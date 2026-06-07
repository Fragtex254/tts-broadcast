const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/db');

describe('播报 API', () => {
  test('GET /api/broadcast/today - 获取今日资讯', async () => {
    const res = await request(app).get('/api/broadcast/today');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('items');
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  test('GET /api/broadcast/history - 获取历史记录', async () => {
    const res = await request(app).get('/api/broadcast/history');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('broadcasts');
    expect(Array.isArray(res.body.broadcasts)).toBe(true);
  });

  test('GET /api/broadcast/:id - 获取播报详情（不存在）', async () => {
    const res = await request(app).get('/api/broadcast/999');
    expect(res.status).toBe(404);
  });

  test('POST /api/broadcast/rewrite - 缺少参数返回 400', async () => {
    const res = await request(app)
      .post('/api/broadcast/rewrite')
      .send({});
    expect(res.status).toBe(400);
  });

  test('POST /api/broadcast/generate - 缺少参数返回 400', async () => {
    const res = await request(app)
      .post('/api/broadcast/generate')
      .send({});
    expect(res.status).toBe(400);
  });

  // ============ Segment API Tests ============

  let segmentedBroadcastId;

  test('POST /api/broadcast/generate (segmented) - 创建 segmented 广播', async () => {
    const result = db.prepare(`
      INSERT INTO broadcasts (title, content, voice_type, voice_config, status, mode)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      '测试切分稿件',
      '大家好，欢迎收听今日AI简讯。今天我们聊聊AI最新动态。以上就是今天的内容，感谢收听。',
      'preset',
      '{"voice":"冰糖"}',
      'pending',
      'segmented'
    );
    segmentedBroadcastId = result.lastInsertRowid;
    expect(segmentedBroadcastId).toBeGreaterThan(0);
  });

  test('GET /api/broadcast/:id/segments - 获取空 segments 列表', async () => {
    const res = await request(app).get(`/api/broadcast/${segmentedBroadcastId}/segments`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('segments');
    expect(Array.isArray(res.body.segments)).toBe(true);
  });

  test('POST /api/broadcast/:id/segments/reorder - 重排序 segments', async () => {
    db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status) VALUES (?, ?, ?, ?)`)
      .run(segmentedBroadcastId, 0, '第一句', 'pending');
    db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status) VALUES (?, ?, ?, ?)`)
      .run(segmentedBroadcastId, 1, '第二句', 'pending');

    const segments = db.prepare('SELECT id FROM segments WHERE broadcast_id = ? ORDER BY "index"')
      .all(segmentedBroadcastId);

    const res = await request(app)
      .post(`/api/broadcast/${segmentedBroadcastId}/segments/reorder`)
      .send({ segmentIds: [segments[1].id, segments[0].id] });

    expect(res.status).toBe(200);
    expect(res.body.segments[0].text).toBe('第二句');
    expect(res.body.segments[1].text).toBe('第一句');

    db.prepare('DELETE FROM segments WHERE broadcast_id = ?').run(segmentedBroadcastId);
  });

  test('POST /api/broadcast/:id/segments/merge - 无 segments 返回 400', async () => {
    const res = await request(app)
      .post(`/api/broadcast/${segmentedBroadcastId}/segments/merge`)
      .send();
    expect(res.status).toBe(400);
  });

  test('GET /api/broadcast/:id/segments - 不存在的广播返回 404', async () => {
    const res = await request(app).get('/api/broadcast/99999/segments');
    expect(res.status).toBe(404);
  });
});
