const request = require('supertest');
const fs = require('fs');
const path = require('path');

jest.mock('../../src/services/tts', () => ({
  generateSpeech: jest.fn().mockResolvedValue(Buffer.from('fake-audio-data')),
}));

jest.mock('../../src/services/mimo', () => ({
  inferVoiceDesignFromImage: jest.fn(),
  suggestTrialTextTags: jest.fn(),
}));

const app = require('../../src/app');
const db = require('../../src/db');
const tts = require('../../src/services/tts');
const mimo = require('../../src/services/mimo');
const ttsQueue = require('../../src/services/ttsQueue');
const { assetDir } = require('../../src/utils/validation');

function cleanupTestAssets() {
  if (!fs.existsSync(assetDir)) return;
  fs.readdirSync(assetDir)
    .filter((file) => file.startsWith('preset_character_'))
    .forEach((file) => fs.rmSync(path.join(assetDir, file), { force: true }));
}

describe('Voice Presets API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cleanupTestAssets();
    ttsQueue.clear();
    ttsQueue.minIntervalMs = 0;
    ttsQueue.maxConcurrent = 10;
    ttsQueue.lastStartAt = 0;
    tts.generateSpeech.mockResolvedValue(Buffer.from('fake-audio-data'));
    mimo.inferVoiceDesignFromImage.mockResolvedValue({
      designPrompt: '青年女性，清亮柔和，温和角色感',
      stylePrompt: '语气温柔，语速适中',
      characterSummary: '明亮温和',
    });
    mimo.suggestTrialTextTags.mockResolvedValue({
      taggedText: '[温柔]你好，[轻笑]欢迎收听。',
      stylePrompt: '语气温柔，语速适中，问候后轻停顿',
    });
    db.prepare('DELETE FROM voice_presets').run();
  });

  afterEach(() => {
    cleanupTestAssets();
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
      expect(res.body.preset.character_image_path).toBeNull();
      expect(res.body.preset.use_trial_audio_as_clone).toBe(0);
    });

    test('创建 design 类型预设时可启用试听音频作为克隆音频', async () => {
      const res = await request(app)
        .post('/api/voice-presets')
        .field('type', 'design')
        .field('name', '可克隆设计音色')
        .field('design_prompt', '青年女性，清亮柔和，温和角色感')
        .field('use_trial_audio_as_clone', 'true')
        .attach('trial_audio', Buffer.from('fake-trial-audio'), {
          filename: 'trial.wav',
          contentType: 'audio/wav',
        });

      expect(res.status).toBe(201);
      expect(res.body.preset.type).toBe('design');
      expect(res.body.preset.trial_audio_path).toMatch(/^\/audio\/preset_trial_\d+\.wav$/);
      expect(res.body.preset.use_trial_audio_as_clone).toBe(1);
    });

    test('创建 design 类型预设时没有试听音频不能启用克隆生成', async () => {
      const res = await request(app)
        .post('/api/voice-presets')
        .type('form')
        .field('type', 'design')
        .field('name', '缺试听')
        .field('design_prompt', '青年女性，清亮柔和，温和角色感')
        .field('use_trial_audio_as_clone', 'true');

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/试听音频/);
      expect(db.prepare('SELECT COUNT(*) as count FROM voice_presets').get().count).toBe(0);
    });

    test('创建 design 类型预设时保存角色立绘', async () => {
      const res = await request(app)
        .post('/api/voice-presets')
        .field('type', 'design')
        .field('name', '立绘音色')
        .field('design_prompt', '清亮柔和的年轻声线')
        .attach('character_image', Buffer.from('fake-png'), {
          filename: 'character.png',
          contentType: 'image/png',
        });

      expect(res.status).toBe(201);
      expect(res.body.preset.character_image_path).toMatch(/^\/assets\/preset_character_\d+\.png$/);
      expect(fs.existsSync(path.join(assetDir, path.basename(res.body.preset.character_image_path)))).toBe(true);
    });

    test('创建 design 类型预设时拒绝非法角色立绘格式且不落库', async () => {
      const res = await request(app)
        .post('/api/voice-presets')
        .field('type', 'design')
        .field('name', '非法图片')
        .field('design_prompt', '清亮柔和的年轻声线')
        .attach('character_image', Buffer.from('fake-gif'), {
          filename: 'character.gif',
          contentType: 'image/gif',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/PNG、JPG 或 WebP/);
      expect(db.prepare('SELECT COUNT(*) as count FROM voice_presets').get().count).toBe(0);
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

  // ==================== PUT /api/voice-presets/:id ====================

  describe('PUT /api/voice-presets/:id', () => {
    test('更新 design 类型预设成功', async () => {
      const result = db.prepare(
        "INSERT INTO voice_presets (type, name, style_prompt, design_prompt) VALUES ('design', '旧名称', '旧风格', '旧描述')"
      ).run();
      const id = result.lastInsertRowid;

      const res = await request(app)
        .put(`/api/voice-presets/${id}`)
        .type('form')
        .field('name', '新名称')
        .field('style_prompt', '新风格')
        .field('design_prompt', '新描述');

      expect(res.status).toBe(200);
      expect(res.body.preset).toEqual(expect.objectContaining({
        id,
        type: 'design',
        name: '新名称',
        style_prompt: '新风格',
        design_prompt: '新描述',
        use_trial_audio_as_clone: 0,
      }));
    });

    test('更新 design 类型预设时可切换试听音频克隆生成', async () => {
      const result = db.prepare(
        "INSERT INTO voice_presets (type, name, style_prompt, design_prompt, trial_audio_path) VALUES ('design', '旧名称', '旧风格', '旧描述', '/audio/preset_trial_123.wav')"
      ).run();
      const id = result.lastInsertRowid;

      const res = await request(app)
        .put(`/api/voice-presets/${id}`)
        .type('form')
        .field('name', '新名称')
        .field('style_prompt', '新风格')
        .field('design_prompt', '新描述')
        .field('use_trial_audio_as_clone', 'true');

      expect(res.status).toBe(200);
      expect(res.body.preset.use_trial_audio_as_clone).toBe(1);
    });

    test('更新 design 类型预设时没有试听音频不能启用克隆生成', async () => {
      const result = db.prepare(
        "INSERT INTO voice_presets (type, name, design_prompt) VALUES ('design', '旧名称', '旧描述')"
      ).run();

      const res = await request(app)
        .put(`/api/voice-presets/${result.lastInsertRowid}`)
        .type('form')
        .field('name', '新名称')
        .field('design_prompt', '新描述')
        .field('use_trial_audio_as_clone', 'true');

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/试听音频/);
      const preset = db.prepare('SELECT * FROM voice_presets WHERE id = ?').get(result.lastInsertRowid);
      expect(preset.use_trial_audio_as_clone).toBe(0);
    });

    test('更新不存在的预设返回 404', async () => {
      const res = await request(app)
        .put('/api/voice-presets/999')
        .type('form')
        .field('name', '新名称')
        .field('design_prompt', '新描述');

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/不存在/);
    });

    test('更新 design 类型预设时替换角色立绘并清理旧文件', async () => {
      const result = db.prepare(
        "INSERT INTO voice_presets (type, name, design_prompt, character_image_path) VALUES ('design', '旧名称', '旧描述', '/assets/preset_character_999.png')"
      ).run();
      const oldFile = path.join(assetDir, 'preset_character_999.png');
      fs.mkdirSync(assetDir, { recursive: true });
      fs.writeFileSync(oldFile, 'old-image');

      const res = await request(app)
        .put(`/api/voice-presets/${result.lastInsertRowid}`)
        .field('name', '新名称')
        .field('design_prompt', '新描述')
        .attach('character_image', Buffer.from('new-png'), {
          filename: 'new.png',
          contentType: 'image/png',
        });

      expect(res.status).toBe(200);
      expect(res.body.preset.character_image_path).toMatch(/^\/assets\/preset_character_\d+\.png$/);
      expect(res.body.preset.character_image_path).not.toBe('/assets/preset_character_999.png');
      expect(fs.existsSync(oldFile)).toBe(false);
    });

    test('更新 design 类型预设时支持移除角色立绘', async () => {
      const result = db.prepare(
        "INSERT INTO voice_presets (type, name, design_prompt, character_image_path) VALUES ('design', '旧名称', '旧描述', '/assets/preset_character_998.png')"
      ).run();
      const oldFile = path.join(assetDir, 'preset_character_998.png');
      fs.mkdirSync(assetDir, { recursive: true });
      fs.writeFileSync(oldFile, 'old-image');

      const res = await request(app)
        .put(`/api/voice-presets/${result.lastInsertRowid}`)
        .field('name', '新名称')
        .field('design_prompt', '新描述')
        .field('remove_character_image', 'true');

      expect(res.status).toBe(200);
      expect(res.body.preset.character_image_path).toBeNull();
      expect(fs.existsSync(oldFile)).toBe(false);
    });

    test('更新时缺少名称返回 400', async () => {
      const result = db.prepare(
        "INSERT INTO voice_presets (type, name, design_prompt) VALUES ('design', '旧名称', '旧描述')"
      ).run();

      const res = await request(app)
        .put(`/api/voice-presets/${result.lastInsertRowid}`)
        .type('form')
        .field('name', '   ')
        .field('design_prompt', '新描述');

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/名称/);
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

    test('删除预设时清理角色立绘文件', async () => {
      fs.mkdirSync(assetDir, { recursive: true });
      const imagePath = '/assets/preset_character_997.png';
      const imageFile = path.join(assetDir, 'preset_character_997.png');
      fs.writeFileSync(imageFile, 'image');
      const result = db.prepare(
        "INSERT INTO voice_presets (type, name, design_prompt, character_image_path) VALUES ('design', '待删除', 'prompt', ?)"
      ).run(imagePath);

      const res = await request(app).delete(`/api/voice-presets/${result.lastInsertRowid}`);

      expect(res.status).toBe(200);
      expect(fs.existsSync(imageFile)).toBe(false);
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

  describe('POST /api/voice-presets/infer-design-from-image', () => {
    test('上传角色立绘后返回反推音色描述', async () => {
      const res = await request(app)
        .post('/api/voice-presets/infer-design-from-image')
        .attach('character_image', Buffer.from('fake-png'), {
          filename: 'character.png',
          contentType: 'image/png',
        });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        designPrompt: '青年女性，清亮柔和，温和角色感',
        stylePrompt: '语气温柔，语速适中',
        characterSummary: '明亮温和',
      });
      expect(mimo.inferVoiceDesignFromImage).toHaveBeenCalledWith({
        imageBuffer: expect.any(Buffer),
        mimeType: 'image/png',
      });
    });

    test('未上传角色立绘返回 400', async () => {
      const res = await request(app).post('/api/voice-presets/infer-design-from-image');

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/角色立绘/);
    });

    test('非法角色立绘格式返回 400', async () => {
      const res = await request(app)
        .post('/api/voice-presets/infer-design-from-image')
        .attach('character_image', Buffer.from('fake-gif'), {
          filename: 'character.gif',
          contentType: 'image/gif',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/PNG、JPG 或 WebP/);
      expect(mimo.inferVoiceDesignFromImage).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/voice-presets/suggest-trial-text-tags', () => {
    test('返回试听文本标签建议', async () => {
      const res = await request(app)
        .post('/api/voice-presets/suggest-trial-text-tags')
        .send({
          text: '你好，欢迎收听。',
          voice_design: '清亮柔和的年轻声线',
          style_prompt: '语速适中',
        });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        taggedText: '[温柔]你好，[轻笑]欢迎收听。',
        stylePrompt: '语气温柔，语速适中，问候后轻停顿',
      });
      expect(mimo.suggestTrialTextTags).toHaveBeenCalledWith({
        text: '你好，欢迎收听。',
        voiceDesign: '清亮柔和的年轻声线',
        stylePrompt: '语速适中',
      });
    });

    test('缺少试听文本返回 400', async () => {
      const res = await request(app)
        .post('/api/voice-presets/suggest-trial-text-tags')
        .send({ text: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('请提供试听文本');
      expect(mimo.suggestTrialTextTags).not.toHaveBeenCalled();
    });
  });
});
