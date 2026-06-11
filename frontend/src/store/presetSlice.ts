import { voicePresetApi } from '../services/api';
import type { AppState } from './types';
import type { StoreSet } from './storeTypes';

export function createPresetSlice(set: StoreSet): Pick<AppState, 'presets' | 'fetchPresets' | 'deletePreset'> {
  return {
    presets: [],

    fetchPresets: async () => {
      try {
        const response = await voicePresetApi.getAll();
        set({ presets: response.data.presets });
      } catch (error) {
        console.error('获取预设列表失败:', error);
      }
    },

    deletePreset: async (id) => {
      try {
        await voicePresetApi.delete(id);
        set((state) => ({
          presets: state.presets.filter((p) => p.id !== id),
        }));
      } catch (error) {
        console.error('删除预设失败:', error);
        throw error;
      }
    },
  };
}
