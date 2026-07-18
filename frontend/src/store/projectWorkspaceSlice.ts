import { projectWorkspaceApi } from '../services/api';
import { getApiErrorMessage } from '../services/apiError';
import {
  ContentArtifactRevisionSchema,
  ContentArtifactSchema,
  ContentProjectSourceSchema,
  ContentProjectWorkspaceSchema,
  safeParseStrict,
} from '../services/schemas';
import type { AppState } from './types';
import type { StoreSet } from './storeTypes';

let workspaceRequestSequence = 0;
let revisionsRequestSequence = 0;
let editorRevisionRequestSequence = 0;

class ProjectEditorValidationError extends Error {}

export function createProjectWorkspaceSlice(set: StoreSet): Pick<
  AppState,
  | 'projectWorkspace'
  | 'isLoadingProjectWorkspace'
  | 'projectWorkspaceError'
  | 'isSavingProjectWorkspace'
  | 'projectWorkspaceSaveError'
  | 'projectArtifactRevisions'
  | 'isLoadingProjectArtifactRevisions'
  | 'projectArtifactRevisionsError'
  | 'projectEditorContext'
  | 'isLoadingProjectEditorRevision'
  | 'projectEditorRevisionError'
  | 'fetchProjectWorkspace'
  | 'clearProjectWorkspace'
  | 'addProjectWorkspaceSource'
  | 'createProjectWorkspaceArtifact'
  | 'saveProjectArtifactRevision'
  | 'fetchProjectArtifactRevisions'
  | 'loadProjectEditorRevision'
  | 'adoptProjectEditorRevision'
  | 'clearProjectEditorContext'
