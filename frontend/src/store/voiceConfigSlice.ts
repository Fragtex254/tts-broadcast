import { broadcastApi } from '../services/api';
import { createScopedLogger, toLogError } from '../services/logger';
import { defaultVoiceConfig } from './defaults';
import type { AppState } from './types';
import type { StoreSet } from './storeTypes';

const logger = createScopedLogger('voice-config-slice');

export function createVoiceConfigSlice(set: StoreSet): Pick<AppState, 'voiceConfig' | 'updateVoiceConfig' | 'syncVoiceConfig'> {
  return {
    voiceConfig: defaultVoiceConfig,

    updateVoiceConfig: (config) => {
      set((state) => ({
        voiceConfig: { ...state.voiceConfig, ...config },
      }));
    },

    syncVoiceConfig: async (broadcastId, config) => {
      try {
        await broadcastApi.updateVoiceConfig(broadcastId, {
          voiceType: config.voiceType,
          voice: config.voiceType === 'preset' ? config.voice : undefined,
          voiceDesign: config.voiceType === 'design' ? config.voiceDesign : undefined,
          voiceClone: config.voiceType === 'clone' ? config.voiceClone : undefined,
          stylePrompt: config.stylePrompt || undefined,
          optimizeTextPreview: config.voiceType === 'design' ? config.optimizeTextPreview : undefined,
          speed: config.speed,
          emotion: config.emotion,
          pitch: config.pitch,
        });
      } catch (error) {
        logger.error({ err: toLogError(error), broadcastId, voiceType: config.voiceType }, '同步播报音色失败');
        throw error;
      }
    },
  };
}
