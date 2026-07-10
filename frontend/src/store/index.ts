import { create } from 'zustand';
import { createBroadcastSlice } from './broadcastSlice';
import { createPresetSlice } from './presetSlice';
import { createScheduleSlice } from './scheduleSlice';
import { createSegmentSlice } from './segmentSlice';
import { createSettingsSlice } from './settingsSlice';
import { createVoiceConfigSlice } from './voiceConfigSlice';
import { createTranscribeSlice } from './transcribeSlice';
import type { AppState } from './types';

export type {
  AppState,
  AsrModelOption,
  AsrProvider,
  AsrLanguage,
  BatchGenerateResult,
  BatchTranscriptionItem,
  BatchTranscriptionItemStatus,
  BatchTranscriptionPhase,
  BatchTranscriptionProgress,
  Broadcast,
  ConfirmDialogProps,
  LlmApiFormat,
  LlmModelOption,
  Schedule,
  Segment,
  SegmentDraftInput,
  Settings,
  TodayItem,
  TranscriptionResult,
  TranscriptionRecord,
  TranscriptionStats,
  VoiceConfig,
  VoicePreset,
} from './types';

export const useStore = create<AppState>((set, get) => ({
  ...createBroadcastSlice(set),
  ...createVoiceConfigSlice(set),
  ...createSegmentSlice(set, get),
  ...createTranscribeSlice(set),
  ...createSettingsSlice(set),
  ...createScheduleSlice(set),
  ...createPresetSlice(set),
}));

export default useStore;
