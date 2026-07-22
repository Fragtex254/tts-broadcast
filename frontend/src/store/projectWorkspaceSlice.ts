import { projectWorkspaceApi } from '../services/api';
import { getApiErrorMessage } from '../services/apiError';
import { createSSEClient } from '../services/sseClient';
import {
  ContentArtifactRevisionSchema,
  ContentArtifactSchema,
  ContentEvidenceSchema,
  ContentGenerationJobSchema,
  ContentJobCompleteEventSchema,
  ContentJobErrorEventSchema,
  ContentJobProgressEventSchema,
  ContentProjectMilestoneSchema,
  ContentProjectSourceSchema,
  ContentProjectWorkspaceSchema,
  ContentSourceFragmentSchema,
  safeParseStrict,
} from '../services/schemas';
import type { AppState, ContentGenerationJob } from './types';
import type { StoreGet, StoreSet } from './storeTypes';
import { acceptMilestoneEvent } from '../components/Projects/projectMilestoneModel';
import { CONTENT_CREATION_PROMPT_VERSION, createStableProjectRequestKey, normalizeCreationJobInput } from './projectRequestKey';
import { bindBackgroundTaskTransport } from './sseBackgroundTask';

let workspaceRequestSequence = 0;
let revisionsRequestSequence = 0;
let outlineRevisionsRequestSequence = 0;
let activeProjectSseClient: ReturnType<typeof createSSEClient> | null = null;
let activeProjectPollTimer: ReturnType<typeof setTimeout> | null = null;

