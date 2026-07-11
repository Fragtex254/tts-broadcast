const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/db');

describe('创作模板 API', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM content_templates WHERE is_builtin = 0').run();
  });

  test('GET /api/content-templates - 返回五个内置模板', async () => {
    const res = await request(app).get('/api/content-templates');
    expect(res.status).toBe(200);
    expect(res.body.templates.filter((item) => item.is_builtin === 1)).toHaveLength(5);
  });

  test('POST /api/content-templates - 创建自定义模板', async () => {
    const res = await request(app).post('/api/content-templates').send({
      name: '我的栏目',
      platform: '小红书',
      content_type: '知识口播',
      target_duration_seconds: 90,
      audience: '职场新人',
      tone: '轻松直接',
      structure: '问题、方法、总结',
      prompt_instructions: '避免术语',
      default_voice_config: '{}',
    });
    expect(res.status).toBe(201);
    expect(res.body.template).toMatchObject({ name: '我的栏目', is_builtin: 0 });
  });

  test('POST /api/content-templates - 拒绝非法目标时长', async () => {
    const res = await request(app).post('/api/content-templates').send({
      name: '非法模板', platform: '通用', content_type: '口播', target_duration_seconds: 3,
      audience: '用户', tone: '自然', structure: '开头、正文、结尾',
    });
    expect(res.status).toBe(400);
  });

  test('PUT /api/content-templates/:id - 内置模板不能修改', async () => {
    const builtin = db.prepare('SELECT id FROM content_templates WHERE is_builtin = 1 LIMIT 1').get();
    const res = await request(app).put(`/api/content-templates/${builtin.id}`).send({
      name: '修改', platform: '通用', content_type: '口播', target_duration_seconds: 60,
      audience: '用户', tone: '自然', structure: '开头、正文、结尾',
    });
    expect(res.status).toBe(400);
  });
});
