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

    test('429 错误抛出友好消息', async () => {
      axios.post.mockRejectedValue({
        response: { status: 429 }
      });
      await expect(tts.generateSpeech({ text: '测试' }))
        .rejects.toThrow('MiMo API 请求过于频繁，请稍后再试');
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
  });
});
