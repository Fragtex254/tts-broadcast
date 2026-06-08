import { create } from 'zustand';
import { broadcastApi, settingsApi, scheduleApi } from '../services/api';

// ============ 接口定义 ============

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

/** 应用状态 */
export interface AppState {
  // 播报状态
  broadcasts: Broadcast[];
  currentBroadcast: Broadcast | null;
  todayItems: TodayItem[];
  script: string;
  isGenerating: boolean;
  isRewriting: boolean;

  // Segment 状态
  segments: Segment[];
  isSplitting: boolean;
  isMerging: boolean;

  // 语音配置（VoiceGenerator 写入，splitScriptAction 读取）
  voiceConfig: {
    voice: string;
    voiceType: string;
    voiceDesign: string;
    voiceClone: string;
    stylePrompt: string;
  };
  updateVoiceConfig: (config: Partial<AppState['voiceConfig']>) => void;

  // 设置状态
  settings: Settings;
  isLoadingSettings: boolean;

  // 定时任务状态
  schedules: Schedule[];

  // 音色预设状态
  presets: VoicePreset[];

  // 播报操作
  fetchTodayItems: (params?: { category?: string; take?: number }) => Promise<void>;
  rewriteScript: (data: { items: TodayItem[]; opening?: string; closing?: string }) => Promise<string>;
  generateBroadcast: (data: {
    text: string;
    voice?: string;
    voiceType?: string;
    voiceDesign?: string;
    voiceClone?: string;
    stylePrompt?: string;
    mode?: 'whole' | 'segmented';
  }) => Promise<{ broadcast: Broadcast; audioUrl: string }>;
  fetchBroadcasts: (params?: { page?: number; limit?: number }) => Promise<{
    broadcasts: Broadcast[];
    pagination: { page: number; limit: number; total: number };
  }>;
  setCurrentBroadcast: (broadcast: Broadcast | null) => void;
  saveBroadcast: (id: number) => Promise<Broadcast>;
  updateScript: (script: string) => void;

  // Segment 操作
  splitScriptAction: (text: string) => Promise<void>;
  splitScript: (broadcastId: number) => Promise<Segment[]>;
  fetchSegments: (broadcastId: number) => Promise<Segment[]>;
  updateSegmentText: (broadcastId: number, segId: number, text: string) => Promise<Segment>;
  regenerateSegment: (broadcastId: number, segId: number) => Promise<Segment>;
  batchGenerateSegments: (broadcastId: number) => Promise<{ segments: Segment[]; results: any[] }>;
  deleteSegment: (broadcastId: number, segId: number) => Promise<Segment[]>;
  mergeSegments: (broadcastId: number) => Promise<Broadcast>;
  clearSegments: () => void;

  // 设置操作
  fetchSettings: () => Promise<void>;
  updateSettings: (data: Partial<Settings>) => Promise<void>;
  testApiKey: (type?: 'llm' | 'tts') => Promise<{ valid: boolean; error?: string }>;

  // 定时任务操作
  fetchSchedules: () => Promise<void>;
  createSchedule: (data: { name: string; cron_expression: string; content_types?: string }) => Promise<Schedule>;
  updateSchedule: (id: number, data: { name?: string; cron_expression?: string; content_types?: string }) => Promise<Schedule>;
  deleteSchedule: (id: number) => Promise<void>;
  toggleSchedule: (id: number) => Promise<Schedule>;

  // 音色预设操作
  fetchPresets: () => Promise<void>;
  deletePreset: (id: number) => Promise<void>;
}

// ============ 默认设置 ============

const defaultSettings: Settings = {
  mimo_api_key: '',
  mimo_tts_api_key: '',
  default_voice: '冰糖',
  opening_script: '大家好，欢迎收听今日 AI 简讯。',
  closing_script: '以上就是今天的 AI 简讯，感谢收听，我们明天再见。',
  content_categories: '["ai-models", "ai-products", "industry", "paper", "tip"]',
};

// ============ Zustand Store ============

