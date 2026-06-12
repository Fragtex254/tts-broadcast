import { settingsApi } from '../services/api';
import { getApiErrorMessage } from '../services/apiError';
import { safeParse, SettingsSchema } from '../services/schemas';
import { defaultSettings } from './defaults';
import type { AppState } from './types';
import type { StoreSet } from './storeTypes';

export function createSettingsSlice(set: StoreSet): Pick<
  AppState,
  'settings' | 'isLoadingSettings' | 'fetchSettings' | 'updateSettings' | 'testApiKey' | 'fetchLlmModels'
> {
  return {
    settings: defaultSettings,
    isLoadingSettings: false,

    fetchSettings: async () => {
      set({ isLoadingSettings: true });
      try {
        const response = await settingsApi.get();
        const settings = safeParse(SettingsSchema, response.data.settings) || response.data.settings;
        set({ settings, isLoadingSettings: false });
      } catch (error) {
        set({ isLoadingSettings: false });
        console.error('获取设置失败:', error);
        throw error;
      }
    },

    updateSettings: async (data) => {
      try {
        const response = await settingsApi.update(data);
        const settings = safeParse(SettingsSchema, response.data.settings) || response.data.settings;
        set({ settings });
      } catch (error) {
        console.error('更新设置失败:', error);
        throw error;
      }
    },

    testApiKey: async (type, apiKey, llmConfig) => {
      try {
        const response = await settingsApi.testKey(type, apiKey, llmConfig);
        return response.data;
      } catch (error) {
        console.error('测试 API Key 失败:', error);
        return { valid: false, error: (error as Error).message };
      }
    },

    fetchLlmModels: async (data) => {
      try {
        const response = await settingsApi.fetchLlmModels(data);
        return response.data;
      } catch (error) {
        console.error('获取 LLM 模型列表失败:', error);
        throw new Error(getApiErrorMessage(error, '获取模型列表失败'), { cause: error });
      }
    },
  };
}
