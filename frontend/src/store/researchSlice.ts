import { contentProjectApi, researchApi, transcribeApi } from '../services/api';
import { getApiErrorMessage } from '../services/apiError';
import { ClaimRelationAnalysisSchema, ClaimSearchResultSchema, ContentProjectSchema, safeParseStrict, TranscriptClaimSchema } from '../services/schemas';
import type { AppState } from './types';
import type { StoreSet } from './storeTypes';

let claimDetailRequestSequence = 0;
let claimSearchRequestSequence = 0;
let claimRelationRequestSequence = 0;
let contentProjectsFetchSequence = 0;
let contentProjectFetchSequence = 0;
const contentProjectMutationQueues = new Map<number, Promise<void>>();

const enqueueContentProjectMutation = async <T>(projectId: number, action: () => Promise<T>): Promise<T> => {
  const previous = contentProjectMutationQueues.get(projectId) || Promise.resolve();
  const result = previous.catch(() => undefined).then(action);
  const marker = result.then(() => undefined, () => undefined);
  contentProjectMutationQueues.set(projectId, marker);
  try {
    return await result;
  } finally {
    if (contentProjectMutationQueues.get(projectId) === marker) contentProjectMutationQueues.delete(projectId);
  }
};

export function createResearchSlice(set: StoreSet): Pick<
  AppState,
  | 'claimSearchResults' | 'isSearchingClaims' | 'claimDetail' | 'isLoadingClaimDetail' | 'claimRelationAnalysis' | 'isAnalyzingRelations'
  | 'contentProjects' | 'currentContentProject' | 'isLoadingContentProjects'
  | 'searchClaims' | 'clearResearchContext' | 'fetchClaimDetail' | 'clearClaimDetail' | 'updateClaimDetail' | 'deleteClaimDetail'
  | 'analyzeClaimRelations' | 'fetchContentProjects' | 'createContentProject'
  | 'fetchContentProject' | 'updateContentProject' | 'deleteContentProject' | 'addClaimToContentProject'
  | 'reorderContentProjectClaims' | 'removeClaimFromContentProject' | 'exportContentProject'
