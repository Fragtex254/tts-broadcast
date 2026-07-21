const request = require('supertest');

jest.mock('../../src/services/transcriptionSummaryRunner', () => ({
  reconcile: jest.fn(),
  start: jest.fn().mockReturnValue({ accepted: true })
}));

const app = require('../../src/app');
const db = require('../../src/db');
const podcastTranscriptStore = require('../../src/services/podcastTranscriptStore');
const summaryRunner = require('../../src/services/transcriptionSummaryRunner');
const researchStore = require('../../src/services/researchStore');

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

  test('更新播客元数据并返回结构化数组', async () => {
    const response = await request(app)
      .patch(`/api/transcribe/results/${record.id}/metadata`)
      .send({
        podcastName: '开发者圆桌',
        episodeTitle: 'AI 与程序员岗位',
        guestNames: ['小明', '小红'],
        sourceUrl: 'https://example.com/episode',
        publishedAt: '2026-07-16',
        topicTags: ['AI 编程', '职业'],
      });

    expect(response.status).toBe(200);
    expect(response.body.record).toMatchObject({
      podcast_name: '开发者圆桌',
      episode_title: 'AI 与程序员岗位',
      guest_names: ['小明', '小红'],
      source_url: 'https://example.com/episode',
      published_at: '2026-07-16',
      topic_tags: ['AI 编程', '职业'],
    });
  });

  test('拒绝非法播客元数据数组', async () => {
    const response = await request(app)
      .patch(`/api/transcribe/results/${record.id}/metadata`)
      .send({ guestNames: '不是数组' });

    expect(response.status).toBe(400);
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
    researchStore.replaceClaims(record.id, { model: 'old-model', claims: [{
      speakerKey: 'speaker-0001', question: '测试问题', claim: '测试观点', reasoning: '', evidenceExcerpt: '测试内容',
      evidenceStartIndex: 0, evidenceEndIndex: 0, startSeconds: 0, endSeconds: 2,
      topicTags: [], contentValue: 50, confidence: 0.8,
    }] });

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
    expect(refreshed.record.claims_status).toBe('stale');
    expect(refreshed.claims[0].status).toBe('stale');
  });

  test('收藏和隐藏观点会持久化，但不会删除观点', async () => {
    const claim = researchStore.replaceClaims(record.id, { model: 'test-model', claims: [{
      speakerKey: 'speaker-0001', question: '测试问题', claim: '测试观点', reasoning: '', evidenceExcerpt: '测试内容',
      evidenceStartIndex: 0, evidenceEndIndex: 0, startSeconds: 0, endSeconds: 2,
      topicTags: [], contentValue: 80, confidence: 0.9,
    }] })[0];

    const response = await request(app)
      .patch(`/api/transcribe/claims/${claim.id}`)
      .send({ isStarred: true, isHidden: true });

    expect(response.status).toBe(200);
    expect(response.body.claim).toMatchObject({ id: claim.id, is_starred: true, is_hidden: true });
    const refreshed = podcastTranscriptStore.getDetail(record.id);
    expect(refreshed.claims).toHaveLength(1);
    expect(refreshed.claims[0]).toMatchObject({ is_starred: true, is_hidden: true });
  });

  test('拒绝非法观点隐藏状态', async () => {
    const response = await request(app)
      .patch('/api/transcribe/claims/999')
      .send({ isHidden: 'yes' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('隐藏状态无效');
  });

  test('删除已被内容项目引用的观点时返回 409 并保留观点和关联', async () => {
    const claim = researchStore.replaceClaims(record.id, { model: 'test-model', claims: [{
      speakerKey: 'speaker-0001', question: '测试问题', claim: '不可删除的观点', reasoning: 'AI 整理的理由', evidenceExcerpt: '测试内容',
      evidenceStartIndex: 0, evidenceEndIndex: 0, startSeconds: 0, endSeconds: 2,
      topicTags: [], contentValue: 80, confidence: 0.9,
    }] })[0];
    const project = db.prepare('INSERT INTO content_projects (title) VALUES (?)').run('引用观点的项目');
    db.prepare('INSERT INTO content_project_claims (project_id, claim_id) VALUES (?, ?)')
      .run(project.lastInsertRowid, claim.id);

    const response = await request(app).delete(`/api/transcribe/claims/${claim.id}`);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: '该观点已被内容项目引用，请先从内容项目移除观点后再删除',
    });
    expect(db.prepare('SELECT COUNT(*) AS count FROM transcription_claims WHERE id = ?').get(claim.id).count).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS count FROM content_project_claims WHERE claim_id = ?').get(claim.id).count).toBe(1);
  });
});
