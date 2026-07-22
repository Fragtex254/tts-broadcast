/** 统一分页协议 */
export interface Pagination {
  page: number;
  limit: number;
  total: number;
}

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
  artifact_revision_id: number | null;
  /** 创建这次 Render 时使用的不可变稿件版本；分段精修不会改变它。 */
  source_artifact_revision_id: number | null;
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
  /** 列表接口返回的 content 长度；详情查询才有完整 content */
  content_length?: number;
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
  playback_rate: number;
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
export type AsrEngine = 'qwen' | 'moss';
export type UiFontPreset = 'modern' | 'system' | 'editorial';
export type UiFontScale = 'compact' | 'comfortable' | 'large' | 'extra_large';

export interface ModelOption {
  id: string;
  owned_by?: string;
}

export type LlmModelOption = ModelOption;
export interface AsrModelCapabilities {
  transcription?: boolean;
  diarization?: boolean;
  segment_timestamps?: boolean;
  languages?: string[];
  speaker_resolution_modes?: string[];
}

export interface AsrModelOption extends ModelOption {
  capabilities?: AsrModelCapabilities;
}

export interface MaskedSecret {
  masked: string;
  is_set: boolean;
}

export type SecretSettingKey =
  | 'mimo_api_key'
  | 'mimo_tts_api_key'
  | 'embedding_api_key'
  | 'qwen_asr_api_key'
  | 'wsl_asr_api_key';

export interface Settings {
  mimo_api_key: MaskedSecret;
  mimo_tts_api_key: MaskedSecret;
  llm_api_format: LlmApiFormat;
  llm_base_url: string;
  llm_model: string;
  llm_rewrite_system_prompt: string;
  llm_split_system_prompt: string;
  llm_rewrite_thinking_enabled: boolean;
  llm_split_thinking_enabled: boolean;
  embedding_enabled: boolean;
  embedding_base_url: string;
  embedding_api_key: MaskedSecret;
  embedding_model: string;
  asr_provider: AsrProvider;
  qwen_asr_base_url: string;
  qwen_asr_model: string;
  qwen_asr_api_key: MaskedSecret;
  wsl_asr_base_url: string;
  wsl_asr_engine: AsrEngine;
  wsl_asr_model: string;
  wsl_asr_api_key: MaskedSecret;
  default_voice: string;
  ui_font_preset: UiFontPreset;
  ui_font_scale: UiFontScale;
  opening_script: string;
  closing_script: string;
  content_categories: string;
}

export type SettingsFormData = Omit<Settings, SecretSettingKey> & Record<SecretSettingKey, string>;
export type SettingsUpdate = Partial<SettingsFormData>;

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
  runtime_state: 'unavailable' | 'inactive' | 'scheduled' | 'not_scheduled';
}

export interface AutomationExecutionState {
  available: boolean;
  state: 'available' | 'unavailable';
  reason: string;
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
  character_image_path: string | null;
  use_trial_audio_as_clone: number;
  created_at: string;
  updated_at: string;
}

export interface VoiceConfig {
  voice: string;
  voiceType: '' | 'preset' | 'clone' | 'design';
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
  asrEngine?: AsrEngine;
  asrModel?: string;
  context?: string;
  contentMode?: 'standard' | 'podcast';
}

export interface TranscriptionRecord {
  id: number;
  file_name: string;
  relative_path: string;
  text: string;
  formatted_text: string;
  language: AsrLanguage;
  provider: AsrProvider | '';
  engine: AsrEngine | '';
  model: string;
  context: string;
  usage?: Record<string, unknown> | null;
  task_id: string;
  file_size_bytes: number;
  audio_duration_seconds: number;
  processing_seconds: number;
  content_mode: 'standard' | 'podcast';
  structure_status: 'unavailable' | 'ready';
  summary_status: 'not_started' | 'queued' | 'running' | 'completed' | 'failed' | 'stale';
  summary_error: string;
  speaker_scope: '' | 'global' | 'mixed' | 'chunk';
  diarization_status: string;
  speaker_count: number;
  diarization_conflicts: number;
  asr_diagnostics: Record<string, unknown>;
  asr_warnings: string[];
  summary_model: string;
  summary_updated_at: string | null;
  claims_status: 'not_started' | 'queued' | 'running' | 'completed' | 'failed' | 'stale';
  claims_error: string;
  claims_model: string;
  claims_updated_at: string | null;
  podcast_name: string;
  episode_title: string;
  guest_names: string[];
  source_url: string;
  published_at: string;
  topic_tags: string[];
  created_at: string;
  updated_at: string;
}

