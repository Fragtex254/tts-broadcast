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
});
