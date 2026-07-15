const request = require('supertest');

jest.mock('../../src/services/transcriptionSummaryRunner', () => ({
  reconcile: jest.fn(),
  start: jest.fn().mockReturnValue({ accepted: true })
}));

const app = require('../../src/app');
const db = require('../../src/db');
const podcastTranscriptStore = require('../../src/services/podcastTranscriptStore');
const summaryRunner = require('../../src/services/transcriptionSummaryRunner');

describe('Transcript 内容详情 API', () => {
  let record;

  beforeEach(() => {
    jest.clearAllMocks();
    db.prepare('DELETE FROM transcription_results').run();
    record = podcastTranscriptStore.create({
      record: {
        fileName: 'podcast.wav',
        text: '测试内容',
        contentMode: 'podcast',
        structureStatus: 'ready'
      },
      transcript: {
        speakers: [{ speakerKey: 'speaker-0001', displayName: '说话人 1', sortOrder: 0, speakerScope: 'mixed' }],
        segments: [{ segmentIndex: 0, speakerKey: 'speaker-0001', sourceSpeaker: 'S01', speakerScope: 'mixed', speakerResolution: 'resolved', chunkIndex: 0, startSeconds: 0, endSeconds: 2, text: '测试内容' }],
        turns: [{ turnIndex: 0, speakerKey: 'speaker-0001', startSeconds: 0, endSeconds: 2, text: '测试内容', evidenceSegmentIndexes: [0] }]
      }
    });
  });

  test('重命名 Speaker 后详情中的统一名称映射更新', async () => {
    const detail = podcastTranscriptStore.getDetail(record.id);
    const speakerId = detail.speakers[0].id;

    const renamed = await request(app)
      .patch(`/api/transcribe/results/${record.id}/speakers/${speakerId}`)
      .send({ displayName: '主持人' });

    expect(renamed.status).toBe(200);
    expect(renamed.body.speaker).toMatchObject({ speaker_key: 'speaker-0001', display_name: '主持人' });
    const refreshed = await request(app).get(`/api/transcribe/results/${record.id}`);
    expect(refreshed.body.transcript.speakers[0].display_name).toBe('主持人');
    expect(refreshed.body.transcript.segments[0].speaker_key).toBe('speaker-0001');
  });

  test('开始总结返回 202 并把任务交给幂等运行器', async () => {
    const response = await request(app)
      .post(`/api/transcribe/results/${record.id}/summarize`)
      .send({ taskId: 'summary-task-123' });

    expect(response.status).toBe(202);
    expect(summaryRunner.start).toHaveBeenCalledWith({
      transcriptionId: record.id,
      taskId: 'summary-task-123'
    });
  });

  test('拒绝超长任务 ID，避免创建不可控的 SSE 键', async () => {
    const response = await request(app)
      .post(`/api/transcribe/results/${record.id}/summarize`)
      .send({ taskId: 'x'.repeat(129) });

    expect(response.status).toBe(400);
    expect(summaryRunner.start).not.toHaveBeenCalled();
  });

  test('校对 Turn 不覆盖原始 Segment 事实', async () => {
    const detail = podcastTranscriptStore.getDetail(record.id);
    const turnId = detail.turns[0].id;
    podcastTranscriptStore.updateSummaryStatus(record.id, { status: 'completed', model: 'old-model' });

    const response = await request(app)
      .patch(`/api/transcribe/results/${record.id}/turns/${turnId}`)
      .send({ correctedText: '校对后的内容' });

    expect(response.status).toBe(200);
    expect(response.body.turn.corrected_text).toBe('校对后的内容');
    expect(response.body.record.summary_status).toBe('stale');
    const refreshed = podcastTranscriptStore.getDetail(record.id);
    expect(refreshed.turns[0].corrected_text).toBe('校对后的内容');
    expect(refreshed.segments[0].text).toBe('测试内容');
    expect(refreshed.record.summary_status).toBe('stale');
  });
});
