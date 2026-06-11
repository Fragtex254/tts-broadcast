const request = require('supertest');

jest.mock('../../src/services/asr', () => ({
  transcribeMedia: jest.fn().mockResolvedValue({
    text: '转录文本',
    usage: { total_tokens: 12 }
  })
}));

const app = require('../../src/app');
const asr = require('../../src/services/asr');

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
    expect(asr.transcribeMedia).toHaveBeenCalledWith({
      file: expect.objectContaining({ originalname: 'sample.wav' }),
      language: 'zh'
    });
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
