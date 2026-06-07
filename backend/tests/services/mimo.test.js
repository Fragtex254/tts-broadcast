const mimo = require('../../src/services/mimo');

describe('MiMo 服务', () => {
  test('生成口播稿', async () => {
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

  test('generateSpeech 函数存在', () => {
    expect(typeof mimo.generateSpeech).toBe('function');
  });

  test('splitScript 存在且为函数', () => {
    expect(typeof mimo.splitScript).toBe('function');
  });

  test('splitScript 切分口播稿', async () => {
    const script = `大家好，欢迎收听今日AI简讯。今天我们来聊聊几个重要的AI动态。首先是OpenAI发布了最新的GPT-5模型，这款模型在推理能力上有了显著提升。其次是谷歌推出了新的Gemini版本，在多模态理解方面表现出色。以上就是今天的AI简讯，感谢收听，我们明天再见。`;

    const segments = await mimo.splitScript(script);
    expect(Array.isArray(segments)).toBe(true);
    expect(segments.length).toBeGreaterThan(1);
    segments.forEach(seg => {
      expect(typeof seg).toBe('string');
      expect(seg.length).toBeGreaterThan(0);
    });
  });
});
