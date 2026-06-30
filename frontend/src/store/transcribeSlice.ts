import { transcribeApi } from '../services/api';
import { getApiErrorMessage } from '../services/apiError';
import { createScopedLogger, toLogError } from '../services/logger';
import {
  safeParseStrict,
  TranscriptionRecordSchema,
  TranscriptionResultSchema,
  TranscriptionResultsResponseSchema,
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
} from './types';
import type { StoreSet } from './storeTypes';

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
  if (options?.wslModel?.trim()) {
    formData.append('wslModel', options.wslModel.trim());
  }
  if (options?.context?.trim()) {
    formData.append('context', options.context.trim());
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

export function createTranscribeSlice(set: StoreSet): Pick<
  AppState,
  | 'transcriptionText'
  | 'transcriptionRecord'
  | 'transcriptionHistory'
  | 'isTranscribing'
  | 'isLoadingTranscriptionHistory'
  | 'isDeletingTranscriptionResult'
  | 'transcribeProgress'
  | 'transcribeMedia'
  | 'fetchTranscriptionHistory'
  | 'deleteTranscriptionHistoryResult'
  | 'formatTranscriptionResult'
  | 'setTranscriptionText'
  | 'clearTranscription'
  | 'batchTranscriptionItems'
  | 'isBatchTranscribing'
  | 'batchTranscribeProgress'
  | 'batchTranscribeMedia'
  | 'clearBatchTranscription'
> {
  return {
    transcriptionText: '',
    transcriptionRecord: null,
    transcriptionHistory: [],
    isTranscribing: false,
    isLoadingTranscriptionHistory: false,
    isDeletingTranscriptionResult: false,
    transcribeProgress: IDLE_PROGRESS,

    transcribeMedia: async (file: File, language: AsrLanguage, provider?: AsrProvider, options?: TranscribeOptions) => {
      const taskId = createTaskId();
      const sseClient = createSSEClient(taskId);

      sseClient.on<SSEProgressEvent>('progress', (progress) => {
        set({
          transcriptionText: progress.text ?? '',
          transcribeProgress: {
            phase: progress.phase ?? 'transcribing',
            percent: progress.percent ?? 0,
            current: progress.current ?? 0,
            total: progress.total ?? 0,
            message: progressMessage(progress),
          },
        });
      });

      sseClient.on<SSECompleteEvent>('complete', (result) => {
        set({
          transcriptionText: result.text ?? '',
          transcriptionRecord: result.transcriptionResult ?? null,
          transcribeProgress: {
            phase: 'completed',
            percent: 100,
            current: 0,
            total: 0,
            message: '转录完成',
          },
        });
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

    setTranscriptionText: (text) => {
      set({ transcriptionText: text });
    },

    clearTranscription: () => {
      set({ transcriptionText: '', transcriptionRecord: null, transcribeProgress: IDLE_PROGRESS });
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
          set({
            batchTranscribeProgress: {
              phase: 'file-progress',
              percent: progress.percent ?? 0,
              currentIndex: idx,
              total: totalCount,
              currentFileName: progress.fileName ?? '',
              message: progress.message ?? `正在转录 ${idx + 1}/${totalCount}`,
            },
          });
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
