const request = require('supertest');
const fs = require('fs');

jest.mock('../../src/services/asr', () => ({
  transcribeMedia: jest.fn().mockResolvedValue({
    text: '转录文本',
    usage: { total_tokens: 12 }
  })
}));

jest.mock('../../src/services/sseManager', () => ({
  send: jest.fn(),
  sendProgress: jest.fn(),
  sendComplete: jest.fn(),
  sendError: jest.fn(),
  addClient: jest.fn(),
  removeClient: jest.fn()
}));

const app = require('../../src/app');
const asr = require('../../src/services/asr');
const sseManager = require('../../src/services/sseManager');

describe('转录 API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    expect(res.body).toEqual({
      text: '转录文本',
      usage: { total_tokens: 12 }
    });
    expect(asr.transcribeMedia).toHaveBeenCalledWith(expect.objectContaining({
      file: expect.objectContaining({ originalname: 'sample.wav' }),
      language: 'zh'
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
      language: 'zh'
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
      text: '第一段。\n第二段。'
    }));
  });

  test('未上传文件返回 400', async () => {
    const res = await request(app)
      .post('/api/transcribe')
      .field('language', 'auto');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('请上传需要转录的音频或视频文件');
  });

  test('service 抛出的业务错误返回 500 和中文消息', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    asr.transcribeMedia.mockRejectedValue(new Error('MiMo ASR API 请求超时，请稍后再试'));

    const res = await request(app)
      .post('/api/transcribe')
      .attach('media', Buffer.from('fake-wav'), 'sample.wav');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('MiMo ASR API 请求超时，请稍后再试');
    console.error.mockRestore();
  });
});
