import { transcribeApi } from '../services/api';
import { getApiErrorMessage } from '../services/apiError';
import { createScopedLogger, toLogError } from '../services/logger';
import {
  safeParseStrict,
  TranscriptClaimSchema,
  TranscriptDetailResponseSchema,
  TranscriptDetailSchema,
  TranscriptSpeakerSchema,
  TranscriptTurnSchema,
  TranscriptionRecordSchema,
  TranscriptionResultsResponseSchema,
  TranscriptionStatsResponseSchema,
} from '../services/schemas';
import {
  createSSEClient,
  type SSECompleteEvent,
  type SSEErrorEvent,
  type SSEProgressEvent,
} from '../services/sseClient';
import type {
  AppState,
  BatchTranscriptionItem,
  TranscriptClaim,
  TranscriptDetail,
  TranscriptSummaryProgress,
  TranscriptionRecord,
  TranscriptionStats,
} from './types';
import type { StoreSet } from './storeTypes';
import { createTranscriptionTaskId } from './transcribeSliceShared';

const logger = createScopedLogger('transcribe-slice');

const EMPTY_TRANSCRIPTION_STATS: TranscriptionStats = {
  total_count: 0,
  total_file_size_bytes: 0,
  total_audio_duration_seconds: 0,
  total_text_chars: 0,
  total_processing_seconds: 0,
};

const IDLE_SUMMARY_PROGRESS: TranscriptSummaryProgress = {
  phase: 'idle',
  percent: 0,
  current: 0,
  total: 0,
  message: '等待总结',
};

function updateBatchItemRecord(
  item: BatchTranscriptionItem,
  record: TranscriptionRecord
): BatchTranscriptionItem {
  if (item.resultId !== record.id && item.transcriptionResult?.id !== record.id) {
    return item;
  }
  return {
    ...item,
    text: record.text,
    formattedText: record.formatted_text,
    transcriptionResult: record,
    resultId: record.id,
  };
}

type TranscribeResultsSlice = Pick<
  AppState,
  | 'transcriptionHistory'
  | 'transcriptionStats'
  | 'isLoadingTranscriptionHistory'
  | 'isLoadingTranscriptionStats'
  | 'isDeletingTranscriptionResult'
  | 'transcriptDetail'
  | 'isLoadingTranscriptDetail'
  | 'isSummarizingTranscript'
  | 'transcriptSummaryProgress'
  | 'isAnalyzingClaims'
  | 'transcriptClaimProgress'
  | 'fetchTranscriptionHistory'
  | 'fetchTranscriptionStats'
  | 'deleteTranscriptionHistoryResult'
  | 'formatTranscriptionResult'
  | 'fetchTranscriptDetail'
  | 'renameTranscriptSpeaker'
  | 'correctTranscriptTurn'
  | 'summarizeTranscript'
  | 'updateTranscriptMetadata'
  | 'analyzeTranscriptClaims'
  | 'updateTranscriptClaim'
  | 'deleteTranscriptClaim'
>;