export interface TranscriptSpeaker {
  id: number;
  transcription_id: number;
  speaker_key: string;
  display_name: string;
  sort_order: number;
  speaker_scope: string;
  created_at: string;
  updated_at: string;
}

export interface TranscriptSegment {
  id: number;
  transcription_id: number;
  segment_index: number;
  speaker_key: string;
  source_speaker: string;
  speaker_scope: string;
  speaker_resolution: string;
  chunk_index: number;
  start_seconds: number;
  end_seconds: number;
  text: string;
  created_at: string;
  updated_at: string;
}

export interface TranscriptTurn {
  id: number;
  transcription_id: number;
  turn_index: number;
  speaker_key: string;
  start_seconds: number;
  end_seconds: number;
  text: string;
  corrected_text: string;
  evidence_segment_indexes: number[];
  created_at: string;
  updated_at: string;
}

export interface TranscriptSummary {
  transcription_id: number;
  one_liner: string;
  overview: string;
  model: string;
  created_at: string;
  updated_at: string;
}

export type TranscriptSummaryItemType = 'chapter' | 'speaker_viewpoint' | 'highlight';

export interface TranscriptSummaryItem {
  id: number;
  transcription_id: number;
  item_type: TranscriptSummaryItemType;
  sort_order: number;
  speaker_key: string;
  title: string;
  content: string;
  evidence_start_index: number;
  evidence_end_index: number;
  start_seconds: number;
  end_seconds: number;
  created_at: string;
  updated_at: string;
}

export interface TranscriptDetail {
  record: TranscriptionRecord;
  speakers: TranscriptSpeaker[];
  segments: TranscriptSegment[];
  turns: TranscriptTurn[];
  summary: TranscriptSummary | null;
  summaryItems: TranscriptSummaryItem[];
  claims: TranscriptClaim[];
}

export interface TranscriptClaim {
  id: number;
  transcription_id: number;
  speaker_key: string;
  speaker_name: string | null;
  question: string;
  claim: string;
  reasoning: string;
  evidence_excerpt: string;
  evidence_start_index: number;
  evidence_end_index: number;
  start_seconds: number;
  end_seconds: number;
  topic_tags: string[];
  content_value: number;
  confidence: number;
  user_note: string;
  is_starred: boolean;
  is_hidden: boolean;
  status: 'active' | 'stale';
  analysis_model: string;
  embedding: number[] | null;
  podcast_name: string;
  episode_title: string;
  source_url: string;
  published_at: string;
  created_at: string;
  updated_at: string;
}

export interface ClaimSearchResult {
  claim: TranscriptClaim;
  similarity: number;
  search_mode: 'embedding' | 'keyword';
}

export type ClaimRelationType = 'support' | 'oppose' | 'complement' | 'different_scope' | 'similar_example' | 'unrelated';

export interface ClaimRelationAnalysis {
  relations: Array<{ id: number; claim_a_id: number; claim_b_id: number; relation_type: ClaimRelationType; explanation: string; confidence: number; analysis_model: string; created_at: string; updated_at: string }>;
  synthesis: { consensus: string[]; disagreements: string[]; different_conditions: string[]; practical_suggestions: string[]; open_questions: string[] };
}

export type ContentTargetPlatform = 'xiaohongshu' | 'wechat' | 'twitter' | 'general';

export type ContentEvidenceOrigin = 'ai' | 'user';
export type ContentEvidenceDecisionState = 'candidate' | 'selected' | 'rejected';
export type ContentEvidenceLifecycleStatus = 'active' | 'stale' | 'superseded';
export type ContentEvidenceState = ContentEvidenceDecisionState;
export type ContentCreationOperation = 'extract_evidence' | 'generate_outline' | 'generate_master';
export type ContentCreatorInputKey = 'personal_practice' | 'personal_judgment';
export type ContentGenerationJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'superseded';
export type ContentRevisionCitationStatus = 'not_applicable' | 'valid' | 'stale';
export type ContentRevisionBlockBasis = 'evidence' | 'creator' | 'inference';

export interface ContentSourceFragment {
  index: number;
  content: string;
  start_offset: number;
  end_offset: number;
}

