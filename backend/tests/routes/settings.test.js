const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/db');
const mimo = require('../../src/services/mimo');
const axios = require('axios');

jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn(),
  create: jest.fn(() => ({
    get: jest.fn(),
    post: jest.fn(),
  })),
}));

describe('设置 API', () => {
  const originalSettings = {};

  beforeEach(() => {
    axios.get.mockReset();
    axios.post.mockReset();
    // 保存原始设置
    const rows = db.prepare('SELECT * FROM settings').all();
    rows.forEach(row => {
      originalSettings[row.key] = row.value;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();

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

  test('PUT /api/settings - 旧 MOSS provider 自动归并为 WSL MOSS 引擎', async () => {
    const res = await request(app)
      .put('/api/settings')
      .send({ asr_provider: 'moss_asr' });

    expect(res.status).toBe(200);
    expect(res.body.settings.asr_provider).toBe('wsl_asr');
    expect(res.body.settings.wsl_asr_engine).toBe('moss');
  });

  test('PUT /api/settings - 非法 WSL ASR 引擎返回 400', async () => {
    const res = await request(app)
      .put('/api/settings')
      .send({ wsl_asr_engine: 'unknown' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('WSL ASR 引擎无效');
  });

  test('POST /api/settings/test-key - 测试 API Key', async () => {
    jest.spyOn(mimo, 'testApiKey').mockResolvedValue(true);

    const res = await request(app)
      .post('/api/settings/test-key')
      .send();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ valid: true });
  });

  test('POST /api/settings/test-key - 使用请求中的 API Key 验证当前输入', async () => {
    const spy = jest.spyOn(mimo, 'testApiKey').mockResolvedValue(true);

    const res = await request(app)
      .post('/api/settings/test-key')
      .send({ type: 'llm', apiKey: 'current-input-key' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ valid: true });
    expect(spy).toHaveBeenCalledWith('anthropic', 'current-input-key', {
      apiFormat: undefined,
      baseUrl: undefined,
      model: undefined,
    });
  });

  test('POST /api/settings/test-key - 透传请求中的 LLM 配置验证当前输入', async () => {
    const spy = jest.spyOn(mimo, 'testApiKey').mockResolvedValue(true);

    const res = await request(app)
      .post('/api/settings/test-key')
      .send({
        type: 'llm',
        apiKey: 'current-input-key',
        apiFormat: 'openai',
        baseUrl: 'https://current.example/v1',
        model: 'current-model',
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ valid: true });
    expect(spy).toHaveBeenCalledWith('anthropic', 'current-input-key', {
      apiFormat: 'openai',
      baseUrl: 'https://current.example/v1',
      model: 'current-model',
    });
  });

  test('POST /api/settings/llm-models - 从默认 /v1/models 获取并排序模型', async () => {
    axios.get.mockResolvedValue({
      data: {
        data: [
          { id: 'z-model', owned_by: 'provider' },
          { id: 'a-model', owned_by: 'provider' },
        ],
      },
    });

    const res = await request(app)
      .post('/api/settings/llm-models')
      .send({ baseUrl: 'https://provider.example', apiKey: 'model-key' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      models: [
        { id: 'a-model', owned_by: 'provider' },
        { id: 'z-model', owned_by: 'provider' },
      ],
      resolvedUrl: 'https://provider.example/v1/models',
    });
    expect(axios.get).toHaveBeenCalledWith(
      'https://provider.example/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer model-key',
          'api-key': 'model-key',
          'User-Agent': 'tts-broadcast',
        }),
        timeout: 15000,
      })
    );
  });

  test('POST /api/settings/llm-models - baseURL 含版本段时尝试 /models', async () => {
    axios.get.mockRejectedValueOnce(new Error('not found'));
    axios.get.mockResolvedValueOnce({
      data: { data: [{ id: 'glm-4.5', owned_by: 'zhipu' }] },
    });

    const res = await request(app)
      .post('/api/settings/llm-models')
      .send({ baseUrl: 'https://provider.example/v4', apiKey: 'model-key' });

    expect(res.status).toBe(200);
    expect(res.body.resolvedUrl).toBe('https://provider.example/v4/models');
    expect(axios.get).toHaveBeenNthCalledWith(2, 'https://provider.example/v4/models', expect.any(Object));
  });

  test('POST /api/settings/llm-models - Anthropic 子路径失败后尝试父路径', async () => {
    axios.get.mockRejectedValueOnce(new Error('child v1 failed'));
    axios.get.mockRejectedValueOnce(new Error('child models failed'));
    axios.get.mockResolvedValueOnce({
      data: { data: [{ id: 'deepseek-chat', owned_by: 'deepseek' }] },
    });

    const res = await request(app)
      .post('/api/settings/llm-models')
      .send({ baseUrl: 'https://provider.example/anthropic', apiKey: 'model-key' });

    expect(res.status).toBe(200);
    expect(res.body.resolvedUrl).toBe('https://provider.example/v1/models');
    expect(axios.get).toHaveBeenNthCalledWith(3, 'https://provider.example/v1/models', expect.any(Object));
  });

  test('POST /api/settings/llm-models - 所有候选失败返回 400', async () => {
    axios.get.mockRejectedValue(new Error('network failed'));

    const res = await request(app)
      .post('/api/settings/llm-models')
      .send({ baseUrl: 'https://provider.example/anthropic', apiKey: 'model-key' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/获取模型列表失败/);
  });
});