export function createTranscribeResultsSlice(set: StoreSet): TranscribeResultsSlice {
  return {
    transcriptionHistory: [],
    transcriptionStats: EMPTY_TRANSCRIPTION_STATS,
    isLoadingTranscriptionHistory: false,
    isLoadingTranscriptionStats: false,
    isDeletingTranscriptionResult: false,
    transcriptDetail: null,
    isLoadingTranscriptDetail: false,
    isSummarizingTranscript: false,
    transcriptSummaryProgress: IDLE_SUMMARY_PROGRESS,
    isAnalyzingClaims: false,
    transcriptClaimProgress: IDLE_SUMMARY_PROGRESS,

    fetchTranscriptDetail: async (id) => {
      set({ isLoadingTranscriptDetail: true });
      try {
        const response = await transcribeApi.getDetail(id);
        const data = safeParseStrict(TranscriptDetailResponseSchema, response.data);
        set({ transcriptDetail: data.transcript, isLoadingTranscriptDetail: false });
        return data.transcript;
      } catch (error) {
        set({ isLoadingTranscriptDetail: false });
        logger.error({ err: toLogError(error), transcriptionId: id }, '获取 Transcript 详情失败');
        throw new Error(getApiErrorMessage(error, '获取内容详情失败'), { cause: error });
      }
    },

    renameTranscriptSpeaker: async (transcriptionId, speakerId, displayName) => {
      try {
        const response = await transcribeApi.renameSpeaker(
          transcriptionId,
          speakerId,
          displayName
        );
        const speaker = safeParseStrict(TranscriptSpeakerSchema, response.data.speaker);
        set((state) => ({
          transcriptDetail:
            state.transcriptDetail?.record.id === transcriptionId
              ? {
                  ...state.transcriptDetail,
                  speakers: state.transcriptDetail.speakers.map((item) =>
                    item.id === speaker.id ? speaker : item
                  ),
                }
              : state.transcriptDetail,
        }));
        return speaker;
      } catch (error) {
        logger.error(
          { err: toLogError(error), transcriptionId, speakerId },
          '更新 Speaker 名称失败'
        );
        throw new Error(getApiErrorMessage(error, '更新说话人名称失败'), { cause: error });
      }
    },

    correctTranscriptTurn: async (transcriptionId, turnId, correctedText) => {
      try {
        const response = await transcribeApi.correctTurn(
          transcriptionId,
          turnId,
          correctedText
        );
        const turn = safeParseStrict(TranscriptTurnSchema, response.data.turn);
        const record = safeParseStrict(TranscriptionRecordSchema, response.data.record);
        set((state) => ({
          transcriptDetail:
            state.transcriptDetail?.record.id === transcriptionId
              ? {
                  ...state.transcriptDetail,
                  record,
                  turns: state.transcriptDetail.turns.map((item) =>
                    item.id === turn.id ? turn : item
                  ),
                }
              : state.transcriptDetail,
        }));
        return turn;
      } catch (error) {
        logger.error(
          { err: toLogError(error), transcriptionId, turnId },
          '校对逐字稿失败'
        );
        throw new Error(getApiErrorMessage(error, '校对逐字稿失败'), { cause: error });
      }
    },

    summarizeTranscript: async (transcriptionId) => {
      const taskId = createTranscriptionTaskId().replace('transcribe-', 'summary-');
      const sseClient = createSSEClient(taskId);
      sseClient.on<SSEProgressEvent>('progress', (progress) => {
        const phase =
          progress.phase === 'synthesizing' ? 'synthesizing' : 'summarizing-batches';
        set({
          transcriptSummaryProgress: {
            phase,
            percent: progress.percent ?? 0,
            current: progress.current ?? 0,
            total: progress.total ?? 0,
            message:
              phase === 'synthesizing' ? '正在合并全局摘要' : '正在分批阅读逐字稿',
          },
        });
      });
      sseClient.on<SSECompleteEvent>('complete', (event) => {
        if (!event.transcript) return;
        const transcript: TranscriptDetail = safeParseStrict(
          TranscriptDetailSchema,
          event.transcript
        );
        set((state) => ({
          transcriptDetail: transcript,
          isSummarizingTranscript: false,
          transcriptionHistory: state.transcriptionHistory.map((record) =>
            record.id === transcript.record.id ? transcript.record : record
          ),
          transcriptSummaryProgress: {
            phase: 'completed',
            percent: 100,
            current: 0,
            total: 0,
            message: '总结完成',
          },
        }));
        sseClient.close();
      });
      sseClient.on<SSEErrorEvent>('error', (event) => {
        if (event.error === 'SSE 连接错误') return;
        set({
          isSummarizingTranscript: false,
          transcriptSummaryProgress: {
            phase: 'failed',
            percent: 0,
            current: 0,
            total: 0,
            message: event.error || '总结失败',
          },
        });
        sseClient.close();
      });
      set({
        isSummarizingTranscript: true,
        transcriptSummaryProgress: {
          phase: 'queued',
          percent: 0,
          current: 0,
          total: 0,
          message: '总结任务已进入队列',
        },
      });
      sseClient.connect();
      try {
        await transcribeApi.summarize(transcriptionId, taskId);
      } catch (error) {
        sseClient.close();
        set({
          isSummarizingTranscript: false,
          transcriptSummaryProgress: {
            phase: 'failed',
            percent: 0,
            current: 0,
            total: 0,
            message: getApiErrorMessage(error, '无法开始总结'),
          },
        });
        throw new Error(getApiErrorMessage(error, '无法开始总结'), { cause: error });
      }
    },

    updateTranscriptMetadata: async (transcriptionId, metadata) => {
      try {
        const response = await transcribeApi.updateMetadata(transcriptionId, metadata);
        const record = safeParseStrict(TranscriptionRecordSchema, response.data.record);
        set((state) => ({
          transcriptDetail:
            state.transcriptDetail?.record.id === transcriptionId
              ? { ...state.transcriptDetail, record }
              : state.transcriptDetail,
          transcriptionHistory: state.transcriptionHistory.map((item) =>
            item.id === transcriptionId ? record : item
          ),
        }));
        return record;
      } catch (error) {
        logger.error(
          { err: toLogError(error), transcriptionId },
          '更新播客元数据失败'
        );
        throw new Error(getApiErrorMessage(error, '更新播客元数据失败'), { cause: error });
      }
    },

    analyzeTranscriptClaims: async (transcriptionId) => {
      const taskId = createTranscriptionTaskId().replace('transcribe-', 'claims-');
      const sseClient = createSSEClient(taskId);
      sseClient.on<SSEProgressEvent>('progress', (progress) => {
        const phase =
          progress.phase === 'embedding-claims' ? 'synthesizing' : 'summarizing-batches';
        set({
          transcriptClaimProgress: {
            phase,
            percent: progress.percent ?? 0,
            current: progress.current ?? 0,
            total: progress.total ?? 0,
            message:
              progress.phase === 'embedding-claims'
                ? '正在建立观点搜索索引'
                : '正在分批提取观点',
          },
        });
      });
      sseClient.on<SSECompleteEvent>('complete', (event) => {
        const claims: TranscriptClaim[] = event.claims ?? [];
        set((state) => ({
          isAnalyzingClaims: false,
          transcriptClaimProgress: {
            phase: 'completed',
            percent: 100,
            current: claims.length,
            total: claims.length,
            message: '观点分析完成',
          },
          transcriptDetail:
            state.transcriptDetail?.record.id === transcriptionId
              ? {
                  ...state.transcriptDetail,
                  record: {
                    ...state.transcriptDetail.record,
                    claims_status: 'completed',
                    claims_error: '',
                  },
                  claims,
                }
              : state.transcriptDetail,
        }));
        sseClient.close();
      });
      sseClient.on<SSEErrorEvent>('error', (event) => {
        if (event.error === 'SSE 连接错误') return;
        set({
          isAnalyzingClaims: false,
          transcriptClaimProgress: {
            phase: 'failed',
            percent: 0,
            current: 0,
            total: 0,
            message: event.error || '观点分析失败',
          },
        });
        sseClient.close();
      });
      set({
        isAnalyzingClaims: true,
        transcriptClaimProgress: {
          phase: 'queued',
          percent: 0,
          current: 0,
          total: 0,
          message: '观点分析任务已进入队列',
        },
      });
      sseClient.connect();
      try {
        await transcribeApi.analyzeClaims(transcriptionId, taskId);
      } catch (error) {
        sseClient.close();
        set({
          isAnalyzingClaims: false,
          transcriptClaimProgress: {
            phase: 'failed',
            percent: 0,
            current: 0,
            total: 0,
            message: getApiErrorMessage(error, '无法开始观点分析'),
          },
        });
        throw new Error(getApiErrorMessage(error, '无法开始观点分析'), { cause: error });
      }
    },

    updateTranscriptClaim: async (claimId, update) => {
      try {
        const response = await transcribeApi.updateClaim(claimId, update);
        const claim = safeParseStrict(TranscriptClaimSchema, response.data.claim);
        set((state) => ({
          transcriptDetail: state.transcriptDetail
            ? {
                ...state.transcriptDetail,
                claims: state.transcriptDetail.claims.map((item) =>
                  item.id === claim.id ? claim : item
                ),
              }
            : null,
          claimDetail: state.claimDetail?.id === claim.id ? claim : state.claimDetail,
          claimSearchResults: state.claimSearchResults.map((item) =>
            item.claim.id === claim.id ? { ...item, claim } : item
          ),
          currentContentProject: state.currentContentProject
            ? {
                ...state.currentContentProject,
                claims: state.currentContentProject.claims.map((item) =>
                  item.claim_id === claim.id ? { ...item, claim } : item
                ),
              }
            : null,
        }));
        return claim;
      } catch (error) {
        throw new Error(getApiErrorMessage(error, '更新观点失败'), { cause: error });
      }
    },

    deleteTranscriptClaim: async (claimId) => {
      try {
        await transcribeApi.deleteClaim(claimId);
        set((state) => {
          const currentProjectHadClaim = Boolean(
            state.currentContentProject?.claims.some((item) => item.claim_id === claimId)
          );
          return {
            transcriptDetail: state.transcriptDetail
              ? {
                  ...state.transcriptDetail,
                  claims: state.transcriptDetail.claims.filter((item) => item.id !== claimId),
                }
              : null,
            claimDetail: state.claimDetail?.id === claimId ? null : state.claimDetail,
            claimSearchResults: state.claimSearchResults.filter(
              (item) => item.claim.id !== claimId
            ),
            claimRelationAnalysis: null,
            currentContentProject: state.currentContentProject
              ? {
                  ...state.currentContentProject,
                  claim_count: Math.max(
                    0,
                    (state.currentContentProject.claim_count ??
                      state.currentContentProject.claims.length) -
                      (currentProjectHadClaim ? 1 : 0)
                  ),
                  claims: state.currentContentProject.claims.filter(
                    (item) => item.claim_id !== claimId
                  ),
                }
              : null,
            contentProjects:
              currentProjectHadClaim && state.currentContentProject
                ? state.contentProjects.map((project) =>
                    project.id === state.currentContentProject?.id
                      ? {
                          ...project,
                          claim_count: Math.max(
                            0,
                            (project.claim_count ?? project.claims.length) - 1
                          ),
                        }
                      : project
                  )
                : state.contentProjects,
          };
        });
      } catch (error) {
        throw new Error(getApiErrorMessage(error, '删除观点失败'), { cause: error });
      }
    },

    fetchTranscriptionHistory: async (params) => {
      set({ isLoadingTranscriptionHistory: true });
      try {
        const response = await transcribeApi.getResults(params);
        const data = safeParseStrict(TranscriptionResultsResponseSchema, response.data);
        set({ transcriptionHistory: data.results, isLoadingTranscriptionHistory: false });
        return data.results;
      } catch (error) {
        set({ isLoadingTranscriptionHistory: false });
        logger.error(
          { err: toLogError(error), limit: params?.limit },
          '获取转录历史失败'
        );
        throw new Error(getApiErrorMessage(error, '获取转录历史失败'), { cause: error });
      }
    },

    fetchTranscriptionStats: async () => {
      set({ isLoadingTranscriptionStats: true });
      try {
        const response = await transcribeApi.getStats();
        const data = safeParseStrict(TranscriptionStatsResponseSchema, response.data);
        set({ transcriptionStats: data.stats, isLoadingTranscriptionStats: false });
        return data.stats;
      } catch (error) {
        set({ isLoadingTranscriptionStats: false });
        logger.error({ err: toLogError(error) }, '获取转录统计失败');
        throw new Error(getApiErrorMessage(error, '获取转录统计失败'), { cause: error });
      }
    },

    deleteTranscriptionHistoryResult: async (id) => {
      set({ isDeletingTranscriptionResult: true });
      try {
        await transcribeApi.deleteResult(id);
        set((state) => ({
          isDeletingTranscriptionResult: false,
          transcriptionHistory: state.transcriptionHistory.filter((record) => record.id !== id),
          transcriptionRecord:
            state.transcriptionRecord?.id === id ? null : state.transcriptionRecord,
          batchTranscriptionItems: state.batchTranscriptionItems.map((item) => {
            const itemResultId = item.resultId ?? item.transcriptionResult?.id;
            if (itemResultId !== id) return item;
            return {
              ...item,
              formattedText: '',
              resultId: undefined,
              transcriptionResult: undefined,
            };
          }),
        }));
      } catch (error) {
        set({ isDeletingTranscriptionResult: false });
        logger.error({ err: toLogError(error), resultId: id }, '删除转录结果失败');
        throw new Error(getApiErrorMessage(error, '删除转录结果失败'), { cause: error });
      }
    },

    formatTranscriptionResult: async (id, text) => {
      try {
        const response = await transcribeApi.formatResult(id, { text });
        const record = safeParseStrict(TranscriptionRecordSchema, response.data.result);
        set((state) => ({
          transcriptionText:
            state.transcriptionRecord?.id === id ? record.text : state.transcriptionText,
          transcriptionRecord:
            state.transcriptionRecord?.id === id ? record : state.transcriptionRecord,
          transcriptionHistory: state.transcriptionHistory.map((item) =>
            item.id === id ? record : item
          ),
          batchTranscriptionItems: state.batchTranscriptionItems.map((item) =>
            updateBatchItemRecord(item, record)
          ),
        }));
        return record;
      } catch (error) {
        logger.error(
          { err: toLogError(error), resultId: id, textLength: text.length },
          '转录结果 AI 排版失败'
        );
        throw new Error(getApiErrorMessage(error, '转录结果 AI 排版失败'), { cause: error });
      }
    },
  };
}
