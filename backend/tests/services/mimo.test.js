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
});
