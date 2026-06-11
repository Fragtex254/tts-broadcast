import { transcribeApi } from '../services/api';
import type { AppState, AsrLanguage, TranscriptionResult } from './types';
import type { StoreSet } from './storeTypes';

export function createTranscribeSlice(set: StoreSet): Pick<
  AppState,
  | 'transcriptionText'
  | 'isTranscribing'
  | 'transcribeMedia'
  | 'setTranscriptionText'
  | 'clearTranscription'
> {
  return {
    transcriptionText: '',
    isTranscribing: false,

    transcribeMedia: async (file: File, language: AsrLanguage) => {
      set({ isTranscribing: true });
      try {
        const formData = new FormData();
        formData.append('media', file);
        formData.append('language', language);

        const response = await transcribeApi.transcribe(formData);
        const result = response.data as TranscriptionResult;
        set({ transcriptionText: result.text, isTranscribing: false });
        return result;
      } catch (error) {
        set({ isTranscribing: false });
        console.error('转录失败:', error);
        throw error;
      }
    },

    setTranscriptionText: (text) => {
      set({ transcriptionText: text });
    },

    clearTranscription: () => {
      set({ transcriptionText: '' });
    },
  };
}
