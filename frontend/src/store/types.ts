import type { NewsItem } from '../services/api';

/** 播报记录 */
export interface Broadcast {
  id: number;
  title: string;
  content: string;
  audio_path: string | null;
  duration: number | null;
  voice_type: string | null;
  voice_config: string | null;
  source_items: string | null;
  status: string;
  saved: number;
  mode: 'whole' | 'segmented';
  created_at: string;
  updated_at: string;
}

/** 逐句 segment */
export interface Segment {
  id: number;
  broadcast_id: number;
  index: number;
  text: string;
  audio_path: string | null;
  status: 'pending' | 'generating' | 'generated' | 'failed';
  created_at: string;
  updated_at: string;
}

/** 今日资讯条目 */
export interface TodayItem {
  id: string;
  title: string;
  summary: string;
  category: string;
  source_url: string;
  published_at: string;
  [key: string]: unknown;
}

/** 应用设置 */
export interface Settings {
  mimo_api_key: string;
  mimo_tts_api_key: string;
  default_voice: string;
  opening_script: string;
  closing_script: string;
  content_categories: string;
}

/** 定时任务 */
export interface Schedule {
  id: number;
  name: string;
  cron_expression: string;
  content_types: string | null;
  is_active: number;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

/** 音色预设 */
export interface VoicePreset {
  id: number;
  type: 'clone' | 'design';
  name: string;
  style_prompt: string;
  trial_audio_path: string | null;
  original_audio_path: string | null;
  design_prompt: string | null;
  created_at: string;
  updated_at: string;
}

export interface VoiceConfig {
  voice: string;
  voiceType: string;
  voiceDesign: string;
  voiceClone: string;
  stylePrompt: string;
  speed: { speed_ratio: number; style?: string } | null;
  emotion: string | { emotion: string; weight: number }[] | null;
  pitch: { pitch_ratio: number; style?: string } | null;
}

export interface BatchGenerateResult {
  id: number;
  status: Segment['status'];
  error?: string;
}

export type AsrLanguage = 'auto' | 'zh' | 'en';

export interface TranscriptionResult {
  text: string;
  usage?: Record<string, unknown> | null;
}

export type TranscriptionPhase = 'idle' | 'uploading' | 'preparing' | 'transcribing' | 'completed' | 'failed';

export interface TranscriptionProgress {
  phase: TranscriptionPhase;
  percent: number;
  current: number;
  total: number;
  message: string;
}

/** 确认对话框 */
export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  warningMessage?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

/** 应用状态 */
export interface AppState {
  broadcasts: Broadcast[];
  currentBroadcast: Broadcast | null;
  todayItems: TodayItem[];
  script: string;
  isGenerating: boolean;
  isRewriting: boolean;

  segments: Segment[];
  isSplitting: boolean;
  isMerging: boolean;

  transcriptionText: string;
  isTranscribing: boolean;
  transcribeProgress: TranscriptionProgress;

  voiceConfig: VoiceConfig;
  updateVoiceConfig: (config: Partial<VoiceConfig>) => void;

  settings: Settings;
  isLoadingSettings: boolean;

  schedules: Schedule[];
  presets: VoicePreset[];

  fetchTodayItems: (params?: { category?: string; take?: number }) => Promise<void>;
  rewriteScript: (data: { items: NewsItem[]; opening?: string; closing?: string }) => Promise<string>;
  generateBroadcast: (data: {
    text: string;
    voice?: string;
    voiceType?: string;
    voiceDesign?: string;
    voiceClone?: string;
    stylePrompt?: string;
    speed?: { speed_ratio: number; style?: string } | null;
    emotion?: string | { emotion: string; weight: number }[] | null;
    pitch?: { pitch_ratio: number; style?: string } | null;
    mode?: 'whole' | 'segmented';
  }) => Promise<{ broadcast: Broadcast; audioUrl: string }>;
  fetchBroadcasts: (params?: { page?: number; limit?: number }) => Promise<{
    broadcasts: Broadcast[];
    pagination: { page: number; limit: number; total: number };
  }>;
  setCurrentBroadcast: (broadcast: Broadcast | null) => void;
  saveBroadcast: (id: number) => Promise<Broadcast>;
  updateScript: (script: string) => void;

  splitScriptAction: (text: string) => Promise<void>;
  splitScript: (broadcastId: number) => Promise<Segment[]>;
  fetchSegments: (broadcastId: number) => Promise<Segment[]>;
  updateSegmentText: (broadcastId: number, segId: number, text: string) => Promise<Segment>;
  regenerateSegment: (broadcastId: number, segId: number) => Promise<Segment>;
  batchGenerateSegments: (broadcastId: number) => Promise<{ segments: Segment[]; results: BatchGenerateResult[] }>;
  deleteSegment: (broadcastId: number, segId: number) => Promise<Segment[]>;
  mergeSegments: (broadcastId: number) => Promise<Broadcast>;
  clearSegments: () => void;

  transcribeMedia: (file: File, language: AsrLanguage) => Promise<TranscriptionResult>;
  setTranscriptionText: (text: string) => void;
  clearTranscription: () => void;

  fetchSettings: () => Promise<void>;
  updateSettings: (data: Partial<Settings>) => Promise<void>;
  testApiKey: (type?: 'llm' | 'tts', apiKey?: string) => Promise<{ valid: boolean; error?: string }>;

  fetchSchedules: () => Promise<void>;
  createSchedule: (data: { name: string; cron_expression: string; content_types?: string }) => Promise<Schedule>;
  updateSchedule: (id: number, data: { name?: string; cron_expression?: string; content_types?: string }) => Promise<Schedule>;
  deleteSchedule: (id: number) => Promise<void>;
  toggleSchedule: (id: number) => Promise<Schedule>;

  fetchPresets: () => Promise<void>;
  deletePreset: (id: number) => Promise<void>;

  isBatchDeleting: boolean;
  batchDeleteBroadcasts: (ids: number[]) => Promise<{ deleted: number; failed: number }>;
}
