jest.mock('axios', () => ({
  post: jest.fn()
}));

const axios = require('axios');
const mossAsr = require('../../src/services/mossAsr');

describe('MOSS ASR 服务', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    axios.post.mockResolvedValue({ data: { text: 'MOSS 转录结果', usage: { audio_seconds: 6 } } });
  });

  test('根据 Base URL 拼接 OpenAI-compatible 转录端点', () => {
    expect(mossAsr.createMossAsrUrl('http://192.168.31.137:18080', '/audio/transcriptions'))
      .toBe('http://192.168.31.137:18080/v1/audio/transcriptions');
    expect(mossAsr.createMossAsrUrl('http://192.168.31.137:18080/v1', '/audio/transcriptions'))
      .toBe('http://192.168.31.137:18080/v1/audio/transcriptions');
  });

  test('发送 multipart 请求并返回文本', async () => {
    const onProgress = jest.fn();

    const result = await mossAsr.transcribeFile({
      file: { originalname: 'sample.wav', mimetype: 'audio/wav', buffer: Buffer.from('wav') },
      baseUrl: 'http://192.168.31.137:18080/v1',
      model: 'moss-asr-large',
      apiKey: 'local-token',
      language: 'zh',
      context: '术语A, 术语B',
      onProgress
    });

    expect(result).toEqual({ text: 'MOSS 转录结果', usage: { audio_seconds: 6 } });
    expect(axios.post).toHaveBeenCalledWith(
      'http://192.168.31.137:18080/v1/audio/transcriptions',
      expect.any(FormData),
      expect.objectContaining({
        headers: { Authorization: 'Bearer local-token' },
        proxy: false,
        timeout: 60 * 60 * 1000
      })
    );
    const formData = axios.post.mock.calls[0][1];
    expect(formData.get('model')).toBe('moss-asr-large');
    expect(formData.get('language')).toBe('zh');
    expect(formData.get('prompt')).toBe('术语A, 术语B');
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'preparing',
      percent: 10
    }));
  });

  test('缺少模型时抛出中文错误且不发送请求', async () => {
    await expect(mossAsr.transcribeFile({
      file: { originalname: 'sample.wav', buffer: Buffer.from('wav') },
      baseUrl: 'http://192.168.31.137:18080/v1',
      model: ''
    })).rejects.toThrow('请选择 MOSS ASR 模型');

    expect(axios.post).not.toHaveBeenCalled();
  });

  test('连接失败时返回中文错误', async () => {
    axios.post.mockRejectedValue({ code: 'ECONNREFUSED' });

    await expect(mossAsr.transcribeFile({
      file: { originalname: 'sample.wav', buffer: Buffer.from('wav') },
      baseUrl: 'http://192.168.31.137:18080/v1',
      model: 'moss-asr-large'
    })).rejects.toThrow('无法连接 MOSS ASR 服务');
  });
});
