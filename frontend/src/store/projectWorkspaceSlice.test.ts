import { beforeEach, describe, expect, test, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  createEvidence: vi.fn(),
  createJob: vi.fn(),
  createRevision: vi.fn(),
  getSourceFragments: vi.fn(),
  getRevisions: vi.fn(),
  getWorkspace: vi.fn(),
  updateEvidence: vi.fn(),
}));

const sseMocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown) => void>(),
  connect: vi.fn(),
  close: vi.fn(),
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    projectWorkspaceApi: {
      ...actual.projectWorkspaceApi,
      createEvidence: apiMocks.createEvidence,
      createJob: apiMocks.createJob,
      createRevision: apiMocks.createRevision,
      getSourceFragments: apiMocks.getSourceFragments,
      getRevisions: apiMocks.getRevisions,
      getWorkspace: apiMocks.getWorkspace,
      updateEvidence: apiMocks.updateEvidence,
    },
  };
});

vi.mock('../services/sseClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/sseClient')>();
  return {
    ...actual,
    createSSEClient: vi.fn(() => ({
      on: (event: string, handler: (payload: unknown) => void) => sseMocks.handlers.set(event, handler),
      connect: sseMocks.connect,
      close: sseMocks.close,
    })),
  };
});

import useStore, {
  type ContentArtifact,
  type ContentArtifactRevision,
  type ContentProjectWorkspace,
} from './index';
import { CONTENT_REVISION_DEFAULTS } from '../test/contentProjectFixtures';

const firstRevision: ContentArtifactRevision = {
  ...CONTENT_REVISION_DEFAULTS,
  id: 41,
  artifact_id: 30,
  revision_number: 1,
  content: '第一版主稿',
  change_reason: '',
  created_at: '2026-07-18T00:00:00.000Z',
};

const artifact: ContentArtifact = {
  id: 30,
  project_id: 12,
  kind: 'master',
  title: '主稿',
  platform: 'general',
  status: 'draft',
  current_revision: firstRevision,
  created_at: '2026-07-18T00:00:00.000Z',
  updated_at: '2026-07-18T00:00:00.000Z',
};

const workspace: ContentProjectWorkspace = {
  project: {
    id: 12,
    title: '版本保存测试',
    topic: '',
    audience: '',
    goal: '',
    angle: '',
    tone: '',
    content_format: '',
    target_platform: 'general',
    thesis: '',
    personal_practice: '',
    personal_judgment: '',
    discussion_question: '',
    status: 'draft',
    claims: [],
    created_at: '2026-07-18T00:00:00.000Z',
    updated_at: '2026-07-18T00:00:00.000Z',
  },
  sources: [],
  evidence: [],
  generation_jobs: [],
  artifacts: [artifact],
};

