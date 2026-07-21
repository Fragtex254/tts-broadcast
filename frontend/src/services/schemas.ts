import { z } from 'zod';
import { createScopedLogger } from './logger';

const logger = createScopedLogger('schema-validation');

// === 基础类型 ===

export const NewsItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string().optional(),
  summary: z.string().optional(),
  category: z.string().optional(),
  published_at: z.string().optional(),
  source_url: z.string().optional(),
}).catchall(z.unknown());

export const LlmApiFormatSchema = z.enum(['openai', 'anthropic']);
export const AsrProviderSchema = z.enum(['mimo', 'qwen_mlx', 'wsl_asr']);
export const AsrEngineSchema = z.enum(['qwen', 'moss']);
export const UiFontPresetSchema = z.enum(['modern', 'system', 'editorial']);
export const UiFontScaleSchema = z.enum(['compact', 'comfortable', 'large', 'extra_large']);
export const MaskedSecretSchema = z.object({
  masked: z.string(),
  is_set: z.boolean(),
});

export const SettingsSchema = z.object({
  mimo_api_key: MaskedSecretSchema,
  mimo_tts_api_key: MaskedSecretSchema,
  llm_api_format: LlmApiFormatSchema,
  llm_base_url: z.string(),
  llm_model: z.string(),
  llm_rewrite_system_prompt: z.string(),
  llm_split_system_prompt: z.string(),
  llm_rewrite_thinking_enabled: z.boolean(),
  llm_split_thinking_enabled: z.boolean(),
  embedding_enabled: z.boolean(),
  embedding_base_url: z.string(),
  embedding_api_key: MaskedSecretSchema,
  embedding_model: z.string(),
  asr_provider: AsrProviderSchema,
  qwen_asr_base_url: z.string(),
  qwen_asr_model: z.string(),
  qwen_asr_api_key: MaskedSecretSchema,
  wsl_asr_base_url: z.string(),
  wsl_asr_engine: AsrEngineSchema,
  wsl_asr_model: z.string(),
  wsl_asr_api_key: MaskedSecretSchema,
  default_voice: z.string(),
  ui_font_preset: UiFontPresetSchema,
  ui_font_scale: UiFontScaleSchema,
  opening_script: z.string(),
  closing_script: z.string(),
  content_categories: z.string(),
});

export const BroadcastSchema = z.object({
  id: z.number(),
  title: z.string(),
  content: z.string(),
  artifact_revision_id: z.number().nullable(),
  source_artifact_revision_id: z.number().nullable(),
  audio_path: z.string().nullable(),
  duration: z.number().nullable(),
  voice_type: z.string().nullable(),
  voice_config: z.string().nullable(),
  source_items: z.string().nullable(),
  status: z.string(),
  saved: z.number(),
  mode: z.enum(['whole', 'segmented']),
  created_at: z.string(),
  updated_at: z.string(),
});

export const SegmentSchema = z.object({
  id: z.number(),
  broadcast_id: z.number(),
  index: z.number(),
  text: z.string(),
  audio_path: z.string().nullable(),
  status: z.enum(['pending', 'generating', 'generated', 'failed']),
  style_tag: z.string(),
  playback_rate: z.number(),
  error_message: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const TodayItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  category: z.string(),
  source_url: z.string(),
  published_at: z.string(),
}).catchall(z.unknown());

export const ScheduleSchema = z.object({
  id: z.number(),
  name: z.string(),
  cron_expression: z.string(),
  content_types: z.string().nullable(),
  is_active: z.number(),
  last_run_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  runtime_state: z.enum(['unavailable', 'inactive', 'scheduled', 'not_scheduled']),
});

export const AutomationExecutionStateSchema = z.object({
  available: z.boolean(),
  state: z.enum(['available', 'unavailable']),
  reason: z.string(),
});

