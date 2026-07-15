jest.mock('axios', () => ({
  post: jest.fn(),
  get: jest.fn()
}));

const axios = require('axios');
const wslAsr = require('../../src/services/wslAsr');

describe('WSL ASR 服务', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    axios.post.mockResolvedValue({ data: { id: 'job_123', status: 'queued' } });
    axios.get.mockResolvedValue({
      data: {
        status: 'completed',
        progress: { phase: 'completed', percent: 100 },
        result: {
          text: 'WSL 转录结果',
          usage: { audio_seconds: 12.3 }
        }
      }
    });
  });

  test('根据 Base URL 拼接 WSL v1 端点', () => {
    expect(wslAsr.createWslAsrUrl('http://192.168.31.137:18080', '/audio/transcription-jobs'))
      .toBe('http://192.168.31.137:18080/v1/audio/transcription-jobs');
    expect(wslAsr.createWslAsrUrl('http://192.168.31.137:18080/v1', '/jobs/job_1'))
      .toBe('http://192.168.31.137:18080/v1/jobs/job_1');
  });

  test('提交 job 并轮询完成结果', async () => {
    const onProgress = jest.fn();

    const result = await wslAsr.transcribeFile({
      file: { originalname: 'sample.wav', mimetype: 'audio/wav', buffer: Buffer.from('wav') },
      baseUrl: 'http://192.168.31.137:18080/v1',
      model: 'qwen3-asr-1.7b',
      apiKey: 'local-token',
      language: 'zh',
      onProgress,
      pollIntervalMs: 1
    });

    expect(result).toEqual({ text: 'WSL 转录结果', usage: { audio_seconds: 12.3 } });
    expect(axios.post).toHaveBeenCalledWith(
      'http://192.168.31.137:18080/v1/audio/transcription-jobs',
      expect.any(FormData),
      expect.objectContaining({
        headers: { Authorization: 'Bearer local-token' },
        proxy: false,
        timeout: 60 * 60 * 1000
      })
    );
    const formData = axios.post.mock.calls[0][1];
    expect(formData.get('model')).toBe('qwen3-asr-1.7b');
    expect(formData.get('language')).toBe('zh');
    expect(axios.get).toHaveBeenCalledWith(
      'http://192.168.31.137:18080/v1/jobs/job_123',
      expect.objectContaining({
        headers: { Authorization: 'Bearer local-token' },
        proxy: false
      })
    );
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'preparing',
      percent: 10
    }));
  });

  test('轮询时透传已完成 chunk 的累计文字和最新文字', async () => {
    axios.get
      .mockResolvedValueOnce({
        data: {
          status: 'transcribing',
          progress: {
            phase: 'transcribing',
            percent: 25,
            completed_chunks: 1,
            total_chunks: 4,
            text: '第一段累计文字',
            chunk_text: '第一段累计文字',
            chunks: [{ index: 1, text: '第一段累计文字' }]
          }
        }
      })
      .mockResolvedValueOnce({
        data: {
          status: 'completed',
          progress: { phase: 'completed', percent: 100 },
          result: { text: '最终文字', usage: null }
        }
      });
    const onProgress = jest.fn();

    await wslAsr.transcribeFile({
      file: { originalname: 'sample.wav', buffer: Buffer.from('wav') },
      baseUrl: 'http://192.168.31.137:18080/v1',
      model: 'qwen3-asr-1.7b',
      onProgress,
      pollIntervalMs: 1
    });

    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      current: 1,
      total: 4,
      text: '第一段累计文字',
      chunkText: '第一段累计文字',
      chunks: [{ index: 1, text: '第一段累计文字' }]
    }));
  });

  test('不重复推送完全相同的 job 进度快照', async () => {
    const repeated = {
      status: 'transcribing',
      progress: {
        phase: 'transcribing',
        percent: 25,
        completed_chunks: 1,
        total_chunks: 4,
        text: '第一段',
        chunk_text: '第一段',
        chunks: [{ index: 1, text: '第一段' }]
      }
    };
    axios.get
      .mockResolvedValueOnce({ data: repeated })
      .mockResolvedValueOnce({ data: repeated })
      .mockResolvedValueOnce({
        data: {
          status: 'completed',
          progress: { phase: 'completed', percent: 100, completed_chunks: 4, total_chunks: 4 },
          result: { text: '最终文字', usage: null }
        }
      });
    const onProgress = jest.fn();

    await wslAsr.transcribeFile({
      file: { originalname: 'sample.wav', buffer: Buffer.from('wav') },
      baseUrl: 'http://192.168.31.137:18080/v1',
      model: 'qwen3-asr-1.7b',
      onProgress,
      pollIntervalMs: 1
    });

    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({
      percent: 99,
      message: 'WSL ASR 正在整理最终结果'
    }));
  });

  test('提交 job 时透传 Qwen context 且不发送 hotwords', async () => {
    await wslAsr.transcribeFile({
      file: { originalname: 'sample.wav', mimetype: 'audio/wav', buffer: Buffer.from('wav') },
      baseUrl: 'http://192.168.31.137:18080/v1',
      model: 'qwen3-asr-0.6b',
      language: 'auto',
      context: '包青天, 福尔摩斯',
      pollIntervalMs: 1
    });

    const formData = axios.post.mock.calls[0][1];
    expect(formData.get('model')).toBe('qwen3-asr-0.6b');
    expect(formData.get('context')).toBe('包青天, 福尔摩斯');
    expect(formData.get('hotwords')).toBeNull();
  });

  test('WSL job 失败时映射为中文错误', async () => {
    axios.get.mockResolvedValue({
      data: {
        status: 'failed',
        error: {
          code: 'job_queue_full',
          message: 'too many queued or running transcription jobs',
          details: {}
        }
      }
    });

    await expect(wslAsr.transcribeFile({
      file: { originalname: 'sample.wav', buffer: Buffer.from('wav') },
      baseUrl: 'http://192.168.31.137:18080/v1',
      model: 'qwen3-asr-1.7b',
      pollIntervalMs: 1
    })).rejects.toThrow('WSL ASR 队列已满');
  });

  test('连接失败时返回中文错误', async () => {
    axios.post.mockRejectedValue({ code: 'ECONNREFUSED' });

    await expect(wslAsr.transcribeFile({
      file: { originalname: 'sample.wav', buffer: Buffer.from('wav') },
      baseUrl: 'http://192.168.31.137:18080/v1',
      model: 'qwen3-asr-1.7b',
      pollIntervalMs: 1
    })).rejects.toThrow('无法连接 WSL ASR 服务');
  });
});