describe('projectWorkspaceSlice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sseMocks.handlers.clear();
    useStore.setState({
      projectWorkspace: workspace,
      projectArtifactRevisions: [firstRevision],
      projectWorkspaceSaveError: null,
      isSavingProjectWorkspace: false,
      projectEditorContext: null,
      isLoadingProjectEditorRevision: false,
      projectEditorRevisionError: null,
      projectMilestoneFeedback: null,
      consumedProjectMilestoneIds: [],
      activeProjectTaskId: null,
      activeProjectJobOperation: null,
      projectWorkspaceJobError: null,
    });
  });

  test('刷新时只用最新任务派生全局错误，较新的成功会清除旧失败', async () => {
    const oldFailedJob = {
      id: 70, project_id: 12, operation: 'generate_outline' as const, request_key: 'old-failed', status: 'failed' as const,
      phase: 'failed', progress: 45, error: '旧任务失败', result_artifact_id: null, result_revision_id: null,
      created_at: '2026-07-18T00:00:00.000Z', updated_at: '2026-07-18T00:01:00.000Z',
    };
    const latestCompletedJob = {
      ...oldFailedJob,
      id: 71,
      request_key: 'latest-completed',
      status: 'completed' as const,
      phase: 'completed',
      progress: 100,
      error: '',
      result_artifact_id: 30,
      result_revision_id: 41,
      created_at: '2026-07-18T00:02:00.000Z',
      updated_at: '2026-07-18T00:03:00.000Z',
    };
    apiMocks.getWorkspace.mockResolvedValue({
      data: { workspace: { ...workspace, generation_jobs: [oldFailedJob, latestCompletedJob] } },
    });

    await useStore.getState().fetchProjectWorkspace(12);

    expect(useStore.getState().projectWorkspaceJobError).toBeNull();
  });

  test('刷新时最新 superseded 任务保留可见的上下文错误', async () => {
    const olderCompletedJob = {
      id: 72, project_id: 12, operation: 'generate_outline' as const, request_key: 'older-completed', status: 'completed' as const,
      phase: 'completed', progress: 100, error: '', result_artifact_id: 30, result_revision_id: 41,
      created_at: '2026-07-18T00:00:00.000Z', updated_at: '2026-07-18T00:01:00.000Z',
    };
    const latestSupersededJob = {
      ...olderCompletedJob,
      id: 73,
      request_key: 'latest-superseded',
      status: 'superseded' as const,
      phase: 'superseded',
      progress: 60,
      error: 'Brief 已变化，请重新生成',
      result_artifact_id: null,
      result_revision_id: null,
      created_at: '2026-07-18T00:02:00.000Z',
      updated_at: '2026-07-18T00:03:00.000Z',
    };
    apiMocks.getWorkspace.mockResolvedValue({
      data: { workspace: { ...workspace, generation_jobs: [olderCompletedJob, latestSupersededJob] } },
    });

    await useStore.getState().fetchProjectWorkspace(12);

    expect(useStore.getState().projectWorkspaceJobError).toBe('Brief 已变化，请重新生成');
  });

  test('显式保存主稿时请求新版本并用服务端 artifact 更新工作区', async () => {
    const revision: ContentArtifactRevision = {
      ...firstRevision,
      id: 42,
      revision_number: 2,
      content: '\n第二版主稿\n',
      change_reason: '补充反方证据',
    };
    const updatedArtifact: ContentArtifact = {
      ...artifact,
      current_revision: revision,
      updated_at: '2026-07-18T00:10:00.000Z',
    };
    apiMocks.createRevision.mockResolvedValue({ data: { revision, artifact: updatedArtifact } });

    await useStore.getState().saveProjectArtifactRevision(12, 30, {
      content: '\n第二版主稿\n',
      changeReason: '补充反方证据',
      parentRevisionId: firstRevision.id,
    });

    expect(apiMocks.createRevision).toHaveBeenCalledWith(12, 30, expect.objectContaining({
      content: '\n第二版主稿\n',
      changeReason: '补充反方证据',
      parentRevisionId: firstRevision.id,
      requestKey: expect.any(String),
    }));
    expect(useStore.getState().projectWorkspace?.artifacts[0]).toEqual(expect.objectContaining({
      ...updatedArtifact,
      current_revision: expect.objectContaining(revision),
    }));
    expect(useStore.getState().projectArtifactRevisions.map((item) => item.revision_number)).toEqual([2, 1]);
  });

  test('提纲与主稿版本历史互不污染，并把显式父版本纳入保存请求和 requestKey', async () => {
    const outlineRevision: ContentArtifactRevision = {
      ...firstRevision,
      id: 51,
      artifact_id: 50,
      content: '旧提纲',
    };
    const nextOutlineRevision: ContentArtifactRevision = {
      ...outlineRevision,
      id: 52,
      revision_number: 2,
      content: '新提纲',
      parent_revision_id: 51,
    };
    const outlineArtifact: ContentArtifact = {
      ...artifact,
      id: 50,
      kind: 'outline',
      title: '提纲',
      current_revision: outlineRevision,
    };
    apiMocks.createRevision.mockResolvedValue({
      data: { revision: nextOutlineRevision, artifact: { ...outlineArtifact, current_revision: nextOutlineRevision } },
    });
    useStore.setState({
      projectWorkspace: { ...workspace, artifacts: [artifact, outlineArtifact] },
      projectArtifactRevisions: [firstRevision],
      projectOutlineRevisions: [outlineRevision],
    });

    await useStore.getState().saveProjectArtifactRevision(12, 50, {
      content: '新提纲',
      changeReason: '调整结构',
      parentRevisionId: 51,
    });

    expect(apiMocks.createRevision).toHaveBeenCalledWith(12, 50, expect.objectContaining({
      parentRevisionId: 51,
      requestKey: expect.stringContaining('revision-12-50'),
    }));
    expect(useStore.getState().projectOutlineRevisions.map((item) => item.id)).toEqual([52, 51]);
    expect(useStore.getState().projectArtifactRevisions.map((item) => item.id)).toEqual([41]);
  });

  test('相同正文在父 Revision 变化后得到新的显式保存 requestKey', async () => {
    const revision2 = { ...firstRevision, id: 42, revision_number: 2, parent_revision_id: 41 };
    const revision3 = { ...firstRevision, id: 43, revision_number: 3, parent_revision_id: 42 };
    apiMocks.createRevision
      .mockResolvedValueOnce({ data: { revision: revision2, artifact: { ...artifact, current_revision: revision2 } } })
      .mockResolvedValueOnce({ data: { revision: revision3, artifact: { ...artifact, current_revision: revision3 } } });

    await useStore.getState().saveProjectArtifactRevision(12, 30, { content: firstRevision.content, changeReason: '', parentRevisionId: 41 });
    await useStore.getState().saveProjectArtifactRevision(12, 30, { content: firstRevision.content, changeReason: '', parentRevisionId: 42 });

    expect(apiMocks.createRevision.mock.calls[0][2].requestKey).not.toBe(apiMocks.createRevision.mock.calls[1][2].requestKey);
  });

  test('编辑器按 query 加载确切 Revision，并清空旧音频渲染上下文', async () => {
    const requestedRevision = { ...firstRevision, id: 43, revision_number: 3, content: '\n确切口播版本\n' };
    apiMocks.getRevisions.mockResolvedValue({ data: { revisions: [requestedRevision, firstRevision] } });
    apiMocks.getWorkspace.mockResolvedValue({
      data: { workspace: { ...workspace, artifacts: [{ ...artifact, kind: 'audio_script', current_revision: requestedRevision }] } },
    });
    useStore.setState({
      script: '旧稿件',
      currentBroadcast: {
        id: 99,
        title: '旧播报',
        content: '旧稿件',
        artifact_revision_id: null,
        source_artifact_revision_id: null,
        audio_path: null,
        duration: null,
        voice_type: null,
        voice_config: null,
        source_items: null,
        status: 'draft',
        saved: 0,
        mode: 'segmented',
        created_at: '2026-07-18T00:00:00.000Z',
        updated_at: '2026-07-18T00:00:00.000Z',
      },
      segments: [{
        id: 1,
        broadcast_id: 99,
        index: 0,
        text: '旧段落',
        audio_path: null,
        status: 'pending',
        style_tag: '',
        playback_rate: 1,
        error_message: '',
        created_at: '2026-07-18T00:00:00.000Z',
        updated_at: '2026-07-18T00:00:00.000Z',
      }],
    });

    await useStore.getState().loadProjectEditorRevision(12, 30, 43);

    expect(apiMocks.getRevisions).toHaveBeenCalledWith(12, 30);
    expect(apiMocks.getWorkspace).toHaveBeenCalledWith(12);
    expect(useStore.getState().projectEditorContext).toEqual({
      projectId: 12,
      artifactId: 30,
      revision: expect.objectContaining(requestedRevision),
    });
    expect(useStore.getState().script).toBe('\n确切口播版本\n');
    expect(useStore.getState().currentBroadcast).toBeNull();
    expect(useStore.getState().segments).toEqual([]);
  });

  test('手工证据保存后合并工作区，并且重复 milestone event 只消费一次', async () => {
    const evidence = {
      id: 5, project_id: 12, source_id: 3, source_title: '原文', origin: 'user' as const, state: 'selected' as const,
      decision_state: 'selected' as const, lifecycle_status: 'active' as const, source_linked: true, source_snapshot_intact: true,
      reuse_eligible: true, unavailable_reason: '' as const,
      start_fragment_index: 0, end_fragment_index: 0, start_offset: 0, end_offset: 4, excerpt: '事实',
      source_content_sha256: 'sha', ai_note: '', user_note: '核心事实', supersedes_id: null, generation_job_id: null,
      sort_order: 0, created_at: '', updated_at: '',
    };
    const milestone = { id: 'milestone-evidence', kind: 'evidence_selected' as const, title: '证据链已建立', description: '已确认首条证据。' };
    apiMocks.createEvidence.mockResolvedValue({ data: { evidence, milestone } });

    await useStore.getState().createManualProjectEvidence(12, {
      sourceId: 3, startFragmentIndex: 0, endFragmentIndex: 0, requestKey: 'manual-1', userNote: '核心事实',
    });

    expect(useStore.getState().projectWorkspace?.evidence).toEqual([evidence]);
    expect(useStore.getState().projectMilestoneFeedback?.id).toBe('milestone-evidence');
    expect(useStore.getState().consumedProjectMilestoneIds).toEqual(['milestone-evidence']);

    apiMocks.updateEvidence.mockResolvedValue({ data: { evidence, milestone } });
    await useStore.getState().updateProjectEvidence(12, 5, { state: 'selected' });
    expect(useStore.getState().consumedProjectMilestoneIds).toEqual(['milestone-evidence']);
  });

  test('修正证据响应合并新卡，并在本地保留旧卡为 superseded', async () => {
    const oldEvidence = {
      id: 5, project_id: 12, source_id: 3, source_title: '原文', origin: 'ai' as const, state: 'selected' as const,
      decision_state: 'selected' as const, lifecycle_status: 'active' as const, source_linked: true, source_snapshot_intact: true,
      reuse_eligible: true, unavailable_reason: '' as const, start_fragment_index: 0, end_fragment_index: 0, start_offset: 0, end_offset: 4,
      excerpt: '旧摘录', source_content_sha256: 'sha', ai_note: '旧说明', user_note: '', supersedes_id: null, generation_job_id: null,
      sort_order: 0, created_at: '', updated_at: '',
    };
    const corrected = { ...oldEvidence, id: 6, origin: 'user' as const, excerpt: '修正摘录', supersedes_id: 5, sort_order: 1 };
    useStore.setState({ projectWorkspace: { ...workspace, evidence: [oldEvidence] } });
    apiMocks.createEvidence.mockResolvedValue({ data: { evidence: corrected } });

    await useStore.getState().createManualProjectEvidence(12, {
      sourceId: 3, startFragmentIndex: 0, endFragmentIndex: 1, decisionState: 'selected', supersedesEvidenceId: 5,
    });

    expect(useStore.getState().projectWorkspace?.evidence).toEqual([
      expect.objectContaining({ id: 5, lifecycle_status: 'superseded', reuse_eligible: false }),
      expect.objectContaining({ id: 6, supersedes_id: 5 }),
    ]);
  });

  test('SSE 先连接后提交生成任务，失败只更新任务并保留旧稿', async () => {
    const job = {
      id: 70, project_id: 12, operation: 'generate_master' as const, request_key: 'server-key', status: 'running' as const,
      phase: 'generating', progress: 25, error: '', result_artifact_id: null, result_revision_id: null, created_at: '', updated_at: '',
    };
    apiMocks.createJob.mockImplementation(async () => {
      expect(sseMocks.connect).toHaveBeenCalledTimes(1);
      return { status: 202, data: { job } };
    });

    await useStore.getState().startProjectCreationJob(12, {
      operation: 'generate_master', evidenceIds: [5], outlineRevisionId: 41,
    });
    const errorHandler = sseMocks.handlers.get('error');
    expect(errorHandler).toBeDefined();
    errorHandler?.({ job: { ...job, status: 'failed', phase: 'failed', error: '模型不可用' }, error: '模型不可用' });

    expect(useStore.getState().projectWorkspace?.artifacts).toEqual([artifact]);
    expect(useStore.getState().projectWorkspace?.generation_jobs[0].status).toBe('failed');
    expect(useStore.getState().projectWorkspaceJobError).toBe('模型不可用');
  });

  test('相同上下文重试复用 requestKey，Brief 事实变化后生成新 key', async () => {
    const job = {
      id: 71, project_id: 12, operation: 'generate_master' as const, request_key: 'server-key', status: 'running' as const,
      phase: 'drafting', progress: 30, error: '', result_artifact_id: null, result_revision_id: null, created_at: '', updated_at: '',
    };
    apiMocks.createJob.mockResolvedValue({ status: 202, data: { job } });

    const input = { operation: 'generate_master' as const, evidenceIds: [5], outlineRevisionId: 41 };
    await useStore.getState().startProjectCreationJob(12, input);
    const firstKey = apiMocks.createJob.mock.calls[0][1].requestKey;
    sseMocks.handlers.get('error')?.({ job: { ...job, status: 'failed', error: '暂时失败' }, error: '暂时失败' });

    await useStore.getState().startProjectCreationJob(12, input);
    const retryKey = apiMocks.createJob.mock.calls[1][1].requestKey;
    expect(retryKey).toBe(firstKey);
    sseMocks.handlers.get('error')?.({ job: { ...job, status: 'failed', error: '暂时失败' }, error: '暂时失败' });

    useStore.setState((state) => ({
      projectWorkspace: state.projectWorkspace
        ? { ...state.projectWorkspace, project: { ...state.projectWorkspace.project, thesis: 'Brief 已更新', updated_at: '2026-07-18T01:00:00.000Z' } }
        : null,
    }));
    await useStore.getState().startProjectCreationJob(12, input);
    const changedContextKey = apiMocks.createJob.mock.calls[2][1].requestKey;
    expect(changedContextKey).not.toBe(firstKey);
    sseMocks.handlers.get('error')?.({ job: { ...job, status: 'failed', error: '暂时失败' }, error: '暂时失败' });

    useStore.setState((state) => ({ settings: { ...state.settings, llm_model: '另一个模型' } }));
    await useStore.getState().startProjectCreationJob(12, input);
    const changedModelKey = apiMocks.createJob.mock.calls[3][1].requestKey;
    expect(changedModelKey).not.toBe(changedContextKey);
    sseMocks.handlers.get('error')?.({ job: { ...job, status: 'failed', error: '暂时失败' }, error: '暂时失败' });

    useStore.setState((state) => ({
      projectWorkspace: state.projectWorkspace
        ? {
            ...state.projectWorkspace,
            project: {
              ...state.projectWorkspace.project,
              target_platform: 'wechat',
              discussion_question: '目标平台和讨论问题变化后呢？',
            },
          }
        : null,
    }));
    await useStore.getState().startProjectCreationJob(12, input);
    const changedProductContextKey = apiMocks.createJob.mock.calls[4][1].requestKey;
    expect(changedProductContextKey).not.toBe(changedModelKey);
    sseMocks.handlers.get('error')?.({ job: { ...job, status: 'failed', error: '暂时失败' }, error: '暂时失败' });
  });

  test('SSE complete 丢失时通过持久化 workspace 轮询收敛', async () => {
    vi.useFakeTimers();
    try {
      const runningJob = {
        id: 72, project_id: 12, operation: 'generate_outline' as const, request_key: 'server-key', status: 'running' as const,
        phase: 'outlining', progress: 30, error: '', result_artifact_id: null, result_revision_id: null, created_at: '', updated_at: '',
      };
      const completedJob = { ...runningJob, status: 'completed' as const, phase: 'completed', progress: 100, result_artifact_id: 30, result_revision_id: 41 };
      apiMocks.createJob.mockResolvedValue({ status: 202, data: { job: runningJob } });
      apiMocks.getWorkspace.mockResolvedValue({ data: { workspace: { ...workspace, generation_jobs: [completedJob] } } });

      await useStore.getState().startProjectCreationJob(12, { operation: 'generate_outline', evidenceIds: [5] });
      expect(useStore.getState().activeProjectTaskId).not.toBeNull();
      await vi.advanceTimersByTimeAsync(1000);

      expect(apiMocks.getWorkspace).toHaveBeenCalledWith(12);
      expect(useStore.getState().projectWorkspace?.generation_jobs[0].status).toBe('completed');
      expect(useStore.getState().activeProjectTaskId).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  test('轮询发现 superseded 时保留服务端上下文错误', async () => {
    vi.useFakeTimers();
    try {
      const runningJob = {
        id: 73, project_id: 12, operation: 'generate_outline' as const, request_key: 'server-key', status: 'running' as const,
        phase: 'outlining', progress: 30, error: '', result_artifact_id: null, result_revision_id: null, created_at: '', updated_at: '',
      };
      const supersededJob = { ...runningJob, status: 'superseded' as const, phase: 'superseded', error: 'Brief 已变化，请重新生成' };
      apiMocks.createJob.mockResolvedValue({ status: 202, data: { job: runningJob } });
      apiMocks.getWorkspace.mockResolvedValue({ data: { workspace: { ...workspace, generation_jobs: [supersededJob] } } });

      await useStore.getState().startProjectCreationJob(12, { operation: 'generate_outline', evidenceIds: [5] });
      await vi.advanceTimersByTimeAsync(1000);

      expect(useStore.getState().activeProjectTaskId).toBeNull();
      expect(useStore.getState().projectWorkspaceJobError).toBe('Brief 已变化，请重新生成');
    } finally {
      vi.useRealTimers();
    }
  });

  test('长任务超过一分钟仍持续轮询，不会关闭健康 SSE 或清空活动任务', async () => {
    vi.useFakeTimers();
    try {
      const runningJob = {
        id: 74, project_id: 12, operation: 'extract_evidence' as const, request_key: 'server-key', status: 'running' as const,
        phase: 'extracting', progress: 35, error: '', result_artifact_id: null, result_revision_id: null, created_at: '', updated_at: '',
      };
      const completedJob = { ...runningJob, status: 'completed' as const, phase: 'completed', progress: 100 };
      apiMocks.createJob.mockResolvedValue({ status: 202, data: { job: runningJob } });
      apiMocks.getWorkspace.mockResolvedValue({ data: { workspace: { ...workspace, generation_jobs: [runningJob] } } });

      await useStore.getState().startProjectCreationJob(12, { operation: 'extract_evidence', sourceIds: [5] });
      await vi.advanceTimersByTimeAsync(65000);

      expect(apiMocks.getWorkspace.mock.calls.length).toBeGreaterThan(39);
      expect(useStore.getState().activeProjectTaskId).not.toBeNull();
      expect(useStore.getState().projectWorkspaceJobError).toBeNull();
      expect(sseMocks.close).not.toHaveBeenCalled();

      apiMocks.getWorkspace.mockResolvedValue({ data: { workspace: { ...workspace, generation_jobs: [completedJob] } } });
      await vi.advanceTimersByTimeAsync(1500);
      expect(useStore.getState().activeProjectTaskId).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