function createOperationId(prefix: string): string {
  const random = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

function closeActiveProjectSse(): void {
  activeProjectSseClient?.close();
  activeProjectSseClient = null;
}

function clearActiveProjectPoll(): void {
  if (activeProjectPollTimer) clearTimeout(activeProjectPollTimer);
  activeProjectPollTimer = null;
}

/** 应用根卸载时释放项目创作的模块级 SSE 与轮询资源。 */
export function disposeProjectWorkspaceRuntime(): void {
  closeActiveProjectSse();
  clearActiveProjectPoll();
}

function parseMilestone(value: unknown) {
  if (!value) return null;
  const parsed = ContentProjectMilestoneSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function consumeMilestone(
  set: StoreSet,
  get: StoreGet,
  projectId: number,
  value: unknown,
  taskId?: string
): void {
  const parsedMilestone = parseMilestone(value);
  const state = get();
  const milestone = acceptMilestoneEvent({
    activeProjectId: state.projectWorkspace?.project.id ?? null,
    eventProjectId: projectId,
    activeTaskId: taskId === undefined ? null : state.activeProjectTaskId,
    eventTaskId: taskId ?? null,
    consumedIds: state.consumedProjectMilestoneIds,
    milestone: parsedMilestone,
  });
  if (!milestone) return;
  set({
    projectMilestoneFeedback: milestone,
    consumedProjectMilestoneIds: [...state.consumedProjectMilestoneIds, milestone.id],
  });
}

function mergeJobIntoWorkspace(state: AppState, projectId: number, job: ContentGenerationJob) {
  if (state.projectWorkspace?.project.id !== projectId) return state.projectWorkspace;
  return {
    ...state.projectWorkspace,
    generation_jobs: [job, ...state.projectWorkspace.generation_jobs.filter((item) => item.id !== job.id)]
      .sort((a, b) => b.id - a.id),
  };
}

function getLatestGenerationJob(jobs: ContentGenerationJob[]): ContentGenerationJob | null {
  return jobs.reduce<ContentGenerationJob | null>((latest, job) => (
    !latest || job.id > latest.id ? job : latest
  ), null);
}

function getLatestGenerationJobError(jobs: ContentGenerationJob[]): string | null {
  const latestJob = getLatestGenerationJob(jobs);
  if (latestJob?.status !== 'failed' && latestJob?.status !== 'superseded') return null;
  return latestJob.error || '创作任务因上下文变化未保存，请核对后重试。';
}

export function createProjectWorkspaceSlice(set: StoreSet, get: StoreGet): Pick<
  AppState,
  | 'projectWorkspace'
  | 'isLoadingProjectWorkspace'
  | 'projectWorkspaceError'
  | 'isSavingProjectWorkspace'
  | 'projectWorkspaceSaveError'
  | 'projectSourceFragments'
  | 'isLoadingProjectSourceFragments'
  | 'projectSourceFragmentsError'
  | 'isUnlinkingProjectSourceId'
  | 'activeProjectTaskId'
  | 'activeProjectJobOperation'
  | 'projectWorkspaceJobError'
  | 'projectMilestoneFeedback'
  | 'consumedProjectMilestoneIds'
  | 'projectArtifactRevisions'
  | 'isLoadingProjectArtifactRevisions'
  | 'projectArtifactRevisionsError'
  | 'projectOutlineRevisions'
  | 'isLoadingProjectOutlineRevisions'
  | 'projectOutlineRevisionsError'
  | 'projectEditorContext'
  | 'fetchProjectWorkspace'
  | 'clearProjectWorkspace'
  | 'addProjectWorkspaceSource'
  | 'fetchProjectSourceFragments'
  | 'unlinkProjectWorkspaceSource'
  | 'createManualProjectEvidence'
  | 'updateProjectEvidence'
  | 'startProjectCreationJob'
  | 'dismissProjectMilestone'
  | 'createProjectWorkspaceArtifact'
  | 'saveProjectArtifactRevision'
  | 'fetchProjectArtifactRevisions'
  | 'fetchProjectOutlineRevisions'
> {
  const scheduleJobPoll = (projectId: number, jobId: number, taskId: string, attempt = 0): void => {
    clearActiveProjectPoll();
    activeProjectPollTimer = setTimeout(async () => {
      const current = get();
      if (current.activeProjectTaskId !== taskId) return;
      try {
        const response = await projectWorkspaceApi.getWorkspace(projectId);
        const workspace = safeParseStrict(ContentProjectWorkspaceSchema, response.data.workspace);
        if (get().activeProjectTaskId !== taskId) return;
        const job = workspace.generation_jobs.find((item) => item.id === jobId);
        if (job) {
          get().updateBackgroundTask(taskId, {
            status: 'running',
            phase: job.phase,
            percent: job.progress ?? 0,
            message: job.phase || '正在生成内容',
          });
        }
        if (get().projectWorkspace?.project.id === projectId) {
          set({ projectWorkspace: workspace });
        }
        if (job?.status === 'completed' || job?.status === 'failed' || job?.status === 'superseded') {
          clearActiveProjectPoll();
          closeActiveProjectSse();
          get().endBackgroundTask(taskId);
          set({
            activeProjectTaskId: null,
            activeProjectJobOperation: null,
            projectWorkspaceJobError: job.status === 'completed' ? null : (job.error || '创作任务因上下文变化未保存，请核对后重试。'),
          });
          return;
        }
      } catch {
        // 持久化 Job 与后端 lease 是长任务的真实状态。短暂轮询失败不能擅自终止健康任务或关闭 SSE。
      }
      scheduleJobPoll(projectId, jobId, taskId, attempt + 1);
    }, attempt === 0 ? 1000 : 1500);
  };

  return {
    projectWorkspace: null,
    isLoadingProjectWorkspace: false,
    projectWorkspaceError: null,
    isSavingProjectWorkspace: false,
    projectWorkspaceSaveError: null,
    projectSourceFragments: {},
    isLoadingProjectSourceFragments: false,
    projectSourceFragmentsError: null,
    isUnlinkingProjectSourceId: null,
    activeProjectTaskId: null,
    activeProjectJobOperation: null,
    projectWorkspaceJobError: null,
    projectMilestoneFeedback: null,
    consumedProjectMilestoneIds: [],
    projectArtifactRevisions: [],
    isLoadingProjectArtifactRevisions: false,
    projectArtifactRevisionsError: null,
    projectOutlineRevisions: [],
    isLoadingProjectOutlineRevisions: false,
    projectOutlineRevisionsError: null,
    projectEditorContext: null,

    fetchProjectWorkspace: async (projectId) => {
      const requestSequence = ++workspaceRequestSequence;
      revisionsRequestSequence += 1;
      outlineRevisionsRequestSequence += 1;
      set({
        projectWorkspace: null,
        isLoadingProjectWorkspace: true,
        projectWorkspaceError: null,
        projectArtifactRevisions: [],
        projectArtifactRevisionsError: null,
        projectOutlineRevisions: [],
        projectOutlineRevisionsError: null,
        projectSourceFragments: {},
        projectSourceFragmentsError: null,
        projectWorkspaceJobError: null,
        projectMilestoneFeedback: null,
      });
      try {
        const response = await projectWorkspaceApi.getWorkspace(projectId);
        const workspace = safeParseStrict(ContentProjectWorkspaceSchema, response.data.workspace);
        if (requestSequence === workspaceRequestSequence) {
          const runningJob = workspace.generation_jobs
            .filter((job) => job.status === 'queued' || job.status === 'running')
            .sort((a, b) => b.id - a.id)[0];
          const existingTaskId = get().activeProjectTaskId;
          const resumedTaskId = !existingTaskId && runningJob
            ? createOperationId(`project-poll-${projectId}`)
            : null;
          set({
            projectWorkspace: workspace,
            isLoadingProjectWorkspace: false,
            projectWorkspaceError: null,
            projectWorkspaceJobError: getLatestGenerationJobError(workspace.generation_jobs),
            activeProjectTaskId: existingTaskId || resumedTaskId,
            activeProjectJobOperation: existingTaskId
              ? get().activeProjectJobOperation
              : (runningJob?.operation || null),
          });
          if (runningJob && resumedTaskId) {
            get().startBackgroundTask({
              taskId: resumedTaskId,
              kind: 'content-creation',
              entityId: projectId,
              title: `内容创作：${workspace.project.title}`,
              href: `/projects/${projectId}`,
              status: 'running',
              phase: runningJob.phase,
              percent: runningJob.progress ?? 0,
              message: runningJob.phase || '正在恢复创作任务',
            });
            scheduleJobPoll(projectId, runningJob.id, resumedTaskId);
          }
        }
        return workspace;
      } catch (error) {
        const message = getApiErrorMessage(error, '获取内容项目工作区失败');
        if (requestSequence === workspaceRequestSequence) {
          set({ isLoadingProjectWorkspace: false, projectWorkspaceError: message });
        }
        throw new Error(message, { cause: error });
      }
    },

    clearProjectWorkspace: () => {
      workspaceRequestSequence += 1;
      revisionsRequestSequence += 1;
      outlineRevisionsRequestSequence += 1;
      set({
        projectWorkspace: null,
        isLoadingProjectWorkspace: false,
        projectWorkspaceError: null,
        isSavingProjectWorkspace: false,
        projectWorkspaceSaveError: null,
        projectSourceFragments: {},
        isLoadingProjectSourceFragments: false,
        projectSourceFragmentsError: null,
        isUnlinkingProjectSourceId: null,
        projectWorkspaceJobError: null,
        projectMilestoneFeedback: null,
        projectArtifactRevisions: [],
        isLoadingProjectArtifactRevisions: false,
        projectArtifactRevisionsError: null,
        projectOutlineRevisions: [],
        isLoadingProjectOutlineRevisions: false,
        projectOutlineRevisionsError: null,
      });
    },

    addProjectWorkspaceSource: async (projectId, data) => {
      set({ isSavingProjectWorkspace: true, projectWorkspaceSaveError: null });
      try {
        const response = await projectWorkspaceApi.addSource(projectId, {
          ...data,
          requestKey: data.requestKey || createStableProjectRequestKey(`source-${projectId}`, data),
        });
        const source = safeParseStrict(ContentProjectSourceSchema, response.data.source);
        set((state) => ({
          isSavingProjectWorkspace: false,
          projectWorkspace: state.projectWorkspace?.project.id === projectId
            ? { ...state.projectWorkspace, sources: [...state.projectWorkspace.sources.filter((item) => item.project_source_id !== source.project_source_id), source].sort((a, b) => a.sort_order - b.sort_order) }
            : state.projectWorkspace,
        }));
        consumeMilestone(set, get, projectId, response.data.milestone);
        return source;
      } catch (error) {
        const message = getApiErrorMessage(error, '添加项目来源失败');
        set({ isSavingProjectWorkspace: false, projectWorkspaceSaveError: message });
        throw new Error(message, { cause: error });
      }
    },

    fetchProjectSourceFragments: async (projectId, sourceId) => {
      set({ isLoadingProjectSourceFragments: true, projectSourceFragmentsError: null });
      try {
        const response = await projectWorkspaceApi.getSourceFragments(projectId, sourceId);
        const fragments = safeParseStrict(ContentSourceFragmentSchema.array(), response.data.fragments);
        if (get().projectWorkspace?.project.id === projectId) {
          set((state) => ({
            isLoadingProjectSourceFragments: false,
            projectSourceFragments: { ...state.projectSourceFragments, [sourceId]: fragments },
          }));
        }
        return fragments;
      } catch (error) {
        const message = getApiErrorMessage(error, '读取来源原文分片失败');
        if (get().projectWorkspace?.project.id === projectId) {
          set({ isLoadingProjectSourceFragments: false, projectSourceFragmentsError: message });
        }
        throw new Error(message, { cause: error });
      }
    },

    unlinkProjectWorkspaceSource: async (projectId, sourceId) => {
      set({ isUnlinkingProjectSourceId: sourceId, projectWorkspaceSaveError: null });
      try {
        const response = await projectWorkspaceApi.unlinkSource(projectId, sourceId);
        let workspace = null;
        if (response.data?.workspace) {
          workspace = safeParseStrict(ContentProjectWorkspaceSchema, response.data.workspace);
        } else {
          const workspaceResponse = await projectWorkspaceApi.getWorkspace(projectId);
          workspace = safeParseStrict(ContentProjectWorkspaceSchema, workspaceResponse.data.workspace);
        }
        if (get().projectWorkspace?.project.id === projectId) {
          set({ projectWorkspace: workspace, isUnlinkingProjectSourceId: null });
        }
      } catch (error) {
        const message = getApiErrorMessage(error, '移出项目来源失败');
        if (get().projectWorkspace?.project.id === projectId) {
          set({ isUnlinkingProjectSourceId: null, projectWorkspaceSaveError: message });
        }
        throw new Error(message, { cause: error });
      }
    },

    createManualProjectEvidence: async (projectId, data) => {
      set({ projectWorkspaceSaveError: null });
      try {
        const response = await projectWorkspaceApi.createEvidence(projectId, {
          ...data,
          requestKey: data.requestKey || createStableProjectRequestKey(`evidence-${projectId}`, data),
        });
        const evidence = safeParseStrict(ContentEvidenceSchema, response.data.evidence);
        set((state) => ({
          projectWorkspace: state.projectWorkspace?.project.id === projectId
            ? {
                ...state.projectWorkspace,
                evidence: [
                  evidence,
                  ...state.projectWorkspace.evidence
                    .filter((item) => item.id !== evidence.id)
                    .map((item) => item.id === data.supersedesEvidenceId
                      ? { ...item, lifecycle_status: 'superseded' as const, reuse_eligible: false, unavailable_reason: 'superseded' as const }
                      : item),
                ]
                  .sort((a, b) => a.sort_order - b.sort_order),
              }
            : state.projectWorkspace,
        }));
        consumeMilestone(set, get, projectId, response.data.milestone);
        return evidence;
      } catch (error) {
        const message = getApiErrorMessage(error, '保存手工证据失败');
        set({ projectWorkspaceSaveError: message });
        throw new Error(message, { cause: error });
      }
    },

    updateProjectEvidence: async (projectId, evidenceId, data) => {
      set({ projectWorkspaceSaveError: null });
      try {
        const response = await projectWorkspaceApi.updateEvidence(projectId, evidenceId, data);
        const evidence = safeParseStrict(ContentEvidenceSchema, response.data.evidence);
        set((state) => ({
          projectWorkspace: state.projectWorkspace?.project.id === projectId
            ? {
                ...state.projectWorkspace,
                evidence: state.projectWorkspace.evidence.map((item) => item.id === evidence.id ? evidence : item),
              }
            : state.projectWorkspace,
        }));
        consumeMilestone(set, get, projectId, response.data.milestone);
        return evidence;
      } catch (error) {
        const message = getApiErrorMessage(error, '更新证据状态失败');
        set({ projectWorkspaceSaveError: message });
        throw new Error(message, { cause: error });
      }
    },

    startProjectCreationJob: async (projectId, data) => {
      const state = get();
      if (state.projectWorkspace?.project.id !== projectId) throw new Error('当前内容项目已经切换，请重新操作');
      if (state.activeProjectTaskId) throw new Error('已有创作任务正在提交或运行，请等待任务收口');

      const taskId = createOperationId(`project-task-${projectId}`);
      const normalizedInput = normalizeCreationJobInput(data);
      const creatorInputs = Object.fromEntries((normalizedInput.creatorInputKeys || []).map((key) => [
        key,
        key === 'personal_practice' ? state.projectWorkspace?.project.personal_practice : state.projectWorkspace?.project.personal_judgment,
      ]));
      const requestContext = {
        promptVersion: CONTENT_CREATION_PROMPT_VERSION,
        input: normalizedInput,
        project: {
          updatedAt: state.projectWorkspace.project.updated_at,
          topic: state.projectWorkspace.project.topic,
          thesis: state.projectWorkspace.project.thesis,
          audience: state.projectWorkspace.project.audience,
          goal: state.projectWorkspace.project.goal,
          angle: state.projectWorkspace.project.angle,
          tone: state.projectWorkspace.project.tone,
          contentFormat: state.projectWorkspace.project.content_format,
          targetPlatform: state.projectWorkspace.project.target_platform,
          discussionQuestion: state.projectWorkspace.project.discussion_question,
        },
        creatorInputs,
        llm: {
          apiFormat: state.settings.llm_api_format,
          baseUrl: state.settings.llm_base_url,
          model: state.settings.llm_model,
        },
        sources: (normalizedInput.sourceIds || []).map((id) => {
          const source = state.projectWorkspace?.sources.find((item) => item.id === id);
          return { id, contentSha256: source?.content_sha256 || '' };
        }),
        evidence: (normalizedInput.evidenceIds || []).map((id) => {
          const evidence = state.projectWorkspace?.evidence.find((item) => item.id === id);
          return {
            id,
            sourceContentSha256: evidence?.source_content_sha256 || '',
            updatedAt: evidence?.updated_at || '',
            decisionState: evidence?.decision_state || '',
            lifecycleStatus: evidence?.lifecycle_status || '',
          };
        }),
      };
      const requestKey = createStableProjectRequestKey(`project-${projectId}-${data.operation}`, requestContext);
      const sseClient = createSSEClient(taskId, 'content-creation');
      closeActiveProjectSse();
      clearActiveProjectPoll();
      activeProjectSseClient = sseClient;
      set({
        activeProjectTaskId: taskId,
        activeProjectJobOperation: data.operation,
        projectWorkspaceJobError: null,
      });
      get().startBackgroundTask({
        taskId,
        kind: 'content-creation',
        entityId: projectId,
        title: `内容创作：${state.projectWorkspace.project.title}`,
        href: `/projects/${projectId}`,
        phase: 'queued',
        percent: 0,
        message: '创作任务已进入队列',
      });
      bindBackgroundTaskTransport(sseClient, taskId, get);

      sseClient.on('progress', (event) => {
        const parsed = ContentJobProgressEventSchema.safeParse(event);
        if (!parsed.success) return;
        const current = get();
        if (current.activeProjectTaskId !== taskId) return;
        current.updateBackgroundTask(taskId, {
          status: 'running',
          phase: parsed.data.job.phase,
          percent: parsed.data.job.progress ?? 0,
          message: parsed.data.job.phase || '正在生成内容',
        });
        if (current.projectWorkspace?.project.id !== projectId) return;
        set((latest) => ({ projectWorkspace: mergeJobIntoWorkspace(latest, projectId, parsed.data.job) }));
      });

      sseClient.on('complete', (event) => {
        const parsed = ContentJobCompleteEventSchema.safeParse(event);
        if (!parsed.success) return;
        const current = get();
        if (current.activeProjectTaskId !== taskId) return;
        current.endBackgroundTask(taskId);
        consumeMilestone(set, get, projectId, parsed.data.milestone, taskId);
        set((latest) => ({
          projectWorkspace: latest.projectWorkspace?.project.id === projectId
            ? parsed.data.workspace
            : latest.projectWorkspace,
          activeProjectTaskId: null,
          activeProjectJobOperation: null,
          projectWorkspaceJobError: null,
        }));
        clearActiveProjectPoll();
        sseClient.close();
        if (activeProjectSseClient === sseClient) activeProjectSseClient = null;
      });

      sseClient.on('error', (event) => {
        const parsed = ContentJobErrorEventSchema.safeParse(event);
        if (!parsed.success) return;
        const current = get();
        if (current.activeProjectTaskId !== taskId) return;
        current.endBackgroundTask(taskId);
        set((latest) => ({
          projectWorkspace: mergeJobIntoWorkspace(latest, projectId, parsed.data.job),
          activeProjectTaskId: null,
          activeProjectJobOperation: null,
          projectWorkspaceJobError: parsed.data.error || parsed.data.job.error,
        }));
        clearActiveProjectPoll();
        sseClient.close();
        if (activeProjectSseClient === sseClient) activeProjectSseClient = null;
      });

      sseClient.connect();
      try {
        const response = await projectWorkspaceApi.createJob(projectId, {
          ...normalizedInput,
          taskId,
          requestKey,
        });
        const job = safeParseStrict(ContentGenerationJobSchema, response.data.job);
        if (get().activeProjectTaskId === taskId) {
          get().updateBackgroundTask(taskId, {
            status: 'running',
            phase: job.phase,
            percent: job.progress ?? 0,
            message: job.phase || '正在生成内容',
          });
        }
        if (get().activeProjectTaskId === taskId && get().projectWorkspace?.project.id === projectId) {
          set((latest) => ({ projectWorkspace: mergeJobIntoWorkspace(latest, projectId, job) }));
        }
        if (job.status === 'completed') {
          clearActiveProjectPoll();
          get().endBackgroundTask(taskId);
          sseClient.close();
          if (activeProjectSseClient === sseClient) activeProjectSseClient = null;
          const workspaceResponse = await projectWorkspaceApi.getWorkspace(projectId);
          const workspace = safeParseStrict(ContentProjectWorkspaceSchema, workspaceResponse.data.workspace);
          if (get().activeProjectTaskId === taskId) {
            set((latest) => ({
              projectWorkspace: latest.projectWorkspace?.project.id === projectId
                ? workspace
                : latest.projectWorkspace,
              activeProjectTaskId: null,
              activeProjectJobOperation: null,
              projectWorkspaceJobError: null,
            }));
          }
        } else if ((job.status === 'queued' || job.status === 'running') && get().activeProjectTaskId === taskId) {
          scheduleJobPoll(projectId, job.id, taskId);
        } else if ((job.status === 'failed' || job.status === 'superseded') && get().activeProjectTaskId === taskId) {
          get().endBackgroundTask(taskId);
          sseClient.close();
          if (activeProjectSseClient === sseClient) activeProjectSseClient = null;
          set({ activeProjectTaskId: null, activeProjectJobOperation: null, projectWorkspaceJobError: job.error });
        }
        return job;
      } catch (error) {
        clearActiveProjectPoll();
        get().endBackgroundTask(taskId);
        sseClient.close();
        if (activeProjectSseClient === sseClient) activeProjectSseClient = null;
        const message = getApiErrorMessage(error, '启动创作任务失败');
        if (get().activeProjectTaskId === taskId) {
          set({
            activeProjectTaskId: null,
            activeProjectJobOperation: null,
            projectWorkspaceJobError: message,
          });
        }
        throw new Error(message, { cause: error });
      }
    },

    dismissProjectMilestone: () => set({ projectMilestoneFeedback: null }),

    createProjectWorkspaceArtifact: async (projectId, data) => {
      set({ isSavingProjectWorkspace: true, projectWorkspaceSaveError: null });
      try {
        const response = await projectWorkspaceApi.createArtifact(projectId, {
          ...data,
          requestKey: data.requestKey || createStableProjectRequestKey(`artifact-${projectId}-${data.kind}`, data),
        });
        const artifact = safeParseStrict(ContentArtifactSchema, response.data.artifact);
        set((state) => ({
          isSavingProjectWorkspace: false,
          projectWorkspace: state.projectWorkspace?.project.id === projectId
            ? { ...state.projectWorkspace, artifacts: [...state.projectWorkspace.artifacts.filter((item) => item.id !== artifact.id), artifact] }
            : state.projectWorkspace,
          ...(artifact.kind === 'outline'
            ? { projectOutlineRevisions: artifact.current_revision ? [artifact.current_revision] : [] }
            : { projectArtifactRevisions: artifact.current_revision ? [artifact.current_revision] : [] }),
        }));
        consumeMilestone(set, get, projectId, response.data.milestone);
        return artifact;
      } catch (error) {
        const message = getApiErrorMessage(error, '创建项目稿件失败');
        set({ isSavingProjectWorkspace: false, projectWorkspaceSaveError: message });
        throw new Error(message, { cause: error });
      }
    },

    saveProjectArtifactRevision: async (projectId, artifactId, data) => {
      set({ isSavingProjectWorkspace: true, projectWorkspaceSaveError: null });
      try {
        const response = await projectWorkspaceApi.createRevision(projectId, artifactId, {
          ...data,
          requestKey: data.requestKey || createStableProjectRequestKey(`revision-${projectId}-${artifactId}`, data),
        });
        const revision = safeParseStrict(ContentArtifactRevisionSchema, response.data.revision);
        const artifact = safeParseStrict(ContentArtifactSchema, response.data.artifact);
        set((state) => {
          const existingArtifact = state.projectWorkspace?.artifacts.find((item) => item.id === artifactId);
          return {
          isSavingProjectWorkspace: false,
          projectWorkspace: state.projectWorkspace?.project.id === projectId
            ? { ...state.projectWorkspace, artifacts: state.projectWorkspace.artifacts.map((item) => item.id === artifactId ? artifact : item) }
            : state.projectWorkspace,
          ...(existingArtifact?.kind === 'outline'
            ? { projectOutlineRevisions: [revision, ...state.projectOutlineRevisions.filter((item) => item.id !== revision.id)].sort((a, b) => b.revision_number - a.revision_number) }
            : { projectArtifactRevisions: [revision, ...state.projectArtifactRevisions.filter((item) => item.id !== revision.id)].sort((a, b) => b.revision_number - a.revision_number) }),
          };
        });
        consumeMilestone(set, get, projectId, response.data.milestone);
        return revision;
      } catch (error) {
        const message = getApiErrorMessage(error, '保存稿件版本失败');
        set({ isSavingProjectWorkspace: false, projectWorkspaceSaveError: message });
        throw new Error(message, { cause: error });
      }
    },

    fetchProjectArtifactRevisions: async (projectId, artifactId) => {
      const requestSequence = ++revisionsRequestSequence;
      set({ isLoadingProjectArtifactRevisions: true, projectArtifactRevisionsError: null });
      try {
        const response = await projectWorkspaceApi.getRevisions(projectId, artifactId);
        const revisions = safeParseStrict(ContentArtifactRevisionSchema.array(), response.data.revisions)
          .sort((a, b) => b.revision_number - a.revision_number);
        if (requestSequence === revisionsRequestSequence) {
          set({ projectArtifactRevisions: revisions, isLoadingProjectArtifactRevisions: false });
        }
        return revisions;
      } catch (error) {
        const message = getApiErrorMessage(error, '获取稿件版本失败');
        if (requestSequence === revisionsRequestSequence) {
          set({ isLoadingProjectArtifactRevisions: false, projectArtifactRevisionsError: message });
        }
        throw new Error(message, { cause: error });
      }
    },

    fetchProjectOutlineRevisions: async (projectId, artifactId) => {
      const requestSequence = ++outlineRevisionsRequestSequence;
      set({ isLoadingProjectOutlineRevisions: true, projectOutlineRevisionsError: null });
      try {
        const response = await projectWorkspaceApi.getRevisions(projectId, artifactId);
        const revisions = safeParseStrict(ContentArtifactRevisionSchema.array(), response.data.revisions)
          .sort((a, b) => b.revision_number - a.revision_number);
        if (requestSequence === outlineRevisionsRequestSequence && get().projectWorkspace?.project.id === projectId) {
          set({ projectOutlineRevisions: revisions, isLoadingProjectOutlineRevisions: false });
        }
        return revisions;
      } catch (error) {
        const message = getApiErrorMessage(error, '获取提纲版本失败');
        if (requestSequence === outlineRevisionsRequestSequence && get().projectWorkspace?.project.id === projectId) {
          set({ isLoadingProjectOutlineRevisions: false, projectOutlineRevisionsError: message });
        }
        throw new Error(message, { cause: error });
      }
    },

  };
}

export default createProjectWorkspaceSlice;
