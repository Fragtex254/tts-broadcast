import { voicePresetApi } from '../services/api';
import { createScopedLogger, toLogError } from '../services/logger';
import type { AppState } from './types';
import type { StoreSet } from './storeTypes';

const logger = createScopedLogger('preset-slice');

export function createPresetSlice(set: StoreSet): Pick<AppState, 'presets' | 'isLoadingPresets' | 'presetError' | 'fetchPresets' | 'updatePreset' | 'deletePreset'> {
  return {
    presets: [],
    isLoadingPresets: false,
    presetError: null,

    fetchPresets: async () => {
      set({ isLoadingPresets: true, presetError: null });
      try {
        const response = await voicePresetApi.getAll();
        set({ presets: response.data.presets, isLoadingPresets: false });
      } catch (error) {
        logger.error({ err: toLogError(error) }, '获取预设列表失败');
        set({ isLoadingPresets: false, presetError: '音色预设加载失败，请确认后端服务已启动' });
      }
    },

    updatePreset: async (id, formData) => {
      try {
        const response = await voicePresetApi.update(id, formData);
        set((state) => ({
          presets: state.presets.map((preset) => (
            preset.id === id ? response.data.preset : preset
          )),
          presetError: null,
        }));
      } catch (error) {
        logger.error({ err: toLogError(error), presetId: id }, '更新预设失败');
        throw error;
      }
    },

    deletePreset: async (id) => {
      try {
        await voicePresetApi.delete(id);
        set((state) => ({
          presets: state.presets.filter((p) => p.id !== id),
          presetError: null,
        }));
      } catch (error) {
        logger.error({ err: toLogError(error), presetId: id }, '删除预设失败');
        throw error;
      }
    },
  };
}
