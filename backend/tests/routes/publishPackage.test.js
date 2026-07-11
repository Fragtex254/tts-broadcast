jest.mock('../../src/services/mimo', () => ({
  generatePublishMetadata: jest.fn(),
}));

const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/db');
const mimo = require('../../src/services/mimo');

describe('发布内容包 API', () => {
  let broadcastId;

  beforeEach(() => {
    jest.clearAllMocks();
    db.prepare('DELETE FROM broadcasts').run();
    const result = db.prepare(`
      INSERT INTO broadcasts (
        title, content, status, mode, template_snapshot, publish_metadata
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      '测试标题',
      '这是一篇用于测试发布内容包的口播稿。',
      'pending',
      'whole',
      JSON.stringify({ name: '通用自由创作', platform: '通用' }),
      '{}'
    );
    broadcastId = result.lastInsertRowid;
  });

  test('POST /api/broadcast/:id/publish-metadata/generate - 生成并持久化发布信息', async () => {
    const metadata = {
      primaryTitle: '推荐标题',
      alternativeTitles: ['标题一', '标题二', '标题三', '标题四'],
      summary: '内容简介',
      publishCopy: '发布文案',
      tags: ['AI', '创作'],
    };
    mimo.generatePublishMetadata.mockResolvedValue(metadata);
    const res = await request(app).post(`/api/broadcast/${broadcastId}/publish-metadata/generate`);
    expect(res.status).toBe(200);
    expect(res.body.metadata).toEqual(metadata);
    expect(JSON.parse(db.prepare('SELECT publish_metadata FROM broadcasts WHERE id = ?').get(broadcastId).publish_metadata))
      .toEqual(metadata);
  });

  test('PUT /api/broadcast/:id/publish-metadata - 保存用户编辑', async () => {
    const res = await request(app).put(`/api/broadcast/${broadcastId}/publish-metadata`).send({
      primaryTitle: '手工标题', alternativeTitles: [], summary: '', publishCopy: '', tags: ['#口播'],
    });
    expect(res.status).toBe(200);
    expect(res.body.metadata.tags).toEqual(['口播']);
  });

  test('GET /api/broadcast/:id/publish-package - 整篇模式返回无字幕的文本资产', async () => {
    const res = await request(app).get(`/api/broadcast/${broadcastId}/publish-package`);
    expect(res.status).toBe(200);
    expect(res.body.publishPackage.subtitleStatus).toBe('whole-mode');
    expect(res.body.publishPackage.srt).toBeNull();
    expect(res.body.publishPackage.scriptMarkdown).toContain('测试标题');
  });
});
