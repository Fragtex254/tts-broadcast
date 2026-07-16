const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/db');
const podcastTranscriptStore = require('../../src/services/podcastTranscriptStore');
const researchStore = require('../../src/services/researchStore');

describe('内容项目 API', () => {
  beforeEach(() => db.prepare('DELETE FROM transcription_results').run());

  test('把观点加入项目并导出带完整来源的 Markdown', async () => {
    const record = podcastTranscriptStore.create({
      record: { fileName: 'episode.wav', text: '真实证据', contentMode: 'podcast', structureStatus: 'ready' },
      transcript: { speakers: [{ speakerKey: 'speaker-0001', displayName: '嘉宾甲', sortOrder: 0 }], segments: [{ segmentIndex: 0, speakerKey: 'speaker-0001', startSeconds: 65, endSeconds: 70, text: '真实证据' }], turns: [{ turnIndex: 0, speakerKey: 'speaker-0001', startSeconds: 65, endSeconds: 70, text: '真实证据', evidenceSegmentIndexes: [0] }] },
    });
    require('../../src/services/transcriptionResultStore').updateMetadata(record.id, { podcastName: '研究播客', episodeTitle: 'AI 单集', guestNames: ['嘉宾甲'], sourceUrl: 'https://example.com/ai', publishedAt: '2026-07-16', topicTags: ['AI'] });
    const claim = researchStore.replaceClaims(record.id, { model: 'test', claims: [{ speakerKey: 'speaker-0001', question: '问题', claim: '明确观点', reasoning: '理由', evidenceExcerpt: '真实证据', evidenceStartIndex: 0, evidenceEndIndex: 0, startSeconds: 65, endSeconds: 70, topicTags: ['AI'], contentValue: 90, confidence: 0.9 }] })[0];

    const created = await request(app).post('/api/content-projects').send({ title: 'AI 争议', targetPlatform: 'wechat' });
    const added = await request(app).post(`/api/content-projects/${created.body.project.id}/claims`).send({ claimId: claim.id, usageNote: '作为核心论据' });
    const exported = await request(app).post(`/api/content-projects/${created.body.project.id}/export`).send({ platform: 'wechat' });

    expect(added.status).toBe(201);
    expect(exported.status).toBe(200);
    expect(exported.body.markdown).toContain('研究播客｜AI 单集｜嘉宾甲｜1:05–1:10｜https://example.com/ai');
    expect(exported.body.markdown).toContain('我的阶段性判断');

    researchStore.replaceClaims(record.id, { model: 'new-model', claims: [{ speakerKey: 'speaker-0001', question: '新问题', claim: '新观点', reasoning: '新理由', evidenceExcerpt: '真实证据', evidenceStartIndex: 0, evidenceEndIndex: 0, startSeconds: 65, endSeconds: 70, topicTags: ['AI'], contentValue: 91, confidence: 0.95 }] });
    const projectAfterReanalysis = await request(app).get(`/api/content-projects/${created.body.project.id}`);
    expect(projectAfterReanalysis.body.project.claims[0].claim).toMatchObject({ id: claim.id, status: 'stale', claim: '明确观点' });
  });
});
