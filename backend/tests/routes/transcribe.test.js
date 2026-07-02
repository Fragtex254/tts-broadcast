const request = require('supertest');
const fs = require('fs');

jest.mock('../../src/services/asr', () => ({
  getAsrConfig: jest.fn().mockReturnValue({
    provider: 'mimo',
    qwenModel: 'Qwen/Qwen3-ASR-1.7B',
    wslModel: 'qwen3-asr-1.7b'
  }),
  transcribeMedia: jest.fn().mockResolvedValue({
    text: '转录文本',
    usage: { total_tokens: 12 }
  })
}));

jest.mock('../../src/services/media', () => ({
  getUploadSize: jest.fn((file) => file?.size || file?.buffer?.length || 0),
  getMediaDuration: jest.fn().mockResolvedValue(12.5),
}));

jest.mock('../../src/services/sseManager', () => ({
  send: jest.fn(),
  sendProgress: jest.fn(),
  sendComplete: jest.fn(),
  sendError: jest.fn(),
  addClient: jest.fn(),
  removeClient: jest.fn(),
  getTaskConnectionCount: jest.fn(() => 1)
}));

const mockLogger = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
};

jest.mock('../../src/services/logger', () => ({
  createScopedLogger: jest.fn(() => mockLogger),
}));

const app = require('../../src/app');
const db = require('../../src/db');
const asr = require('../../src/services/asr');
const mimo = require('../../src/services/mimo');
const sseManager = require('../../src/services/sseManager');

