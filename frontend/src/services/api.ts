import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 0, // 不设置超时限制，TTS 生成可能需要较长时间
});

// 播报相关 API
export const broadcastApi = {
  getToday: (params?: { category?: string; take?: number }) =>
    api.get('/broadcast/today', { params }),

  rewrite: (data: { items: any[]; opening?: string; closing?: string }) =>
    api.post('/broadcast/rewrite', data),

  generate: (data: {
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

  updateSegment: (broadcastId: number, segId: number, data: { text: string }) =>
    api.put(`/broadcast/${broadcastId}/segments/${segId}`, data),

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

  updateVoiceConfig: (broadcastId: number, data: {
    voiceType: string;
    voice?: string;
    voiceDesign?: string;
    voiceClone?: string;
    stylePrompt?: string;
    speed?: { speed_ratio: number; style?: string } | null;
    emotion?: string | { emotion: string; weight: number }[] | null;
    pitch?: { pitch_ratio: number; style?: string } | null;
  }) => api.patch(`/broadcast/${broadcastId}/voice-config`, data),
};

// 设置相关 API
export const settingsApi = {
  get: () => api.get('/settings'),

  update: (data: Record<string, any>) =>
    api.put('/settings', data),

  testKey: (type?: 'llm' | 'tts') => api.post('/settings/test-key', { type }),
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

  delete: (id: number) => api.delete(`/voice-presets/${id}`),

  trialClone: (formData: FormData) =>
    api.post('/voice-presets/trial/clone', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  trialDesign: (data: { design_prompt: string; trial_text: string; style_prompt?: string }) =>
    api.post('/voice-presets/trial/design', data),
};

export default api;
