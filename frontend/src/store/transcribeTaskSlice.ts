import { transcribeApi } from '../services/api';
import { createScopedLogger, toLogError } from '../services/logger';
import { safeParseStrict, TranscriptionResultSchema } from '../services/schemas';
import {
  createSSEClient,
  type SSECompleteEvent,
  type SSEErrorEvent,
  type SSEProgressEvent,
} from '../services/sseClient';
import type {
  AppState,
  AsrLanguage,
  AsrProvider,
  TranscribeOptions,
  TranscriptionProgress,
  TranscriptionResult,
} from './types';
import type { StoreSet } from './storeTypes';
import { mergeTranscriptionChunk, mergeTranscriptionText } from './transcriptionProgressModel';
import {
  appendTranscribeOptions,
  createTranscriptionTaskId,
  refreshTranscriptionStats,
  upsertTranscriptionHistory,
} from './transcribeSliceShared';

const logger = createScopedLogger('transcribe-slice');

const IDLE_PROGRESS: TranscriptionProgress = {
  phase: 'idle',
  percent: 0,
  current: 0,
  total: 0,
  message: '等待上传',
};

function progressMessage(progress: SSEProgressEvent): string {
  if (progress.message) return progress.message;
  if (progress.phase === 'preparing') return '正在分析音频并切片';
  if (progress.total && progress.current !== undefined) {
    return `正在转录 ${progress.current}/${progress.total}`;
  }
  return '正在转录';
}

type TranscribeTaskSlice = Pick<
  AppState,
  | 'transcriptionText'
  | 'transcriptionChunks'
  | 'transcriptionRecord'
  | 'isTranscribing'
  | 'transcribeProgress'
  | 'transcribeMedia'
  | 'clearTranscription'
>;

export function createTranscribeTaskSlice(set: StoreSet): TranscribeTaskSlice {
  return {
    transcriptionText: '',
    transcriptionChunks: [],
    transcriptionRecord: null,
    isTranscribing: false,
    transcribeProgress: IDLE_PROGRESS,

    transcribeMedia: async (
      file: File,
      language: AsrLanguage,
      provider?: AsrProvider,
      options?: TranscribeOptions
    ) => {
      const taskId = createTranscriptionTaskId();
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
        logger.error(
          {
            err: toLogError(error),
            fileSize: file.size,
            language,
            provider,
            hasContext: Boolean(options?.context),
            taskIdLength: taskId.length,
          },
          '转录失败'
        );
        throw error;
      } finally {
        sseClient.close();
      }
    },

    clearTranscription: () => {
      set({
        transcriptionText: '',
        transcriptionChunks: [],
        transcriptionRecord: null,
        transcribeProgress: IDLE_PROGRESS,
      });
    },
  };
}
