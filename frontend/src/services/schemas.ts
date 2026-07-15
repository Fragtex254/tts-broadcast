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

export const SettingsSchema = z.object({
  mimo_api_key: z.string(),
  mimo_tts_api_key: z.string(),
  llm_api_format: LlmApiFormatSchema,
  llm_base_url: z.string(),
  llm_model: z.string(),
  llm_rewrite_system_prompt: z.string(),
  llm_split_system_prompt: z.string(),
  llm_rewrite_thinking_enabled: z.boolean(),
  llm_split_thinking_enabled: z.boolean(),
  asr_provider: AsrProviderSchema,
  qwen_asr_base_url: z.string(),
  qwen_asr_model: z.string(),
  qwen_asr_api_key: z.string(),
  wsl_asr_base_url: z.string(),
  wsl_asr_engine: AsrEngineSchema,
  wsl_asr_model: z.string(),
  wsl_asr_api_key: z.string(),
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

export const TranscriptDetailSchema = z.object({
  record: TranscriptionRecordSchema,
  speakers: z.array(TranscriptSpeakerSchema),
  segments: z.array(TranscriptSegmentSchema),
  turns: z.array(TranscriptTurnSchema),
  summary: TranscriptSummarySchema.nullable(),
  summaryItems: z.array(TranscriptSummaryItemSchema),
});

export const TranscriptDetailResponseSchema = z.object({ transcript: TranscriptDetailSchema });

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
