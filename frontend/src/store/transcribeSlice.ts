import { transcribeApi } from '../services/api';
import { getApiErrorMessage } from '../services/apiError';
import { createScopedLogger, toLogError } from '../services/logger';
import {
  safeParseStrict,
  TranscriptDetailResponseSchema,
  TranscriptDetailSchema,
  TranscriptSpeakerSchema,
  TranscriptTurnSchema,
  TranscriptionRecordSchema,
  TranscriptionResultSchema,
  TranscriptionResultsResponseSchema,
  TranscriptionStatsResponseSchema,
} from '../services/schemas';
import { createSSEClient, type SSECompleteEvent, type SSEErrorEvent, type SSEProgressEvent } from '../services/sseClient';
import type {
  AppState,
  AsrProvider,
  AsrLanguage,
  BatchTranscriptionItem,
  BatchTranscriptionProgress,
  TranscribeOptions,
  TranscriptionRecord,
  TranscriptionProgress,
  TranscriptionResult,
  TranscriptionStats,
  TranscriptDetail,
  TranscriptSummaryProgress,
} from './types';
import type { StoreSet } from './storeTypes';
import { mergeTranscriptionChunk, mergeTranscriptionText } from './transcriptionProgressModel';

const logger = createScopedLogger('transcribe-slice');

const IDLE_PROGRESS: TranscriptionProgress = {
  phase: 'idle',
  percent: 0,
  current: 0,
  total: 0,
  message: '等待上传',
};

const IDLE_BATCH_PROGRESS: BatchTranscriptionProgress = {
  phase: 'idle',
  percent: 0,
  currentIndex: 0,
  total: 0,
  currentFileName: '',
  message: '等待上传',
};

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

interface BatchSSEProgress {
  phase?: string;
  index?: number;
  fileName?: string;
  total?: number;
  current?: number;
  filePercent?: number;
  percent?: number;
  text?: string;
  chunkText?: string;
  chunks?: Array<{ index: number; text: string }>;
  usage?: Record<string, unknown> | null;
  resultId?: number;
  transcriptionResult?: TranscriptionRecord;
  error?: string;
  message?: string;
  timestamp?: number;
}

interface BatchSSECompleteResult {
  fileName: string;
  relativePath: string;
  text: string;
  usage?: Record<string, unknown> | null;
  resultId?: number;
  transcriptionResult?: TranscriptionRecord;
  error?: string;
}

interface BatchSSEComplete {
  phase?: 'completed';
  percent?: number;
  results?: BatchSSECompleteResult[];
  total?: number;
  succeeded?: number;
  failed?: number;
  timestamp: number;
}

