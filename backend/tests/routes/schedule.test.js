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
    expect(res.body.schedule).toHaveProperty('id');
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

  test('POST /api/schedules/:id/toggle - 切换任务状态', async () => {
    // 先创建一个任务
    const createRes = await request(app)
      .post('/api/schedules')
      .send({
        name: '测试任务',
        cron_expression: '0 8 * * *',
        content_types: '["ai-models"]'
      });

    const taskId = createRes.body.schedule.id;

    // 切换状态（从启用变为禁用）
    const res = await request(app).post(`/api/schedules/${taskId}/toggle`);
    expect(res.status).toBe(200);
    expect(res.body.schedule.is_active).toBe(0);
  });

  test('POST /api/schedules/:id/toggle - 非法 ID 返回 400', async () => {
    const res = await request(app).post('/api/schedules/0/toggle');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('无效的任务 ID');
  });
});
