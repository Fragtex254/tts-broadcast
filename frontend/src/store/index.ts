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

/** 应用状态 */
export interface AppState {
  // 播报状态
  broadcasts: Broadcast[];
  currentBroadcast: Broadcast | null;
  todayItems: TodayItem[];
  script: string;
  isGenerating: boolean;
  isRewriting: boolean;

  // 设置状态
  settings: Settings;
  isLoadingSettings: boolean;

  // 定时任务状态
  schedules: Schedule[];

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
  }) => Promise<{ broadcast: Broadcast; audioUrl: string }>;
  fetchBroadcasts: (params?: { page?: number; limit?: number }) => Promise<{
    broadcasts: Broadcast[];
    pagination: { page: number; limit: number; total: number };
  }>;
  setCurrentBroadcast: (broadcast: Broadcast | null) => void;
  saveBroadcast: (id: number) => Promise<Broadcast>;
  updateScript: (script: string) => void;

  // 设置操作
  fetchSettings: () => Promise<void>;
  updateSettings: (data: Partial<Settings>) => Promise<void>;
  testApiKey: () => Promise<{ valid: boolean; error?: string }>;

  // 定时任务操作
  fetchSchedules: () => Promise<void>;
  createSchedule: (data: { name: string; cron_expression: string; content_types?: string }) => Promise<Schedule>;
  updateSchedule: (id: number, data: { name?: string; cron_expression?: string; content_types?: string }) => Promise<Schedule>;
  deleteSchedule: (id: number) => Promise<void>;
  toggleSchedule: (id: number) => Promise<Schedule>;
}

// ============ 默认设置 ============

const defaultSettings: Settings = {
  mimo_api_key: '',
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

  // 设置状态
  settings: defaultSettings,
  isLoadingSettings: false,

  // 定时任务状态
  schedules: [],

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
  testApiKey: async () => {
    try {
      const response = await settingsApi.testKey();
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
}));

export default useStore;
