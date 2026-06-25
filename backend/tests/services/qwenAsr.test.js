jest.mock('axios', () => ({
  post: jest.fn()
}));

const axios = require('axios');
const qwenAsr = require('../../src/services/qwenAsr');

describe('Qwen 本地 ASR 服务', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    axios.post.mockResolvedValue({ data: { text: '本地结果' } });
  });

  test('根据 Base URL 拼接 OpenAI-compatible 转录端点', () => {
    expect(qwenAsr.createTranscriptionsUrl('http://localhost:8765')).toBe('http://localhost:8765/v1/audio/transcriptions');
    expect(qwenAsr.createTranscriptionsUrl('http://localhost:8765/v1')).toBe('http://localhost:8765/v1/audio/transcriptions');
    expect(qwenAsr.createTranscriptionsUrl('http://localhost:8765/v1/audio/transcriptions')).toBe('http://localhost:8765/v1/audio/transcriptions');
  });

  test('发送 multipart 请求并返回文本', async () => {
    const result = await qwenAsr.transcribeDataUrl({
      dataUrl: 'data:audio/wav;base64,QUJD',
      baseUrl: 'http://localhost:8765/v1',
      model: 'Qwen/Qwen3-ASR-1.7B',
      apiKey: 'local-key',
      language: 'zh'
    });

    expect(result).toEqual({ text: '本地结果', usage: null });
    expect(axios.post).toHaveBeenCalledWith(
      'http://localhost:8765/v1/audio/transcriptions',
      expect.any(FormData),
      expect.objectContaining({
        headers: { Authorization: 'Bearer local-key' },
        proxy: false,
        timeout: 30 * 60 * 1000
      })
    );
  });

  test('连接失败时返回中文错误', async () => {
    axios.post.mockRejectedValue({ code: 'ECONNREFUSED' });

    await expect(qwenAsr.transcribeDataUrl({
      dataUrl: 'data:audio/wav;base64,QUJD',
      baseUrl: 'http://localhost:8765/v1',
      model: 'Qwen/Qwen3-ASR-1.7B'
    })).rejects.toThrow('无法连接 Qwen 本地 ASR 服务');
  });
});
