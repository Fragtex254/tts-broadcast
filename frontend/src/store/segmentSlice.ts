import { broadcastApi } from '../services/api';
import { createScopedLogger, toLogError } from '../services/logger';
import { BroadcastSchema, safeParseArray, safeParseStrict, SegmentSchema } from '../services/schemas';
import { createSSEClient, type SSEErrorEvent } from '../services/sseClient';
import { buildVoicePayload } from './voiceConfigModel';
import type { AppState, Segment } from './types';
import type { StoreGet, StoreSet } from './storeTypes';
import { bindBackgroundTaskTransport } from './sseBackgroundTask';
import { markSegmentEntityChanged } from './segmentEntityVersion';

const logger = createScopedLogger('segment-slice');

interface SegmentProgressEvent {
  segmentId?: number;
  status?: Segment['status'];
  audioPath?: string;
  error?: string;
  current?: number;
  total?: number;
}

interface SegmentCompleteEvent {
  segments?: Segment[];
}

function createSegmentGenerationTaskId(broadcastId: number): string {
  const random = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `segment-${broadcastId}-${random}`;
}

export function createSegmentSlice(set: StoreSet, get: StoreGet): Pick<
  AppState,
  | 'segments'
  | 'isSplitting'
  | 'isMerging'
  | 'splitScriptAction'
  | 'splitScript'
  | 'fetchSegments'
  | 'updateSegmentText'
  | 'regenerateSegment'
  | 'batchGenerateSegments'
  | 'deleteSegment'
  | 'replaceSegments'
  | 'mergeSegments'
  | 'isSuggestingTags'
  | 'updateSegmentStyleTag'
  | 'updateSegmentPlaybackRate'
  | 'updateAllSegmentPlaybackRates'
  | 'suggestTags'
  | 'clearSegments'