export const useStore = create<AppState>((set) => ({
  // 播报状态
  broadcasts: [],
  currentBroadcast: null,
  todayItems: [],
  script: '',
  isGenerating: false,
  isRewriting: false,

  // Segment 状态
  segments: [],
  isSplitting: false,
  isMerging: false,

  // 语音配置
  voiceConfig: {
    voice: defaultSettings.default_voice || '冰糖',
    voiceType: 'preset',
    voiceDesign: '',
    voiceClone: '',
    stylePrompt: '',
  },

  // 设置状态
  settings: defaultSettings,
  isLoadingSettings: false,

  // 定时任务状态
  schedules: [],

  // 音色预设状态
  presets: [],

  // ============ 播报操作 ============

  /** 获取今日 AI HOT 精选资讯 */
  fetchTodayItems: async (params) => {
    try {
      const response = await broadcastApi.getToday(params);
      set({ todayItems: response.data.items });
    } catch (error) {
      console.error('获取今日资讯失败:', error);
      throw error;
    }
  },

  /** 将资讯改写成口播稿 */
  rewriteScript: async (data) => {
    set({ isRewriting: true });
    try {
      const response = await broadcastApi.rewrite(data);
      const script = response.data.script;
      set({ script, isRewriting: false });
      return script;
    } catch (error) {
      set({ isRewriting: false });
      console.error('改写口播稿失败:', error);
      throw error;
    }
  },

  /** 生成 TTS 语音播报 */
  generateBroadcast: async (data) => {
    set({ isGenerating: true });
    try {
      const response = await broadcastApi.generate(data);
      const { broadcast, audioUrl } = response.data;
      set((state) => ({
        broadcasts: [broadcast, ...state.broadcasts],
        currentBroadcast: broadcast,
        isGenerating: false,
      }));
      return { broadcast, audioUrl };
    } catch (error) {
      set({ isGenerating: false });
      console.error('生成播报失败:', error);
      throw error;
    }
  },

  /** 获取历史播报列表 */
  fetchBroadcasts: async (params) => {
    try {
      const response = await broadcastApi.getHistory(params);
      const { broadcasts, pagination } = response.data;
      set({ broadcasts });
      return { broadcasts, pagination };
    } catch (error) {
      console.error('获取历史播报失败:', error);
      throw error;
    }
  },

  /** 设置当前播报 */
  setCurrentBroadcast: (broadcast) => {
    set({ currentBroadcast: broadcast });
  },

  /** 保存/取消保存播报 */
  saveBroadcast: async (id) => {
    try {
      const response = await broadcastApi.save(id);
      const updated = response.data.broadcast;
      set((state) => ({
        broadcasts: state.broadcasts.map((b) => (b.id === id ? updated : b)),
        currentBroadcast: state.currentBroadcast?.id === id ? updated : state.currentBroadcast,
      }));
      return updated;
    } catch (error) {
      console.error('保存播报失败:', error);
      throw error;
    }
  },

  /** 更新口播稿内容 */
  updateScript: (script) => {
    set({ script });
  },

  /** 更新语音配置 */
  updateVoiceConfig: (config) => {
    set((state) => ({
      voiceConfig: { ...state.voiceConfig, ...config },
    }));
  },

  // ============ Segment 操作 ============

  /** 切分口播稿：创建 broadcast 记录 + AI 切分为短句 */
  splitScriptAction: async (text) => {
    set({ isSplitting: true });
    try {
      const { voiceConfig } = useStore.getState();
      const genResponse = await broadcastApi.generate({
        text,
        voice: voiceConfig.voiceType === 'preset' ? voiceConfig.voice : undefined,
        voiceType: voiceConfig.voiceType,
        voiceDesign: voiceConfig.voiceType === 'design' ? voiceConfig.voiceDesign : undefined,
        voiceClone: voiceConfig.voiceType === 'clone' ? voiceConfig.voiceClone : undefined,
        stylePrompt: voiceConfig.stylePrompt || undefined,
        mode: 'segmented',
      });
      const { broadcast } = genResponse.data;
      set((state) => ({
        broadcasts: [broadcast, ...state.broadcasts],
        currentBroadcast: broadcast,
      }));

      const splitResponse = await broadcastApi.split(broadcast.id);
      const segments = splitResponse.data.segments;
      set({ segments, isSplitting: false });
    } catch (error) {
      set({ isSplitting: false });
      console.error('切分口播稿失败:', error);
      throw error;
    }
  },

  splitScript: async (broadcastId) => {
    set({ isSplitting: true });
    try {
      const response = await broadcastApi.split(broadcastId);
      const segments = response.data.segments;
      set({ segments, isSplitting: false });
      return segments;
    } catch (error) {
      set({ isSplitting: false });
      console.error('切分失败:', error);
      throw error;
    }
  },

  fetchSegments: async (broadcastId) => {
    try {
      const response = await broadcastApi.getSegments(broadcastId);
      const segments = response.data.segments;
      set({ segments });
      return segments;
    } catch (error) {
      console.error('获取 segments 失败:', error);
      throw error;
    }
  },

  updateSegmentText: async (broadcastId, segId, text) => {
    try {
      const response = await broadcastApi.updateSegment(broadcastId, segId, { text });
      const updated = response.data.segment;
      set((state) => ({
        segments: state.segments.map((s) => (s.id === segId ? updated : s)),
      }));
      return updated;
    } catch (error) {
      console.error('编辑句子失败:', error);
      throw error;
    }
  },

  regenerateSegment: async (broadcastId, segId) => {
    set((state) => ({
      segments: state.segments.map((s) =>
        s.id === segId ? { ...s, status: 'generating' as const } : s
      ),
    }));
    try {
      // 先同步最新音色配置到后端（从 store 读取最新值）
      const { voiceConfig } = useStore.getState();
      await broadcastApi.updateVoiceConfig(broadcastId, {
        voiceType: voiceConfig.voiceType,
        voice: voiceConfig.voiceType === 'preset' ? voiceConfig.voice : undefined,
        voiceDesign: voiceConfig.voiceType === 'design' ? voiceConfig.voiceDesign : undefined,
        voiceClone: voiceConfig.voiceType === 'clone' ? voiceConfig.voiceClone : undefined,
        stylePrompt: voiceConfig.stylePrompt || undefined,
      }).catch(() => {/* 即使更新失败也继续重新生成 */});

      const response = await broadcastApi.regenerateSegment(broadcastId, segId);
      const updated = response.data.segment;
      set((state) => ({
        segments: state.segments.map((s) => (s.id === segId ? updated : s)),
      }));
      return updated;
    } catch (error) {
      set((state) => ({
        segments: state.segments.map((s) =>
          s.id === segId ? { ...s, status: 'failed' as const } : s
        ),
      }));
      console.error('重新生成失败:', error);
      throw error;
    }
  },

  batchGenerateSegments: async (broadcastId) => {
    set((state) => ({
      segments: state.segments.map((s) =>
        s.status === 'pending' || s.status === 'failed'
          ? { ...s, status: 'generating' as const }
          : s
      ),
    }));
    try {
      // 先同步最新音色配置到后端
      const { voiceConfig } = useStore.getState();
      await broadcastApi.updateVoiceConfig(broadcastId, {
        voiceType: voiceConfig.voiceType,
        voice: voiceConfig.voiceType === 'preset' ? voiceConfig.voice : undefined,
        voiceDesign: voiceConfig.voiceType === 'design' ? voiceConfig.voiceDesign : undefined,
        voiceClone: voiceConfig.voiceType === 'clone' ? voiceConfig.voiceClone : undefined,
        stylePrompt: voiceConfig.stylePrompt || undefined,
      });
      const response = await broadcastApi.batchGenerateSegments(broadcastId);
      const { segments, results } = response.data;
      set({ segments });
      return { segments, results };
    } catch (error) {
      console.error('批量生成失败:', error);
      throw error;
    }
  },

  deleteSegment: async (broadcastId, segId) => {
    try {
      const response = await broadcastApi.deleteSegment(broadcastId, segId);
      const segments = response.data.segments;
      set({ segments });
      return segments;
    } catch (error) {
      console.error('删除句子失败:', error);
      throw error;
    }
  },

  mergeSegments: async (broadcastId) => {
    set({ isMerging: true });
    try {
      const response = await broadcastApi.mergeSegments(broadcastId);
      const broadcast = response.data.broadcast;
      set((state) => ({
        currentBroadcast: broadcast,
        broadcasts: state.broadcasts.map((b) => (b.id === broadcastId ? broadcast : b)),
        isMerging: false,
      }));
      return broadcast;
    } catch (error) {
      set({ isMerging: false });
      console.error('合并失败:', error);
      throw error;
    }
  },

  clearSegments: () => {
    set({ segments: [] });
  },

  // ============ 设置操作 ============

  /** 获取所有设置 */
  fetchSettings: async () => {
    set({ isLoadingSettings: true });
    try {
      const response = await settingsApi.get();
      set({ settings: response.data.settings, isLoadingSettings: false });
    } catch (error) {
      set({ isLoadingSettings: false });
      console.error('获取设置失败:', error);
      throw error;
    }
  },

  /** 更新设置 */
  updateSettings: async (data) => {
    try {
      const response = await settingsApi.update(data);
      set({ settings: response.data.settings });
    } catch (error) {
      console.error('更新设置失败:', error);
      throw error;
    }
  },

  /** 测试 API Key */
  testApiKey: async (type?: 'llm' | 'tts') => {
    try {
      const response = await settingsApi.testKey(type);
      return response.data;
    } catch (error) {
      console.error('测试 API Key 失败:', error);
      return { valid: false, error: (error as Error).message };
    }
  },

  // ============ 定时任务操作 ============

  /** 获取所有定时任务 */
  fetchSchedules: async () => {
    try {
      const response = await scheduleApi.getAll();
      set({ schedules: response.data.schedules });
    } catch (error) {
      console.error('获取定时任务失败:', error);
      throw error;
    }
  },

  /** 创建定时任务 */
  createSchedule: async (data) => {
    try {
      const response = await scheduleApi.create(data);
      const schedule = response.data.schedule;
      set((state) => ({
        schedules: [schedule, ...state.schedules],
      }));
      return schedule;
    } catch (error) {
      console.error('创建定时任务失败:', error);
      throw error;
    }
  },

  /** 更新定时任务 */
  updateSchedule: async (id, data) => {
    try {
      const response = await scheduleApi.update(id, data);
      const updated = response.data.schedule;
      set((state) => ({
        schedules: state.schedules.map((s) => (s.id === id ? updated : s)),
      }));
      return updated;
    } catch (error) {
      console.error('更新定时任务失败:', error);
      throw error;
    }
  },

  /** 删除定时任务 */
  deleteSchedule: async (id) => {
    try {
      await scheduleApi.delete(id);
      set((state) => ({
        schedules: state.schedules.filter((s) => s.id !== id),
      }));
    } catch (error) {
      console.error('删除定时任务失败:', error);
      throw error;
    }
  },

  /** 切换定时任务启用/禁用状态 */
  toggleSchedule: async (id) => {
    try {
      const response = await scheduleApi.toggle(id);
      const updated = response.data.schedule;
      set((state) => ({
        schedules: state.schedules.map((s) => (s.id === id ? updated : s)),
      }));
      return updated;
    } catch (error) {
      console.error('切换任务状态失败:', error);
      throw error;
    }
  },

  // ============ 音色预设操作 ============

  fetchPresets: async () => {
    try {
      const { voicePresetApi } = await import('../services/api');
      const response = await voicePresetApi.getAll();
      set({ presets: response.data.presets });
    } catch (error) {
      console.error('获取预设列表失败:', error);
    }
  },

  deletePreset: async (id) => {
    try {
      const { voicePresetApi } = await import('../services/api');
      await voicePresetApi.delete(id);
      set((state) => ({
        presets: state.presets.filter((p) => p.id !== id),
      }));
    } catch (error) {
      console.error('删除预设失败:', error);
      throw error;
    }
  },
}));

export default useStore;
