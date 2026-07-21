import { beforeEach, describe, expect, test, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  deleteResult: vi.fn(),
  formatResult: vi.fn(),
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    transcribeApi: {
      ...actual.transcribeApi,
      deleteResult: apiMocks.deleteResult,
      formatResult: apiMocks.formatResult,
    },
  };
});

import useStore from './index';
import { TRANSCRIPTION_RECORD_FIXTURE } from './transcribeSlice.testFixtures';

describe('transcribeResultsSlice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({
      transcriptionText: TRANSCRIPTION_RECORD_FIXTURE.text,
      transcriptionRecord: TRANSCRIPTION_RECORD_FIXTURE,
      transcriptionHistory: [TRANSCRIPTION_RECORD_FIXTURE],
      isDeletingTranscriptionResult: false,
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
});
