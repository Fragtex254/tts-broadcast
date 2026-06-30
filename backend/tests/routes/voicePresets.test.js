const request = require('supertest');

jest.mock('../../src/services/tts', () => ({
  generateSpeech: jest.fn().mockResolvedValue(Buffer.from('fake-audio-data')),
}));

const app = require('../../src/app');
const db = require('../../src/db');
const tts = require('../../src/services/tts');

describe('Voice Presets API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    tts.generateSpeech.mockResolvedValue(Buffer.from('fake-audio-data'));
    db.prepare('DELETE FROM voice_presets').run();
  });

  // ==================== GET /api/voice-presets ====================

  describe('GET /api/voice-presets', () => {
    test('初始返回空列表', async () => {
      const res = await request(app).get('/api/voice-presets');
      expect(res.status).toBe(200);
      expect(res.body.presets).toEqual([]);
    });

    test('按 created_at DESC 排序', async () => {
      db.prepare(
        "INSERT INTO voice_presets (type, name, design_prompt, created_at) VALUES ('design', '预设A', 'prompt-a', '2025-01-01 10:00:00')"
      ).run();
      db.prepare(
        "INSERT INTO voice_presets (type, name, design_prompt, created_at) VALUES ('design', '预设B', 'prompt-b', '2025-01-02 10:00:00')"
      ).run();

      const res = await request(app).get('/api/voice-presets');
      expect(res.status).toBe(200);
      expect(res.body.presets).toHaveLength(2);
      expect(res.body.presets[0].name).toBe('预设B');
      expect(res.body.presets[1].name).toBe('预设A');
    });
  });

  // ==================== POST /api/voice-presets ====================

  describe('POST /api/voice-presets', () => {
    test('创建 design 类型预设成功', async () => {
      const res = await request(app)
        .post('/api/voice-presets')
        .type('form')
        .field('type', 'design')
        .field('name', '温柔女声')
        .field('style_prompt', '温柔')
        .field('design_prompt', '年轻的女性声音');

      expect(res.status).toBe(201);
      expect(res.body.preset.type).toBe('design');
      expect(res.body.preset.name).toBe('温柔女声');
      expect(res.body.preset.style_prompt).toBe('温柔');
      expect(res.body.preset.design_prompt).toBe('年轻的女性声音');
    });

    test('无效 type 返回 400', async () => {
      const res = await request(app)
        .post('/api/voice-presets')
        .type('form')
        .field('type', 'invalid')
        .field('name', '测试');

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/type/);
    });

    test('缺少 name 返回 400', async () => {
      const res = await request(app)
        .post('/api/voice-presets')
        .type('form')
        .field('type', 'design')
        .field('design_prompt', '描述');

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/名称/);
    });

    test('design 类型缺少 design_prompt 返回 400', async () => {
      const res = await request(app)
        .post('/api/voice-presets')
        .type('form')
        .field('type', 'design')
        .field('name', '测试预设');

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/design_prompt/);
    });
  });

  // ==================== DELETE /api/voice-presets/:id ====================

  describe('DELETE /api/voice-presets/:id', () => {
    test('删除已有预设成功', async () => {
      const result = db.prepare(
        "INSERT INTO voice_presets (type, name, design_prompt) VALUES ('design', '待删除', 'prompt')"
      ).run();
      const id = result.lastInsertRowid;

      const res = await request(app).delete(`/api/voice-presets/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/删除/);

      const check = db.prepare('SELECT * FROM voice_presets WHERE id = ?').get(id);
      expect(check).toBeUndefined();
    });

    test('删除不存在的预设返回 404', async () => {
      const res = await request(app).delete('/api/voice-presets/999');
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/不存在/);
    });
  });

  // ==================== POST /api/voice-presets/trial/design ====================

  describe('POST /api/voice-presets/trial/design', () => {
    test('试听成功返回 audioUrl', async () => {
      const res = await request(app)
        .post('/api/voice-presets/trial/design')
        .send({ design_prompt: '温柔的女性声音', trial_text: '你好世界' });

      expect(res.status).toBe(200);
      expect(res.body.audioUrl).toBeDefined();
      expect(res.body.audioUrl).toMatch(/^\/audio\/preset_trial_design_/);
      expect(tts.generateSpeech).toHaveBeenCalledWith(expect.objectContaining({
        text: '你好世界',
        voiceType: 'design',
        voiceDesign: '温柔的女性声音',
      }));
    });

    test('缺少 design_prompt 返回 400', async () => {
      const res = await request(app)
        .post('/api/voice-presets/trial/design')
        .send({ trial_text: '你好' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/design_prompt/);
    });

    test('缺少 trial_text 使用默认值，仍可成功', async () => {
      const res = await request(app)
        .post('/api/voice-presets/trial/design')
        .send({ design_prompt: '温柔的女性声音' });

      expect(res.status).toBe(200);
      expect(res.body.audioUrl).toBeDefined();
      expect(tts.generateSpeech).toHaveBeenCalledWith(expect.objectContaining({
        text: '你好，我是你的专属语音助手。',
      }));
    });

    test('显式开启 optimize_text_preview 时透传给 TTS 服务', async () => {
      const res = await request(app)
        .post('/api/voice-presets/trial/design')
        .send({
          design_prompt: '温柔的女性声音',
          trial_text: '你好世界',
          optimize_text_preview: true
        });

      expect(res.status).toBe(200);
      expect(tts.generateSpeech).toHaveBeenCalledWith(expect.objectContaining({
        optimizeTextPreview: true,
      }));
    });
  });
});
