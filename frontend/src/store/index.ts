import { create } from 'zustand';
import { createBroadcastSlice } from './broadcastSlice';
import { createPresetSlice } from './presetSlice';
import { createScheduleSlice } from './scheduleSlice';
import { createSegmentSlice } from './segmentSlice';
import { createSettingsSlice } from './settingsSlice';
import { createVoiceConfigSlice } from './voiceConfigSlice';
import { createTranscribeSlice } from './transcribeSlice';
import { createResearchSlice } from './researchSlice';
import type { AppState } from './types';

export type {
  AppState,
  AsrEngine,
  AsrModelOption,
  AsrModelCapabilities,
  AsrProvider,
  AsrLanguage,
  BatchGenerateResult,
  BatchTranscriptionItem,
  BatchTranscriptionItemStatus,
  BatchTranscriptionPhase,
  BatchTranscriptionProgress,
  Broadcast,
  ClaimRelationAnalysis,
  ClaimSearchResult,
  ConfirmDialogProps,
  ContentProject,
  ContentTargetPlatform,
  LlmApiFormat,
  LlmModelOption,
  Schedule,
  Segment,
  SegmentDraftInput,
  Settings,
  TodayItem,
  TranscriptionResult,
  TranscriptionRecord,
  TranscriptionChunkPreview,
  TranscriptionProgress,
  TranscriptionStats,
  TranscriptDetail,
  TranscriptClaim,
  TranscriptSegment,
  TranscriptSpeaker,
  TranscriptSummary,
  TranscriptSummaryItem,
  TranscriptSummaryProgress,
  TranscriptTurn,
  VoiceConfig,
  VoicePreset,
} from './types';

export const useStore = create<AppState>((set, get) => ({
  ...createBroadcastSlice(set),
  ...createVoiceConfigSlice(set),
  ...createSegmentSlice(set, get),
  ...createTranscribeSlice(set),
  ...createResearchSlice(set),
  ...createSettingsSlice(set),
  ...createScheduleSlice(set),
  ...createPresetSlice(set),
}));

export default useStore;
