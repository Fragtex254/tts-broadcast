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

  test('播客整理请求结构化结果并保留说话人、时间与诊断事实', async () => {
    const structuredResult = {
      text: '主持人：欢迎。嘉宾：谢谢。',
      usage: { audio_seconds: 12 },
      segments: [
        { start: 0.2, end: 4.8, speaker: 'speaker-0001', source_speaker: 'chunk-0000:S01', text: '欢迎。' },
        { start: 5.1, end: 8.4, speaker: 'speaker-0002', source_speaker: 'chunk-0000:S02', text: '谢谢。' }
      ],
      execution: { mode: 'native_long_form', speaker_scope: 'global', automatic_chunk_fallback: false },
      diarization: { method: 'moss_anchor_replay', status: 'complete', speaker_scope: 'global', speaker_count: 2, unresolved_segments: 0, conflicts: 0 },
      generation: { segment_coverage_ratio: 0.99, truncated: false },
      warnings: []
    };
    axios.post.mockResolvedValue({ data: structuredResult });

    const result = await mossAsr.transcribeFile({
      file: { originalname: 'podcast.wav', mimetype: 'audio/wav', buffer: Buffer.from('wav') },
      baseUrl: 'http://192.168.31.137:18080/v1',
      model: 'capability-selected-model',
      language: 'auto',
      podcastMode: true
    });

    expect(result).toEqual(structuredResult);
    const formData = axios.post.mock.calls[0][1];
    expect(formData.get('response_format')).toBe('verbose_json');
    expect(formData.get('split_strategy')).toBe('auto');
    expect(formData.get('preserve_segments')).toBe('true');
    expect(formData.get('speaker_resolution')).toBe('auto');
    expect(formData.get('language')).toBeNull();
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
          progress: {
            phase: 'transcribing',
            percent: 40,
            completed_chunks: 2,
            total_chunks: 5,
            text: '第一段\n第二段',
            chunk_text: '第二段',
            chunks: [{ index: 1, text: '第一段' }, { index: 2, text: '第二段' }]
          }
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
      total: 5,
      text: '第一段\n第二段',
      chunkText: '第二段',
      chunks: [{ index: 1, text: '第一段' }, { index: 2, text: '第二段' }]
    }));
  });

  test('长音频轮询不重复推送完全相同的进度快照', async () => {
    axios.post.mockResolvedValue({
      status: 202,
      data: { id: 'job_moss_123', status: 'queued' }
    });
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

    await mossAsr.transcribeFile({
      file: { originalname: 'podcast.mp3', buffer: Buffer.from('mp3') },
      baseUrl: 'http://192.168.31.137:18080/v1',
      model: 'moss-transcribe-diarize-0.9b',
      onProgress,
      pollIntervalMs: 1
    });

    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({
      percent: 99,
      message: 'MOSS ASR 正在整理最终结果'
    }));
  });

  test('长音频超过一小时但服务端任务仍在运行时继续轮询', async () => {
    axios.post.mockResolvedValue({
      status: 202,
      data: { id: 'job_moss_4h', status: 'queued' }
    });
    axios.get
      .mockResolvedValueOnce({
        data: {
          status: 'running',
          progress: { phase: 'transcribing', percent: 20, completed_chunks: 1, total_chunks: 8 }
        }
      })
      .mockResolvedValueOnce({
        data: {
          status: 'completed',
          progress: { phase: 'completed', percent: 100, completed_chunks: 8, total_chunks: 8 },
          result: { text: '四小时播客转录结果', usage: { audio_seconds: 4 * 60 * 60 } }
        }
      });
    const dateNow = jest.spyOn(Date, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValue(60 * 60 * 1000 + 1);

    try {
      await expect(mossAsr.transcribeFile({
        file: { originalname: 'podcast-4h.mp4', mimetype: 'video/mp4', buffer: Buffer.from('mp4') },
        baseUrl: 'http://192.168.31.137:18080/v1',
        model: 'moss-transcribe-diarize-0.9b',
        pollIntervalMs: 1
      })).resolves.toEqual({
        text: '四小时播客转录结果',
        usage: { audio_seconds: 4 * 60 * 60 }
      });
    } finally {
      dateNow.mockRestore();
    }

    expect(axios.get).toHaveBeenCalledTimes(2);
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
