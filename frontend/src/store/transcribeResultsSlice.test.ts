import { beforeEach, describe, expect, test, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  deleteResult: vi.fn(),
  formatResult: vi.fn(),
  summarize: vi.fn(),
  getResults: vi.fn(),
}));

const sseMocks = vi.hoisted(() => ({
  create: vi.fn(),
  handlers: new Map<string, (event: unknown) => void>(),
  close: vi.fn(),
  connect: vi.fn(),
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    transcribeApi: {
      ...actual.transcribeApi,
      deleteResult: apiMocks.deleteResult,
      formatResult: apiMocks.formatResult,
      summarize: apiMocks.summarize,
      getResults: apiMocks.getResults,
    },
  };
});

vi.mock('../services/sseClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/sseClient')>();
  return {
    ...actual,
    createSSEClient: sseMocks.create,
  };
});

import useStore from './index';
import { TRANSCRIPTION_RECORD_FIXTURE } from './transcribeSlice.testFixtures';

describe('transcribeResultsSlice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sseMocks.handlers.clear();
    sseMocks.create.mockReturnValue({
      on: (eventType: string, handler: (event: unknown) => void) => {
        sseMocks.handlers.set(eventType, handler);
      },
      connect: sseMocks.connect,
      close: sseMocks.close,
    });
    useStore.setState({
      transcriptionText: TRANSCRIPTION_RECORD_FIXTURE.text,
      transcriptionRecord: TRANSCRIPTION_RECORD_FIXTURE,
      transcriptionHistory: [TRANSCRIPTION_RECORD_FIXTURE],
      isDeletingTranscriptionResult: false,
      backgroundTasks: [],
      batchTranscriptionItems: [
        {
          fileName: TRANSCRIPTION_RECORD_FIXTURE.file_name,
          relativePath: TRANSCRIPTION_RECORD_FIXTURE.relative_path,
          text: TRANSCRIPTION_RECORD_FIXTURE.text,
          formattedText: TRANSCRIPTION_RECORD_FIXTURE.formatted_text,
          resultId: TRANSCRIPTION_RECORD_FIXTURE.id,
          transcriptionResult: TRANSCRIPTION_RECORD_FIXTURE,
          status: 'completed',
        },
      ],
    });
  });

  test('获取转录历史时同步保存分页信息', async () => {
    apiMocks.getResults.mockResolvedValue({
      data: {
        results: [TRANSCRIPTION_RECORD_FIXTURE],
        pagination: { page: 2, limit: 1, total: 3 },
      },
    });

    await useStore.getState().fetchTranscriptionHistory({ page: 2, limit: 1 });

    expect(apiMocks.getResults).toHaveBeenCalledWith({ page: 2, limit: 1 });
    expect(useStore.getState().transcriptionHistory).toEqual([TRANSCRIPTION_RECORD_FIXTURE]);
    expect(useStore.getState().transcriptionHistoryPagination).toEqual({ page: 2, limit: 1, total: 3 });
  });

  test('删除结果时同步清除单任务与批任务中的持久记录引用', async () => {
    apiMocks.deleteResult.mockResolvedValue({ data: { success: true } });

    await useStore
      .getState()
      .deleteTranscriptionHistoryResult(TRANSCRIPTION_RECORD_FIXTURE.id);

    expect(useStore.getState().transcriptionHistory).toEqual([]);
    expect(useStore.getState().transcriptionRecord).toBeNull();
    expect(useStore.getState().batchTranscriptionItems[0]).toEqual(
      expect.objectContaining({
        text: TRANSCRIPTION_RECORD_FIXTURE.text,
        formattedText: '',
        resultId: undefined,
        transcriptionResult: undefined,
      })
    );
    expect(useStore.getState().isDeletingTranscriptionResult).toBe(false);
  });

  test('排版结果同步覆盖任务、历史和批量任务中的同一记录', async () => {
    const formattedRecord = {
      ...TRANSCRIPTION_RECORD_FIXTURE,
      text: '校正后的逐字稿',
      formatted_text: '校正后的排版稿',
      updated_at: '2026-07-22T01:00:00.000Z',
    };
    apiMocks.formatResult.mockResolvedValue({ data: { result: formattedRecord } });

    await useStore
      .getState()
      .formatTranscriptionResult(TRANSCRIPTION_RECORD_FIXTURE.id, '校正后的逐字稿');

    expect(useStore.getState().transcriptionText).toBe(formattedRecord.text);
    expect(useStore.getState().transcriptionRecord).toEqual(formattedRecord);
    expect(useStore.getState().transcriptionHistory).toEqual([formattedRecord]);
    expect(useStore.getState().batchTranscriptionItems[0]).toEqual(
      expect.objectContaining({
        text: formattedRecord.text,
        formattedText: formattedRecord.formatted_text,
        transcriptionResult: formattedRecord,
      })
    );
  });

  test('后台总结 A 完成时不覆盖用户已打开的逐字稿 B', async () => {
    const detailA = {
      record: TRANSCRIPTION_RECORD_FIXTURE,
      speakers: [],
      segments: [],
      turns: [],
      summary: null,
      summaryItems: [],
      claims: [],
    };
    const recordB = { ...TRANSCRIPTION_RECORD_FIXTURE, id: 43, file_name: 'episode-b.mp3' };
    const detailB = { ...detailA, record: recordB };
    const completedA = {
      ...detailA,
      record: { ...TRANSCRIPTION_RECORD_FIXTURE, summary_status: 'completed' as const },
    };
    apiMocks.summarize.mockResolvedValue({ status: 202, data: { accepted: true } });
    useStore.setState({
      transcriptDetail: detailA,
      transcriptionHistory: [TRANSCRIPTION_RECORD_FIXTURE, recordB],
      isSummarizingTranscript: false,
    });

    await useStore.getState().summarizeTranscript(TRANSCRIPTION_RECORD_FIXTURE.id);
    useStore.setState({
      transcriptDetail: detailB,
      isSummarizingTranscript: false,
      transcriptSummaryProgress: {
        phase: 'idle', percent: 0, current: 0, total: 0, message: '等待总结',
      },
    });

    sseMocks.handlers.get('complete')?.({
      transcriptionId: TRANSCRIPTION_RECORD_FIXTURE.id,
      phase: 'summary-completed',
      percent: 100,
      transcript: completedA,
      timestamp: 1,
    });

    expect(useStore.getState().transcriptDetail).toEqual(detailB);
    expect(useStore.getState().transcriptionHistory[0].summary_status).toBe('completed');
    expect(useStore.getState().backgroundTasks).toEqual([]);
  });

  test('同一逐字稿已有后台总结时不重复提交新任务', async () => {
    useStore.getState().startBackgroundTask({
      taskId: 'summary-existing',
      kind: 'transcript-summary',
      entityId: TRANSCRIPTION_RECORD_FIXTURE.id,
      title: '播客逐字稿总结',
      href: `/history/transcriptions/${TRANSCRIPTION_RECORD_FIXTURE.id}`,
      status: 'connection_lost',
    });

    await expect(
      useStore.getState().summarizeTranscript(TRANSCRIPTION_RECORD_FIXTURE.id)
    ).rejects.toThrow('总结任务仍在后台运行');

    expect(apiMocks.summarize).not.toHaveBeenCalled();
    expect(sseMocks.create).not.toHaveBeenCalled();
  });
});
