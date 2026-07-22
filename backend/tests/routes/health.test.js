const request = require('supertest');
const app = require('../../src/app');

describe('GET /api/health', () => {
  test('返回运行状态、DB、队列与 SSE 连接概览', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptime).toBe('number');
    expect(res.body.db).toBe('ok');
    expect(res.body.queues.tts).toMatchObject({
      queued: expect.any(Number),
      active: expect.any(Number),
      rpmLimit: expect.any(Number),
    });
    expect(res.body.queues.llm).toMatchObject({
      queued: expect.any(Number),
      active: expect.any(Number),
      rpmLimit: expect.any(Number),
    });
    expect(typeof res.body.sseConnections).toBe('number');
  });

  test('响应不包含任何敏感信息', async () => {
    const res = await request(app).get('/api/health');
    const payload = JSON.stringify(res.body);

    expect(res.status).toBe(200);
    expect(payload).not.toMatch(/api[_-]?key/i);
    expect(payload).not.toMatch(/secret|token|password/i);
    expect(payload).not.toContain('broadcast.db');
  });
});
