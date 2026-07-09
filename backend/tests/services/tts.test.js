jest.mock('axios');
const axios = require('axios');

jest.mock('../../src/services/mimo', () => ({
  getApiKey: jest.fn().mockReturnValue('fake-tts-key')
}));

const tts = require('../../src/services/tts');
const mimo = require('../../src/services/mimo');

describe('TTS 服务', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateSpeech', () => {
    const fakeAudioBase64 = Buffer.from('fake-wav-data').toString('base64');

    function mockTtsResponse() {
      axios.post.mockResolvedValue({
        data: {
          choices: [{ message: { audio: { data: fakeAudioBase64 } } }]
        }
      });
    }

    test('preset 模式成功生成音频 Buffer', async () => {
      mockTtsResponse();
      const result = await tts.generateSpeech({
        text: '测试文本',
        voice: '冰糖',
        voiceType: 'preset'
      });
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.toString()).toBe('fake-wav-data');
      expect(axios.post).toHaveBeenCalledWith(
        'https://api.xiaomimimo.com/v1/chat/completions',
        expect.objectContaining({ model: 'mimo-v2.5-tts' }),
        expect.any(Object)
      );
    });

    test('design 模式使用 voicedesign 模型', async () => {
      mockTtsResponse();
      await tts.generateSpeech({
        text: '测试文本',
        voiceType: 'design',
        voiceDesign: '温柔女声'
      });
      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ model: 'mimo-v2.5-tts-voicedesign' }),
        expect.any(Object)
      );
    });

    test('design 模式将合成文本放入 assistant 消息', async () => {
      mockTtsResponse();
      await tts.generateSpeech({
        text: '这段试听文本必须进入请求',
        voiceType: 'design',
        voiceDesign: '温柔女声'
      });

      const body = axios.post.mock.calls[0][1];
      expect(body.messages).toEqual([
        { role: 'user', content: '音色设计：温柔女声' },
        { role: 'assistant', content: '这段试听文本必须进入请求' }
      ]);
      expect(body.audio).toEqual({ format: 'wav' });
    });

    test('design 模式显式开启时才优化试听文本', async () => {
      mockTtsResponse();
      await tts.generateSpeech({
        text: '短试听',
        voiceType: 'design',
        voiceDesign: '温柔女声',
        optimizeTextPreview: true
      });

      const body = axios.post.mock.calls[0][1];
      expect(body.audio).toEqual({ format: 'wav', optimize_text_preview: true });
    });

    test('design 模式将风格提示合并进 user context', async () => {
      mockTtsResponse();
      await tts.generateSpeech({
        text: '试听文本',
        voiceType: 'design',
        voiceDesign: '低柔磁性的成熟女性声线',
        stylePrompt: '语速更慢，尾音轻轻下落'
      });

      const body = axios.post.mock.calls[0][1];
      expect(body.messages[0].content).toContain('低柔磁性的成熟女性声线');
      expect(body.messages[0].content).toContain('风格提示：语速更慢，尾音轻轻下落');
      expect(body.messages[1].content).toBe('试听文本');
    });

    test('design 模式忽略旧表演导演配置', async () => {
      mockTtsResponse();
      await tts.generateSpeech({
        text: '今晚的风很安静。',
        voiceType: 'design',
        voiceDesign: '低柔冷静的成熟女性声线',
        performance: {
          role: '疏离的女性角色',
          scene: '深夜独白',
          direction: '语速偏慢，尾音轻收',
          globalTags: ['冷静', '气声']
        }
      });

      const body = axios.post.mock.calls[0][1];
      expect(body.messages[0].content).toBe('音色设计：低柔冷静的成熟女性声线');
      expect(body.messages[1].content).toBe('今晚的风很安静。');
    });

    test('clone 模式使用 voiceclone 模型', async () => {
      mockTtsResponse();
      await tts.generateSpeech({
        text: '测试文本',
        voiceType: 'clone',
        voiceClone: 'data:audio/wav;base64,AAAA'
      });
      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ model: 'mimo-v2.5-tts-voiceclone' }),
        expect.any(Object)
      );
    });

    test('429 错误抛出友好消息并携带退避时间', async () => {
      axios.post.mockRejectedValue({ response: { status: 429, headers: { 'retry-after': '8' } } });
      await expect(tts.generateSpeech({ text: '测试' })).rejects.toMatchObject({
        message: 'MiMo API 请求过于频繁，请稍后再试',
        code: 'MIMO_RATE_LIMIT',
        retryAfterMs: 8000,
      });
      expect(axios.post).toHaveBeenCalledTimes(1);
    });

    test('429 不在 TTS 服务内快速重试，避免绕过全局队列', async () => {
      axios.post.mockRejectedValue({ response: { status: 429 } });

      await expect(tts.generateSpeech({ text: '测试' })).rejects.toMatchObject({
        message: 'MiMo API 请求过于频繁，请稍后再试',
        retryAfterMs: 15000,
      });
      expect(axios.post).toHaveBeenCalledTimes(1);
    });

    test('超时错误抛出超时提示', async () => {
      axios.post.mockRejectedValue({ code: 'ECONNABORTED', message: 'timeout' });
      await expect(tts.generateSpeech({ text: '测试' }))
        .rejects.toThrow('MiMo TTS API 请求超时');
    });

    test('网络错误抛出网络提示', async () => {
      axios.post.mockRejectedValue({ message: 'getaddrinfo ENOTFOUND', code: 'ENOTFOUND' });
      await expect(tts.generateSpeech({ text: '测试' }))
        .rejects.toThrow('MiMo TTS API 网络错误');
    });

    test('API 返回无音频数据时抛出错误', async () => {
      axios.post.mockResolvedValue({
        data: { choices: [{ message: {} }] }
      });
      await expect(tts.generateSpeech({ text: '测试' }))
        .rejects.toThrow('MiMo TTS API 未返回音频数据');
    });

    test('其他 API 错误抛出包含状态信息的错误', async () => {
      axios.post.mockRejectedValue({
        response: {
          status: 500,
          data: { error: { message: '内部错误' } }
        }
      });
      await expect(tts.generateSpeech({ text: '测试' }))
        .rejects.toThrow('MiMo TTS API 调用失败');
    });

    test('使用 tts 类型的 API Key', async () => {
      mockTtsResponse();
      await tts.generateSpeech({ text: '测试' });
      expect(mimo.getApiKey).toHaveBeenCalledWith('tts');
    });

    test('text 为空时抛出校验错误', async () => {
      await expect(tts.generateSpeech({ text: '' }))
        .rejects.toThrow('请提供合成文本');
      await expect(tts.generateSpeech({ text: null }))
        .rejects.toThrow('请提供合成文本');
      await expect(tts.generateSpeech({}))
        .rejects.toThrow('请提供合成文本');
      await expect(tts.generateSpeech({ text: '   ' }))
        .rejects.toThrow('请提供合成文本');
      await expect(tts.generateSpeech({ text: 123 }))
        .rejects.toThrow('请提供合成文本');
    });

    test('clone 模式缺少 voiceClone 时抛出校验错误', async () => {
      await expect(tts.generateSpeech({ text: '测试', voiceType: 'clone' }))
        .rejects.toThrow('clone 模式需要提供 voiceClone');
    });

    test('design 模式缺少 voiceDesign 时抛出校验错误', async () => {
      await expect(tts.generateSpeech({ text: '测试', voiceType: 'design' }))
        .rejects.toThrow('design 模式需要提供 voiceDesign');
    });

    test('请求设置了合理的超时时间', async () => {
      mockTtsResponse();
      await tts.generateSpeech({ text: '测试' });
      const config = axios.post.mock.calls[0][2];
      expect(config.timeout).toBeGreaterThan(0);
    });

    test('preset 模式传入 speed 参数到 audioConfig', async () => {
      mockTtsResponse();
      await tts.generateSpeech({
        text: '测试文本',
        voice: '冰糖',
        voiceType: 'preset',
        speed: { speed_ratio: 0.9, style: '固定' }
      });
      const body = axios.post.mock.calls[0][1];
      expect(body.audio.speed).toEqual({ speed_ratio: 0.9, style: '固定' });
    });

    test('preset 模式传入 emotion 字符串到 audioConfig', async () => {
      mockTtsResponse();
      await tts.generateSpeech({
        text: '测试文本',
        voice: '冰糖',
        voiceType: 'preset',
        emotion: 'happy'
      });
      const body = axios.post.mock.calls[0][1];
      expect(body.audio.emotion).toBe('happy');
    });

    test('preset 模式传入 emotion 数组映射到 emotion_weights', async () => {
      mockTtsResponse();
      const weights = [
        { emotion: 'happy', weight: 0.6 },
        { emotion: 'surprised', weight: 0.4 }
      ];
      await tts.generateSpeech({
        text: '测试文本',
        voice: '冰糖',
        voiceType: 'preset',
        emotion: weights
      });
      const body = axios.post.mock.calls[0][1];
      expect(body.audio.emotion_weights).toEqual(weights);
      expect(body.audio.emotion).toBeUndefined();
    });

    test('preset 模式传入 pitch 参数到 audioConfig', async () => {
      mockTtsResponse();
      await tts.generateSpeech({
        text: '测试文本',
        voice: '冰糖',
        voiceType: 'preset',
        pitch: { pitch_ratio: 1.2, style: '随机' }
      });
      const body = axios.post.mock.calls[0][1];
      expect(body.audio.pitch).toEqual({ pitch_ratio: 1.2, style: '随机' });
    });

    test('有精细参数时清除 stylePrompt 避免冲突', async () => {
      mockTtsResponse();
      await tts.generateSpeech({
        text: '测试文本',
        voice: '冰糖',
        voiceType: 'preset',
        stylePrompt: '用温柔的语气',
        speed: { speed_ratio: 0.9 }
      });
      const body = axios.post.mock.calls[0][1];
      // user message 应为空，避免与精细参数冲突
      expect(body.messages[0].content).toBe('');
    });

    test('无精细参数时保留 stylePrompt', async () => {
      mockTtsResponse();
      await tts.generateSpeech({
        text: '测试文本',
        voice: '冰糖',
        voiceType: 'preset',
        stylePrompt: '用温柔的语气播报'
      });
      const body = axios.post.mock.calls[0][1];
      expect(body.messages[0].content).toBe('风格提示：用温柔的语气播报');
    });

    test('可自定义输出格式（如 mp3）', async () => {
      mockTtsResponse();
      await tts.generateSpeech({
        text: '测试文本',
        voice: '冰糖',
        voiceType: 'preset',
        format: 'mp3'
      });
      const body = axios.post.mock.calls[0][1];
      expect(body.audio.format).toBe('mp3');
    });

    test('不传 format 时默认为 wav', async () => {
      mockTtsResponse();
      await tts.generateSpeech({ text: '测试文本' });
      const body = axios.post.mock.calls[0][1];
      expect(body.audio.format).toBe('wav');
    });
  });
});
