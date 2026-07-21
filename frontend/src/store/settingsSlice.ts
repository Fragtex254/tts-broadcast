import { settingsApi, transcribeApi } from '../services/api';
import { getApiErrorMessage } from '../services/apiError';
import { createScopedLogger, toLogError } from '../services/logger';
import { safeParseStrict, SettingsSchema } from '../services/schemas';
import { defaultSettings } from './defaults';
import type { AppState } from './types';
import type { StoreSet } from './storeTypes';

const logger = createScopedLogger('settings-slice');

export function createSettingsSlice(set: StoreSet): Pick<
  AppState,
  'settings' | 'isLoadingSettings' | 'fetchSettings' | 'updateSettings' | 'testApiKey' | 'fetchLlmModels' | 'fetchAsrModels'
> {
  return {
    settings: defaultSettings,
    isLoadingSettings: false,

    fetchSettings: async () => {
      set({ isLoadingSettings: true });
      try {
        const response = await settingsApi.get();
        const settings = safeParseStrict(SettingsSchema, response.data.settings);
        set({ settings, isLoadingSettings: false });
      } catch (error) {
        set({ isLoadingSettings: false });
        logger.error({ err: toLogError(error) }, '获取设置失败');
        throw error;
      }
    },

    updateSettings: async (data) => {
      try {
        const response = await settingsApi.update(data);
        const settings = safeParseStrict(SettingsSchema, response.data.settings);
        set({ settings });
      } catch (error) {
        logger.error({ err: toLogError(error), fieldCount: Object.keys(data).length }, '更新设置失败');
        throw error;
      }
    },

    testApiKey: async (type, apiKey, llmConfig) => {
      try {
        const response = await settingsApi.testKey(type, apiKey, llmConfig);
        return response.data;
      } catch (error) {
        logger.error({ err: toLogError(error), type, hasApiKey: Boolean(apiKey), hasLlmConfig: Boolean(llmConfig) }, '测试 API Key 失败');
        return { valid: false, error: (error as Error).message };
      }
    },

    fetchLlmModels: async (data) => {
      try {
        const response = await settingsApi.fetchLlmModels(data);
        return response.data;
      } catch (error) {
        logger.error({ err: toLogError(error), apiFormat: data.apiFormat, hasApiKey: Boolean(data.apiKey) }, '获取 LLM 模型列表失败');
        throw new Error(getApiErrorMessage(error, '获取模型列表失败'), { cause: error });
      }
    },

    fetchAsrModels: async (data) => {
      try {
        const response = await transcribeApi.fetchModels(data);
        return response.data;
      } catch (error) {
        logger.error({ err: toLogError(error), provider: data.provider, hasApiKey: Boolean(data.apiKey) }, '获取 ASR 模型列表失败');
        throw new Error(getApiErrorMessage(error, '获取 ASR 模型列表失败'), { cause: error });
      }
    },
  };
}
