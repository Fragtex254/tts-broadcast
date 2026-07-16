import { contentProjectApi, researchApi } from '../services/api';
import { getApiErrorMessage } from '../services/apiError';
import { ClaimRelationAnalysisSchema, ClaimSearchResultSchema, ContentProjectSchema, safeParseStrict } from '../services/schemas';
import type { AppState } from './types';
import type { StoreSet } from './storeTypes';

export function createResearchSlice(set: StoreSet): Pick<
  AppState,
  | 'claimSearchResults' | 'isSearchingClaims' | 'claimRelationAnalysis' | 'isAnalyzingRelations'
  | 'contentProjects' | 'currentContentProject' | 'isLoadingContentProjects'
  | 'searchClaims' | 'analyzeClaimRelations' | 'fetchContentProjects' | 'createContentProject'
  | 'fetchContentProject' | 'updateContentProject' | 'deleteContentProject' | 'addClaimToContentProject'
  | 'reorderContentProjectClaims' | 'removeClaimFromContentProject' | 'exportContentProject'
> {
  return {
    claimSearchResults: [],
    isSearchingClaims: false,
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
