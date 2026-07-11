jest.mock('axios', () => ({
  post: jest.fn(),
  get: jest.fn()
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
    expect(formData.get('context')).toBe('术语A, 术语B');
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'preparing',
      percent: 10
    }));
  });

  test('同步端点对长音频返回 202 时轮询 job 直到完成', async () => {
    axios.post.mockResolvedValue({
      status: 202,
      data: { id: 'job_moss_123', status: 'queued' }
    });
    axios.get
      .mockResolvedValueOnce({
        data: {
          status: 'running',
          progress: { phase: 'transcribing', percent: 40, completed_chunks: 2, total_chunks: 5 }
        }
      })
      .mockResolvedValueOnce({
        data: {
          status: 'completed',
          progress: { phase: 'completed', percent: 100, completed_chunks: 5, total_chunks: 5 },
          result: { text: '长音频 MOSS 转录结果', usage: { audio_seconds: 3600 } }
        }
      });
    const onProgress = jest.fn();

    const result = await mossAsr.transcribeFile({
      file: { originalname: 'podcast.mp3', mimetype: 'audio/mpeg', buffer: Buffer.from('mp3') },
      baseUrl: 'http://192.168.31.137:18080/v1',
      model: 'moss-transcribe-diarize-0.9b',
      language: 'zh',
      onProgress,
      pollIntervalMs: 1
    });

    expect(result).toEqual({ text: '长音频 MOSS 转录结果', usage: { audio_seconds: 3600 } });
    expect(axios.get).toHaveBeenCalledWith(
      'http://192.168.31.137:18080/v1/jobs/job_moss_123',
      expect.objectContaining({ proxy: false })
    );
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'transcribing',
      current: 2,
      total: 5
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
