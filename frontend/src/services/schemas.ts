import { z } from 'zod';

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
  default_voice: z.string(),
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
  created_at: z.string(),
  updated_at: z.string(),
});

export const TranscriptionResultSchema = z.object({
  text: z.string(),
  usage: z.record(z.string(), z.unknown()).nullable().optional(),
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
 */
export function safeParse<T>(schema: z.ZodType<T>, data: unknown): T | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.warn('Schema validation failed:', result.error.format());
    return null;
  }
  return result.data;
}

/**
 * 安全解析数组，过滤掉不符合 schema 的项
 */
export function safeParseArray<T>(schema: z.ZodType<T>, data: unknown[]): T[] {
  const results: T[] = [];
  for (const item of data) {
    const parsed = safeParse(schema, item);
    if (parsed) results.push(parsed);
  }
  return results;
}