export interface ContentEvidence {
  id: number;
  project_id: number;
  source_id: number;
  source_title: string;
  origin: ContentEvidenceOrigin;
  /** @deprecated 兼容旧响应；新代码使用 decision_state。 */
  state: ContentEvidenceDecisionState;
  decision_state: ContentEvidenceDecisionState;
  lifecycle_status: ContentEvidenceLifecycleStatus;
  source_linked: boolean;
  source_snapshot_intact: boolean;
  reuse_eligible: boolean;
  unavailable_reason: '' | 'source_changed' | 'source_unlinked' | 'stale' | 'superseded' | 'not_selected';
  start_fragment_index: number;
  end_fragment_index: number;
  start_offset: number;
  end_offset: number;
  excerpt: string;
  source_content_sha256: string;
  ai_note: string;
  user_note: string;
  supersedes_id: number | null;
  generation_job_id: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ContentRevisionCitation {
  id: number;
  revision_id: number;
  evidence_id: number | null;
  marker: string;
  excerpt: string;
  source_id: number;
  source_title: string;
  source_content_sha256: string;
  start_fragment_index: number;
  end_fragment_index: number;
  start_offset: number;
  end_offset: number;
  evidence_decision_state: ContentEvidenceDecisionState;
  evidence_lifecycle_status: ContentEvidenceLifecycleStatus;
  source_linked: boolean;
  reuse_eligible: boolean;
  is_stale: boolean;
}

export interface ContentRevisionProvenanceBlock {
  basis: ContentRevisionBlockBasis;
  text: string;
  evidence_ids: number[];
}

export interface ContentRevisionProvenance {
  blocks: ContentRevisionProvenanceBlock[];
  origin: 'manual' | 'ai';
  operation: ContentCreationOperation | 'manual_save';
  prompt_version: string;
  model: string;
  provider: string;
  input_fingerprint: string;
  creator_input_keys: ContentCreatorInputKey[];
  creator_inputs: Partial<Record<ContentCreatorInputKey, string>>;
  outline_revision_id: number | null;
  evidence_ids: number[];
}

export interface ContentGenerationJob {
  id: number;
  project_id: number;
  operation: ContentCreationOperation;
  status: ContentGenerationJobStatus;
  phase: string;
  progress: number | null;
  error: string;
  request_key: string;
  result_artifact_id: number | null;
  result_revision_id: number | null;
  created_at: string;
  updated_at: string;
}

export type ContentProjectMilestoneKind = 'source_saved' | 'evidence_selected' | 'outline_saved' | 'cited_master_saved';

export interface ContentProjectMilestone {
  id: string;
  kind: ContentProjectMilestoneKind;
  title: string;
  description: string;
}

export interface ContentMutationResult<T> {
  value: T;
  milestone: ContentProjectMilestone | null;
}

export interface ContentProject {
  id: number;
  title: string;
  topic: string;
  audience: string;
  goal: string;
  angle: string;
  tone: string;
  content_format: string;
  target_platform: ContentTargetPlatform;
  thesis: string;
  personal_practice: string;
  personal_judgment: string;
  discussion_question: string;
  status: string;
  claim_count?: number;
  claims: Array<{ id: number; project_id: number; claim_id: number; sort_order: number; usage_note: string; claim: TranscriptClaim }>;
  created_at: string;
  updated_at: string;
}

export interface CreateContentProjectInput {
  title: string;
  topic?: string;
  targetPlatform?: ContentTargetPlatform;
  thesis?: string;
  audience?: string;
  goal?: string;
  angle?: string;
  tone?: string;
  contentFormat?: string;
}

export interface ContentProjectUpdateInput {
  title?: string;
  topic?: string;
  targetPlatform?: ContentTargetPlatform;
  thesis?: string;
  personalPractice?: string;
  personalJudgment?: string;
  discussionQuestion?: string;
  status?: string;
  audience?: string;
  goal?: string;
  angle?: string;
  tone?: string;
  contentFormat?: string;
}

export interface ContentProjectSource {
  id: number;
  project_id: number;
  project_source_id: number;
  source_type: string;
  title: string;
  content: string;
  content_sha256: string;
  url: string;
  external_ref: string;
  metadata: Record<string, unknown>;
  usage_note: string;
  sort_order: number;
  linked_at: string;
  link_updated_at: string;
  created_at: string;
  updated_at: string;
}

export interface ContentProjectSourceInput {
  sourceType: string;
  title: string;
  content: string;
  url?: string;
  externalRef?: string;
  metadata?: Record<string, unknown>;
  usageNote?: string;
  requestKey?: string;
}

export interface ContentArtifactRevision {
  id: number;
  artifact_id: number;
  revision_number: number;
  content: string;
  change_reason: string;
  parent_revision_id: number | null;
  generation_job_id: number | null;
  request_key: string;
  provenance: ContentRevisionProvenance;
  citations: ContentRevisionCitation[];
  citation_status: ContentRevisionCitationStatus;
  created_at: string;
}

export interface ContentArtifact {
  id: number;
  project_id: number;
  kind: string;
  title: string;
  platform: string;
  status: string;
  current_revision: ContentArtifactRevision | null;
  created_at: string;
  updated_at: string;
}

export interface ContentArtifactInput {
  kind: string;
  title: string;
  platform: string;
  status?: string;
  content: string;
  changeReason?: string;
  requestKey?: string;
}

export interface ContentArtifactRevisionInput {
  content: string;
  changeReason?: string;
  parentRevisionId?: number | null;
  requestKey?: string;
}

export interface ContentEvidenceInput {
  sourceId: number;
  startFragmentIndex: number;
  endFragmentIndex: number;
  decisionState?: ContentEvidenceDecisionState;
  userNote?: string;
  supersedesEvidenceId?: number;
  requestKey?: string;
}

export interface ContentEvidenceUpdateInput {
  state?: ContentEvidenceDecisionState;
  userNote?: string;
}

export interface ContentCreationJobInput {
  operation: ContentCreationOperation;
  requestKey: string;
  taskId: string;
  sourceIds?: number[];
  evidenceIds?: number[];
  outlineRevisionId?: number;
  creatorInputKeys?: ContentCreatorInputKey[];
}

export interface StartContentCreationJobInput {
  operation: ContentCreationOperation;
  sourceIds?: number[];
  evidenceIds?: number[];
  outlineRevisionId?: number;
  creatorInputKeys?: ContentCreatorInputKey[];
}

export interface ContentProjectWorkspace {
  project: ContentProject;
  sources: ContentProjectSource[];
  evidence: ContentEvidence[];
  generation_jobs: ContentGenerationJob[];
  artifacts: ContentArtifact[];
}

export interface ProjectEditorContext {
  projectId: number;
  artifactId: number;
  revision: ContentArtifactRevision;
}

export interface TranscriptSummaryProgress {
  phase: 'idle' | 'queued' | 'summarizing-batches' | 'synthesizing' | 'completed' | 'failed';
  percent: number;
  current: number;
  total: number;
  message: string;
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

export interface TranscriptionChunkPreview {
  index: number;
  text: string;
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

export type BackgroundTaskStatus = 'connecting' | 'running' | 'reconnecting' | 'connection_lost';

export interface BackgroundTaskSnapshot {
  taskId: string;
  kind: string;
  entityId?: string | number;
  title: string;
  href: string;
  status: BackgroundTaskStatus;
  phase: string;
  percent: number;
  message: string;
  retryAttempt: number;
  startedAt: number;
  updatedAt: number;
}

export interface StartBackgroundTaskInput {
  taskId: string;
  kind: string;
  entityId?: string | number;
  title: string;
  href: string;
  status?: BackgroundTaskStatus;
  phase?: string;
  percent?: number;
  message?: string;
  retryAttempt?: number;
  startedAt?: number;
  updatedAt?: number;
}

export interface BackgroundTaskUpdate {
  kind?: string;
  entityId?: string | number;
  title?: string;
  href?: string;
  status?: BackgroundTaskStatus;
  phase?: string;
  percent?: number;
  message?: string;
  retryAttempt?: number;
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
  isLoadingEditorBroadcast: boolean;
  isCreatingEditorDraft: boolean;
  editorBroadcastError: string | null;