> {
  return {
    claimSearchResults: [],
    isSearchingClaims: false,
    claimDetail: null,
    isLoadingClaimDetail: false,
    claimRelationAnalysis: null,
    isAnalyzingRelations: false,
    contentProjects: [],
    currentContentProject: null,
    isLoadingContentProjects: false,

    searchClaims: async (query) => {
      const requestSequence = ++claimSearchRequestSequence;
      set({ isSearchingClaims: true, claimRelationAnalysis: null });
      try {
        const response = await researchApi.searchClaims(query);
        const results = safeParseStrict(ClaimSearchResultSchema.array(), response.data.results);
        if (requestSequence !== claimSearchRequestSequence) return [];
        set({ claimSearchResults: results, isSearchingClaims: false });
        return results;
      } catch (error) {
        if (requestSequence === claimSearchRequestSequence) set({ isSearchingClaims: false });
        throw new Error(getApiErrorMessage(error, '搜索观点失败'), { cause: error });
      }
    },

    clearResearchContext: () => {
      claimSearchRequestSequence += 1;
      claimRelationRequestSequence += 1;
      set({ claimSearchResults: [], isSearchingClaims: false, claimRelationAnalysis: null, isAnalyzingRelations: false });
    },

    fetchClaimDetail: async (claimId) => {
      const requestSequence = ++claimDetailRequestSequence;
      set({ claimDetail: null, isLoadingClaimDetail: true });
      try {
        const response = await researchApi.getClaim(claimId);
        const claim = safeParseStrict(TranscriptClaimSchema, response.data.claim);
        if (requestSequence === claimDetailRequestSequence) set({ claimDetail: claim, isLoadingClaimDetail: false });
        return claim;
      } catch (error) {
        if (requestSequence === claimDetailRequestSequence) set({ claimDetail: null, isLoadingClaimDetail: false });
        throw new Error(getApiErrorMessage(error, '获取观点详情失败'), { cause: error });
      }
    },

    clearClaimDetail: () => {
      claimDetailRequestSequence += 1;
      set({ claimDetail: null, isLoadingClaimDetail: false });
    },

    updateClaimDetail: async (claimId, update) => {
      try {
        const response = await transcribeApi.updateClaim(claimId, update);
        const claim = safeParseStrict(TranscriptClaimSchema, response.data.claim);
        set((state) => ({
          claimDetail: state.claimDetail?.id === claim.id ? claim : state.claimDetail,
          claimSearchResults: state.claimSearchResults.map((item) => item.claim.id === claim.id ? { ...item, claim } : item),
          transcriptDetail: state.transcriptDetail ? { ...state.transcriptDetail, claims: state.transcriptDetail.claims.map((item) => item.id === claim.id ? claim : item) } : null,
          currentContentProject: state.currentContentProject ? {
            ...state.currentContentProject,
            claims: state.currentContentProject.claims.map((item) => item.claim_id === claim.id ? { ...item, claim } : item),
          } : null,
        }));
        return claim;
      } catch (error) {
        throw new Error(getApiErrorMessage(error, '更新观点失败'), { cause: error });
      }
    },

    deleteClaimDetail: async (claimId) => {
      try {
        await transcribeApi.deleteClaim(claimId);
        set((state) => {
          const currentProjectHadClaim = Boolean(state.currentContentProject?.claims.some((item) => item.claim_id === claimId));
          return {
            claimDetail: state.claimDetail?.id === claimId ? null : state.claimDetail,
            claimSearchResults: state.claimSearchResults.filter((item) => item.claim.id !== claimId),
            claimRelationAnalysis: null,
            transcriptDetail: state.transcriptDetail ? { ...state.transcriptDetail, claims: state.transcriptDetail.claims.filter((item) => item.id !== claimId) } : null,
            currentContentProject: state.currentContentProject ? {
              ...state.currentContentProject,
              claim_count: Math.max(0, (state.currentContentProject.claim_count ?? state.currentContentProject.claims.length) - (currentProjectHadClaim ? 1 : 0)),
              claims: state.currentContentProject.claims.filter((item) => item.claim_id !== claimId),
            } : null,
            contentProjects: currentProjectHadClaim && state.currentContentProject
              ? state.contentProjects.map((project) => project.id === state.currentContentProject?.id
                ? { ...project, claim_count: Math.max(0, (project.claim_count ?? project.claims.length) - 1) }
                : project)
              : state.contentProjects,
          };
        });
      } catch (error) {
        throw new Error(getApiErrorMessage(error, '删除观点失败'), { cause: error });
      }
    },

    analyzeClaimRelations: async (claimIds) => {
      const requestSequence = ++claimRelationRequestSequence;
      set({ isAnalyzingRelations: true });
      try {
        const response = await researchApi.analyzeRelations(claimIds);
        const analysis = safeParseStrict(ClaimRelationAnalysisSchema, response.data.analysis);
        if (requestSequence === claimRelationRequestSequence) set({ claimRelationAnalysis: analysis, isAnalyzingRelations: false });
        return analysis;
      } catch (error) {
        if (requestSequence === claimRelationRequestSequence) set({ isAnalyzingRelations: false });
        throw new Error(getApiErrorMessage(error, '分析观点关系失败'), { cause: error });
      }
    },

    fetchContentProjects: async () => {
      const requestSequence = ++contentProjectsFetchSequence;
      set({ isLoadingContentProjects: true });
      try {
        const response = await contentProjectApi.getAll();
        const projects = safeParseStrict(ContentProjectSchema.array(), response.data.projects);
        if (requestSequence === contentProjectsFetchSequence) set({ contentProjects: projects, isLoadingContentProjects: false });
        return projects;
      } catch (error) {
        if (requestSequence === contentProjectsFetchSequence) set({ isLoadingContentProjects: false });
        throw new Error(getApiErrorMessage(error, '获取内容项目失败'), { cause: error });
      }
    },

    createContentProject: async (data) => {
      const response = await contentProjectApi.create(data);
      const project = safeParseStrict(ContentProjectSchema, response.data.project);
      contentProjectsFetchSequence += 1;
      contentProjectFetchSequence += 1;
      set((state) => ({ contentProjects: [project, ...state.contentProjects], currentContentProject: project, isLoadingContentProjects: false }));
      return project;
    },

    fetchContentProject: async (id) => {
      const requestSequence = ++contentProjectFetchSequence;
      const response = await contentProjectApi.getById(id);
      const project = safeParseStrict(ContentProjectSchema, response.data.project);
      if (requestSequence === contentProjectFetchSequence) set({ currentContentProject: project });
      return project;
    },

    updateContentProject: (id, data) => enqueueContentProjectMutation(id, async () => {
      const response = await contentProjectApi.update(id, data);
      const project = safeParseStrict(ContentProjectSchema, response.data.project);
      set((state) => ({
        currentContentProject: state.currentContentProject?.id === id ? project : state.currentContentProject,
        contentProjects: state.contentProjects.map((item) => item.id === id ? project : item),
        projectWorkspace: state.projectWorkspace?.project.id === id
          ? { ...state.projectWorkspace, project }
          : state.projectWorkspace,
      }));
      return project;
    }),

    deleteContentProject: async (id) => {
      await contentProjectApi.delete(id);
      contentProjectsFetchSequence += 1;
      contentProjectFetchSequence += 1;
      set((state) => ({
        contentProjects: state.contentProjects.filter((item) => item.id !== id),
        currentContentProject: state.currentContentProject?.id === id ? null : state.currentContentProject,
        isLoadingContentProjects: false,
      }));
    },

    addClaimToContentProject: (projectId, claimId, usageNote = '') => enqueueContentProjectMutation(projectId, async () => {
      const response = await contentProjectApi.addClaim(projectId, claimId, usageNote);
      const project = safeParseStrict(ContentProjectSchema, response.data.project);
      set((state) => ({
        currentContentProject: state.currentContentProject?.id === projectId ? project : state.currentContentProject,
        contentProjects: state.contentProjects.map((item) => item.id === projectId ? project : item),
      }));
      return project;
    }),

    reorderContentProjectClaims: (projectId, claimIds) => enqueueContentProjectMutation(projectId, async () => {
      const response = await contentProjectApi.reorderClaims(projectId, claimIds);
      const project = safeParseStrict(ContentProjectSchema, response.data.project);
      set((state) => ({
        currentContentProject: state.currentContentProject?.id === projectId ? project : state.currentContentProject,
        contentProjects: state.contentProjects.map((item) => item.id === projectId ? project : item),
      }));
      return project;
    }),

    removeClaimFromContentProject: (projectId, claimId) => enqueueContentProjectMutation(projectId, async () => {
      await contentProjectApi.removeClaim(projectId, claimId);
      set((state) => {
        const update = (project: AppState['currentContentProject']) => project ? {
          ...project,
          claim_count: Math.max(0, (project.claim_count ?? project.claims.length) - (project.claims.some((item) => item.claim_id === claimId) ? 1 : 0)),
          claims: project.claims.filter((item) => item.claim_id !== claimId),
        } : null;
        return {
          currentContentProject: state.currentContentProject?.id === projectId ? update(state.currentContentProject) : state.currentContentProject,
          contentProjects: state.contentProjects.map((project) => project.id === projectId ? update(project) || project : project),
        };
      });
    }),

    exportContentProject: async (projectId, platform) => {
      const response = await contentProjectApi.export(projectId, platform);
      if (typeof response.data.markdown !== 'string') throw new Error('导出结果格式无效');
      return response.data.markdown;
    },
  };
}
