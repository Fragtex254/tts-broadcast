const express = require('express');
const router = express.Router();
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const tts = require('../services/tts');
const db = require('../db');

// multer：内存存储，仅接受 reference_audio 字段，10MB 上限
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// 音频目录
const audioDir = path.join(__dirname, '../../audio');
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
}

/**
 * 将音频 Buffer 转为 base64 data URI
 * - mp3 / wav：直接编码
 * - 其他格式：先用 ffmpeg 转为 wav 再编码
 */
function audioBufferToBase64(buffer, originalName, mimetype) {
  return new Promise((resolve, reject) => {
    const ext = path.extname(originalName || '').toLowerCase().replace('.', '');
    const isMp3 = ext === 'mp3' || (mimetype && mimetype.includes('mpeg'));
    const isWav = ext === 'wav' || (mimetype && mimetype.includes('wav'));

    if (isMp3) {
      resolve(`data:audio/mpeg;base64,${buffer.toString('base64')}`);
    } else if (isWav) {
      resolve(`data:audio/wav;base64,${buffer.toString('base64')}`);
    } else {
      // 需要 ffmpeg 转换
      const tmpIn = path.join(audioDir, `_tmp_convert_in_${Date.now()}.${ext || 'bin'}`);
      const tmpOut = path.join(audioDir, `_tmp_convert_out_${Date.now()}.wav`);
      fs.writeFileSync(tmpIn, buffer);

      ffmpeg(tmpIn)
        .toFormat('wav')
        .on('error', (err) => {
          cleanFile(tmpIn);
          cleanFile(tmpOut);
          reject(new Error(`ffmpeg 转换失败: ${err.message}`));
        })
        .on('end', () => {
          try {
            const wavBuffer = fs.readFileSync(tmpOut);
            resolve(`data:audio/wav;base64,${wavBuffer.toString('base64')}`);
          } catch (readErr) {
            reject(readErr);
          } finally {
            cleanFile(tmpIn);
            cleanFile(tmpOut);
          }
        })
        .save(tmpOut);
    }
  });
}

/** 同步删除文件（忽略不存在的情况） */
function cleanFile(filepath) {
  try {
    if (filepath && fs.existsSync(filepath)) fs.unlinkSync(filepath);
  } catch { /* 忽略 */ }
}

/**
 * 清理旧的试听音频文件，保留最近 maxKeep 个
 */
function cleanupOldTrials(prefix, maxKeep = 10) {
  try {
    const files = fs.readdirSync(audioDir)
      .filter(f => f.startsWith(prefix))
      .map(f => ({
        name: f,
        time: fs.statSync(path.join(audioDir, f)).mtimeMs
      }))
      .sort((a, b) => b.time - a.time);

    for (let i = maxKeep; i < files.length; i++) {
      cleanFile(path.join(audioDir, files[i].name));
    }
  } catch { /* 忽略 */ }
}

// ==================== 克隆试听 ====================

/**
 * POST /api/voice-presets/trial/clone
 * 克隆试听：上传参考音频 → base64 → MiMo TTS → 返回音频 URL
 *
 * Body (multipart/form-data):
 *   - reference_audio: 音频文件（必填）
 *   - text: 试听文本（可选，默认 "你好，我是你的专属语音助手。"）
 *   - style_prompt: 风格提示（可选）
 */
router.post('/trial/clone', upload.single('reference_audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传参考音频文件' });
    }

    const text = req.body.trial_text || '你好，我是你的专属语音助手。';
    const stylePrompt = req.body.style_prompt || '';

    // 转为 base64 data URI
    const voiceClone = await audioBufferToBase64(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );

    // 调用 TTS 克隆接口
    const audioBuffer = await tts.generateSpeech({
      text,
      voiceType: 'clone',
      voiceClone,
      stylePrompt
    });

    // 保存生成的音频文件
    const filename = `preset_trial_clone_${Date.now()}.wav`;
    const filepath = path.join(audioDir, filename);
    fs.writeFileSync(filepath, audioBuffer);

    // 清理旧的试听文件
    cleanupOldTrials('preset_trial_clone_');

    res.json({ audioUrl: `/audio/${filename}` });
  } catch (error) {
    console.error('克隆试听失败:', error);
    res.status(500).json({ error: error.message || '克隆试听失败' });
  }
});

// ==================== 设计试听 ====================

/**
 * POST /api/voice-presets/trial/design
 * 设计试听：传入描述 → MiMo TTS → 返回音频 URL
 *
 * Body (JSON):
 *   - design_prompt: 音色描述（必填）
 *   - trial_text: 试听文本（可选，默认 "你好，我是你的专属语音助手。"）
 *   - style_prompt: 风格提示（可选）
 */