  segments: Segment[];
  isSplitting: boolean;
  isMerging: boolean;

  transcriptionText: string;
  transcriptionChunks: TranscriptionChunkPreview[];
  transcriptionRecord: TranscriptionRecord | null;
  transcriptionHistory: TranscriptionRecord[];
  transcriptionHistoryPagination: Pagination | null;
  transcriptionStats: TranscriptionStats;
  isTranscribing: boolean;
  isLoadingTranscriptionHistory: boolean;
  isLoadingTranscriptionStats: boolean;
  isDeletingTranscriptionResult: boolean;
  transcribeProgress: TranscriptionProgress;
  transcriptDetail: TranscriptDetail | null;
  isLoadingTranscriptDetail: boolean;
  isSummarizingTranscript: boolean;
  transcriptSummaryProgress: TranscriptSummaryProgress;
  isAnalyzingClaims: boolean;
  transcriptClaimProgress: TranscriptSummaryProgress;

  batchTranscriptionItems: BatchTranscriptionItem[];
  isBatchTranscribing: boolean;
  batchTranscribeProgress: BatchTranscriptionProgress;

  backgroundTasks: BackgroundTaskSnapshot[];
  startBackgroundTask: (input: StartBackgroundTaskInput) => void;
  updateBackgroundTask: (taskId: string, update: BackgroundTaskUpdate) => void;
  markBackgroundTaskConnectionLost: (taskId: string, message: string) => void;
  endBackgroundTask: (taskId: string) => void;