export const VoicePresetSchema = z.object({
  id: z.number(),
  type: z.enum(['clone', 'design']),
  name: z.string(),
  style_prompt: z.string(),
  trial_audio_path: z.string().nullable(),
  original_audio_path: z.string().nullable(),
  design_prompt: z.string().nullable(),
  character_image_path: z.string().nullable(),
  use_trial_audio_as_clone: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const TranscriptionRecordSchema = z.object({
  id: z.number(),
  file_name: z.string(),
  relative_path: z.string(),
  text: z.string(),
  formatted_text: z.string(),
  language: z.enum(['auto', 'zh', 'en']),
  provider: z.union([AsrProviderSchema, z.literal('')]),
  engine: z.union([AsrEngineSchema, z.literal('')]),
  model: z.string(),
  context: z.string(),
  usage: z.record(z.string(), z.unknown()).nullable().optional(),
  task_id: z.string(),
  file_size_bytes: z.number(),
  audio_duration_seconds: z.number(),
  processing_seconds: z.number(),
  content_mode: z.enum(['standard', 'podcast']),
  structure_status: z.enum(['unavailable', 'ready']),
  summary_status: z.enum(['not_started', 'queued', 'running', 'completed', 'failed', 'stale']),
  summary_error: z.string(),
  speaker_scope: z.union([z.literal(''), z.enum(['global', 'mixed', 'chunk'])]),
  diarization_status: z.string(),
  speaker_count: z.number(),
  diarization_conflicts: z.number(),
  asr_diagnostics: z.record(z.string(), z.unknown()),
  asr_warnings: z.array(z.string()),
  summary_model: z.string(),
  summary_updated_at: z.string().nullable(),
  claims_status: z.enum(['not_started', 'queued', 'running', 'completed', 'failed', 'stale']),
  claims_error: z.string(),
  claims_model: z.string(),
  claims_updated_at: z.string().nullable(),
  podcast_name: z.string(),
  episode_title: z.string(),
  guest_names: z.array(z.string()),
  source_url: z.string(),
  published_at: z.string(),
  topic_tags: z.array(z.string()),
  created_at: z.string(),
  updated_at: z.string(),
});

export const TranscriptionResultSchema = z.object({
  text: z.string(),
  usage: z.record(z.string(), z.unknown()).nullable().optional(),
  transcriptionResult: TranscriptionRecordSchema.optional(),
});

export const TranscriptionResultsResponseSchema = z.object({
  results: z.array(TranscriptionRecordSchema),
});

export const TranscriptionStatsSchema = z.object({
  total_count: z.number(),
  total_file_size_bytes: z.number(),
  total_audio_duration_seconds: z.number(),
  total_text_chars: z.number(),
  total_processing_seconds: z.number(),
});

export const TranscriptionStatsResponseSchema = z.object({
  stats: TranscriptionStatsSchema,
});

export const TranscriptSpeakerSchema = z.object({
  id: z.number(), transcription_id: z.number(), speaker_key: z.string(), display_name: z.string(),
  sort_order: z.number(), speaker_scope: z.string(), created_at: z.string(), updated_at: z.string(),
});

export const TranscriptSegmentSchema = z.object({
  id: z.number(), transcription_id: z.number(), segment_index: z.number(), speaker_key: z.string(),
  source_speaker: z.string(), speaker_scope: z.string(), speaker_resolution: z.string(), chunk_index: z.number(),
  start_seconds: z.number(), end_seconds: z.number(), text: z.string(), created_at: z.string(), updated_at: z.string(),
});

export const TranscriptTurnSchema = z.object({
  id: z.number(), transcription_id: z.number(), turn_index: z.number(), speaker_key: z.string(),
  start_seconds: z.number(), end_seconds: z.number(), text: z.string(), corrected_text: z.string(), evidence_segment_indexes: z.array(z.number()),
  created_at: z.string(), updated_at: z.string(),
});

export const TranscriptSummarySchema = z.object({
  transcription_id: z.number(), one_liner: z.string(), overview: z.string(), model: z.string(),
  created_at: z.string(), updated_at: z.string(),
});

export const TranscriptSummaryItemSchema = z.object({
  id: z.number(), transcription_id: z.number(), item_type: z.enum(['chapter', 'speaker_viewpoint', 'highlight']),
  sort_order: z.number(), speaker_key: z.string(), title: z.string(), content: z.string(),
  evidence_start_index: z.number(), evidence_end_index: z.number(), start_seconds: z.number(), end_seconds: z.number(),
  created_at: z.string(), updated_at: z.string(),
});

export const TranscriptClaimSchema = z.object({
  id: z.number(), transcription_id: z.number(), speaker_key: z.string(), speaker_name: z.string().nullable(),
  question: z.string(), claim: z.string(), reasoning: z.string(), evidence_excerpt: z.string(),
  evidence_start_index: z.number(), evidence_end_index: z.number(), start_seconds: z.number(), end_seconds: z.number(),
  topic_tags: z.array(z.string()), content_value: z.number(), confidence: z.number(), user_note: z.string(),
  is_starred: z.boolean(), is_hidden: z.boolean(), status: z.enum(['active', 'stale']), analysis_model: z.string(), embedding: z.array(z.number()).nullable(),
  podcast_name: z.string(), episode_title: z.string(), source_url: z.string(), published_at: z.string(),
  created_at: z.string(), updated_at: z.string(),
});

export const TranscriptDetailSchema = z.object({
  record: TranscriptionRecordSchema,
  speakers: z.array(TranscriptSpeakerSchema),
  segments: z.array(TranscriptSegmentSchema),
  turns: z.array(TranscriptTurnSchema),
  summary: TranscriptSummarySchema.nullable(),
  summaryItems: z.array(TranscriptSummaryItemSchema),
  claims: z.array(TranscriptClaimSchema),
});

export const TranscriptDetailResponseSchema = z.object({ transcript: TranscriptDetailSchema });

export const ClaimSearchResultSchema = z.object({ claim: TranscriptClaimSchema, similarity: z.number(), search_mode: z.enum(['embedding', 'keyword']) });
export const ClaimRelationAnalysisSchema = z.object({
  relations: z.array(z.object({ id: z.number(), claim_a_id: z.number(), claim_b_id: z.number(), relation_type: z.enum(['support', 'oppose', 'complement', 'different_scope', 'similar_example', 'unrelated']), explanation: z.string(), confidence: z.number(), analysis_model: z.string(), created_at: z.string(), updated_at: z.string() })),
  synthesis: z.object({ consensus: z.array(z.string()), disagreements: z.array(z.string()), different_conditions: z.array(z.string()), practical_suggestions: z.array(z.string()), open_questions: z.array(z.string()) }),
});
export const ContentProjectSchema = z.object({
  id: z.number(), title: z.string(), topic: z.string(), target_platform: z.enum(['xiaohongshu', 'wechat', 'twitter', 'general']), thesis: z.string(),
  audience: z.string(), goal: z.string(), angle: z.string(), tone: z.string(), content_format: z.string(),
  personal_practice: z.string(), personal_judgment: z.string(), discussion_question: z.string(), status: z.string(), claim_count: z.number().optional(),
  claims: z.array(z.object({ id: z.number(), project_id: z.number(), claim_id: z.number(), sort_order: z.number(), usage_note: z.string(), claim: TranscriptClaimSchema })).default([]),
  created_at: z.string(), updated_at: z.string(),
});
export const ContentProjectSourceSchema = z.object({
  id: z.number(), project_id: z.number(), project_source_id: z.number(), source_type: z.string(), title: z.string(), content: z.string(), content_sha256: z.string(),
  url: z.string(), external_ref: z.string(), metadata: z.record(z.string(), z.unknown()), usage_note: z.string(), sort_order: z.number(),
  linked_at: z.string(), link_updated_at: z.string(), created_at: z.string(), updated_at: z.string(),
});
export const ContentSourceFragmentSchema = z.object({
  index: z.number().int().nonnegative(), content: z.string(), start_offset: z.number().int().nonnegative(), end_offset: z.number().int().nonnegative(),
});
export const ContentEvidenceSchema = z.object({
  id: z.number(), project_id: z.number(), source_id: z.number(), source_title: z.string(), origin: z.enum(['ai', 'user']),
  state: z.enum(['candidate', 'selected', 'rejected']), decision_state: z.enum(['candidate', 'selected', 'rejected']),
  lifecycle_status: z.enum(['active', 'stale', 'superseded']), source_linked: z.boolean(), source_snapshot_intact: z.boolean(),
  reuse_eligible: z.boolean(), unavailable_reason: z.enum(['', 'source_changed', 'source_unlinked', 'stale', 'superseded', 'not_selected']),
  start_fragment_index: z.number().int().nonnegative(), end_fragment_index: z.number().int().nonnegative(),
  start_offset: z.number().int().nonnegative(), end_offset: z.number().int().nonnegative(), excerpt: z.string(),
  source_content_sha256: z.string(), ai_note: z.string(), user_note: z.string(), supersedes_id: z.number().nullable(),
  generation_job_id: z.number().nullable(), sort_order: z.number().int().nonnegative(), created_at: z.string(), updated_at: z.string(),
});
export const ContentGenerationJobSchema = z.object({
  id: z.number(), project_id: z.number(), operation: z.enum(['extract_evidence', 'generate_outline', 'generate_master']),
  request_key: z.string(), status: z.enum(['queued', 'running', 'completed', 'failed', 'superseded']), phase: z.string(),
  progress: z.number().nullable(), error: z.string(), result_artifact_id: z.number().nullable(), result_revision_id: z.number().nullable(),
  created_at: z.string(), updated_at: z.string(),
});
export const ContentProjectMilestoneSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  kind: z.enum(['source_saved', 'evidence_selected', 'outline_saved', 'cited_master_saved']),
  title: z.string(), description: z.string(),
});
export const ContentJobProgressEventSchema = z.object({ job: ContentGenerationJobSchema });
export const ContentJobErrorEventSchema = z.object({ job: ContentGenerationJobSchema, error: z.string() });
export const ContentRevisionCitationSchema = z.object({
  id: z.number(), revision_id: z.number(), evidence_id: z.number().nullable(), marker: z.string(), excerpt: z.string(),
  source_id: z.number(), source_title: z.string(), source_content_sha256: z.string(),
  start_fragment_index: z.number().int().nonnegative(), end_fragment_index: z.number().int().nonnegative(),
  start_offset: z.number().int().nonnegative(), end_offset: z.number().int().nonnegative(), is_stale: z.boolean(), source_linked: z.boolean(),
  evidence_decision_state: z.enum(['candidate', 'selected', 'rejected']), evidence_lifecycle_status: z.enum(['active', 'stale', 'superseded']),
  reuse_eligible: z.boolean(),
});
export const ContentRevisionProvenanceSchema = z.object({
  blocks: z.array(z.object({
    basis: z.enum(['evidence', 'creator', 'inference']), text: z.string(), evidence_ids: z.array(z.number()),
  })).default([]),
  origin: z.enum(['manual', 'ai']).default('manual'),
  operation: z.enum(['manual_save', 'extract_evidence', 'generate_outline', 'generate_master']).default('manual_save'),
  prompt_version: z.string().default(''), model: z.string().default(''), provider: z.string().default(''), input_fingerprint: z.string().default(''),
  creator_input_keys: z.array(z.enum(['personal_practice', 'personal_judgment'])).default([]),
  creator_inputs: z.object({ personal_practice: z.string().optional(), personal_judgment: z.string().optional() }).default({}),
  outline_revision_id: z.number().nullable().default(null), evidence_ids: z.array(z.number()).default([]),
});
export const ContentArtifactRevisionSchema = z.object({
  id: z.number(), artifact_id: z.number(), revision_number: z.number(), content: z.string(), change_reason: z.string(),
  parent_revision_id: z.number().nullable().default(null), generation_job_id: z.number().nullable().default(null), request_key: z.string().default(''),
  provenance: ContentRevisionProvenanceSchema.default({
    blocks: [], origin: 'manual', operation: 'manual_save', prompt_version: '', model: '', provider: '', input_fingerprint: '',
    creator_input_keys: [], creator_inputs: {}, outline_revision_id: null, evidence_ids: [],
  }),
  citations: z.array(ContentRevisionCitationSchema).default([]),
  citation_status: z.enum(['not_applicable', 'valid', 'stale']).default('not_applicable'),
  created_at: z.string(),
});
export const ContentArtifactSchema = z.object({
  id: z.number(), project_id: z.number(), kind: z.string(), title: z.string(), platform: z.string(), status: z.string(),
  current_revision: ContentArtifactRevisionSchema.nullable(), created_at: z.string(), updated_at: z.string(),
});
export const ContentProjectWorkspaceSchema = z.object({
  project: ContentProjectSchema,
  sources: z.array(ContentProjectSourceSchema),
  evidence: z.array(ContentEvidenceSchema).default([]),
  generation_jobs: z.array(ContentGenerationJobSchema).default([]),
  artifacts: z.array(ContentArtifactSchema),
});
export const ContentJobCompleteEventSchema = z.object({
  job: ContentGenerationJobSchema,
  workspace: ContentProjectWorkspaceSchema,
  milestone: ContentProjectMilestoneSchema.optional(),
});

