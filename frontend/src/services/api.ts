import axios, { type AxiosProgressEvent, type AxiosError } from 'axios';
import type { AsrEngine, AsrProvider, ContentTargetPlatform, NewsItem, Settings, VoiceConfig } from '../store/types';
import { createScopedLogger, toLogError } from './logger';

const logger = createScopedLogger('api-client');

const api = axios.create({
  baseURL: '/api',
  timeout: 30 * 60 * 1000, // 30 分钟超时 — 本地 ASR 长音频可能耗时较长
});

// === 全局响应拦截器 ===
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // 网络错误 / 请求中断
    if (!error.response) {
      if (axios.isCancel(error)) {
        logger.info('Request cancelled');
      } else {
        logger.error({ err: toLogError(error), message: error.message }, 'Network error');
      }
      return Promise.reject(error);
    }

    const status = error.response.status;
    const data = error.response.data as { error?: string } | undefined;

    switch (status) {
      case 401:
        logger.error({ status }, 'Unauthorized — 请检查 API Key 配置');
        break;
      case 403:
        logger.error({ status }, 'Forbidden — 无权访问该资源');
        break;
      case 429:
        logger.error({ status }, 'Rate limited — 请求过于频繁，请稍后重试');
        break;
      case 500:
      case 502:
      case 503:
        logger.error({ status }, 'Server error — 服务端异常');
        break;
      default:
        logger.error({ status, hasServerError: Boolean(data?.error), message: error.message }, 'API error');
    }

    return Promise.reject(error);
  }
);

// 播报相关 API
export const broadcastApi = {
  getToday: (params?: { category?: string; take?: number }) =>
    api.get('/broadcast/today', { params }),

  rewrite: (data: { items: NewsItem[]; opening?: string; closing?: string }) =>
    api.post('/broadcast/rewrite', data),

  generate: (data: {
    text: string;
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
  }) => api.post('/broadcast/generate', data),

  getHistory: (params?: { page?: number; limit?: number }) =>
    api.get('/broadcast/history', { params }),

  getDetail: (id: number) =>
    api.get(`/broadcast/${id}`),

  save: (id: number) =>
    api.post(`/broadcast/${id}/save`),

  // Segment API
  split: (id: number) =>
    api.post(`/broadcast/${id}/split`),

  getSegments: (id: number) =>
    api.get(`/broadcast/${id}/segments`),

  updateSegment: (broadcastId: number, segId: number, data: { text?: string; styleTag?: string; playbackRate?: number }) =>
    api.put(`/broadcast/${broadcastId}/segments/${segId}`, data),

  updateAllSegmentPlaybackRates: (broadcastId: number, playbackRate: number) =>
    api.patch(`/broadcast/${broadcastId}/segments/playback-rate`, { playbackRate }),

  regenerateSegment: (broadcastId: number, segId: number) =>
    api.post(`/broadcast/${broadcastId}/segments/${segId}/regenerate`),

  batchGenerateSegments: (broadcastId: number) =>
    api.post(`/broadcast/${broadcastId}/segments/batch-generate`),

  mergeSegments: (broadcastId: number) =>
    api.post(`/broadcast/${broadcastId}/segments/merge`),

  deleteSegment: (broadcastId: number, segId: number) =>
    api.delete(`/broadcast/${broadcastId}/segments/${segId}`),

  reorderSegments: (broadcastId: number, segmentIds: number[]) =>
    api.post(`/broadcast/${broadcastId}/segments/reorder`, { segmentIds }),

  replaceSegments: (broadcastId: number, segments: { id?: number; text: string; styleTag?: string }[]) =>
    api.post(`/broadcast/${broadcastId}/segments/replace`, { segments }),

  suggestSegmentTags: (broadcastId: number, allowedTags: string[]) =>
    api.post(`/broadcast/${broadcastId}/segments/suggest-tags`, { allowedTags }),

  suggestSegmentAudioTags: (broadcastId: number) =>
    api.post(`/broadcast/${broadcastId}/segments/suggest-audio-tags`),

  updateVoiceConfig: (broadcastId: number, data: {
    voiceType: VoiceConfig['voiceType'];
    voice?: string;
    voiceDesign?: string;
    voiceClone?: string;
    stylePrompt?: string;
    optimizeTextPreview?: boolean;
    speed?: { speed_ratio: number; style?: string } | null;
    emotion?: string | { emotion: string; weight: number }[] | null;
    pitch?: { pitch_ratio: number; style?: string } | null;
  }) => api.patch(`/broadcast/${broadcastId}/voice-config`, data),

  /** 批量删除播报记录 */
  batchDelete: (ids: number[]) =>
    api.post('/broadcast/batch-delete', { ids }),
};

// 设置相关 API
export const settingsApi = {
  get: () => api.get('/settings'),

  update: (data: Partial<Settings>) =>
    api.put('/settings', data),

  testKey: (
    type?: 'llm' | 'tts',
    apiKey?: string,
    llmConfig?: { apiFormat?: 'openai' | 'anthropic'; baseUrl?: string; model?: string }
  ) => api.post('/settings/test-key', {
    type,
    apiKey,
    apiFormat: llmConfig?.apiFormat,
    baseUrl: llmConfig?.baseUrl,
    model: llmConfig?.model,
  }),

  fetchLlmModels: (data: { baseUrl: string; apiKey?: string; apiFormat?: 'openai' | 'anthropic' }) =>
    api.post('/settings/llm-models', data),
};