> {
  return {
    segments: [],
    isSplitting: false,
    isMerging: false,
    isSuggestingTags: false,

    splitScriptAction: async (text, artifactRevisionId) => {
      set({ isSplitting: true });
      try {
        let broadcast = get().currentBroadcast;
        if (!broadcast) throw new Error('当前编辑器没有可切分的持久化草稿，请重新打开口播稿');
        if (artifactRevisionId !== undefined && broadcast.source_artifact_revision_id !== artifactRevisionId) {
          throw new Error('当前编辑器绑定的口播稿版本已经变化，请重新打开后再切分');
        }
        if (broadcast.content !== text) {
          broadcast = await get().updateEditorDraft(broadcast.id, text);
        }

        const splitResponse = await broadcastApi.split(broadcast.id);
        const segments = safeParseArray(SegmentSchema, splitResponse.data.segments || []);
        const splitBroadcast = splitResponse.data.broadcast
          ? safeParseStrict(BroadcastSchema, splitResponse.data.broadcast)
          : null;
        markSegmentEntityChanged(broadcast.id);
        set((state) => ({
          segments,
          currentBroadcast: splitBroadcast || (
            state.currentBroadcast?.id === broadcast?.id
              ? { ...state.currentBroadcast, status: 'pending', mode: 'segmented' as const }
              : state.currentBroadcast
          ),
          isSplitting: false,
        }));
      } catch (error) {
        set({ isSplitting: false });
        logger.error({ err: toLogError(error), textLength: text.length }, '切分口播稿失败');
        throw error;
      }
    },

    splitScript: async (broadcastId) => {
      set({ isSplitting: true });
      try {
        const response = await broadcastApi.split(broadcastId);
        const segments = safeParseArray(SegmentSchema, response.data.segments || []);
        markSegmentEntityChanged(broadcastId);
        set((state) => ({
          segments,
          currentBroadcast: response.data.broadcast
            ? safeParseStrict(BroadcastSchema, response.data.broadcast)
            : state.currentBroadcast,
          isSplitting: false,
        }));
        return segments;
      } catch (error) {
        set({ isSplitting: false });
        logger.error({ err: toLogError(error), broadcastId }, '切分失败');
        throw error;
      }
    },

    fetchSegments: async (broadcastId) => {
      try {
        const response = await broadcastApi.getSegments(broadcastId);
        const segments = safeParseArray(SegmentSchema, response.data.segments || []);
        set({ segments });
        return segments;
      } catch (error) {
        logger.error({ err: toLogError(error), broadcastId }, '获取 segments 失败');
        throw error;
      }
    },

    updateSegmentText: async (broadcastId, segId, text) => {
      try {
        const response = await broadcastApi.updateSegment(broadcastId, segId, { text });
        const updated = safeParseStrict(SegmentSchema, response.data.segment);
        markSegmentEntityChanged(broadcastId);
        set((state) => ({
          segments: state.segments.map((s) => (s.id === segId ? updated : s)),
          currentBroadcast: state.currentBroadcast?.id === broadcastId
            ? { ...state.currentBroadcast, audio_path: null }
            : state.currentBroadcast,
          broadcasts: state.broadcasts.map((b) => (b.id === broadcastId ? { ...b, audio_path: null } : b)),
        }));
        return updated;
      } catch (error) {
        logger.error({ err: toLogError(error), broadcastId, segmentId: segId, textLength: text.length }, '编辑句子失败');
        throw error;
      }
    },

    regenerateSegment: async (broadcastId, segId) => {
      set((state) => ({
        segments: state.segments.map((s) =>
          s.id === segId ? { ...s, status: 'generating' as const, error_message: '' } : s
        ),
      }));
      try {
        await broadcastApi.updateVoiceConfig(broadcastId, buildVoicePayload(get().voiceConfig)).catch(() => {
          // 音色配置同步失败不阻断本段重试，后端仍可使用已保存配置生成。
        });

        const response = await broadcastApi.regenerateSegment(broadcastId, segId);
        const updated = response.data.segment;
        markSegmentEntityChanged(broadcastId);
        set((state) => ({
          segments: state.segments.map((s) => (s.id === segId ? updated : s)),
        }));
        return updated;
      } catch (error) {
        set((state) => ({
        segments: state.segments.map((s) =>
            s.id === segId ? { ...s, status: 'failed' as const, error_message: '重新生成失败' } : s
          ),
        }));
        logger.error({ err: toLogError(error), broadcastId, segmentId: segId }, '重新生成失败');
        throw error;
      }
    },

    batchGenerateSegments: async (broadcastId) => {
      const existingTask = get().backgroundTasks.find((task) => (
        task.kind === 'segment-generation' && task.entityId === broadcastId
      ));
      if (existingTask) {
        throw new Error('该播报正在后台生成分段语音，请等待当前任务结束');
      }

      const taskId = createSegmentGenerationTaskId(broadcastId);
      let sseClient: ReturnType<typeof createSSEClient> | null = null;
      get().startBackgroundTask({
        taskId,
        kind: 'segment-generation',
        entityId: broadcastId,
        title: `生成分段语音：${get().currentBroadcast?.title || `播报 ${broadcastId}`}`,
        href: `/editor/${broadcastId}`,
        phase: 'preparing',
        percent: 0,
        message: '正在同步音色配置',
      });
      try {
        await broadcastApi.updateVoiceConfig(broadcastId, buildVoicePayload(get().voiceConfig));
        const terminalSegmentIds = new Set<number>();
        let highestPercent = 0;
        sseClient = createSSEClient(taskId, 'segment');
        get().updateBackgroundTask(taskId, {
          phase: 'queued',
          message: '分段语音任务正在排队',
        });
        bindBackgroundTaskTransport(sseClient, taskId, get);
        sseClient.on<SegmentProgressEvent>('progress', (event) => {
          if (event.segmentId && (event.status === 'generated' || event.status === 'failed')) {
            terminalSegmentIds.add(event.segmentId);
          }
          const derivedPercent = event.total && terminalSegmentIds.size > 0
            ? Math.round((terminalSegmentIds.size / event.total) * 100)
            : 0;
          highestPercent = Math.max(highestPercent, derivedPercent);
          get().updateBackgroundTask(taskId, {
            status: 'running',
            phase: event.status ?? 'generating',
            percent: highestPercent,
            message: event.total
              ? `正在生成分段语音（${terminalSegmentIds.size}/${event.total}）`
              : '正在生成分段语音',
          });
          const nextStatus = event.status;
          if (get().currentBroadcast?.id !== broadcastId || !event.segmentId || !nextStatus) return;
          set((state) => ({
            segments: state.segments.map((segment) => segment.id === event.segmentId
              ? {
                  ...segment,
                  status: nextStatus,
                  audio_path: event.audioPath || segment.audio_path,
                  error_message: nextStatus === 'failed'
                    ? (event.error || segment.error_message || '语音生成失败')
                    : '',
                }
              : segment),
          }));
        });
        sseClient.on<SegmentCompleteEvent>('complete', (event) => {
          get().endBackgroundTask(taskId);
          markSegmentEntityChanged(broadcastId);
          if (event.segments && get().currentBroadcast?.id === broadcastId) {
            set({ segments: event.segments });
          }
          sseClient?.close();
        });
        sseClient.on<SSEErrorEvent>('error', () => {
          get().endBackgroundTask(taskId);
          sseClient?.close();
        });
        sseClient.connect();

        const response = await broadcastApi.batchGenerateSegments(broadcastId, taskId);
        const { segments, results } = response.data;
        markSegmentEntityChanged(broadcastId);
        get().endBackgroundTask(taskId);
        if (get().currentBroadcast?.id === broadcastId) set({ segments });
        return { segments, results };
      } catch (error) {
        get().endBackgroundTask(taskId);
        try {
          const response = await broadcastApi.getSegments(broadcastId);
          markSegmentEntityChanged(broadcastId);
          if (get().currentBroadcast?.id === broadcastId) {
            set({ segments: response.data.segments });
          }
        } catch {
          if (get().currentBroadcast?.id === broadcastId) {
            set((state) => ({
              segments: state.segments.map((s) =>
                s.status === 'generating' ? { ...s, status: 'failed' as const, error_message: '批量生成失败' } : s
              ),
            }));
          }
        }
        logger.error({ err: toLogError(error), broadcastId }, '批量生成失败');
        throw error;
      } finally {
        sseClient?.close();
      }
    },

    deleteSegment: async (broadcastId, segId) => {
      try {
        const response = await broadcastApi.deleteSegment(broadcastId, segId);
        const segments = response.data.segments;
        markSegmentEntityChanged(broadcastId);
        set({ segments });
        return segments;
      } catch (error) {
        logger.error({ err: toLogError(error), broadcastId, segmentId: segId }, '删除句子失败');
        throw error;
      }
    },

    replaceSegments: async (broadcastId, segments) => {
      try {
        const response = await broadcastApi.replaceSegments(broadcastId, segments);
        const updatedSegments = response.data.segments;
        markSegmentEntityChanged(broadcastId);
        set({ segments: updatedSegments });
        return updatedSegments;
      } catch (error) {
        logger.error({ err: toLogError(error), broadcastId, count: segments.length }, '批量整理句子失败');
        throw error;
      }
    },

    mergeSegments: async (broadcastId) => {
      set({ isMerging: true });
      try {
        const response = await broadcastApi.mergeSegments(broadcastId);
        const broadcast = response.data.broadcast;
        markSegmentEntityChanged(broadcastId);
        set((state) => ({
          currentBroadcast: broadcast,
          broadcasts: state.broadcasts.map((b) => (b.id === broadcastId ? broadcast : b)),
          isMerging: false,
        }));
        return broadcast;
      } catch (error) {
        set({ isMerging: false });
        logger.error({ err: toLogError(error), broadcastId }, '合并失败');
        throw error;
      }
    },

    updateSegmentStyleTag: async (broadcastId, segId, styleTag) => {
      try {
        const response = await broadcastApi.updateSegment(broadcastId, segId, { styleTag });
        const updated = response.data.segment;
        markSegmentEntityChanged(broadcastId);
        set((state) => ({
          segments: state.segments.map((s) => (s.id === segId ? updated : s)),
          currentBroadcast: state.currentBroadcast?.id === broadcastId
            ? { ...state.currentBroadcast, audio_path: null }
            : state.currentBroadcast,
          broadcasts: state.broadcasts.map((b) => (b.id === broadcastId ? { ...b, audio_path: null } : b)),
        }));
        return updated;
      } catch (error) {
        logger.error({ err: toLogError(error), broadcastId, segmentId: segId }, '设置风格标签失败');
        throw error;
      }
    },

    suggestTags: async (broadcastId) => {
      set({ isSuggestingTags: true });
      try {
        const response = await broadcastApi.suggestSegmentAudioTags(broadcastId);
        const segments = response.data.segments;
        markSegmentEntityChanged(broadcastId);
        set((state) => ({
          segments,
          isSuggestingTags: false,
          currentBroadcast: state.currentBroadcast?.id === broadcastId
            ? { ...state.currentBroadcast, audio_path: null }
            : state.currentBroadcast,
          broadcasts: state.broadcasts.map((b) => (b.id === broadcastId ? { ...b, audio_path: null } : b)),
        }));
        return segments;
      } catch (error) {
        set({ isSuggestingTags: false });
        logger.error({ err: toLogError(error), broadcastId }, 'AI 标签优化失败');
        throw error;
      }
    },

    updateSegmentPlaybackRate: async (broadcastId, segId, playbackRate) => {
      try {
        const response = await broadcastApi.updateSegment(broadcastId, segId, { playbackRate });
        const updated = response.data.segment;
        markSegmentEntityChanged(broadcastId);
        set((state) => ({
          segments: state.segments.map((s) => (s.id === segId ? updated : s)),
          currentBroadcast: state.currentBroadcast?.id === broadcastId
            ? { ...state.currentBroadcast, audio_path: null }
            : state.currentBroadcast,
          broadcasts: state.broadcasts.map((b) => (b.id === broadcastId ? { ...b, audio_path: null } : b)),
        }));
        return updated;
      } catch (error) {
        logger.error({ err: toLogError(error), broadcastId, segmentId: segId, playbackRate }, '设置句子倍速失败');
        throw error;
      }
    },

    updateAllSegmentPlaybackRates: async (broadcastId, playbackRate) => {
      try {
        const response = await broadcastApi.updateAllSegmentPlaybackRates(broadcastId, playbackRate);
        const segments = response.data.segments;
        markSegmentEntityChanged(broadcastId);
        set((state) => ({
          segments,
          currentBroadcast: state.currentBroadcast?.id === broadcastId
            ? { ...state.currentBroadcast, audio_path: null }
            : state.currentBroadcast,
          broadcasts: state.broadcasts.map((b) => (b.id === broadcastId ? { ...b, audio_path: null } : b)),
        }));
        return segments;
      } catch (error) {
        logger.error({ err: toLogError(error), broadcastId, playbackRate }, '批量设置句子倍速失败');
        throw error;
      }
    },

    clearSegments: () => {
      set({ segments: [] });
    },
  };
}
