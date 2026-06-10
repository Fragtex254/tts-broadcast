import { defaultVoiceConfig } from './defaults';
import type { AppState } from './types';
import type { StoreSet } from './storeTypes';

export function createVoiceConfigSlice(set: StoreSet): Pick<AppState, 'voiceConfig' | 'updateVoiceConfig'> {
  return {
    voiceConfig: defaultVoiceConfig,

    updateVoiceConfig: (config) => {
      set((state) => ({
        voiceConfig: { ...state.voiceConfig, ...config },
      }));
    },
  };
}
