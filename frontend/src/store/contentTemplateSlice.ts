import { contentTemplateApi } from '../services/api';
import { createScopedLogger, toLogError } from '../services/logger';
import { ContentTemplateSchema, safeParseArray, safeParseStrict } from '../services/schemas';
import type { AppState } from './types';
import type { StoreSet } from './storeTypes';

const logger = createScopedLogger('content-template-slice');

export function createContentTemplateSlice(set: StoreSet): Pick<
  AppState,
  | 'contentTemplates'
  | 'selectedTemplateId'
  | 'isLoadingContentTemplates'
  | 'contentTemplateError'
  | 'fetchContentTemplates'
  | 'selectContentTemplate'
  | 'createContentTemplate'
  | 'updateContentTemplate'
  | 'deleteContentTemplate'
> {
  return {
    contentTemplates: [],
    selectedTemplateId: null,
    isLoadingContentTemplates: false,
    contentTemplateError: null,

    fetchContentTemplates: async () => {
      set({ isLoadingContentTemplates: true, contentTemplateError: null });
      try {
        const response = await contentTemplateApi.getAll();
        const templates = safeParseArray(ContentTemplateSchema, response.data.templates || []);
        set((state) => ({
          contentTemplates: templates,
          selectedTemplateId: state.selectedTemplateId
            ?? templates.find((item) => item.name === '3 分钟资讯播报')?.id
            ?? templates[0]?.id
            ?? null,
          isLoadingContentTemplates: false,
        }));
        return templates;
      } catch (error) {
        set({ isLoadingContentTemplates: false, contentTemplateError: '获取创作模板失败' });
        logger.error({ err: toLogError(error) }, '获取创作模板失败');
        throw error;
      }
    },

    selectContentTemplate: (id) => set({ selectedTemplateId: id }),

    createContentTemplate: async (data) => {
      try {
        const response = await contentTemplateApi.create(data);
        const template = safeParseStrict(ContentTemplateSchema, response.data.template);
        set((state) => ({ contentTemplates: [...state.contentTemplates, template], selectedTemplateId: template.id }));
        return template;
      } catch (error) {
        logger.error({ err: toLogError(error) }, '创建创作模板失败');
        throw error;
      }
    },

    updateContentTemplate: async (id, data) => {
      try {
        const response = await contentTemplateApi.update(id, data);
        const template = safeParseStrict(ContentTemplateSchema, response.data.template);
        set((state) => ({ contentTemplates: state.contentTemplates.map((item) => item.id === id ? template : item) }));
        return template;
      } catch (error) {
        logger.error({ err: toLogError(error), templateId: id }, '更新创作模板失败');
        throw error;
      }
    },

    deleteContentTemplate: async (id) => {
      try {
        await contentTemplateApi.delete(id);
        set((state) => {
          const templates = state.contentTemplates.filter((item) => item.id !== id);
          return {
            contentTemplates: templates,
            selectedTemplateId: state.selectedTemplateId === id ? templates[0]?.id ?? null : state.selectedTemplateId,
          };
        });
      } catch (error) {
        logger.error({ err: toLogError(error), templateId: id }, '删除创作模板失败');
        throw error;
      }
    },
  };
}
