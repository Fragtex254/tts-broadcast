const mockMessagesCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: mockMessagesCreate,
    },
  }));
});

jest.mock('axios', () => ({
  post: jest.fn(),
  get: jest.fn(),
}));

const db = require('../../src/db');
const mimo = require('../../src/services/mimo');
const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');

describe('MiMo 服务', () => {
  beforeEach(() => {
    mockMessagesCreate.mockReset();
    Anthropic.mockClear();
    axios.post.mockReset();
    axios.get.mockReset();
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('mimo_api_key', '"test-key"');
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_api_format', '"anthropic"');
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_base_url', '"https://token-plan-cn.xiaomimimo.com/anthropic"');
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_model', '"mimo-v2.5"');
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_rewrite_system_prompt', '"你是一位专业的播音稿撰写者。"');
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_split_system_prompt', '"你是一个文本切分助手，只输出 JSON 数组格式。"');
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_rewrite_thinking_enabled', 'true');
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_split_thinking_enabled', 'false');
  });

  test('生成口播稿', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: '大家好，欢迎收听今日 AI 简讯。感谢收听，我们明天再见。' }],
    });

    const mockItems = [
      {
        title: 'OpenAI 发布 GPT-5',
        summary: 'OpenAI 今日发布了最新的 GPT-5 模型...',
        source: 'OpenAI Blog',
        url: 'https://example.com'
      }
    ];
    const result = await mimo.rewriteToScript({
      items: mockItems,
      opening: '大家好，欢迎收听今日 AI 简讯。',
      closing: '感谢收听，我们明天再见。'
    });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  test('testApiKey 函数存在', () => {
    expect(typeof mimo.testApiKey).toBe('function');
  });

  test('testApiKey 使用传入的 LLM API Key 验证当前输入', async () => {
    mockMessagesCreate.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });

    await expect(mimo.testApiKey('anthropic', 'current-input-key')).resolves.toBe(true);

    expect(Anthropic).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: 'current-input-key',
      defaultHeaders: { 'api-key': 'current-input-key' },
    }));
    expect(mockMessagesCreate).toHaveBeenCalledWith(expect.objectContaining({
      thinking: { type: 'disabled' },
    }));
  });

  test('testApiKey 使用传入的 LLM 配置验证当前输入', async () => {
    axios.post.mockResolvedValue({
      data: { choices: [{ message: { content: 'ok' } }] },
    });

    await expect(mimo.testApiKey('anthropic', 'current-input-key', {
      apiFormat: 'openai',
      baseUrl: 'https://current.example/v1',
      model: 'current-model',
    })).resolves.toBe(true);

    expect(axios.post).toHaveBeenCalledWith(
      'https://current.example/v1/chat/completions',
      expect.objectContaining({ model: 'current-model' }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer current-input-key',
        }),
      })
    );
  });

  test('Anthropic 格式使用设置中的 baseURL、模型、系统提示词和 thinking 配置', async () => {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_base_url', '"https://custom.example/anthropic"');
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_model', '"custom-model"');
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_rewrite_system_prompt', '"自定义改写 system"');
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_rewrite_thinking_enabled', 'false');
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: '自定义改写结果' }],
    });

    const result = await mimo.rewriteToScript({
      items: [{ title: '标题', summary: '摘要', source: '来源' }],
      opening: '开场白',
      closing: '结束语',
    });

    expect(result).toBe('自定义改写结果');
    expect(Anthropic).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: 'test-key',
      baseURL: 'https://custom.example/anthropic',
      defaultHeaders: { 'api-key': 'test-key' },
    }));
    expect(mockMessagesCreate).toHaveBeenCalledWith(expect.objectContaining({
      model: 'custom-model',
      system: '自定义改写 system',
      thinking: { type: 'disabled' },
    }));
  });

  test('OpenAI 格式使用 chat completions 请求并解析内容', async () => {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_api_format', '"openai"');
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_base_url', '"https://openai.example/v1"');
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_model', '"gpt-compatible"');
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_rewrite_system_prompt', '"OpenAI 改写 system"');
    axios.post.mockResolvedValue({
      data: { choices: [{ message: { content: '改写结果' } }] },
    });

    const result = await mimo.rewriteToScript({
      items: [{ title: '标题', summary: '摘要', source: '来源' }],
      opening: '开场白',
      closing: '结束语',
    });

    expect(result).toBe('改写结果');
    expect(axios.post).toHaveBeenCalledWith(
      'https://openai.example/v1/chat/completions',
      expect.objectContaining({
        model: 'gpt-compatible',
        max_tokens: 2000,
        messages: expect.arrayContaining([
          { role: 'system', content: 'OpenAI 改写 system' },
          expect.objectContaining({ role: 'user' }),
        ]),
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
          'api-key': 'test-key',
          'Content-Type': 'application/json',
        }),
      })
    );
  });

  test('OpenAI 格式返回空内容时抛出中文错误', async () => {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_api_format', '"openai"');
    axios.post.mockResolvedValue({
      data: { choices: [{ message: { content: '' } }] },
    });

    await expect(mimo.rewriteToScript({
      items: [{ title: '标题', summary: '摘要', source: '来源' }],
      opening: '开场白',
      closing: '结束语',
    })).rejects.toThrow('LLM API 返回内容为空');
  });

  test('generateSpeech 函数存在', () => {
    expect(typeof mimo.generateSpeech).toBe('function');
  });

  test('splitScript 存在且为函数', () => {
    expect(typeof mimo.splitScript).toBe('function');
  });

  test('splitScript 切分口播稿', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: '["大家好，欢迎收听今日AI简讯。","今天我们来聊聊几个重要的AI动态。"]' }],
    });

    const script = `大家好，欢迎收听今日AI简讯。今天我们来聊聊几个重要的AI动态。首先是OpenAI发布了最新的GPT-5模型，这款模型在推理能力上有了显著提升。其次是谷歌推出了新的Gemini版本，在多模态理解方面表现出色。以上就是今天的AI简讯，感谢收听，我们明天再见。`;

    const segments = await mimo.splitScript(script);
    expect(Array.isArray(segments)).toBe(true);
    expect(segments.length).toBeGreaterThan(1);
    segments.forEach(seg => {
      expect(typeof seg).toBe('string');
      expect(seg.length).toBeGreaterThan(0);
    });
  });

  describe('rewriteToScript 错误路径', () => {
    test('空 items 抛出错误', async () => {
      await expect(mimo.rewriteToScript({ items: [] }))
        .rejects.toThrow('请提供有效的资讯列表');
    });

    test('非数组 items 抛出错误', async () => {
      await expect(mimo.rewriteToScript({ items: 'not-array' }))
        .rejects.toThrow('请提供有效的资讯列表');
    });
  });

  describe('splitScript 错误路径', () => {
    test('空文本抛出错误', async () => {
      await expect(mimo.splitScript(''))
        .rejects.toThrow('请提供有效的口播稿文本');
    });

    test('非字符串抛出错误', async () => {
      await expect(mimo.splitScript(null))
        .rejects.toThrow('请提供有效的口播稿文本');
    });
  });

  describe('suggestStyleTags', () => {
    test('为每句返回候选标签之一', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: '["平静","严肃","活泼"]' }],
      });
      const tags = await mimo.suggestStyleTags(['第一句', '第二句', '第三句'], ['平静', '严肃', '活泼']);
      expect(tags).toEqual(['平静', '严肃', '活泼']);
    });

    test('非候选标签归为空串', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: '["平静","唱歌"]' }],
      });
      const tags = await mimo.suggestStyleTags(['A', 'B'], ['平静', '严肃']);
      expect(tags).toEqual(['平静', '']);
    });

    test('数量不一致时抛错', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: '["平静"]' }],
      });
      await expect(mimo.suggestStyleTags(['A', 'B'], ['平静'])).rejects.toThrow('数量');
    });

    test('剥离 markdown 代码块', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: '```json\n["平静","严肃"]\n```' }],
      });
      const tags = await mimo.suggestStyleTags(['A', 'B'], ['平静', '严肃']);
      expect(tags).toEqual(['平静', '严肃']);
    });
  });
});
