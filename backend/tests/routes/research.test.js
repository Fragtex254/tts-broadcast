const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/db');
const podcastTranscriptStore = require('../../src/services/podcastTranscriptStore');
const researchStore = require('../../src/services/researchStore');

describe('观点研究 API', () => {
  beforeEach(() => db.prepare('DELETE FROM transcription_results').run());

  function createClaim() {
    const record = podcastTranscriptStore.create({
      record: { fileName: 'episode.wav', text: 'Agent 会从单体走向协作。', contentMode: 'podcast', structureStatus: 'ready' },
      transcript: {
        speakers: [{ speakerKey: 'speaker-0001', displayName: '嘉宾甲', sortOrder: 0 }],
        segments: [{ segmentIndex: 0, speakerKey: 'speaker-0001', startSeconds: 12, endSeconds: 18, text: 'Agent 会从单体走向协作。' }],
        turns: [{ turnIndex: 0, speakerKey: 'speaker-0001', startSeconds: 12, endSeconds: 18, text: 'Agent 会从单体走向协作。', evidenceSegmentIndexes: [0] }],
      },
    });
    return researchStore.replaceClaims(record.id, {
      model: 'test-model',
      claims: [{
        speakerKey: 'speaker-0001', question: 'Agent 下一步是什么？', claim: 'Agent 会从单体走向协作', reasoning: '复杂任务需要分工',
        evidenceExcerpt: 'Agent 会从单体走向协作。', evidenceStartIndex: 0, evidenceEndIndex: 0,
        startSeconds: 12, endSeconds: 18, topicTags: ['Agent'], contentValue: 92, confidence: 0.9,
      }],
    })[0];
  }

  test('GET /api/research/claims/:id 返回可深链的观点详情', async () => {
    const claim = createClaim();
    const response = await request(app).get(`/api/research/claims/${claim.id}`);

    expect(response.status).toBe(200);
    expect(response.body.claim).toMatchObject({
      id: claim.id,
      claim: 'Agent 会从单体走向协作',
      speaker_name: '嘉宾甲',
      evidence_start_index: 0,
      evidence_end_index: 0,
    });
  });

  test('GET /api/research/claims/:id 校验 ID 并处理不存在的观点', async () => {
    expect((await request(app).get('/api/research/claims/not-a-number')).status).toBe(400);
    expect((await request(app).get('/api/research/claims/999999')).status).toBe(404);
  });

  test('静态 search 路由不会被动态观点 ID 路由截获', async () => {
    createClaim();
    const response = await request(app).get('/api/research/claims/search').query({ q: 'Agent' });

    expect(response.status).toBe(200);
    expect(response.body.results).toHaveLength(1);
  });
});
