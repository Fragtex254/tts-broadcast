const { buildSpeechRequest } = require('../../src/services/speechRequestBuilder');

describe('语音请求编译器', () => {
  test('design 模式只将音色描述和风格提示编译到 user 消息', () => {
    const request = buildSpeechRequest({
      text: '今晚的风很安静。',
      voiceType: 'design',
      voiceDesign: '低柔冷静的成熟女性声线',
      stylePrompt: '语速偏慢，尾音轻收',
    });

    expect(request.model).toBe('mimo-v2.5-tts-voicedesign');
    expect(request.messages[0].content).toContain('音色设计：低柔冷静的成熟女性声线');
    expect(request.messages[0].content).toContain('风格提示：语速偏慢，尾音轻收');
    expect(request.messages[0].content).not.toContain('表演导演');
    expect(request.messages[1].content).toBe('今晚的风很安静。');
  });

  test('preset 精细参数没有导演配置时保持空 user 消息', () => {
    const request = buildSpeechRequest({
      text: '测试文本',
      voiceType: 'preset',
      voice: '冰糖',
      stylePrompt: '温柔一些',
      speed: { speed_ratio: 0.9 },
    });

    expect(request.messages[0].content).toBe('');
    expect(request.audio.speed).toEqual({ speed_ratio: 0.9 });
  });

  test('忽略旧 performance 配置，避免导演模式混入当前链路', () => {
    const request = buildSpeechRequest({
      text: '测试文本',
      voiceType: 'preset',
      voice: '冰糖',
      speed: { speed_ratio: 0.9 },
      performance: {
        direction: '保持温柔，但每个短句之间留出明显停顿',
      },
    });

    expect(request.messages[0].content).toBe('');
    expect(request.messages[1].content).toBe('测试文本');
    expect(request.audio.speed).toEqual({ speed_ratio: 0.9 });
  });
});