describe('转录 API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.prepare('DELETE FROM transcription_results').run();
    asr.getAsrConfig.mockReturnValue({
      provider: 'mimo',
      qwenModel: 'Qwen/Qwen3-ASR-1.7B',
      wslModel: 'qwen3-asr-1.7b'
    });
    asr.transcribeMedia.mockResolvedValue({
      text: '转录文本',
      usage: { total_tokens: 12 }
    });
  });

  test('POST /api/transcribe 上传文件后返回转录文本', async () => {
    const res = await request(app)
      .post('/api/transcribe')
      .field('language', 'zh')
      .attach('media', Buffer.from('fake-wav'), 'sample.wav');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      text: '转录文本',
      usage: { total_tokens: 12 },
      transcriptionResult: {
        file_name: 'sample.wav',
        relative_path: 'sample.wav',
        text: '转录文本',
        language: 'zh',
        provider: 'mimo',
        model: 'mimo-v2.5-asr',
        usage: { total_tokens: 12 }
      }
    });
    expect(res.body.transcriptionResult.id).toEqual(expect.any(Number));
    expect(res.body.transcriptionResult).toEqual(expect.objectContaining({
      file_size_bytes: 8,
      audio_duration_seconds: 12.5,
      processing_seconds: expect.any(Number)
    }));
    expect(db.prepare('SELECT COUNT(*) as count FROM transcription_results').get().count).toBe(1);
    expect(asr.transcribeMedia).toHaveBeenCalledWith(expect.objectContaining({
      file: expect.objectContaining({ originalname: 'sample.wav' }),
      language: 'zh',
      provider: undefined
    }));
  });

  test('POST /api/transcribe 透传 ASR provider', async () => {
    const res = await request(app)
      .post('/api/transcribe')
      .field('language', 'zh')
      .field('provider', 'qwen_mlx')
      .attach('media', Buffer.from('fake-wav'), 'sample.wav');

    expect(res.status).toBe(200);
    expect(asr.transcribeMedia).toHaveBeenCalledWith(expect.objectContaining({
      language: 'zh',
      provider: 'qwen_mlx'
    }));
  });

  test('POST /api/transcribe 透传 WSL 模型与 context', async () => {
    const res = await request(app)
      .post('/api/transcribe')
      .field('language', 'zh')
      .field('provider', 'wsl_asr')
      .field('wslModel', 'qwen3-asr-0.6b')
      .field('context', '包青天, 福尔摩斯')
      .attach('media', Buffer.from('fake-wav'), 'sample.wav');

    expect(res.status).toBe(200);
    expect(asr.transcribeMedia).toHaveBeenCalledWith(expect.objectContaining({
      language: 'zh',
      provider: 'wsl_asr',
      wslModel: 'qwen3-asr-0.6b',
      context: '包青天, 福尔摩斯'
    }));
  });

  test('POST /api/transcribe 支持超过 50MB 的长音频上传', async () => {
    const res = await request(app)
      .post('/api/transcribe')
      .field('language', 'zh')
      .attach('media', Buffer.alloc(51 * 1024 * 1024, 1), 'long.mp3');

    expect(res.status).toBe(200);
    expect(asr.transcribeMedia).toHaveBeenCalledWith(expect.objectContaining({
      file: expect.objectContaining({
        originalname: 'long.mp3',
        path: expect.any(String)
      }),
      language: 'zh',
      provider: undefined
    }));
    expect(fs.existsSync(asr.transcribeMedia.mock.calls[0][0].file.path)).toBe(false);
  });

  test('提供 taskId 时通过 SSE 推送转录进度与完成事件', async () => {
    asr.transcribeMedia.mockImplementation(async ({ onProgress }) => {
      onProgress({
        phase: 'transcribing',
        current: 1,
        total: 2,
        percent: 60,
        text: '第一段。',
        chunkText: '第一段。'
      });
      return { text: '第一段。\n第二段。', usage: { total_tokens: 12 } };
    });

    const res = await request(app)
      .post('/api/transcribe')
      .field('language', 'zh')
      .field('taskId', 'transcribe-test')
      .attach('media', Buffer.from('fake-wav'), 'sample.wav');

    expect(res.status).toBe(200);
    expect(sseManager.send).toHaveBeenCalledWith('transcribe-test', 'transcribe-start', expect.objectContaining({
      phase: 'preparing',
      percent: 0
    }));
    expect(sseManager.sendProgress).toHaveBeenCalledWith('transcribe-test', expect.objectContaining({
      phase: 'transcribing',
      current: 1,
      total: 2,
      text: '第一段。'
    }));
    expect(sseManager.sendComplete).toHaveBeenCalledWith('transcribe-test', expect.objectContaining({
      phase: 'completed',
      percent: 100,
      text: '第一段。\n第二段。',
      transcriptionResult: expect.objectContaining({ text: '第一段。\n第二段。' })
    }));
  });

  test('POST /api/transcribe/results/:id/format 使用 AI 排版并写回结果', async () => {
    const record = db.prepare(`
      INSERT INTO transcription_results (file_name, relative_path, text, language, provider, model)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('sample.wav', 'sample.wav', '大家好今天聊 AI 首先是新模型发布', 'zh', 'mimo', 'mimo-v2.5-asr');
    jest.spyOn(mimo, 'formatTranscriptionText').mockResolvedValue('大家好，今天聊 AI。\n\n首先是新模型发布。');

    const res = await request(app)
      .post(`/api/transcribe/results/${record.lastInsertRowid}/format`)
      .send({ text: '大家好今天聊 AI 首先是新模型发布' });

    expect(res.status).toBe(200);
    expect(res.body.result).toMatchObject({
      id: record.lastInsertRowid,
      text: '大家好今天聊 AI 首先是新模型发布',
      formatted_text: '大家好，今天聊 AI。\n\n首先是新模型发布。'
    });
    expect(mimo.formatTranscriptionText).toHaveBeenCalledWith('大家好今天聊 AI 首先是新模型发布');
  });

  test('GET /api/transcribe/stats 返回转录累计统计', async () => {
    db.prepare(`
      INSERT INTO transcription_results (
        file_name, relative_path, text, formatted_text, language, provider, model,
        file_size_bytes, audio_duration_seconds, processing_seconds
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('a.wav', 'a.wav', 'abc', '', 'zh', 'mimo', 'mimo-v2.5-asr', 100, 1.5, 0.5);
    db.prepare(`
      INSERT INTO transcription_results (
        file_name, relative_path, text, formatted_text, language, provider, model,
        file_size_bytes, audio_duration_seconds, processing_seconds
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('b.wav', 'b.wav', 'abc', 'abcdef', 'zh', 'mimo', 'mimo-v2.5-asr', 200, 3, 1);

    const res = await request(app).get('/api/transcribe/stats');

    expect(res.status).toBe(200);
    expect(res.body.stats).toEqual({
      total_count: 2,
      total_file_size_bytes: 300,
      total_audio_duration_seconds: 4.5,
      total_text_chars: 9,
      total_processing_seconds: 1.5
    });
  });

  test('DELETE /api/transcribe/results/:id 删除已保存转录结果', async () => {
    const record = db.prepare(`
      INSERT INTO transcription_results (file_name, relative_path, text, language, provider, model)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('sample.wav', 'sample.wav', '转录文本', 'zh', 'mimo', 'mimo-v2.5-asr');

    const res = await request(app)
      .delete(`/api/transcribe/results/${record.lastInsertRowid}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: '转录结果已删除' });
    expect(db.prepare('SELECT COUNT(*) as count FROM transcription_results WHERE id = ?').get(record.lastInsertRowid).count).toBe(0);
  });

  test('DELETE /api/transcribe/results/:id 不存在时返回 404', async () => {
    const res = await request(app)
      .delete('/api/transcribe/results/9999');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('转录结果不存在');
  });

  test('DELETE /api/transcribe/results/:id 非法 ID 返回 400', async () => {
    const res = await request(app)
      .delete('/api/transcribe/results/abc');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('无效的转录结果 ID');
  });

  test('未上传文件返回 400', async () => {
    const res = await request(app)
      .post('/api/transcribe')
      .field('language', 'auto');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('请上传需要转录的音频或视频文件');
  });

  test('service 抛出的业务错误返回 500 和中文消息', async () => {
    asr.transcribeMedia.mockRejectedValue(new Error('MiMo ASR API 请求超时，请稍后再试'));

    const res = await request(app)
      .post('/api/transcribe')
      .field('taskId', 'secret-user-controlled-task-id')
      .attach('media', Buffer.from('fake-wav'), 'sample.wav');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('MiMo ASR API 请求超时，请稍后再试');
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        hasTaskId: true,
      }),
      '转录失败'
    );
    expect(mockLogger.error.mock.calls[0][0]).not.toHaveProperty('taskId');
  });
});

describe('批量转录 API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.prepare('DELETE FROM transcription_results').run();
    asr.getAsrConfig.mockReturnValue({
      provider: 'mimo',
      qwenModel: 'Qwen/Qwen3-ASR-1.7B',
      wslModel: 'qwen3-asr-1.7b'
    });
    sseManager.getTaskConnectionCount.mockReturnValue(1);
  });

  // 等待后台转录任务（mock 的 asr 很快，50ms 足够事件循环跑完）
  const flushBackground = () => new Promise((resolve) => setTimeout(resolve, 50));

  test('POST /api/transcribe/batch 立即返回 202，后台串行转录并通过 SSE 推送结果', async () => {
    asr.transcribeMedia
      .mockResolvedValueOnce({ text: '文本一', usage: { total_tokens: 5 } })
      .mockResolvedValueOnce({ text: '文本二', usage: { total_tokens: 7 } });

    const res = await request(app)
      .post('/api/transcribe/batch')
      .field('language', 'zh')
      .field('provider', 'qwen_mlx')
      .field('taskId', 'batch-test')
      .attach('media', Buffer.from('fake-mp3'), 'a.mp3')
      .attach('media', Buffer.from('fake-mp4'), 'b.mp4');

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ taskId: 'batch-test', total: 2, accepted: true });

    await flushBackground();

    expect(asr.transcribeMedia).toHaveBeenCalledTimes(2);
    expect(asr.transcribeMedia.mock.calls[0][0]).toMatchObject({
      file: expect.objectContaining({ originalname: 'a.mp3' }),
      language: 'zh',
      provider: 'qwen_mlx'
    });
    expect(asr.transcribeMedia.mock.calls[1][0]).toMatchObject({
      file: expect.objectContaining({ originalname: 'b.mp4' }),
      language: 'zh',
      provider: 'qwen_mlx'
    });
    expect(sseManager.sendComplete).toHaveBeenCalledWith('batch-test', expect.objectContaining({
      phase: 'completed',
      total: 2,
      succeeded: 2,
      failed: 0,
      results: [
        expect.objectContaining({ fileName: 'a.mp3', relativePath: 'a.mp3', text: '文本一', usage: { total_tokens: 5 }, resultId: expect.any(Number) }),
        expect.objectContaining({ fileName: 'b.mp4', relativePath: 'b.mp4', text: '文本二', usage: { total_tokens: 7 }, resultId: expect.any(Number) })
      ]
    }));
    expect(db.prepare('SELECT COUNT(*) as count FROM transcription_results').get().count).toBe(2);
  });

  test('POST /api/transcribe/batch 透传 WSL 模型与 context', async () => {
    asr.transcribeMedia.mockResolvedValue({ text: '文本', usage: null });

    const res = await request(app)
      .post('/api/transcribe/batch')
      .field('language', 'zh')
      .field('provider', 'wsl_asr')
      .field('wslModel', 'qwen3-asr-0.6b')
      .field('context', '术语A, 术语B')
      .field('taskId', 'batch-wsl-options')
      .attach('media', Buffer.from('fake-mp3'), 'a.mp3');

    expect(res.status).toBe(202);
    await flushBackground();

    expect(asr.transcribeMedia).toHaveBeenCalledWith(expect.objectContaining({
      language: 'zh',
      provider: 'wsl_asr',
      wslModel: 'qwen3-asr-0.6b',
      context: '术语A, 术语B'
    }));
  });

  test('通过 SSE 推送文件级进度事件', async () => {
    asr.transcribeMedia.mockImplementation(async ({ onProgress }) => {
      if (typeof onProgress === 'function') {
        onProgress({ phase: 'transcribing', current: 1, total: 2, percent: 50, text: '片段' });
      }
      return { text: '文件结果', usage: { total_tokens: 3 } };
    });

    const res = await request(app)
      .post('/api/transcribe/batch')
      .field('language', 'auto')
      .field('taskId', 'batch-progress')
      .attach('media', Buffer.from('fake'), 'x.mp3');

    expect(res.status).toBe(202);
    await flushBackground();

    expect(sseManager.send).toHaveBeenCalledWith('batch-progress', 'progress', expect.objectContaining({
      phase: 'batch-preparing',
      total: 1
    }));
    expect(sseManager.sendProgress).toHaveBeenCalledWith('batch-progress', expect.objectContaining({
      phase: 'file-start',
      index: 0,
      fileName: 'x.mp3'
    }));
    expect(sseManager.sendProgress).toHaveBeenCalledWith('batch-progress', expect.objectContaining({
      phase: 'file-progress',
      index: 0,
      filePercent: 50
    }));
    expect(sseManager.sendProgress).toHaveBeenCalledWith('batch-progress', expect.objectContaining({
      phase: 'file-complete',
      index: 0,
      text: '文件结果'
    }));
  });

  test('单文件失败不影响其他文件，结果带 error 字段', async () => {
    asr.transcribeMedia
      .mockRejectedValueOnce(new Error('第一个文件转录失败'))
      .mockResolvedValueOnce({ text: '第二个成功', usage: null });

    const res = await request(app)
      .post('/api/transcribe/batch')
      .field('language', 'zh')
      .field('taskId', 'batch-mixed')
      .attach('media', Buffer.from('fake'), 'fail.mp3')
      .attach('media', Buffer.from('fake'), 'ok.mp4');

    expect(res.status).toBe(202);
    await flushBackground();

    expect(sseManager.sendComplete).toHaveBeenCalledWith('batch-mixed', expect.objectContaining({
      total: 2,
      succeeded: 1,
      failed: 1,
      results: expect.arrayContaining([
        expect.objectContaining({ fileName: 'fail.mp3', error: '第一个文件转录失败', text: '' }),
        expect.objectContaining({ fileName: 'ok.mp4', text: '第二个成功' })
      ])
    }));
  });

  test('未上传文件返回 400', async () => {
    const res = await request(app)
      .post('/api/transcribe/batch')
      .field('language', 'auto');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('请至少上传一个音频或视频文件');
  });

  test('relativePaths 用于保留子目录结构', async () => {
    asr.transcribeMedia.mockResolvedValue({ text: '文本', usage: null });

    const res = await request(app)
      .post('/api/transcribe/batch')
      .field('language', 'auto')
      .field('taskId', 'batch-paths')
      .field('relativePaths', JSON.stringify(['子目录/a.mp3', '子目录/深层/b.mp4']))
      .attach('media', Buffer.from('fake'), 'a.mp3')
      .attach('media', Buffer.from('fake'), 'b.mp4');

    expect(res.status).toBe(202);
    await flushBackground();

    expect(sseManager.sendComplete).toHaveBeenCalledWith('batch-paths', expect.objectContaining({
      results: expect.arrayContaining([
        expect.objectContaining({ relativePath: '子目录/a.mp3' }),
        expect.objectContaining({ relativePath: '子目录/深层/b.mp4' })
      ])
    }));
  });

  test('后台单文件失败不泄露 taskId 到日志', async () => {
    asr.transcribeMedia.mockRejectedValue(new Error('MiMo ASR API 请求超时，请稍后再试'));

    const res = await request(app)
      .post('/api/transcribe/batch')
      .field('taskId', 'secret-user-controlled-task-id')
      .attach('media', Buffer.from('fake'), 'sample.wav');

    expect(res.status).toBe(202);
    await flushBackground();

    expect(mockLogger.error.mock.calls[0][0]).not.toHaveProperty('taskId');
    expect(sseManager.sendComplete).toHaveBeenCalledWith(
      'secret-user-controlled-task-id',
      expect.objectContaining({ failed: 1, succeeded: 0 })
    );
  });
});
