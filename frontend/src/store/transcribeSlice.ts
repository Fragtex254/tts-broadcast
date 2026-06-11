import { transcribeApi } from '../services/api';
import { createSSEClient, type SSECompleteEvent, type SSEErrorEvent, type SSEProgressEvent } from '../services/sseClient';
import type { AppState, AsrLanguage, TranscriptionProgress, TranscriptionResult } from './types';
import type { StoreSet } from './storeTypes';

const IDLE_PROGRESS: TranscriptionProgress = {
  phase: 'idle',
  percent: 0,
  current: 0,
  total: 0,
  message: '等待上传',
};

function createTaskId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `transcribe-${crypto.randomUUID()}`;
  }
  return `transcribe-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function progressMessage(progress: SSEProgressEvent): string {
  if (progress.phase === 'preparing') return '正在分析音频并切片';
  if (progress.total && progress.current !== undefined) {
    return `正在转录 ${progress.current}/${progress.total}`;
  }
  return '正在转录';
}

export function createTranscribeSlice(set: StoreSet): Pick<
  AppState,
  | 'transcriptionText'
  | 'isTranscribing'
  | 'transcribeProgress'
  | 'transcribeMedia'
  | 'setTranscriptionText'
  | 'clearTranscription'
> {
  return {
    transcriptionText: '',
    isTranscribing: false,
    transcribeProgress: IDLE_PROGRESS,

    transcribeMedia: async (file: File, language: AsrLanguage) => {
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
        const result = response.data as TranscriptionResult;
        set({
          transcriptionText: result.text,
          isTranscribing: false,
          transcribeProgress: {
            phase: 'completed',
            percent: 100,
            current: 0,
            total: 0,
            message: '转录完成',
          },
        });
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
        console.error('转录失败:', error);
        throw error;
      } finally {
        sseClient.close();
      }
    },

    setTranscriptionText: (text) => {
      set({ transcriptionText: text });
    },

    clearTranscription: () => {
      set({ transcriptionText: '', transcribeProgress: IDLE_PROGRESS });
    },
  };
}
