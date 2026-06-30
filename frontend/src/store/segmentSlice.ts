import { broadcastApi } from '../services/api';
import { createScopedLogger, toLogError } from '../services/logger';
import { STYLE_TAGS } from '../constants/toneTags';
import type { AppState } from './types';
import type { StoreGet, StoreSet } from './storeTypes';

const logger = createScopedLogger('segment-slice');

function buildVoicePayload(voiceConfig: AppState['voiceConfig']) {
  return {
    voiceType: voiceConfig.voiceType,
    voice: voiceConfig.voiceType === 'preset' ? voiceConfig.voice : undefined,
    voiceDesign: voiceConfig.voiceType === 'design' ? voiceConfig.voiceDesign : undefined,
    voiceClone: voiceConfig.voiceType === 'clone' ? voiceConfig.voiceClone : undefined,
    stylePrompt: voiceConfig.stylePrompt || undefined,
    speed: voiceConfig.speed,
    emotion: voiceConfig.emotion,
    pitch: voiceConfig.pitch,
  };
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
  | 'mergeSegments'
  | 'isSuggestingTags'
  | 'updateSegmentStyleTag'
  | 'suggestTags'
  | 'clearSegments'
> {
  return {
    segments: [],
    isSplitting: false,
    isMerging: false,
    isSuggestingTags: false,

    splitScriptAction: async (text) => {
      set({ isSplitting: true });
      try {
        const genResponse = await broadcastApi.generate({
          text,
          ...buildVoicePayload(get().voiceConfig),
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
        logger.error({ err: toLogError(error), textLength: text.length }, '切分口播稿失败');
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
        logger.error({ err: toLogError(error), broadcastId }, '切分失败');
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
        logger.error({ err: toLogError(error), broadcastId }, '获取 segments 失败');
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
        logger.error({ err: toLogError(error), broadcastId, segmentId: segId, textLength: text.length }, '编辑句子失败');
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
        await broadcastApi.updateVoiceConfig(broadcastId, buildVoicePayload(get().voiceConfig)).catch(() => {
          // 音色配置同步失败不阻断本段重试，后端仍可使用已保存配置生成。
        });

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
        logger.error({ err: toLogError(error), broadcastId, segmentId: segId }, '重新生成失败');
        throw error;
      }
    },

    batchGenerateSegments: async (broadcastId) => {
      set((state) => ({
        segments: state.segments.map((s) =>
          s.status === 'pending' || s.status === 'failed' || s.status === 'generating'
            ? { ...s, status: 'generating' as const }
            : s
        ),
      }));
      try {
        await broadcastApi.updateVoiceConfig(broadcastId, buildVoicePayload(get().voiceConfig));
        const response = await broadcastApi.batchGenerateSegments(broadcastId);
        const { segments, results } = response.data;
        set({ segments });
        return { segments, results };
      } catch (error) {
        try {
          const response = await broadcastApi.getSegments(broadcastId);
          set({ segments: response.data.segments });
        } catch {
          set((state) => ({
            segments: state.segments.map((s) =>
              s.status === 'generating' ? { ...s, status: 'failed' as const } : s
            ),
          }));
        }
        logger.error({ err: toLogError(error), broadcastId }, '批量生成失败');
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
        logger.error({ err: toLogError(error), broadcastId, segmentId: segId }, '删除句子失败');
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
        logger.error({ err: toLogError(error), broadcastId }, '合并失败');
        throw error;
      }
    },

    updateSegmentStyleTag: async (broadcastId, segId, styleTag) => {
      try {
        const response = await broadcastApi.updateSegment(broadcastId, segId, { styleTag });
        const updated = response.data.segment;
        set((state) => ({
          segments: state.segments.map((s) => (s.id === segId ? updated : s)),
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
        const response = await broadcastApi.suggestSegmentTags(broadcastId, STYLE_TAGS);
        const segments = response.data.segments;
        set({ segments, isSuggestingTags: false });
        return segments;
      } catch (error) {
        set({ isSuggestingTags: false });
        logger.error({ err: toLogError(error), broadcastId }, 'AI 建议风格失败');
        throw error;
      }
    },

    clearSegments: () => {
      set({ segments: [] });
    },
  };
}