// 定时任务 API
export const scheduleApi = {
  getAll: () => api.get('/schedules'),

  create: (data: { name: string; cron_expression: string; content_types?: string }) =>
    api.post('/schedules', data),

  update: (id: number, data: { name?: string; cron_expression?: string; content_types?: string }) =>
    api.put(`/schedules/${id}`, data),

  delete: (id: number) =>
    api.delete(`/schedules/${id}`),

  toggle: (id: number) =>
    api.post(`/schedules/${id}/toggle`),
};

// 音色预设 API
export const voicePresetApi = {
  getAll: () => api.get('/voice-presets'),

  create: (formData: FormData) =>
    api.post('/voice-presets', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  update: (id: number, formData: FormData) =>
    api.put(`/voice-presets/${id}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  delete: (id: number) => api.delete(`/voice-presets/${id}`),

  trialClone: (formData: FormData) =>
    api.post('/voice-presets/trial/clone', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  trialDesign: (data: { design_prompt: string; trial_text: string; style_prompt?: string; optimize_text_preview?: boolean }) =>
    api.post('/voice-presets/trial/design', data),

  suggestTrialTextTags: (data: { text: string; voice_design?: string; style_prompt?: string }) =>
    api.post<{ taggedText: string; stylePrompt?: string }>('/voice-presets/suggest-trial-text-tags', data),

  inferDesignFromImage: (formData: FormData) =>
    api.post('/voice-presets/infer-design-from-image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
};

// 转录 API
export const transcribeApi = {
  transcribe: (formData: FormData, options?: { onUploadProgress?: (event: AxiosProgressEvent) => void }) =>
    api.post('/transcribe', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: options?.onUploadProgress,
      // 单文件本地 ASR 通过 SSE 持续报告进度，不能用请求总耗时中断仍在运行的长任务。
      timeout: 0,
    }),
  batchTranscribe: (formData: FormData, options?: { onUploadProgress?: (event: AxiosProgressEvent) => void }) =>
    api.post('/transcribe/batch', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: options?.onUploadProgress,
    }),
  formatResult: (id: number, data: { text?: string }) =>
    api.post(`/transcribe/results/${id}/format`, data),
  getResults: (params?: { limit?: number }) =>
    api.get('/transcribe/results', { params }),
  getStats: () =>
    api.get('/transcribe/stats'),
  deleteResult: (id: number) =>
    api.delete(`/transcribe/results/${id}`),
  getDetail: (id: number) =>
    api.get(`/transcribe/results/${id}`),
  renameSpeaker: (transcriptionId: number, speakerId: number, displayName: string) =>
    api.patch(`/transcribe/results/${transcriptionId}/speakers/${speakerId}`, { displayName }),
  correctTurn: (transcriptionId: number, turnId: number, correctedText: string) =>
    api.patch(`/transcribe/results/${transcriptionId}/turns/${turnId}`, { correctedText }),
  summarize: (id: number, taskId: string) =>
    api.post(`/transcribe/results/${id}/summarize`, { taskId }),
  updateMetadata: (id: number, data: { podcastName: string; episodeTitle: string; guestNames: string[]; sourceUrl: string; publishedAt: string; topicTags: string[] }) =>
    api.patch(`/transcribe/results/${id}/metadata`, data),
  analyzeClaims: (id: number, taskId: string) =>
    api.post(`/transcribe/results/${id}/analyze-claims`, { taskId }),
  updateClaim: (claimId: number, data: { userNote?: string; isStarred?: boolean; isHidden?: boolean }) =>
    api.patch(`/transcribe/claims/${claimId}`, data),
  deleteClaim: (claimId: number) => api.delete(`/transcribe/claims/${claimId}`),
  fetchModels: (data: { provider: AsrProvider; engine?: AsrEngine; baseUrl?: string; apiKey?: string }) =>
    api.post('/transcribe/models', data),
};

export const researchApi = {
  searchClaims: (query: string, limit = 20) => api.get('/research/claims/search', { params: { q: query, limit } }),
  getClaim: (id: number) => api.get(`/research/claims/${id}`),
  analyzeRelations: (claimIds: number[]) => api.post('/research/claims/relations', { claimIds }),
};

export const contentProjectApi = {
  getAll: () => api.get('/content-projects'),
  getById: (id: number) => api.get(`/content-projects/${id}`),
  create: (data: { title: string; topic?: string; targetPlatform?: ContentTargetPlatform; thesis?: string }) => api.post('/content-projects', data),
  update: (id: number, data: Partial<{ title: string; topic: string; targetPlatform: ContentTargetPlatform; thesis: string; personalPractice: string; personalJudgment: string; discussionQuestion: string; status: string }>) => api.patch(`/content-projects/${id}`, data),
  delete: (id: number) => api.delete(`/content-projects/${id}`),
  addClaim: (id: number, claimId: number, usageNote = '') => api.post(`/content-projects/${id}/claims`, { claimId, usageNote }),
  reorderClaims: (id: number, claimIds: number[]) => api.patch(`/content-projects/${id}/claims/reorder`, { claimIds }),
  removeClaim: (id: number, claimId: number) => api.delete(`/content-projects/${id}/claims/${claimId}`),
  export: (id: number, platform: 'xiaohongshu' | 'wechat') => api.post(`/content-projects/${id}/export`, { platform }),
};

export type { NewsItem, Settings };

export default api;
