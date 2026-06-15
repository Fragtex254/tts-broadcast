import { voicePresetApi } from '../services/api';
import { createScopedLogger, toLogError } from '../services/logger';
import type { AppState } from './types';
import type { StoreSet } from './storeTypes';

const logger = createScopedLogger('preset-slice');

export function createPresetSlice(set: StoreSet): Pick<AppState, 'presets' | 'fetchPresets' | 'deletePreset'> {
  return {
    presets: [],

    fetchPresets: async () => {
      try {
        const response = await voicePresetApi.getAll();
        set({ presets: response.data.presets });
      } catch (error) {
        logger.error({ err: toLogError(error) }, '获取预设列表失败');
      }
    },

    deletePreset: async (id) => {
      try {
        await voicePresetApi.delete(id);
        set((state) => ({
          presets: state.presets.filter((p) => p.id !== id),
        }));
      } catch (error) {
        logger.error({ err: toLogError(error), presetId: id }, '删除预设失败');
        throw error;
      }
    },
  };
}
