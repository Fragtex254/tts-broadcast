import { settingsApi } from '../services/api';
import { defaultSettings } from './defaults';
import type { AppState } from './types';
import type { StoreSet } from './storeTypes';

export function createSettingsSlice(set: StoreSet): Pick<
  AppState,
  'settings' | 'isLoadingSettings' | 'fetchSettings' | 'updateSettings' | 'testApiKey'
> {
  return {
    settings: defaultSettings,
    isLoadingSettings: false,

    fetchSettings: async () => {
      set({ isLoadingSettings: true });
      try {
        const response = await settingsApi.get();
        set({ settings: response.data.settings, isLoadingSettings: false });
      } catch (error) {
        set({ isLoadingSettings: false });
        console.error('获取设置失败:', error);
        throw error;
      }
    },

    updateSettings: async (data) => {
      try {
        const response = await settingsApi.update(data);
        set({ settings: response.data.settings });
      } catch (error) {
        console.error('更新设置失败:', error);
        throw error;
      }
    },

    testApiKey: async (type) => {
      try {
        const response = await settingsApi.testKey(type);
        return response.data;
      } catch (error) {
        console.error('测试 API Key 失败:', error);
        return { valid: false, error: (error as Error).message };
      }
    },
  };
}
