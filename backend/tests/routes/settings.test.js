const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/db');

describe('设置 API', () => {
  const originalSettings = {};

  beforeEach(() => {
    // 保存原始设置
    const rows = db.prepare('SELECT * FROM settings').all();
    rows.forEach(row => {
      originalSettings[row.key] = row.value;
    });
  });

  afterEach(() => {
    // 恢复原始设置
    const upsert = db.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
    `);
    for (const [key, value] of Object.entries(originalSettings)) {
      upsert.run(key, value, value);
    }
  });

  test('GET /api/settings - 获取设置', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('settings');
  });

  test('PUT /api/settings - 空 body 应返回 400', async () => {
    const res = await request(app)
      .put('/api/settings')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('请提供有效的设置对象');
  });

  test('PUT /api/settings - 数组应返回 400', async () => {
    const res = await request(app)
      .put('/api/settings')
      .send(['invalid']);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('请提供有效的设置对象');
  });

  test('PUT /api/settings - 更新设置', async () => {
    const res = await request(app)
      .put('/api/settings')
      .send({
        default_voice: '茉莉'
      });
    expect(res.status).toBe(200);
    expect(res.body.settings.default_voice).toBe('茉莉');
  });

  test('POST /api/settings/test-key - 测试 API Key', async () => {
    const res = await request(app)
      .post('/api/settings/test-key')
      .send();
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('valid');
    expect(typeof res.body.valid).toBe('boolean');
  });
});
