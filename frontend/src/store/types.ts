/** 资讯条目 */
export interface NewsItem {
  id: string;
  title: string;
  content?: string;
  summary?: string;
  category?: string;
  published_at?: string;
  source_url?: string;
  [key: string]: unknown;
}

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
  style_tag: string;
  error_message: string;
  created_at: string;
  updated_at: string;
}

export interface SegmentDraftInput {
  id?: number;
  text: string;
  styleTag?: string;
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
export type LlmApiFormat = 'openai' | 'anthropic';
export type AsrProvider = 'mimo' | 'qwen_mlx' | 'wsl_asr';
export type UiFontPreset = 'modern' | 'system' | 'editorial';
export type UiFontScale = 'compact' | 'comfortable' | 'large' | 'extra_large';

export interface LlmModelOption {
  id: string;
  owned_by?: string;
}

export interface Settings {
  mimo_api_key: string;
  mimo_tts_api_key: string;
  llm_api_format: LlmApiFormat;
  llm_base_url: string;
  llm_model: string;
  llm_rewrite_system_prompt: string;
  llm_split_system_prompt: string;
  llm_rewrite_thinking_enabled: boolean;
  llm_split_thinking_enabled: boolean;
  asr_provider: AsrProvider;
  qwen_asr_base_url: string;
  qwen_asr_model: string;
  qwen_asr_api_key: string;
  wsl_asr_base_url: string;
  wsl_asr_model: string;
  wsl_asr_api_key: string;
  default_voice: string;
  ui_font_preset: UiFontPreset;
  ui_font_scale: UiFontScale;
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
  optimizeTextPreview: boolean;
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

export interface TranscribeOptions {
  wslModel?: string;
  context?: string;
}

export interface TranscriptionRecord {
  id: number;
  file_name: string;
  relative_path: string;
  text: string;
  formatted_text: string;
  language: AsrLanguage;
  provider: AsrProvider | '';
  model: string;
  context: string;
  usage?: Record<string, unknown> | null;
  task_id: string;
  file_size_bytes: number;
  audio_duration_seconds: number;
  processing_seconds: number;
  created_at: string;
  updated_at: string;
}

export interface TranscriptionStats {
  total_count: number;
  total_file_size_bytes: number;
  total_audio_duration_seconds: number;
  total_text_chars: number;
  total_processing_seconds: number;
}

export interface TranscriptionResult {
  text: string;
  usage?: Record<string, unknown> | null;
  transcriptionResult?: TranscriptionRecord;
}

export type TranscriptionPhase = 'idle' | 'uploading' | 'preparing' | 'transcribing' | 'completed' | 'failed';

export interface TranscriptionProgress {
  phase: TranscriptionPhase;
  percent: number;
  current: number;
  total: number;
  message: string;
}

export type BatchTranscriptionItemStatus = 'pending' | 'transcribing' | 'completed' | 'failed';

export interface BatchTranscriptionItem {
  fileName: string;
  relativePath: string;
  text: string;
  formattedText?: string;
  resultId?: number;
  transcriptionResult?: TranscriptionRecord;
  usage?: Record<string, unknown> | null;
  status: BatchTranscriptionItemStatus;
  error?: string;
}

export type BatchTranscriptionPhase =
  | 'idle'
  | 'uploading'
  | 'batch-preparing'
  | 'file-start'
  | 'file-progress'
  | 'file-complete'
  | 'file-error'
  | 'completed'
  | 'failed';

export interface BatchTranscriptionProgress {
  phase: BatchTranscriptionPhase;
  percent: number;
  currentIndex: number;
  total: number;
  currentFileName: string;
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
  transcriptionRecord: TranscriptionRecord | null;
  transcriptionHistory: TranscriptionRecord[];
  transcriptionStats: TranscriptionStats;
  isTranscribing: boolean;
  isLoadingTranscriptionHistory: boolean;
  isLoadingTranscriptionStats: boolean;
  isDeletingTranscriptionResult: boolean;
  transcribeProgress: TranscriptionProgress;

  batchTranscriptionItems: BatchTranscriptionItem[];
  isBatchTranscribing: boolean;
  batchTranscribeProgress: BatchTranscriptionProgress;

  voiceConfig: VoiceConfig;
  updateVoiceConfig: (config: Partial<VoiceConfig>) => void;

  settings: Settings;
  isLoadingSettings: boolean;

  schedules: Schedule[];
  presets: VoicePreset[];
  isLoadingPresets: boolean;
  presetError: string | null;

  fetchTodayItems: (params?: { category?: string; take?: number }) => Promise<void>;
  rewriteScript: (data: { items: NewsItem[]; opening?: string; closing?: string }) => Promise<string>;
  generateBroadcast: (data: {
    text: string;
    voice?: string;
    voiceType?: string;
    voiceDesign?: string;
    voiceClone?: string;
    stylePrompt?: string;
    optimizeTextPreview?: boolean;
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
  replaceSegments: (broadcastId: number, segments: SegmentDraftInput[]) => Promise<Segment[]>;
  mergeSegments: (broadcastId: number) => Promise<Broadcast>;
  isSuggestingTags: boolean;
  updateSegmentStyleTag: (broadcastId: number, segId: number, styleTag: string) => Promise<Segment>;
  suggestTags: (broadcastId: number) => Promise<Segment[]>;
  clearSegments: () => void;

  transcribeMedia: (
    file: File,
    language: AsrLanguage,
    provider?: AsrProvider,
    options?: TranscribeOptions
  ) => Promise<TranscriptionResult>;
  fetchTranscriptionHistory: (params?: { limit?: number }) => Promise<TranscriptionRecord[]>;
  fetchTranscriptionStats: () => Promise<TranscriptionStats>;
  deleteTranscriptionHistoryResult: (id: number) => Promise<void>;
  formatTranscriptionResult: (id: number, text: string) => Promise<TranscriptionRecord>;
  setTranscriptionText: (text: string) => void;
  clearTranscription: () => void;
  batchTranscribeMedia: (
    files: File[],
    language: AsrLanguage,
    provider?: AsrProvider,
    options?: TranscribeOptions
  ) => Promise<BatchTranscriptionItem[]>;
  clearBatchTranscription: () => void;

  fetchSettings: () => Promise<void>;
  updateSettings: (data: Partial<Settings>) => Promise<void>;
  testApiKey: (
    type?: 'llm' | 'tts',
    apiKey?: string,
    llmConfig?: { apiFormat?: LlmApiFormat; baseUrl?: string; model?: string }
  ) => Promise<{ valid: boolean; error?: string }>;
  fetchLlmModels: (data: {
    baseUrl: string;
    apiKey?: string;
    apiFormat?: LlmApiFormat;
  }) => Promise<{ models: LlmModelOption[]; resolvedUrl?: string }>;

  fetchSchedules: () => Promise<void>;

  fetchPresets: () => Promise<void>;
  updatePreset: (id: number, formData: FormData) => Promise<void>;
  deletePreset: (id: number) => Promise<void>;
  createSchedule: (data: { name: string; cron_expression: string; content_types?: string }) => Promise<Schedule>;
  updateSchedule: (id: number, data: { name?: string; cron_expression?: string; content_types?: string }) => Promise<Schedule>;
  deleteSchedule: (id: number) => Promise<void>;
  toggleSchedule: (id: number) => Promise<Schedule>;

  isBatchDeleting: boolean;
  batchDeleteBroadcasts: (ids: number[]) => Promise<{ deleted: number; failed: number }>;
}