  voiceConfig: VoiceConfig;
  updateVoiceConfig: (config: Partial<VoiceConfig>) => void;
  syncVoiceConfig: (broadcastId: number, config: VoiceConfig) => Promise<void>;

  settings: Settings;
  isLoadingSettings: boolean;

  schedules: Schedule[];
  automationExecution: AutomationExecutionState;
  presets: VoicePreset[];
  isLoadingPresets: boolean;
  presetError: string | null;

  fetchTodayItems: (params?: { category?: string; take?: number }) => Promise<void>;
  rewriteScript: (data: { items: NewsItem[]; opening?: string; closing?: string }) => Promise<string>;
  generateBroadcast: (data: {
    text: string;
    artifactRevisionId?: number;
    voice?: string;
    voiceType?: VoiceConfig['voiceType'];
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
  createEditorDraft: (data: { text: string; artifactRevisionId?: number }) => Promise<Broadcast>;
  forkEditorDraft: (broadcastId: number) => Promise<Broadcast>;
  loadEditorBroadcast: (broadcastId: number) => Promise<Broadcast>;
  updateEditorDraft: (broadcastId: number, text: string) => Promise<Broadcast>;
  cancelEditorDraftCreation: () => void;
  cancelEditorBroadcastLoad: () => void;
  clearEditorBroadcast: () => void;
  saveBroadcast: (id: number) => Promise<Broadcast>;
  updateScript: (script: string) => void;

  splitScriptAction: (text: string, artifactRevisionId?: number) => Promise<void>;
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
  updateSegmentPlaybackRate: (broadcastId: number, segId: number, playbackRate: number) => Promise<Segment>;
  updateAllSegmentPlaybackRates: (broadcastId: number, playbackRate: number) => Promise<Segment[]>;
  suggestTags: (broadcastId: number) => Promise<Segment[]>;
  clearSegments: () => void;

  transcribeMedia: (
    file: File,
    language: AsrLanguage,
    provider?: AsrProvider,
    options?: TranscribeOptions
  ) => Promise<TranscriptionResult>;
  fetchTranscriptionHistory: (params?: { page?: number; limit?: number }) => Promise<TranscriptionRecord[]>;
  fetchTranscriptionStats: () => Promise<TranscriptionStats>;
  deleteTranscriptionHistoryResult: (id: number) => Promise<void>;
  formatTranscriptionResult: (id: number, text: string) => Promise<TranscriptionRecord>;
  clearTranscription: () => void;
  fetchTranscriptDetail: (id: number) => Promise<TranscriptDetail>;
  renameTranscriptSpeaker: (transcriptionId: number, speakerId: number, displayName: string) => Promise<TranscriptSpeaker>;
  correctTranscriptTurn: (transcriptionId: number, turnId: number, correctedText: string) => Promise<TranscriptTurn>;
  summarizeTranscript: (transcriptionId: number) => Promise<void>;
  updateTranscriptMetadata: (transcriptionId: number, metadata: { podcastName: string; episodeTitle: string; guestNames: string[]; sourceUrl: string; publishedAt: string; topicTags: string[] }) => Promise<TranscriptionRecord>;
  analyzeTranscriptClaims: (transcriptionId: number) => Promise<void>;
  updateTranscriptClaim: (claimId: number, update: { userNote?: string; isStarred?: boolean; isHidden?: boolean }) => Promise<TranscriptClaim>;
  deleteTranscriptClaim: (claimId: number) => Promise<void>;
  batchTranscribeMedia: (
    files: File[],
    language: AsrLanguage,
    provider?: AsrProvider,
    options?: TranscribeOptions
  ) => Promise<BatchTranscriptionItem[]>;
  clearBatchTranscription: () => void;

  claimSearchResults: ClaimSearchResult[];
  claimSearchPagination: Pagination | null;
  isSearchingClaims: boolean;
  claimDetail: TranscriptClaim | null;
  isLoadingClaimDetail: boolean;
  claimRelationAnalysis: ClaimRelationAnalysis | null;
  isAnalyzingRelations: boolean;
  contentProjects: ContentProject[];
  currentContentProject: ContentProject | null;
  isLoadingContentProjects: boolean;
  projectWorkspace: ContentProjectWorkspace | null;
  isLoadingProjectWorkspace: boolean;
  projectWorkspaceError: string | null;
  isSavingProjectWorkspace: boolean;
  projectWorkspaceSaveError: string | null;
  projectSourceFragments: Record<number, ContentSourceFragment[]>;
  isLoadingProjectSourceFragments: boolean;
  projectSourceFragmentsError: string | null;
  isUnlinkingProjectSourceId: number | null;
  activeProjectTaskId: string | null;
  activeProjectJobOperation: ContentCreationOperation | null;
  projectWorkspaceJobError: string | null;
  projectMilestoneFeedback: ContentProjectMilestone | null;
  consumedProjectMilestoneIds: string[];
  projectArtifactRevisions: ContentArtifactRevision[];
  isLoadingProjectArtifactRevisions: boolean;
  projectArtifactRevisionsError: string | null;
  projectOutlineRevisions: ContentArtifactRevision[];
  isLoadingProjectOutlineRevisions: boolean;
  projectOutlineRevisionsError: string | null;
  projectEditorContext: ProjectEditorContext | null;
  searchClaims: (query: string) => Promise<ClaimSearchResult[]>;
  clearResearchContext: () => void;
  fetchClaimDetail: (claimId: number) => Promise<TranscriptClaim>;
  clearClaimDetail: () => void;
  updateClaimDetail: (claimId: number, update: { userNote?: string; isStarred?: boolean }) => Promise<TranscriptClaim>;
  deleteClaimDetail: (claimId: number) => Promise<void>;
  analyzeClaimRelations: (claimIds: number[]) => Promise<ClaimRelationAnalysis>;
  fetchContentProjects: () => Promise<ContentProject[]>;
  createContentProject: (data: CreateContentProjectInput) => Promise<ContentProject>;
  fetchContentProject: (id: number) => Promise<ContentProject>;
  updateContentProject: (id: number, data: ContentProjectUpdateInput) => Promise<ContentProject>;
  deleteContentProject: (id: number) => Promise<void>;
  addClaimToContentProject: (projectId: number, claimId: number, usageNote?: string) => Promise<ContentProject>;
  reorderContentProjectClaims: (projectId: number, claimIds: number[]) => Promise<ContentProject>;
  removeClaimFromContentProject: (projectId: number, claimId: number) => Promise<void>;
  exportContentProject: (projectId: number, platform: 'xiaohongshu' | 'wechat') => Promise<string>;
  fetchProjectWorkspace: (projectId: number) => Promise<ContentProjectWorkspace>;
  clearProjectWorkspace: () => void;
  addProjectWorkspaceSource: (projectId: number, data: ContentProjectSourceInput) => Promise<ContentProjectSource>;
  fetchProjectSourceFragments: (projectId: number, sourceId: number) => Promise<ContentSourceFragment[]>;
  unlinkProjectWorkspaceSource: (projectId: number, sourceId: number) => Promise<void>;
  createManualProjectEvidence: (projectId: number, data: ContentEvidenceInput) => Promise<ContentEvidence>;
  updateProjectEvidence: (projectId: number, evidenceId: number, data: ContentEvidenceUpdateInput) => Promise<ContentEvidence>;
  startProjectCreationJob: (projectId: number, data: StartContentCreationJobInput) => Promise<ContentGenerationJob>;
  dismissProjectMilestone: () => void;
  createProjectWorkspaceArtifact: (projectId: number, data: ContentArtifactInput) => Promise<ContentArtifact>;
  saveProjectArtifactRevision: (projectId: number, artifactId: number, data: ContentArtifactRevisionInput) => Promise<ContentArtifactRevision>;
  fetchProjectArtifactRevisions: (projectId: number, artifactId: number) => Promise<ContentArtifactRevision[]>;
  fetchProjectOutlineRevisions: (projectId: number, artifactId: number) => Promise<ContentArtifactRevision[]>;

  fetchSettings: () => Promise<void>;
  updateSettings: (data: SettingsUpdate) => Promise<void>;
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
  fetchAsrModels: (data: {
    provider: AsrProvider;
    engine?: AsrEngine;
    baseUrl?: string;
    apiKey?: string;
  }) => Promise<{ models: AsrModelOption[]; resolvedUrl?: string }>;

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
