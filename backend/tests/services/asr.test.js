jest.mock('../../src/services/mimo', () => ({
  getApiKey: jest.fn().mockReturnValue('fake-tts-key')
}));

jest.mock('../../src/services/media', () => ({
  fileToAsrDataUrl: jest.fn().mockResolvedValue('data:audio/wav;base64,AAAA'),
  fileToAsrDataUrls: jest.fn().mockResolvedValue(['data:audio/wav;base64,AAAA'])
}));

jest.mock('../../src/services/mimoApiClient', () => ({
  postChatCompletions: jest.fn().mockResolvedValue({
    choices: [{ message: { content: '转录文本' } }],
    usage: { total_tokens: 12 }
  })
}));

const mimo = require('../../src/services/mimo');
const media = require('../../src/services/media');
const mimoApiClient = require('../../src/services/mimoApiClient');
const asr = require('../../src/services/asr');

describe('ASR 服务', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mimo.getApiKey.mockReturnValue('fake-tts-key');
    media.fileToAsrDataUrl.mockResolvedValue('data:audio/wav;base64,AAAA');
    media.fileToAsrDataUrls.mockResolvedValue(['data:audio/wav;base64,AAAA']);
    mimoApiClient.postChatCompletions.mockResolvedValue({
      choices: [{ message: { content: '转录文本' } }],
      usage: { total_tokens: 12 }
    });
  });

  test('成功调用 MiMo ASR 并返回文本与 usage', async () => {
    const file = { originalname: 'a.wav', buffer: Buffer.from('a') };

    const result = await asr.transcribeMedia({ file, language: 'zh' });

    expect(result).toEqual({ text: '转录文本', usage: { total_tokens: 12 } });
    expect(mimo.getApiKey).toHaveBeenCalledWith('tts');
    expect(media.fileToAsrDataUrls).toHaveBeenCalledWith({ file, maxDataUrlSize: 10 * 1024 * 1024 });
    expect(mimoApiClient.postChatCompletions).toHaveBeenCalledWith({
      apiKey: 'fake-tts-key',
      serviceName: 'ASR',
      payload: {
        model: 'mimo-v2.5-asr',
        messages: [{
          role: 'user',
          content: [{
            type: 'input_audio',
            input_audio: { data: 'data:audio/wav;base64,AAAA' }
          }]
        }],
        asr_options: { language: 'zh' }
      }
    });
  });

  test('默认语言为 auto', async () => {
    await asr.transcribeMedia({ file: { originalname: 'a.wav', buffer: Buffer.from('a') } });

    const call = mimoApiClient.postChatCompletions.mock.calls[0][0];
    expect(call.payload.asr_options.language).toBe('auto');
  });

  test('自动转录多个音频切片并按顺序合并文本', async () => {
    media.fileToAsrDataUrls.mockResolvedValue([
      'data:audio/mpeg;base64,AAAA',
      'data:audio/mpeg;base64,BBBB'
    ]);
    mimoApiClient.postChatCompletions
      .mockResolvedValueOnce({ choices: [{ message: { content: '第一段。' } }], usage: { total_tokens: 5 } })
      .mockResolvedValueOnce({ choices: [{ message: { content: '第二段。' } }], usage: { total_tokens: 7 } });

    const result = await asr.transcribeMedia({
      file: { originalname: 'long.mp3', buffer: Buffer.from('a') },
      language: 'zh'
    });

    expect(result).toEqual({
      text: '第一段。\n第二段。',
      usage: { total_tokens: 12 }
    });
    expect(mimoApiClient.postChatCompletions).toHaveBeenCalledTimes(2);
    expect(mimoApiClient.postChatCompletions.mock.calls[0][0].payload.messages[0].content[0].input_audio.data)
      .toBe('data:audio/mpeg;base64,AAAA');
    expect(mimoApiClient.postChatCompletions.mock.calls[1][0].payload.messages[0].content[0].input_audio.data)
      .toBe('data:audio/mpeg;base64,BBBB');
  });

  test('语言参数无效时抛出中文错误', async () => {
    await expect(asr.transcribeMedia({
      file: { originalname: 'a.wav', buffer: Buffer.from('a') },
      language: 'jp'
    })).rejects.toThrow('语言参数无效，请选择自动、中文或英文');
  });

  test('切片后仍有 Base64 data URL 超过限制时抛出中文错误', async () => {
    media.fileToAsrDataUrls.mockResolvedValue([`data:audio/wav;base64,${'a'.repeat(10 * 1024 * 1024 + 1)}`]);

    await expect(asr.transcribeMedia({
      file: { originalname: 'large.wav', buffer: Buffer.from('a') }
    })).rejects.toThrow('音频内容过大，转换后超过 ASR 10MB 限制');
  });

  test('MiMo 未返回文本时抛出中文错误', async () => {
    mimoApiClient.postChatCompletions.mockResolvedValue({ choices: [{ message: {} }] });

    await expect(asr.transcribeMedia({
      file: { originalname: 'a.wav', buffer: Buffer.from('a') }
    })).rejects.toThrow('MiMo ASR API 未返回转录结果');
  });
});
