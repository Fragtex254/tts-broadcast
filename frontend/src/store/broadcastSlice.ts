import { broadcastApi } from '../services/api';
import { createScopedLogger, toLogError } from '../services/logger';
import { safeParseArray, safeParseStrict, BroadcastSchema, TodayItemSchema } from '../services/schemas';
import type { AppState } from './types';
import type { StoreSet } from './storeTypes';

const logger = createScopedLogger('broadcast-slice');

export function createBroadcastSlice(set: StoreSet): Pick<
  AppState,
  | 'broadcasts'
  | 'currentBroadcast'
  | 'todayItems'
  | 'script'
  | 'isGenerating'
  | 'isRewriting'
  | 'isBatchDeleting'
  | 'fetchTodayItems'
  | 'rewriteScript'
  | 'generateBroadcast'
  | 'fetchBroadcasts'
  | 'setCurrentBroadcast'
  | 'saveBroadcast'
  | 'updateScript'
  | 'batchDeleteBroadcasts'
> {
  return {
    broadcasts: [],
    currentBroadcast: null,
    todayItems: [],
    script: '',
    isGenerating: false,
    isRewriting: false,
    isBatchDeleting: false,

    fetchTodayItems: async (params) => {
      try {
        const response = await broadcastApi.getToday(params);
        const items = safeParseArray(TodayItemSchema, response.data.items || []);
        set({ todayItems: items });
      } catch (error) {
        logger.error({ err: toLogError(error), hasCategory: Boolean(params?.category), take: params?.take }, '获取今日资讯失败');
        throw error;
      }
    },

    rewriteScript: async (data) => {
      set({ isRewriting: true });
      try {
        const response = await broadcastApi.rewrite(data);
        const script = response.data.script;
        set({ script, isRewriting: false });
        return script;
      } catch (error) {
        set({ isRewriting: false });
        logger.error({ err: toLogError(error), itemCount: data.items.length }, '改写口播稿失败');
        throw error;
      }
    },

    generateBroadcast: async (data) => {
      set({ isGenerating: true });
      try {
        const response = await broadcastApi.generate(data);
        const broadcast = safeParseStrict(BroadcastSchema, response.data.broadcast);
        const audioUrl = response.data.audioUrl as string;
        set((state) => ({
          broadcasts: [broadcast, ...state.broadcasts],
          currentBroadcast: broadcast,
          isGenerating: false,
        }));
        return { broadcast, audioUrl };
      } catch (error) {
        set({ isGenerating: false });
        logger.error({ err: toLogError(error), mode: data.mode, textLength: data.text.length }, '生成播报失败');
        throw error;
      }
    },

    fetchBroadcasts: async (params) => {
      try {
        const response = await broadcastApi.getHistory(params);
        const broadcasts = safeParseArray(BroadcastSchema, response.data.broadcasts || []);
        const pagination = response.data.pagination;
        set({ broadcasts });
        return { broadcasts, pagination };
      } catch (error) {
        logger.error({ err: toLogError(error), page: params?.page, limit: params?.limit }, '获取历史播报失败');
        throw error;
      }
    },

    setCurrentBroadcast: (broadcast) => {
      set({ currentBroadcast: broadcast });
    },

    saveBroadcast: async (id) => {
      try {
        const response = await broadcastApi.save(id);
        const updated = safeParseStrict(BroadcastSchema, response.data.broadcast);
        set((state) => ({
          broadcasts: state.broadcasts.map((b) => (b.id === id ? updated : b)),
          currentBroadcast: state.currentBroadcast?.id === id ? updated : state.currentBroadcast,
        }));
        return updated;
      } catch (error) {
        logger.error({ err: toLogError(error), broadcastId: id }, '保存播报失败');
        throw error;
      }
    },

    updateScript: (script) => {
      set({ script });
    },

    batchDeleteBroadcasts: async (ids) => {
      set({ isBatchDeleting: true });
      try {
        const response = await broadcastApi.batchDelete(ids);
        const result = response.data;
        set({ isBatchDeleting: false });
        return result;
      } catch (error) {
        set({ isBatchDeleting: false });
        logger.error({ err: toLogError(error), count: ids.length }, '批量删除失败');
        throw error;
      }
    },
  };
}