router.post('/trial/design', async (req, res) => {
  try {
    const { design_prompt, trial_text, style_prompt } = req.body;

    if (!design_prompt) {
      return res.status(400).json({ error: '请提供音色描述 (design_prompt)' });
    }

    const text = trial_text || '你好，我是你的专属语音助手。';

    const audioBuffer = await tts.generateSpeech({
      text,
      voiceType: 'design',
      voiceDesign: design_prompt,
      stylePrompt: style_prompt || ''
    });

    const filename = `preset_trial_design_${Date.now()}.wav`;
    const filepath = path.join(audioDir, filename);
    fs.writeFileSync(filepath, audioBuffer);

    cleanupOldTrials('preset_trial_design_');

    res.json({ audioUrl: `/audio/${filename}` });
  } catch (error) {
    console.error('设计试听失败:', error);
    res.status(500).json({ error: error.message || '设计试听失败' });
  }
});

// ==================== CRUD ====================

/**
 * GET /api/voice-presets
 * 查询所有音色预设，按创建时间倒序
 */
router.get('/', (req, res) => {
  try {
    const presets = db.prepare(
      'SELECT * FROM voice_presets ORDER BY created_at DESC'
    ).all();
    res.json({ presets });
  } catch (error) {
    console.error('查询预设失败:', error);
    res.status(500).json({ error: '查询预设失败' });
  }
});

/**
 * POST /api/voice-presets
 * 创建音色预设（multipart/form-data）
 *
 * Fields:
 *   - type: 'clone' | 'design'（必填）
 *   - name: 预设名称（必填）
 *   - style_prompt: 风格提示（可选）
 *   - design_prompt: 音色描述，type=design 时必填
 *   - trial_audio_path: 试听音频路径（可选，来自试听接口返回的 URL）
 *   - trial_audio: 试听音频文件（可选）
 *   - reference_audio: 参考音频文件（可选，用于克隆预设）
 *
 * 上限：20 个预设
 */
const createUpload = upload.fields([
  { name: 'trial_audio', maxCount: 1 },
  { name: 'reference_audio', maxCount: 1 }
]);

router.post('/', createUpload, (req, res) => {
  try {
    const { type, name, style_prompt, design_prompt, trial_audio_path } = req.body;

    if (!type || !['clone', 'design'].includes(type)) {
      return res.status(400).json({ error: 'type 必须为 clone 或 design' });
    }
    if (!name) {
      return res.status(400).json({ error: '请提供预设名称' });
    }
    if (type === 'design' && !design_prompt) {
      return res.status(400).json({ error: '设计类型预设必须提供 design_prompt' });
    }

    // 检查上限（20个）
    const count = db.prepare('SELECT COUNT(*) as count FROM voice_presets').get().count;
    if (count >= 20) {
      return res.status(400).json({ error: '预设数量已达上限（20个），请删除不需要的预设' });
    }

    const files = req.files || {};
    let finalTrialAudioPath = trial_audio_path || null;
    let finalOriginalAudioPath = null;

    // 试听音频：优先使用上传的文件
    if (files.trial_audio && files.trial_audio[0]) {
      const file = files.trial_audio[0];
      const ext = path.extname(file.originalname) || '.wav';
      const trialFilename = `preset_trial_${Date.now()}${ext}`;
      const trialFilepath = path.join(audioDir, trialFilename);
      fs.writeFileSync(trialFilepath, file.buffer);
      finalTrialAudioPath = `/audio/${trialFilename}`;
    }

    // 参考音频（克隆预设的原始音频）
    if (files.reference_audio && files.reference_audio[0]) {
      const file = files.reference_audio[0];
      const ext = path.extname(file.originalname) || '.wav';
      const origFilename = `preset_original_${Date.now()}${ext}`;
      const origFilepath = path.join(audioDir, origFilename);
      fs.writeFileSync(origFilepath, file.buffer);
      finalOriginalAudioPath = `/audio/${origFilename}`;
    }

    const result = db.prepare(`
      INSERT INTO voice_presets (type, name, style_prompt, trial_audio_path, original_audio_path, design_prompt)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      type,
      name,
      style_prompt || '',
      finalTrialAudioPath,
      finalOriginalAudioPath,
      design_prompt || null
    );

    const preset = db.prepare('SELECT * FROM voice_presets WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ preset });
  } catch (error) {
    console.error('创建预设失败:', error);
    res.status(500).json({ error: error.message || '创建预设失败' });
  }
});

/**
 * DELETE /api/voice-presets/:id
 * 删除音色预设及其关联音频文件
 */
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: '无效的预设 ID' });
    }

    const preset = db.prepare('SELECT * FROM voice_presets WHERE id = ?').get(id);
    if (!preset) {
      return res.status(404).json({ error: '预设不存在' });
    }

    // 删除关联的音频文件
    if (preset.trial_audio_path) {
      cleanFile(path.join(__dirname, '../..', preset.trial_audio_path));
    }
    if (preset.original_audio_path) {
      cleanFile(path.join(__dirname, '../..', preset.original_audio_path));
    }

    db.prepare('DELETE FROM voice_presets WHERE id = ?').run(id);

    res.json({ message: '预设已删除', id });
  } catch (error) {
    console.error('删除预设失败:', error);
    res.status(500).json({ error: '删除预设失败' });
  }
});

module.exports = router;
