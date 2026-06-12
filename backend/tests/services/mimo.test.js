const mockMessagesCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: mockMessagesCreate,
    },
  }));
});

const db = require('../../src/db');
const mimo = require('../../src/services/mimo');
const Anthropic = require('@anthropic-ai/sdk');

describe('MiMo 服务', () => {
  beforeEach(() => {
    mockMessagesCreate.mockReset();
    Anthropic.mockClear();
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('mimo_api_key', '"test-key"');
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
});
