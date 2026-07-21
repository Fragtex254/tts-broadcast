import { beforeEach, describe, expect, test, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  getStats: vi.fn(),
  transcribe: vi.fn(),
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
      getStats: apiMocks.getStats,
      transcribe: apiMocks.transcribe,
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

describe('transcribeTaskSlice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sseMocks.handlers.clear();
    useStore.setState({
      transcriptionText: '',
      transcriptionChunks: [],
      transcriptionRecord: null,
      transcriptionHistory: [],
      transcriptionStats: {
        total_count: 0,
        total_file_size_bytes: 0,
        total_audio_duration_seconds: 0,
        total_text_chars: 0,
        total_processing_seconds: 0,
      },
      isTranscribing: false,
      transcribeProgress: {
        phase: 'idle',
        percent: 0,
        current: 0,
        total: 0,
        message: '等待上传',
      },
    });
    apiMocks.getStats.mockResolvedValue({ data: { stats: TRANSCRIPTION_STATS_FIXTURE } });
  });

  test('单文件转录完成后更新任务结果并同步历史记录', async () => {
    apiMocks.transcribe.mockResolvedValue({
      data: {
        text: TRANSCRIPTION_RECORD_FIXTURE.text,
        transcriptionResult: TRANSCRIPTION_RECORD_FIXTURE,
      },
    });

    const result = await useStore.getState().transcribeMedia(
      new File(['audio'], 'episode.mp3', { type: 'audio/mpeg' }),
      'zh',
      'mimo',
      { context: '访谈上下文', contentMode: 'standard' }
    );

    expect(result.transcriptionResult).toEqual(TRANSCRIPTION_RECORD_FIXTURE);
    expect(useStore.getState()).toMatchObject({
      transcriptionText: TRANSCRIPTION_RECORD_FIXTURE.text,
      transcriptionRecord: TRANSCRIPTION_RECORD_FIXTURE,
      transcriptionHistory: [TRANSCRIPTION_RECORD_FIXTURE],
      isTranscribing: false,
      transcribeProgress: { phase: 'completed', percent: 100 },
    });
    const formData = apiMocks.transcribe.mock.calls[0]?.[0] as FormData;
    expect(formData.get('context')).toBe('访谈上下文');
    expect(formData.get('contentMode')).toBe('standard');
    expect(sseMocks.connect).toHaveBeenCalledOnce();
    expect(sseMocks.close).toHaveBeenCalledOnce();
    await vi.waitFor(() => {
      expect(useStore.getState().transcriptionStats).toEqual(TRANSCRIPTION_STATS_FIXTURE);
    });
  });
});