// === API 响应包装 ===

export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema,
    status: z.number().optional(),
  });

// === 常用验证辅助函数 ===

/**
 * 安全解析 API 响应数据，失败时返回 null 并打印警告
 *
 * 注意：仅在调用方明确希望"宽容降级"时使用（如 settings 字段多、偶发字段缺失）。
 * 列表/必填对象应当使用 `safeParseArray` / `safeParseStrict`，让校验失败显式抛出。
 */
export function safeParse<T>(schema: z.ZodType<T>, data: unknown): T | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    logger.warn({ validationError: result.error.format() }, 'Schema validation failed');
    return null;
  }
  return result.data;
}

/**
 * 严格解析 API 响应数据，校验失败时抛出错误。
 * 用于"理应必填"的业务对象（如 broadcast 单条记录），不能静默降级。
 */
export function safeParseStrict<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error(`响应数据校验失败：${result.error.message}`);
  }
  return result.data;
}

/**
 * 严格解析数组，校验失败时抛出错误。
 * 用于"理应必填且完整"的列表（如今日资讯、播报历史），
 * 任一条目校验失败都应当让上层 catch 显式提示用户，而不是静默丢弃。
 */
export function safeParseArray<T>(schema: z.ZodType<T>, data: unknown[]): T[] {
  if (!Array.isArray(data)) {
    throw new Error('响应数据格式错误：期望数组');
  }
  const results: T[] = [];
  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    const result = schema.safeParse(item);
    if (!result.success) {
      const detail = JSON.stringify(result.error.format(), null, 2);
      throw new Error(`第 ${i + 1} 条数据校验失败：${result.error.message}\n${detail}`);
    }
    results.push(result.data);
  }
  return results;
}
