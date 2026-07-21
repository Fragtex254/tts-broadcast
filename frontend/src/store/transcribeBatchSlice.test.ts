import { beforeEach, describe, expect, test, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  batchTranscribe: vi.fn(),
  getStats: vi.fn(),
}));

const sseMocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown) => void>(),
  connect: vi.fn(),
  close: vi.fn(),
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    transcribeApi: {
      ...actual.transcribeApi,
      batchTranscribe: apiMocks.batchTranscribe,
      getStats: apiMocks.getStats,
    },
  };
});

vi.mock('../services/sseClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/sseClient')>();
  return {
    ...actual,
    createSSEClient: vi.fn(() => ({
      on: (event: string, handler: (payload: unknown) => void) =>
        sseMocks.handlers.set(event, handler),
      connect: sseMocks.connect,
      close: sseMocks.close,
    })),
  };
});

import useStore from './index';
import {
  TRANSCRIPTION_RECORD_FIXTURE,
  TRANSCRIPTION_STATS_FIXTURE,
} from './transcribeSlice.testFixtures';

describe('transcribeBatchSlice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sseMocks.handlers.clear();
    useStore.setState({
      batchTranscriptionItems: [],
      isBatchTranscribing: false,
      backgroundTasks: [],
      transcriptionHistory: [],
      transcriptionStats: {
        total_count: 0,
        total_file_size_bytes: 0,
        total_audio_duration_seconds: 0,
        total_text_chars: 0,
        total_processing_seconds: 0,
      },
      batchTranscribeProgress: {
        phase: 'idle',
        percent: 0,
        currentIndex: 0,
        total: 0,
        currentFileName: '',
        message: '等待上传',
      },
    });
    apiMocks.batchTranscribe.mockResolvedValue({ status: 202 });
    apiMocks.getStats.mockResolvedValue({ data: { stats: TRANSCRIPTION_STATS_FIXTURE } });
  });

  test('批量完成事件收敛任务项并把成功记录并入历史', async () => {
    const file = new File(['audio'], 'episode.mp3', { type: 'audio/mpeg' });
    Object.defineProperty(file, 'webkitRelativePath', { value: 'folder/episode.mp3' });

    const initialItems = await useStore
      .getState()
      .batchTranscribeMedia([file], 'auto', 'wsl_asr', { asrEngine: 'moss' });

    expect(initialItems).toEqual([
      expect.objectContaining({
        fileName: 'episode.mp3',
        relativePath: 'folder/episode.mp3',
        status: 'pending',
      }),
    ]);
    expect(useStore.getState().isBatchTranscribing).toBe(true);
    expect(useStore.getState().backgroundTasks).toEqual([
      expect.objectContaining({
        kind: 'batch-transcribe',
        href: '/transcribe',
        status: 'connecting',
      }),
    ]);

    sseMocks.handlers.get('progress')?.({
      phase: 'file-start',
      index: 0,
      fileName: 'episode.mp3',
      total: 1,
      percent: 10,
    });
    expect(useStore.getState().backgroundTasks[0]).toMatchObject({
      status: 'running',
      percent: 10,
    });

    sseMocks.handlers.get('complete')?.({
      phase: 'completed',
      percent: 100,
      total: 1,
      succeeded: 1,
      failed: 0,
      timestamp: Date.now(),
      results: [
        {
          fileName: 'episode.mp3',
          relativePath: 'folder/episode.mp3',
          text: TRANSCRIPTION_RECORD_FIXTURE.text,
          resultId: TRANSCRIPTION_RECORD_FIXTURE.id,
          transcriptionResult: TRANSCRIPTION_RECORD_FIXTURE,
        },
      ],
    });

    expect(useStore.getState()).toMatchObject({
      isBatchTranscribing: false,
      transcriptionHistory: [TRANSCRIPTION_RECORD_FIXTURE],
      batchTranscribeProgress: { phase: 'completed', percent: 100 },
      batchTranscriptionItems: [
        {
          status: 'completed',
          resultId: TRANSCRIPTION_RECORD_FIXTURE.id,
          transcriptionResult: TRANSCRIPTION_RECORD_FIXTURE,
        },
      ],
      backgroundTasks: [],
    });
    await vi.waitFor(() => {
      expect(useStore.getState().transcriptionStats).toEqual(TRANSCRIPTION_STATS_FIXTURE);
    });
    expect(sseMocks.close).toHaveBeenCalledOnce();
  });
});
