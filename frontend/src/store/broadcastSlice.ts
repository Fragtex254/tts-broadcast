import { broadcastApi } from '../services/api';
import { getApiErrorMessage } from '../services/apiError';
import { createScopedLogger, toLogError } from '../services/logger';
import {
  BroadcastSchema,
  EditorBroadcastPayloadSchema,
  TodayItemSchema,
  safeParseArray,
  safeParseStrict,
} from '../services/schemas';
import type { AppState } from './types';
import type { StoreSet } from './storeTypes';
import { getSegmentEntityVersion } from './segmentEntityVersion';

const logger = createScopedLogger('broadcast-slice');
const EDITOR_SPLIT_POLL_MS = 250;
let editorIntentSequence = 0;
let editorLoadRequestSequence = 0;
let editorDraftRequestSequence = 0;

class EditorDraftRequestCancelledError extends Error {
  constructor() {
    super('编辑器草稿请求已取消');
    this.name = 'EditorDraftRequestCancelledError';
  }
}

function waitForEditorSplitPoll(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, EDITOR_SPLIT_POLL_MS));
}

export function createBroadcastSlice(set: StoreSet): Pick<
  AppState,
  | 'broadcasts'
  | 'currentBroadcast'
  | 'todayItems'
  | 'script'
  | 'isGenerating'
  | 'isRewriting'
  | 'isLoadingEditorBroadcast'
  | 'isCreatingEditorDraft'
  | 'editorBroadcastError'
  | 'isBatchDeleting'
  | 'fetchTodayItems'
  | 'rewriteScript'
  | 'generateBroadcast'
  | 'fetchBroadcasts'
  | 'setCurrentBroadcast'
  | 'createEditorDraft'
  | 'forkEditorDraft'
  | 'loadEditorBroadcast'
  | 'updateEditorDraft'
  | 'cancelEditorDraftCreation'
  | 'cancelEditorBroadcastLoad'
  | 'clearEditorBroadcast'
  | 'saveBroadcast'
  | 'updateScript'
  | 'batchDeleteBroadcasts'
