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

jest.mock('../../src/services/qwenAsr', () => ({
  transcribeDataUrl: jest.fn().mockResolvedValue({
    text: '本地转录文本',
    usage: null
  })
}));

jest.mock('../../src/services/wslAsr', () => ({
  transcribeFile: jest.fn().mockResolvedValue({
    text: 'WSL 转录文本',
    usage: { audio_seconds: 8 }
  })
}));

const mimo = require('../../src/services/mimo');
const media = require('../../src/services/media');
const mimoApiClient = require('../../src/services/mimoApiClient');
const qwenAsr = require('../../src/services/qwenAsr');
const wslAsr = require('../../src/services/wslAsr');
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
    qwenAsr.transcribeDataUrl.mockResolvedValue({
      text: '本地转录文本',
      usage: null
    });
    wslAsr.transcribeFile.mockResolvedValue({
      text: 'WSL 转录文本',
      usage: { audio_seconds: 8 }
    });
  });

  test('成功调用 MiMo ASR 并返回文本与 usage', async () => {
    const file = { originalname: 'a.wav', buffer: Buffer.from('a') };

    const result = await asr.transcribeMedia({ file, language: 'zh', provider: 'mimo' });

    expect(result).toEqual({ text: '转录文本', usage: { total_tokens: 12 } });
    expect(mimo.getApiKey).toHaveBeenCalledWith('tts');
    expect(media.fileToAsrDataUrls).toHaveBeenCalledWith({
      file,
      maxDataUrlSize: 10 * 1024 * 1024,
      chunkOptions: undefined
    });
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
    await asr.transcribeMedia({ file: { originalname: 'a.wav', buffer: Buffer.from('a') }, provider: 'mimo' });

    const call = mimoApiClient.postChatCompletions.mock.calls[0][0];
    expect(call.payload.asr_options.language).toBe('auto');
  });

  test('选择 Qwen 本地 provider 时调用本地 ASR 且不读取 MiMo Key', async () => {
    const file = { originalname: 'local.wav', buffer: Buffer.from('a') };

    const result = await asr.transcribeMedia({ file, language: 'zh', provider: 'qwen_mlx' });

    expect(result).toEqual({ text: '本地转录文本', usage: null });
    expect(mimo.getApiKey).not.toHaveBeenCalled();
    expect(mimoApiClient.postChatCompletions).not.toHaveBeenCalled();
    expect(qwenAsr.transcribeDataUrl).toHaveBeenCalledWith({
      dataUrl: 'data:audio/wav;base64,AAAA',
      language: 'zh',
      baseUrl: 'http://localhost:8765/v1',
      model: 'Qwen/Qwen3-ASR-1.7B',
      apiKey: ''
    });
    expect(media.fileToAsrDataUrls).toHaveBeenCalledWith({
      file,
      maxDataUrlSize: 256 * 1024 * 1024,
      chunkOptions: {
        targetSeconds: 600,
        minSeconds: 60,
        maxSeconds: 1200,
        tooLargeMessage: '音频内容过大，转换后超过 Qwen 本地 ASR 单片限制'
      }
    });
  });

  test('选择 WSL ASR provider 时直接提交文件且不走本地切片', async () => {
    const file = { originalname: 'wsl.wav', buffer: Buffer.from('a') };
    const onProgress = jest.fn();

    const result = await asr.transcribeMedia({
      file,
      language: 'zh',
      provider: 'wsl_asr',
      wslModel: 'qwen3-asr-0.6b',
      context: '包青天, 福尔摩斯',
      onProgress
    });

    expect(result).toEqual({ text: 'WSL 转录文本', usage: { audio_seconds: 8 } });
    expect(mimo.getApiKey).not.toHaveBeenCalled();
    expect(media.fileToAsrDataUrls).not.toHaveBeenCalled();
    expect(mimoApiClient.postChatCompletions).not.toHaveBeenCalled();
    expect(qwenAsr.transcribeDataUrl).not.toHaveBeenCalled();
    expect(wslAsr.transcribeFile).toHaveBeenCalledWith({
      file,
      language: 'zh',
      baseUrl: 'http://192.168.31.137:18080/v1',
      model: 'qwen3-asr-0.6b',
      apiKey: '',
      context: '包青天, 福尔摩斯',
      onProgress
    });
  });

  test('默认 provider 为 WSL ASR', async () => {
    const file = { originalname: 'default.wav', buffer: Buffer.from('a') };

    const result = await asr.transcribeMedia({ file, language: 'zh' });

    expect(result).toEqual({ text: 'WSL 转录文本', usage: { audio_seconds: 8 } });
    expect(wslAsr.transcribeFile).toHaveBeenCalledWith(expect.objectContaining({
      file,
      language: 'zh',
      baseUrl: 'http://192.168.31.137:18080/v1',
      model: 'qwen3-asr-1.7b'
    }));
    expect(media.fileToAsrDataUrls).not.toHaveBeenCalled();
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
      language: 'zh',
      provider: 'mimo'
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

  test('转录多个切片时回调进度与累计文本', async () => {
    media.fileToAsrDataUrls.mockResolvedValue([
      'data:audio/mpeg;base64,AAAA',
      'data:audio/mpeg;base64,BBBB'
    ]);
    mimoApiClient.postChatCompletions
      .mockResolvedValueOnce({ choices: [{ message: { content: '第一段。' } }], usage: { total_tokens: 5 } })
      .mockResolvedValueOnce({ choices: [{ message: { content: '第二段。' } }], usage: { total_tokens: 7 } });
    const onProgress = jest.fn();

    await asr.transcribeMedia({
      file: { originalname: 'long.mp3', buffer: Buffer.from('a') },
      language: 'zh',
      provider: 'mimo',
      onProgress
    });

    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'preparing',
      percent: 10,
      text: ''
    }));
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'transcribing',
      current: 1,
      total: 2,
      percent: 60,
      chunkText: '第一段。',
      text: '第一段。'
    }));
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'transcribing',
      current: 2,
      total: 2,
      percent: 100,
      chunkText: '第二段。',
      text: '第一段。\n第二段。'
    }));
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
      file: { originalname: 'large.wav', buffer: Buffer.from('a') },
      provider: 'mimo'
    })).rejects.toThrow('音频内容过大，转换后超过 ASR 10MB 限制');
  });

  test('MiMo 未返回文本时抛出中文错误', async () => {
    mimoApiClient.postChatCompletions.mockResolvedValue({ choices: [{ message: {} }] });

    await expect(asr.transcribeMedia({
      file: { originalname: 'a.wav', buffer: Buffer.from('a') },
      provider: 'mimo'
    })).rejects.toThrow('MiMo ASR API 未返回转录结果');
  });
});
