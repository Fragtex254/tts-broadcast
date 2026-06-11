import { broadcastApi } from '../services/api';
import type { AppState } from './types';
import type { StoreGet, StoreSet } from './storeTypes';

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
  | 'clearSegments'
> {
  return {
    segments: [],
    isSplitting: false,
    isMerging: false,

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
        await broadcastApi.updateVoiceConfig(broadcastId, buildVoicePayload(get().voiceConfig));
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
  };
}