> {
  const runEditorDraftRequest = async (
    request: () => Promise<{ data: unknown }>,
    logContext: Record<string, unknown>,
  ) => {
    const requestSequence = ++editorDraftRequestSequence;
    const intentSequence = ++editorIntentSequence;
    set({ isCreatingEditorDraft: true, editorBroadcastError: null });
    try {
      const response = await request();
      if (requestSequence !== editorDraftRequestSequence || intentSequence !== editorIntentSequence) {
        throw new EditorDraftRequestCancelledError();
      }
      const payload = safeParseStrict(EditorBroadcastPayloadSchema, response.data);
      set({
        currentBroadcast: payload.broadcast,
        script: payload.broadcast.content,
        segments: payload.segments,
        voiceConfig: payload.voiceConfig,
        projectEditorContext: payload.sourceRevisionContext,
        isCreatingEditorDraft: false,
        isLoadingEditorBroadcast: false,
        editorBroadcastError: null,
      });
      return payload.broadcast;
    } catch (error) {
      const isCancelled = error instanceof EditorDraftRequestCancelledError
        || requestSequence !== editorDraftRequestSequence
        || intentSequence !== editorIntentSequence;
      if (isCancelled) throw new EditorDraftRequestCancelledError();
      const message = getApiErrorMessage(error, '创建编辑器草稿失败，请稍后重试');
      set({ isCreatingEditorDraft: false, editorBroadcastError: message });
      logger.error({ err: toLogError(error), ...logContext }, '创建编辑器草稿失败');
      throw new Error(message, { cause: error });
    }
  };

  return {
    broadcasts: [],
    currentBroadcast: null,
    todayItems: [],
    script: '',
    isGenerating: false,
    isRewriting: false,
    isLoadingEditorBroadcast: false,
    isCreatingEditorDraft: false,
    editorBroadcastError: null,
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
        set({ script, currentBroadcast: null, isRewriting: false });
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
        set({
          currentBroadcast: broadcast,
          isGenerating: false,
        });
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

    createEditorDraft: async (data) => {
      return runEditorDraftRequest(
        () => broadcastApi.createDraft(data),
        { textLength: data.text.length },
      );
    },

    forkEditorDraft: async (broadcastId) => {
      return runEditorDraftRequest(
        () => broadcastApi.forkDraft(broadcastId),
        { sourceBroadcastId: broadcastId },
      );
    },

    loadEditorBroadcast: async (broadcastId) => {
      const requestSequence = ++editorLoadRequestSequence;
      editorIntentSequence += 1;
      set({
        currentBroadcast: null,
        script: '',
        segments: [],
        projectEditorContext: null,
        isLoadingEditorBroadcast: true,
        isCreatingEditorDraft: false,
        editorBroadcastError: null,
      });
      try {
        let observedSegmentVersion = getSegmentEntityVersion(broadcastId);
        let detailResponse = await broadcastApi.getDetail(broadcastId);
        let payload = safeParseStrict(EditorBroadcastPayloadSchema, detailResponse.data);
        while (
          requestSequence === editorLoadRequestSequence
          && (payload.splitInProgress || observedSegmentVersion !== getSegmentEntityVersion(broadcastId))
        ) {
          if (payload.splitInProgress) await waitForEditorSplitPoll();
          if (requestSequence !== editorLoadRequestSequence) break;
          observedSegmentVersion = getSegmentEntityVersion(broadcastId);
          detailResponse = await broadcastApi.getDetail(broadcastId);
          payload = safeParseStrict(EditorBroadcastPayloadSchema, detailResponse.data);
        }
        if (payload.broadcast.id !== broadcastId) {
          throw new Error('后端返回了不匹配的播报记录');
        }
        if (payload.segments.some((segment) => segment.broadcast_id !== broadcastId)) {
          throw new Error('后端返回了不属于当前播报的分段');
        }
        if (requestSequence === editorLoadRequestSequence) {
          set({
            currentBroadcast: payload.broadcast,
            script: payload.broadcast.content,
            segments: payload.segments,
            voiceConfig: payload.voiceConfig,
            projectEditorContext: payload.sourceRevisionContext,
            isLoadingEditorBroadcast: false,
            editorBroadcastError: null,
          });
        }
        return payload.broadcast;
      } catch (error) {
        const message = getApiErrorMessage(error, '加载口播稿失败，请稍后重试');
        if (requestSequence === editorLoadRequestSequence) {
          set({
            currentBroadcast: null,
            script: '',
            segments: [],
            projectEditorContext: null,
            isLoadingEditorBroadcast: false,
            editorBroadcastError: message,
          });
        }
        logger.error({ err: toLogError(error), broadcastId }, '加载编辑器上下文失败');
        throw new Error(message, { cause: error });
      }
    },

    updateEditorDraft: async (broadcastId, text) => {
      try {
        const response = await broadcastApi.updateDraft(broadcastId, { text });
        const broadcast = safeParseStrict(BroadcastSchema, response.data.broadcast);
        if (broadcast.id !== broadcastId) throw new Error('后端返回了不匹配的播报记录');
        set((state) => state.currentBroadcast?.id === broadcastId
          ? { currentBroadcast: broadcast, script: broadcast.content }
          : state);
        return broadcast;
      } catch (error) {
        const message = getApiErrorMessage(error, '保存编辑器草稿失败，请稍后重试');
        logger.error({ err: toLogError(error), broadcastId, textLength: text.length }, '保存编辑器草稿失败');
        throw new Error(message, { cause: error });
      }
    },

    cancelEditorBroadcastLoad: () => {
      editorLoadRequestSequence += 1;
      set({ isLoadingEditorBroadcast: false });
    },

    cancelEditorDraftCreation: () => {
      editorDraftRequestSequence += 1;
      editorIntentSequence += 1;
      set({ isCreatingEditorDraft: false });
    },

    clearEditorBroadcast: () => {
      editorLoadRequestSequence += 1;
      editorDraftRequestSequence += 1;
      editorIntentSequence += 1;
      set({
        currentBroadcast: null,
        script: '',
        segments: [],
        projectEditorContext: null,
        isLoadingEditorBroadcast: false,
        isCreatingEditorDraft: false,
        editorBroadcastError: null,
      });
    },

    saveBroadcast: async (id) => {
      try {
        const response = await broadcastApi.save(id);
        const updated = safeParseStrict(BroadcastSchema, response.data.broadcast);
        set((state) => ({
          broadcasts: updated.saved === 1
            ? state.broadcasts.some((b) => b.id === id)
              ? state.broadcasts.map((b) => (b.id === id ? updated : b))
              : [updated, ...state.broadcasts]
            : state.broadcasts.filter((b) => b.id !== id),
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
