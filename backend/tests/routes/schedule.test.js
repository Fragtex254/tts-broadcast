const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/db');
const scheduler = require('../../src/services/scheduler');

describe('定时任务 API', () => {
  afterEach(() => {
    scheduler.shutdown();
    db.prepare('DELETE FROM schedules').run();
  });

  test('POST /api/schedules - 创建任务', async () => {
    const res = await request(app)
      .post('/api/schedules')
      .send({
        name: '测试任务',
        cron_expression: '0 8 * * *',
        content_types: '["ai-models"]'
      });
    expect(res.status).toBe(201);
    expect(res.body.schedule).toMatchObject({ is_active: 0, runtime_state: 'unavailable' });
    expect(res.body.execution).toEqual({
      available: false,
      state: 'unavailable',
      reason: '自动化执行器尚未配置',
    });
  });

  test('GET /api/schedules - 获取任务列表', async () => {
    await request(app)
      .post('/api/schedules')
      .send({
        name: '任务1',
        cron_expression: '0 8 * * *',
        content_types: '["ai-models"]'
      });

    const res = await request(app).get('/api/schedules');
    expect(res.status).toBe(200);
    expect(res.body.schedules.length).toBe(1);
    expect(res.body.schedules[0]).toMatchObject({ is_active: 0, runtime_state: 'unavailable' });
    expect(res.body.execution).toMatchObject({ available: false, state: 'unavailable' });
  });

  test('PUT /api/schedules/:id - 更新任务', async () => {
    // 先创建一个任务
    const createRes = await request(app)
      .post('/api/schedules')
      .send({
        name: '原始任务',
        cron_expression: '0 8 * * *',
        content_types: '["ai-models"]'
      });

    const taskId = createRes.body.schedule.id;

    // 更新任务
    const res = await request(app)
      .put(`/api/schedules/${taskId}`)
      .send({
        name: '更新后的任务',
        cron_expression: '0 9 * * *'
      });
    expect(res.status).toBe(200);
    expect(res.body.schedule.name).toBe('更新后的任务');
  });

  test('PUT /api/schedules/:id - 非法 ID 返回 400', async () => {
    const res = await request(app)
      .put('/api/schedules/abc')
      .send({
        name: '更新后的任务',
        cron_expression: '0 9 * * *'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('无效的任务 ID');
  });

  test('DELETE /api/schedules/:id - 删除任务', async () => {
    // 先创建一个任务
    const createRes = await request(app)
      .post('/api/schedules')
      .send({
        name: '待删除任务',
        cron_expression: '0 8 * * *',
        content_types: '["ai-models"]'
      });

    const taskId = createRes.body.schedule.id;

    // 删除任务
    const res = await request(app).delete(`/api/schedules/${taskId}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('任务已删除');

    // 验证任务已被删除
    const getRes = await request(app).get('/api/schedules');
    expect(getRes.body.schedules.length).toBe(0);
  });

  test('DELETE /api/schedules/:id - 非法 ID 返回 400', async () => {
    const res = await request(app).delete('/api/schedules/not-a-number');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('无效的任务 ID');
  });

  test('POST /api/schedules/:id/toggle - 无执行器时拒绝启用任务', async () => {
    // 先创建一个任务
    const createRes = await request(app)
      .post('/api/schedules')
      .send({
        name: '测试任务',
        cron_expression: '0 8 * * *',
        content_types: '["ai-models"]'
      });

    const taskId = createRes.body.schedule.id;

    // 新建配置默认停用，且在未接执行器时不能伪装启用成功
    const res = await request(app).post(`/api/schedules/${taskId}/toggle`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('自动化执行器尚未配置，当前不能启用任务');
    expect(db.prepare('SELECT is_active FROM schedules WHERE id = ?').get(taskId).is_active).toBe(0);
  });

  test('GET /api/schedules - 旧 active 配置保留但运行态明确不可用', async () => {
    db.prepare(`
      INSERT INTO schedules (name, cron_expression, content_types, is_active)
      VALUES (?, ?, ?, 1)
    `).run('历史启用配置', '0 8 * * *', '[]');

    const res = await request(app).get('/api/schedules');

    expect(res.status).toBe(200);
    expect(res.body.schedules[0]).toMatchObject({ is_active: 1, runtime_state: 'unavailable' });
    expect(res.body.execution).toMatchObject({ available: false, state: 'unavailable' });
  });

  test('POST /api/schedules/:id/toggle - 无执行器时仍允许停用旧 active 配置', async () => {
    const stored = db.prepare(`
      INSERT INTO schedules (name, cron_expression, content_types, is_active)
      VALUES (?, ?, ?, 1)
    `).run('需要停用的历史配置', '0 8 * * *', '[]');

    const res = await request(app).post(`/api/schedules/${stored.lastInsertRowid}/toggle`);

    expect(res.status).toBe(200);
    expect(res.body.schedule).toMatchObject({ is_active: 0, runtime_state: 'unavailable' });
    expect(db.prepare('SELECT is_active FROM schedules WHERE id = ?').get(stored.lastInsertRowid).is_active).toBe(0);
  });

  test('POST /api/schedules/:id/toggle - 非法 ID 返回 400', async () => {
    const res = await request(app).post('/api/schedules/0/toggle');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('无效的任务 ID');
  });
});