function createTaskId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `transcribe-${crypto.randomUUID()}`;
  }
  return `transcribe-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function progressMessage(progress: SSEProgressEvent): string {
  if (progress.message) return progress.message;
  if (progress.phase === 'preparing') return '正在分析音频并切片';
  if (progress.total && progress.current !== undefined) {
    return `正在转录 ${progress.current}/${progress.total}`;
  }
  return '正在转录';
}

function getRelativePath(file: File): string {
  const withPath = file as File & { webkitRelativePath?: string };
  return withPath.webkitRelativePath || file.name;
}

function appendTranscribeOptions(formData: FormData, options?: TranscribeOptions) {
  if (options?.asrEngine) {
    formData.append('asrEngine', options.asrEngine);
  }
  if (options?.asrModel?.trim()) {
    formData.append('asrModel', options.asrModel.trim());
  }
  if (options?.context?.trim()) {
    formData.append('context', options.context.trim());
  }
  if (options?.contentMode) {
    formData.append('contentMode', options.contentMode);
  }
}

function updateBatchItemRecord(item: BatchTranscriptionItem, record: TranscriptionRecord): BatchTranscriptionItem {
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

function upsertTranscriptionHistory(history: TranscriptionRecord[], record: TranscriptionRecord): TranscriptionRecord[] {
  return [record, ...history.filter((item) => item.id !== record.id)];
}

function collectBatchRecords(items: BatchTranscriptionItem[]): TranscriptionRecord[] {
  return items
    .map((item) => item.transcriptionResult)
    .filter((record): record is TranscriptionRecord => Boolean(record));
}

async function refreshTranscriptionStats(set: StoreSet): Promise<void> {
  try {
    const response = await transcribeApi.getStats();
    const data = safeParseStrict(TranscriptionStatsResponseSchema, response.data);
    set({ transcriptionStats: data.stats });
  } catch (error) {
    logger.error({ err: toLogError(error) }, '刷新转录统计失败');
  }
}

export function createTranscribeSlice(set: StoreSet): Pick<
  AppState,
  | 'transcriptionText'
  | 'transcriptionChunks'
  | 'transcriptionRecord'
  | 'transcriptionHistory'
  | 'transcriptionStats'
  | 'isTranscribing'
  | 'isLoadingTranscriptionHistory'
  | 'isLoadingTranscriptionStats'
  | 'isDeletingTranscriptionResult'
  | 'transcribeProgress'
  | 'transcriptDetail'
  | 'isLoadingTranscriptDetail'
  | 'isSummarizingTranscript'
  | 'transcriptSummaryProgress'
  | 'transcribeMedia'
  | 'fetchTranscriptionHistory'
  | 'fetchTranscriptionStats'
  | 'deleteTranscriptionHistoryResult'
  | 'formatTranscriptionResult'
  | 'clearTranscription'
  | 'fetchTranscriptDetail'
  | 'renameTranscriptSpeaker'
  | 'correctTranscriptTurn'
  | 'summarizeTranscript'
  | 'batchTranscriptionItems'
  | 'isBatchTranscribing'
  | 'batchTranscribeProgress'
  | 'batchTranscribeMedia'
  | 'clearBatchTranscription'
> {
  return {
    transcriptionText: '',
    transcriptionChunks: [],
    transcriptionRecord: null,
    transcriptionHistory: [],
    transcriptionStats: EMPTY_TRANSCRIPTION_STATS,
    isTranscribing: false,
    isLoadingTranscriptionHistory: false,
    isLoadingTranscriptionStats: false,
    isDeletingTranscriptionResult: false,
    transcribeProgress: IDLE_PROGRESS,
    transcriptDetail: null,
    isLoadingTranscriptDetail: false,
    isSummarizingTranscript: false,
    transcriptSummaryProgress: IDLE_SUMMARY_PROGRESS,

    transcribeMedia: async (file: File, language: AsrLanguage, provider?: AsrProvider, options?: TranscribeOptions) => {
      const taskId = createTaskId();
      const sseClient = createSSEClient(taskId);

      sseClient.on<SSEProgressEvent>('progress', (progress) => {
        set((state) => ({
          transcriptionText: mergeTranscriptionText(state.transcriptionText, progress.text),
          transcriptionChunks: mergeTranscriptionChunk(state.transcriptionChunks, progress),
          transcribeProgress: {
            phase: progress.phase === 'preparing' ? 'preparing' : 'transcribing',
            percent: progress.percent ?? 0,
            current: progress.current ?? 0,
            total: progress.total ?? 0,
            message: progressMessage(progress),
          },
        }));
      });

      sseClient.on<SSECompleteEvent>('complete', (result) => {
        set((state) => ({
          transcriptionText: result.text ?? '',
          transcriptionChunks: [],
          transcriptionRecord: result.transcriptionResult ?? null,
          isTranscribing: false,
          transcriptionHistory: result.transcriptionResult
            ? upsertTranscriptionHistory(state.transcriptionHistory, result.transcriptionResult)
            : state.transcriptionHistory,
          transcribeProgress: {
            phase: 'completed',
            percent: 100,
            current: 0,
            total: 0,
            message: '转录完成',
          },
        }));
        void refreshTranscriptionStats(set);
      });

      sseClient.on<SSEErrorEvent>('error', (event) => {
        if (event.error === 'SSE 连接错误') return;
        set({
          isTranscribing: false,
          transcribeProgress: {
            phase: 'failed',
            percent: 0,
            current: 0,
            total: 0,
            message: event.error || '转录失败',
          },
        });
      });

      set({
        isTranscribing: true,
        transcriptionText: '',
        transcriptionChunks: [],
        transcriptionRecord: null,
        transcribeProgress: {
          phase: 'uploading',
          percent: 0,
          current: 0,
          total: 0,
          message: '正在上传音频',
        },
      });
      sseClient.connect();

      try {
        const formData = new FormData();
        formData.append('media', file);
        formData.append('language', language);
        formData.append('taskId', taskId);
        if (provider) formData.append('provider', provider);
        appendTranscribeOptions(formData, options);

        const response = await transcribeApi.transcribe(formData, {
          onUploadProgress: (event) => {
            const uploadPercent = event.total ? Math.round((event.loaded / event.total) * 10) : 5;
            set({
              transcribeProgress: {
                phase: 'uploading',
                percent: Math.min(uploadPercent, 10),
                current: 0,
                total: 0,
                message: '正在上传音频',
              },
            });
          },
        });
        const result = safeParseStrict(TranscriptionResultSchema, response.data) as TranscriptionResult;
        set((state) => ({
          transcriptionText: result.text,
          transcriptionChunks: [],
          transcriptionRecord: result.transcriptionResult ?? null,
          isTranscribing: false,
          transcriptionHistory: result.transcriptionResult
            ? upsertTranscriptionHistory(state.transcriptionHistory, result.transcriptionResult)
            : state.transcriptionHistory,
          transcribeProgress: {
            phase: 'completed',
            percent: 100,
            current: 0,
            total: 0,
            message: '转录完成',
          },
        }));
        void refreshTranscriptionStats(set);
        return result;
      } catch (error) {
        set({
          isTranscribing: false,
          transcribeProgress: {
            phase: 'failed',
            percent: 0,
            current: 0,
            total: 0,
            message: '转录失败',
          },
        });
        logger.error({ err: toLogError(error), fileSize: file.size, language, provider, hasContext: Boolean(options?.context), taskIdLength: taskId.length }, '转录失败');
        throw error;
      } finally {
        sseClient.close();
      }
    },

    clearTranscription: () => {
      set({ transcriptionText: '', transcriptionChunks: [], transcriptionRecord: null, transcribeProgress: IDLE_PROGRESS });
    },

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
        const response = await transcribeApi.renameSpeaker(transcriptionId, speakerId, displayName);
        const speaker = safeParseStrict(TranscriptSpeakerSchema, response.data.speaker);
        set((state) => ({
          transcriptDetail: state.transcriptDetail?.record.id === transcriptionId
            ? {
                ...state.transcriptDetail,
                speakers: state.transcriptDetail.speakers.map((item) => item.id === speaker.id ? speaker : item),
              }
            : state.transcriptDetail,
        }));
        return speaker;
      } catch (error) {
        logger.error({ err: toLogError(error), transcriptionId, speakerId }, '更新 Speaker 名称失败');
        throw new Error(getApiErrorMessage(error, '更新说话人名称失败'), { cause: error });
      }
    },

    correctTranscriptTurn: async (transcriptionId, turnId, correctedText) => {
      try {
        const response = await transcribeApi.correctTurn(transcriptionId, turnId, correctedText);
        const turn = safeParseStrict(TranscriptTurnSchema, response.data.turn);
        const record = safeParseStrict(TranscriptionRecordSchema, response.data.record);
        set((state) => ({
          transcriptDetail: state.transcriptDetail?.record.id === transcriptionId
            ? {
                ...state.transcriptDetail,
                record,
                turns: state.transcriptDetail.turns.map((item) => item.id === turn.id ? turn : item),
              }
            : state.transcriptDetail,
        }));
        return turn;
      } catch (error) {
        logger.error({ err: toLogError(error), transcriptionId, turnId }, '校对逐字稿失败');
        throw new Error(getApiErrorMessage(error, '校对逐字稿失败'), { cause: error });
      }
    },

    summarizeTranscript: async (transcriptionId) => {
      const taskId = createTaskId().replace('transcribe-', 'summary-');
      const sseClient = createSSEClient(taskId);
      sseClient.on<SSEProgressEvent>('progress', (progress) => {
        const phase = progress.phase === 'synthesizing' ? 'synthesizing' : 'summarizing-batches';
        set({
          transcriptSummaryProgress: {
            phase,
            percent: progress.percent ?? 0,
            current: progress.current ?? 0,
            total: progress.total ?? 0,
            message: phase === 'synthesizing' ? '正在合并全局摘要' : '正在分批阅读逐字稿',
          },
        });
      });
      sseClient.on<SSECompleteEvent>('complete', (event) => {
        if (!event.transcript) return;
        const transcript: TranscriptDetail = safeParseStrict(TranscriptDetailSchema, event.transcript);
        set((state) => ({
          transcriptDetail: transcript,
          isSummarizingTranscript: false,
          transcriptionHistory: state.transcriptionHistory.map((record) =>
            record.id === transcript.record.id ? transcript.record : record
          ),
          transcriptSummaryProgress: {
            phase: 'completed', percent: 100, current: 0, total: 0, message: '总结完成',
          },
        }));
        sseClient.close();
      });
      sseClient.on<SSEErrorEvent>('error', (event) => {
        if (event.error === 'SSE 连接错误') return;
        set({
          isSummarizingTranscript: false,
          transcriptSummaryProgress: {
            phase: 'failed', percent: 0, current: 0, total: 0, message: event.error || '总结失败',
          },
        });
        sseClient.close();
      });
      set({
        isSummarizingTranscript: true,
        transcriptSummaryProgress: {
          phase: 'queued', percent: 0, current: 0, total: 0, message: '总结任务已进入队列',
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
            phase: 'failed', percent: 0, current: 0, total: 0,
            message: getApiErrorMessage(error, '无法开始总结'),
          },
        });
        throw new Error(getApiErrorMessage(error, '无法开始总结'), { cause: error });
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
        logger.error({ err: toLogError(error), limit: params?.limit }, '获取转录历史失败');
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
          transcriptionRecord: state.transcriptionRecord?.id === id ? null : state.transcriptionRecord,
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
          transcriptionText: state.transcriptionRecord?.id === id ? record.text : state.transcriptionText,
          transcriptionRecord: state.transcriptionRecord?.id === id ? record : state.transcriptionRecord,
          transcriptionHistory: state.transcriptionHistory.map((item) => item.id === id ? record : item),
          batchTranscriptionItems: state.batchTranscriptionItems.map((item) => updateBatchItemRecord(item, record)),
        }));
        return record;
      } catch (error) {
        logger.error({ err: toLogError(error), resultId: id, textLength: text.length }, '转录结果 AI 排版失败');
        throw new Error(getApiErrorMessage(error, '转录结果 AI 排版失败'), { cause: error });
      }
    },

    batchTranscriptionItems: [],
    isBatchTranscribing: false,
    batchTranscribeProgress: IDLE_BATCH_PROGRESS,

    batchTranscribeMedia: async (files: File[], language: AsrLanguage, provider?: AsrProvider, options?: TranscribeOptions) => {
      const taskId = createTaskId();
      const sseClient = createSSEClient(taskId);
      const total = files.length;

      const initialItems: BatchTranscriptionItem[] = files.map((file) => ({
        fileName: file.name,
        relativePath: getRelativePath(file),
        text: '',
        formattedText: '',
        usage: null,
        status: 'pending',
      }));

      sseClient.on<BatchSSEProgress>('progress', (progress) => {
        const phase = progress.phase;
        const idx = progress.index ?? 0;
        const totalCount = progress.total ?? total;

        if (phase === 'batch-preparing') {
          set({
            batchTranscribeProgress: {
              phase: 'batch-preparing',
              percent: 0,
              currentIndex: 0,
              total: totalCount,
              currentFileName: '',
              message: '准备批量转录',
            },
          });
          return;
        }

        if (phase === 'file-start') {
          set((state) => ({
            batchTranscriptionItems: state.batchTranscriptionItems.map((item, i) =>
              i === idx ? { ...item, status: 'transcribing' as const } : item
            ),
            batchTranscribeProgress: {
              phase: 'file-start',
              percent: progress.percent ?? 0,
              currentIndex: idx,
              total: totalCount,
              currentFileName: progress.fileName ?? '',
              message: `正在转录 ${idx + 1}/${totalCount}`,
            },
          }));
          return;
        }

        if (phase === 'file-progress') {
          set((state) => ({
            batchTranscriptionItems: state.batchTranscriptionItems.map((item, itemIndex) =>
              itemIndex === idx
                ? { ...item, text: mergeTranscriptionText(item.text, progress.text) }
                : item
            ),
            batchTranscribeProgress: {
              phase: 'file-progress',
              percent: progress.percent ?? 0,
              currentIndex: idx,
              total: totalCount,
              currentFileName: progress.fileName ?? '',
              message: progress.message ?? `正在转录 ${idx + 1}/${totalCount}`,
            },
          }));
          return;
        }

        if (phase === 'file-complete') {
          set((state) => ({
            batchTranscriptionItems: state.batchTranscriptionItems.map((item, i) =>
              i === idx
                ? {
                    ...item,
                    status: 'completed' as const,
                    text: progress.text ?? '',
                    formattedText: progress.transcriptionResult?.formatted_text ?? '',
                    resultId: progress.resultId ?? progress.transcriptionResult?.id,
                    transcriptionResult: progress.transcriptionResult,
                    usage: progress.usage ?? null,
                  }
                : item
            ),
          }));
          return;
        }

        if (phase === 'file-error') {
          set((state) => ({
            batchTranscriptionItems: state.batchTranscriptionItems.map((item, i) =>
              i === idx
                ? { ...item, status: 'failed' as const, error: progress.error ?? '转录失败' }
                : item
            ),
          }));
          return;
        }
      });

      sseClient.on<BatchSSEComplete>('complete', (result) => {
        const items: BatchTranscriptionItem[] = (result.results ?? []).map((r) => ({
          fileName: r.fileName,
          relativePath: r.relativePath ?? r.fileName,
          text: r.text ?? '',
          formattedText: r.transcriptionResult?.formatted_text ?? '',
          resultId: r.resultId ?? r.transcriptionResult?.id,
          transcriptionResult: r.transcriptionResult,
          usage: r.usage ?? null,
          status: r.error ? 'failed' : 'completed',
          error: r.error,
        }));
        set((state) => {
          const records = collectBatchRecords(items);
          return {
          batchTranscriptionItems: items,
          isBatchTranscribing: false,
          transcriptionHistory: records.reduce(upsertTranscriptionHistory, state.transcriptionHistory),
          batchTranscribeProgress: {
            phase: 'completed',
            percent: 100,
            currentIndex: result.total ?? total,
            total: result.total ?? total,
            currentFileName: '',
            message: `批量转录完成（成功 ${result.succeeded ?? 0}，失败 ${result.failed ?? 0}）`,
          },
        };
        });
        void refreshTranscriptionStats(set);
        sseClient.close();
      });

      sseClient.on<SSEErrorEvent>('error', (event) => {
        // EventSource 连接层错误会自动重连，不在此置失败态
        if (event.error === 'SSE 连接错误') return;
        set({
          isBatchTranscribing: false,
          batchTranscribeProgress: {
            phase: 'failed',
            percent: 0,
            currentIndex: 0,
            total,
            currentFileName: '',
            message: event.error || '批量转录失败',
          },
        });
        sseClient.close();
      });

      set({
        isBatchTranscribing: true,
        batchTranscriptionItems: initialItems,
        batchTranscribeProgress: {
          phase: 'uploading',
          percent: 0,
          currentIndex: 0,
          total,
          currentFileName: '',
          message: '正在上传文件',
        },
      });
      sseClient.connect();

      try {
        const formData = new FormData();
        const relativePaths: string[] = [];
        files.forEach((file) => {
          formData.append('media', file);
          relativePaths.push(getRelativePath(file));
        });
        formData.append('language', language);
        formData.append('taskId', taskId);
        formData.append('relativePaths', JSON.stringify(relativePaths));
        if (provider) formData.append('provider', provider);
        appendTranscribeOptions(formData, options);

        const response = await transcribeApi.batchTranscribe(formData, {
          onUploadProgress: (event) => {
            const uploadPercent = event.total ? Math.round((event.loaded / event.total) * 100) : 50;
            set({
              batchTranscribeProgress: {
                phase: 'uploading',
                percent: Math.min(uploadPercent, 100),
                currentIndex: 0,
                total,
                currentFileName: '',
                message: '正在上传文件',
              },
            });
          },
        });

        // 后端立即返回 202（任务已受理），实际转录在后台进行，
        // 进度与最终结果全部通过 SSE 推送。此处不关闭 SSE，由 complete/error 回调关闭。
        if (response.status !== 202) {
          throw new Error('批量任务提交失败，请稍后重试');
        }
        return initialItems;
      } catch (error) {
        // 仅 HTTP 提交失败才到这里；转录过程中的失败走 SSE error 通道
        set({
          isBatchTranscribing: false,
          batchTranscribeProgress: {
            phase: 'failed',
            percent: 0,
            currentIndex: 0,
            total,
            currentFileName: '',
            message: '批量转录提交失败',
          },
        });
        sseClient.close();
        logger.error({ err: toLogError(error), fileCount: files.length, language, provider, hasContext: Boolean(options?.context), taskIdLength: taskId.length }, '批量转录提交失败');
        throw error;
      }
    },

    clearBatchTranscription: () => {
      set({ batchTranscriptionItems: [], batchTranscribeProgress: IDLE_BATCH_PROGRESS });
    },
  };
}
