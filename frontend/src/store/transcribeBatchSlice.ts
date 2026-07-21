import { transcribeApi } from '../services/api';
import { createScopedLogger, toLogError } from '../services/logger';
import { createSSEClient, type SSEErrorEvent } from '../services/sseClient';
import type {
  AppState,
  AsrLanguage,
  AsrProvider,
  BatchTranscriptionItem,
  BatchTranscriptionProgress,
  TranscribeOptions,
  TranscriptionRecord,
} from './types';
import type { StoreGet, StoreSet } from './storeTypes';
import { mergeTranscriptionText } from './transcriptionProgressModel';
import { bindBackgroundTaskTransport } from './sseBackgroundTask';
import {
  appendTranscribeOptions,
  createTranscriptionTaskId,
  refreshTranscriptionStats,
  upsertTranscriptionHistory,
} from './transcribeSliceShared';

const logger = createScopedLogger('transcribe-slice');

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
  percent?: number;
  text?: string;
  usage?: Record<string, unknown> | null;
  resultId?: number;
  transcriptionResult?: TranscriptionRecord;
  error?: string;
  message?: string;
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

function getRelativePath(file: File): string {
  const withPath = file as File & { webkitRelativePath?: string };
  return withPath.webkitRelativePath || file.name;
}

function collectBatchRecords(items: BatchTranscriptionItem[]): TranscriptionRecord[] {
  return items
    .map((item) => item.transcriptionResult)
    .filter((record): record is TranscriptionRecord => Boolean(record));
}

type TranscribeBatchSlice = Pick<
  AppState,
  | 'batchTranscriptionItems'
  | 'isBatchTranscribing'
  | 'batchTranscribeProgress'
  | 'batchTranscribeMedia'
  | 'clearBatchTranscription'
>;

export function createTranscribeBatchSlice(set: StoreSet, get: StoreGet): TranscribeBatchSlice {
  return {
    batchTranscriptionItems: [],
    isBatchTranscribing: false,
    batchTranscribeProgress: IDLE_BATCH_PROGRESS,

    batchTranscribeMedia: async (
      files: File[],
      language: AsrLanguage,
      provider?: AsrProvider,
      options?: TranscribeOptions
    ) => {
      const taskId = createTranscriptionTaskId();
      const sseClient = createSSEClient(taskId, 'batch-transcribe');
      const total = files.length;

      get().startBackgroundTask({
        taskId,
        kind: 'batch-transcribe',
        title: `批量转录：${total} 个文件`,
        href: '/transcribe',
        phase: 'uploading',
        percent: 0,
        message: '正在上传文件',
      });
      bindBackgroundTaskTransport(sseClient, taskId, get, () => {
        set({
          isBatchTranscribing: true,
          batchTranscribeProgress: {
            phase: 'failed',
            percent: 0,
            currentIndex: 0,
            total,
            currentFileName: '',
            message: '连接中断，请在顶部任务条重新连接',
          },
        });
      });

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

        get().updateBackgroundTask(taskId, {
          status: 'running',
          phase: phase ?? 'transcribing',
          percent: progress.percent ?? 0,
          message: progress.message ?? progress.fileName ?? '正在批量转录',
        });

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
            batchTranscriptionItems: state.batchTranscriptionItems.map((item, index) =>
              index === idx ? { ...item, status: 'transcribing' as const } : item
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
            batchTranscriptionItems: state.batchTranscriptionItems.map((item, index) =>
              index === idx
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
            batchTranscriptionItems: state.batchTranscriptionItems.map((item, index) =>
              index === idx
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
            batchTranscriptionItems: state.batchTranscriptionItems.map((item, index) =>
              index === idx
                ? { ...item, status: 'failed' as const, error: progress.error ?? '转录失败' }
                : item
            ),
          }));
        }
      });

      sseClient.on<BatchSSEComplete>('complete', (result) => {
        get().endBackgroundTask(taskId);
        const items: BatchTranscriptionItem[] = (result.results ?? []).map((item) => ({
          fileName: item.fileName,
          relativePath: item.relativePath ?? item.fileName,
          text: item.text ?? '',
          formattedText: item.transcriptionResult?.formatted_text ?? '',
          resultId: item.resultId ?? item.transcriptionResult?.id,
          transcriptionResult: item.transcriptionResult,
          usage: item.usage ?? null,
          status: item.error ? 'failed' : 'completed',
          error: item.error,
        }));
        set((state) => {
          const records = collectBatchRecords(items);
          return {
            batchTranscriptionItems: items,
            isBatchTranscribing: false,
            transcriptionHistory: records.reduce(
              upsertTranscriptionHistory,
              state.transcriptionHistory
            ),
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
        get().endBackgroundTask(taskId);
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
            const uploadPercent = event.total
              ? Math.round((event.loaded / event.total) * 100)
              : 50;
            get().updateBackgroundTask(taskId, {
              status: 'running',
              phase: 'uploading',
              percent: Math.min(uploadPercent, 100),
              message: '正在上传文件',
            });
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

        if (response.status !== 202) {
          throw new Error('批量任务提交失败，请稍后重试');
        }
        return initialItems;
      } catch (error) {
        get().endBackgroundTask(taskId);
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
        logger.error(
          {
            err: toLogError(error),
            fileCount: files.length,
            language,
            provider,
            hasContext: Boolean(options?.context),
            taskIdLength: taskId.length,
          },
          '批量转录提交失败'
        );
        throw error;
      }
    },

    clearBatchTranscription: () => {
      set({ batchTranscriptionItems: [], batchTranscribeProgress: IDLE_BATCH_PROGRESS });
    },
  };
}
