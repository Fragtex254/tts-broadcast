import { contentProjectApi, researchApi, transcribeApi } from '../services/api';
import { getApiErrorMessage } from '../services/apiError';
import { ClaimRelationAnalysisSchema, ClaimSearchResultSchema, ContentProjectSchema, safeParseStrict, TranscriptClaimSchema } from '../services/schemas';
import type { AppState } from './types';
import type { StoreSet } from './storeTypes';

let claimDetailRequestSequence = 0;

export function createResearchSlice(set: StoreSet): Pick<
  AppState,
  | 'claimSearchResults' | 'isSearchingClaims' | 'claimDetail' | 'isLoadingClaimDetail' | 'claimRelationAnalysis' | 'isAnalyzingRelations'
  | 'contentProjects' | 'currentContentProject' | 'isLoadingContentProjects'
  | 'searchClaims' | 'fetchClaimDetail' | 'clearClaimDetail' | 'updateClaimDetail' | 'deleteClaimDetail'
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
      set({ isSearchingClaims: true, claimRelationAnalysis: null });
      try {
        const response = await researchApi.searchClaims(query);
        const results = safeParseStrict(ClaimSearchResultSchema.array(), response.data.results);
        set({ claimSearchResults: results, isSearchingClaims: false });
        return results;
      } catch (error) {
        set({ isSearchingClaims: false });
        throw new Error(getApiErrorMessage(error, '搜索观点失败'), { cause: error });
      }
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
      set({ isAnalyzingRelations: true });
      try {
        const response = await researchApi.analyzeRelations(claimIds);
        const analysis = safeParseStrict(ClaimRelationAnalysisSchema, response.data.analysis);
        set({ claimRelationAnalysis: analysis, isAnalyzingRelations: false });
        return analysis;
      } catch (error) {
        set({ isAnalyzingRelations: false });
        throw new Error(getApiErrorMessage(error, '分析观点关系失败'), { cause: error });
      }
    },

    fetchContentProjects: async () => {
      set({ isLoadingContentProjects: true });
      try {
        const response = await contentProjectApi.getAll();
        const projects = safeParseStrict(ContentProjectSchema.array(), response.data.projects);
        set({ contentProjects: projects, isLoadingContentProjects: false });
        return projects;
      } catch (error) {
        set({ isLoadingContentProjects: false });
        throw new Error(getApiErrorMessage(error, '获取内容项目失败'), { cause: error });
      }
    },

    createContentProject: async (data) => {
      const response = await contentProjectApi.create(data);
      const project = safeParseStrict(ContentProjectSchema, response.data.project);
      set((state) => ({ contentProjects: [project, ...state.contentProjects], currentContentProject: project }));
      return project;
    },

    fetchContentProject: async (id) => {
      const response = await contentProjectApi.getById(id);
      const project = safeParseStrict(ContentProjectSchema, response.data.project);
      set({ currentContentProject: project });
      return project;
    },

    updateContentProject: async (id, data) => {
      const response = await contentProjectApi.update(id, data);
      const project = safeParseStrict(ContentProjectSchema, response.data.project);
      set((state) => ({ currentContentProject: project, contentProjects: state.contentProjects.map((item) => item.id === id ? project : item) }));
      return project;
    },

    deleteContentProject: async (id) => {
      await contentProjectApi.delete(id);
      set((state) => ({ contentProjects: state.contentProjects.filter((item) => item.id !== id), currentContentProject: state.currentContentProject?.id === id ? null : state.currentContentProject }));
    },

    addClaimToContentProject: async (projectId, claimId, usageNote = '') => {
      const response = await contentProjectApi.addClaim(projectId, claimId, usageNote);
      const project = safeParseStrict(ContentProjectSchema, response.data.project);
      set((state) => ({ currentContentProject: project, contentProjects: state.contentProjects.map((item) => item.id === projectId ? project : item) }));
      return project;
    },

    reorderContentProjectClaims: async (projectId, claimIds) => {
      const response = await contentProjectApi.reorderClaims(projectId, claimIds);
      const project = safeParseStrict(ContentProjectSchema, response.data.project);
      set({ currentContentProject: project });
      return project;
    },

    removeClaimFromContentProject: async (projectId, claimId) => {
      await contentProjectApi.removeClaim(projectId, claimId);
      set((state) => state.currentContentProject?.id === projectId ? { currentContentProject: { ...state.currentContentProject, claims: state.currentContentProject.claims.filter((item) => item.claim_id !== claimId) } } : {});
    },

    exportContentProject: async (projectId, platform) => {
      const response = await contentProjectApi.export(projectId, platform);
      if (typeof response.data.markdown !== 'string') throw new Error('导出结果格式无效');
      return response.data.markdown;
    },
  };
}