> {
  return {
    projectWorkspace: null,
    isLoadingProjectWorkspace: false,
    projectWorkspaceError: null,
    isSavingProjectWorkspace: false,
    projectWorkspaceSaveError: null,
    projectArtifactRevisions: [],
    isLoadingProjectArtifactRevisions: false,
    projectArtifactRevisionsError: null,
    projectEditorContext: null,
    isLoadingProjectEditorRevision: false,
    projectEditorRevisionError: null,

    fetchProjectWorkspace: async (projectId) => {
      const requestSequence = ++workspaceRequestSequence;
      revisionsRequestSequence += 1;
      set({
        projectWorkspace: null,
        isLoadingProjectWorkspace: true,
        projectWorkspaceError: null,
        projectArtifactRevisions: [],
        projectArtifactRevisionsError: null,
      });
      try {
        const response = await projectWorkspaceApi.getWorkspace(projectId);
        const workspace = safeParseStrict(ContentProjectWorkspaceSchema, response.data.workspace);
        if (requestSequence === workspaceRequestSequence) {
          set({ projectWorkspace: workspace, isLoadingProjectWorkspace: false, projectWorkspaceError: null });
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
      set({
        projectWorkspace: null,
        isLoadingProjectWorkspace: false,
        projectWorkspaceError: null,
        isSavingProjectWorkspace: false,
        projectWorkspaceSaveError: null,
        projectArtifactRevisions: [],
        isLoadingProjectArtifactRevisions: false,
        projectArtifactRevisionsError: null,
      });
    },

    addProjectWorkspaceSource: async (projectId, data) => {
      set({ isSavingProjectWorkspace: true, projectWorkspaceSaveError: null });
      try {
        const response = await projectWorkspaceApi.addSource(projectId, data);
        const source = safeParseStrict(ContentProjectSourceSchema, response.data.source);
        set((state) => ({
          isSavingProjectWorkspace: false,
          projectWorkspace: state.projectWorkspace?.project.id === projectId
            ? { ...state.projectWorkspace, sources: [...state.projectWorkspace.sources.filter((item) => item.project_source_id !== source.project_source_id), source].sort((a, b) => a.sort_order - b.sort_order) }
            : state.projectWorkspace,
        }));
        return source;
      } catch (error) {
        const message = getApiErrorMessage(error, '添加项目来源失败');
        set({ isSavingProjectWorkspace: false, projectWorkspaceSaveError: message });
        throw new Error(message, { cause: error });
      }
    },

    createProjectWorkspaceArtifact: async (projectId, data) => {
      set({ isSavingProjectWorkspace: true, projectWorkspaceSaveError: null });
      try {
        const response = await projectWorkspaceApi.createArtifact(projectId, data);
        const artifact = safeParseStrict(ContentArtifactSchema, response.data.artifact);
        set((state) => ({
          isSavingProjectWorkspace: false,
          projectWorkspace: state.projectWorkspace?.project.id === projectId
            ? { ...state.projectWorkspace, artifacts: [...state.projectWorkspace.artifacts.filter((item) => item.id !== artifact.id), artifact] }
            : state.projectWorkspace,
          projectArtifactRevisions: artifact.current_revision ? [artifact.current_revision] : [],
        }));
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
        const response = await projectWorkspaceApi.createRevision(projectId, artifactId, data);
        const revision = safeParseStrict(ContentArtifactRevisionSchema, response.data.revision);
        const artifact = safeParseStrict(ContentArtifactSchema, response.data.artifact);
        set((state) => ({
          isSavingProjectWorkspace: false,
          projectWorkspace: state.projectWorkspace?.project.id === projectId
            ? { ...state.projectWorkspace, artifacts: state.projectWorkspace.artifacts.map((item) => item.id === artifactId ? artifact : item) }
            : state.projectWorkspace,
          projectArtifactRevisions: [revision, ...state.projectArtifactRevisions.filter((item) => item.id !== revision.id)]
            .sort((a, b) => b.revision_number - a.revision_number),
        }));
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

    loadProjectEditorRevision: async (projectId, artifactId, revisionId) => {
      const requestSequence = ++editorRevisionRequestSequence;
      set({
        projectEditorContext: null,
        isLoadingProjectEditorRevision: true,
        projectEditorRevisionError: null,
      });
      try {
        const [workspaceResponse, revisionsResponse] = await Promise.all([
          projectWorkspaceApi.getWorkspace(projectId),
          projectWorkspaceApi.getRevisions(projectId, artifactId),
        ]);
        const workspace = safeParseStrict(ContentProjectWorkspaceSchema, workspaceResponse.data.workspace);
        const revisions = safeParseStrict(ContentArtifactRevisionSchema.array(), revisionsResponse.data.revisions)
          .sort((a, b) => b.revision_number - a.revision_number);
        const artifact = workspace.artifacts.find((item) => item.id === artifactId);
        if (!artifact || artifact.kind !== 'audio_script') {
          throw new ProjectEditorValidationError('这个稿件不是项目口播稿，请返回内容项目重新选择。');
        }
        const revision = revisions.find((item) => item.id === revisionId && item.artifact_id === artifactId);
        if (!revision) {
          throw new ProjectEditorValidationError('找不到指定的口播稿版本，请返回内容项目重新选择。');
        }
        if (requestSequence === editorRevisionRequestSequence) {
          set({
            projectWorkspace: workspace,
            projectArtifactRevisions: revisions,
            projectEditorContext: { projectId, artifactId, revision },
            isLoadingProjectEditorRevision: false,
            projectEditorRevisionError: null,
            script: revision.content,
            currentBroadcast: null,
            segments: [],
          });
        }
        return revision;
      } catch (error) {
        const message = error instanceof ProjectEditorValidationError
          ? error.message
          : getApiErrorMessage(error, '加载项目口播稿失败，请稍后重试');
        if (requestSequence === editorRevisionRequestSequence) {
          set({
            projectEditorContext: null,
            isLoadingProjectEditorRevision: false,
            projectEditorRevisionError: message,
          });
        }
        throw new Error(message, { cause: error });
      }
    },

    adoptProjectEditorRevision: (revision) => {
      set((state) => {
        const context = state.projectEditorContext;
        if (!context || context.artifactId !== revision.artifact_id) return state;
        return {
          projectEditorContext: { ...context, revision },
          script: revision.content,
          currentBroadcast: null,
          segments: [],
        };
      });
    },

    clearProjectEditorContext: () => {
      editorRevisionRequestSequence += 1;
      set({
        projectEditorContext: null,
        isLoadingProjectEditorRevision: false,
        projectEditorRevisionError: null,
      });
    },
  };
}

export default createProjectWorkspaceSlice;
