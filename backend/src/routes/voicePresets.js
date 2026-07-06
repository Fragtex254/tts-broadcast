const express = require('express');
const router = express.Router();
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const tts = require('../services/tts');
const mimo = require('../services/mimo');
const voicePresetStore = require('../services/voicePresetStore');
const audioAsset = require('../services/audioAsset');
const ttsQueue = require('../services/ttsQueue');
const { createScopedLogger } = require('../services/logger');
const { validateId, cleanAudioFile, cleanAssetFile, audioDir } = require('../utils/validation');

const logger = createScopedLogger('voice-presets-route');
const SUPPORTED_CHARACTER_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

// multer：内存存储，音频和立绘上传共用 10MB 上限
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

function isSupportedCharacterImage(file) {
  return file && SUPPORTED_CHARACTER_IMAGE_TYPES.has(file.mimetype);
}

function parseBooleanField(value) {
  return value === true || value === 'true' || value === '1' || value === 1;
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
          cleanAudioFile(tmpIn);
          cleanAudioFile(tmpOut);
          reject(new Error(`ffmpeg 转换失败: ${err.message}`));
        })
        .on('end', () => {
          try {
            const wavBuffer = fs.readFileSync(tmpOut);
            resolve(`data:audio/wav;base64,${wavBuffer.toString('base64')}`);
          } catch (readErr) {
            reject(readErr);
          } finally {
            cleanAudioFile(tmpIn);
            cleanAudioFile(tmpOut);
          }
        })
        .save(tmpOut);
    }
  });
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
    const speechParams = {
      text,
      voiceType: 'clone',
      voiceClone,
      stylePrompt
    };
    const audioBuffer = await ttsQueue.enqueueTts(speechParams, () => tts.generateSpeech(speechParams));

    const audioUrl = audioAsset.writeTrialAudio('clone', audioBuffer);

    // 清理旧的试听文件
    audioAsset.cleanupOldTrials('preset_trial_clone_');

    res.json({ audioUrl });
  } catch (error) {
    logger.error({ err: error }, '克隆试听失败');
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
 *   - optimize_text_preview: 是否允许 MiMo 优化/扩写试听文本（可选，默认 false）
 */
router.post('/trial/design', async (req, res) => {
  try {
    const { design_prompt, trial_text, style_prompt, optimize_text_preview } = req.body;

    if (!design_prompt) {
      return res.status(400).json({ error: '请提供音色描述 (design_prompt)' });
    }

    const text = trial_text || '你好，我是你的专属语音助手。';

    const speechParams = {
      text,
      voiceType: 'design',
      voiceDesign: design_prompt,
      stylePrompt: style_prompt || '',
      optimizeTextPreview: optimize_text_preview === true
    };
    const audioBuffer = await ttsQueue.enqueueTts(speechParams, () => tts.generateSpeech(speechParams));

    const audioUrl = audioAsset.writeTrialAudio('design', audioBuffer);

    audioAsset.cleanupOldTrials('preset_trial_design_');

    res.json({ audioUrl });
  } catch (error) {
    logger.error({ err: error }, '设计试听失败');
    res.status(500).json({ error: error.message || '设计试听失败' });
  }
});

/**
 * POST /api/voice-presets/infer-design-from-image
 * 上传角色立绘，反推适合 voicedesign 的音色描述
 *
 * Body (multipart/form-data):
 *   - character_image: PNG/JPG/WebP 角色立绘（必填，10MB 内）
 */
router.post('/infer-design-from-image', upload.single('character_image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传角色立绘图片' });
    }
    if (!isSupportedCharacterImage(req.file)) {
      return res.status(400).json({ error: '仅支持 PNG、JPG 或 WebP 角色立绘' });
    }

    const result = await mimo.inferVoiceDesignFromImage({
      imageBuffer: req.file.buffer,
      mimeType: req.file.mimetype,
    });
    res.json(result);
  } catch (error) {
    logger.error({ err: error }, '角色立绘反推音色失败');
    res.status(500).json({ error: error.message || '角色立绘反推音色失败' });
  }
});

/**
 * POST /api/voice-presets/suggest-trial-text-tags
 * 为试听文本建议 MiMo 风格标签和音频标签
 *
 * Body (JSON):
 *   - text: 试听文本（必填）
 *   - voice_design: 音色设计描述（可选）
 *   - style_prompt: 风格提示（可选）
 */
router.post('/suggest-trial-text-tags', async (req, res) => {
  try {
    const { text, voice_design, style_prompt } = req.body;
    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: '请提供试听文本' });
    }

    const result = await mimo.suggestTrialTextTags({
      text,
      voiceDesign: voice_design || '',
      stylePrompt: style_prompt || '',
    });
    res.json(result);
  } catch (error) {
    logger.error({ err: error }, '试听文本标签建议失败');
    res.status(500).json({ error: error.message || '试听文本标签建议失败' });
  }
});

// ==================== CRUD ====================

/**
 * GET /api/voice-presets
 * 查询所有音色预设，按创建时间倒序
 */
router.get('/', (req, res) => {
  try {
    const presets = voicePresetStore.getAll();
    res.json({ presets });
  } catch (error) {
    logger.error({ err: error }, '查询预设失败');
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
 *   - character_image: 角色立绘图片（可选，仅 design 类型保存）
 *   - use_trial_audio_as_clone: 'true' 时设计预设使用试听音频走 voiceclone（需有试听音频）
 *
 * 上限：20 个预设
 */
const createUpload = upload.fields([
  { name: 'trial_audio', maxCount: 1 },
  { name: 'reference_audio', maxCount: 1 },
  { name: 'character_image', maxCount: 1 }
]);

router.post('/', createUpload, (req, res) => {
  let createdPresetId = null;
  let writtenCharacterImagePath = null;
  try {
    const { type, name, style_prompt, design_prompt, trial_audio_path, use_trial_audio_as_clone } = req.body;

    if (!type || !['clone', 'design'].includes(type)) {
      return res.status(400).json({ error: 'type 必须为 clone 或 design' });
    }
    if (!name || !name.trim()) {
      return res.status(400).json({ error: '请提供预设名称' });
    }
    if (type === 'design' && !design_prompt) {
      return res.status(400).json({ error: '设计类型预设必须提供 design_prompt' });
    }

    // 检查上限（20个）
    const count = voicePresetStore.countAll();
    if (count >= 20) {
      return res.status(400).json({ error: '预设数量已达上限（20个），请删除不需要的预设' });
    }

    const files = req.files || {};
    if (files.character_image && files.character_image[0] && !isSupportedCharacterImage(files.character_image[0])) {
      return res.status(400).json({ error: '仅支持 PNG、JPG 或 WebP 角色立绘' });
    }
    const shouldUseTrialAudioAsClone = type === 'design' && parseBooleanField(use_trial_audio_as_clone);
    if (shouldUseTrialAudioAsClone && !trial_audio_path && !(files.trial_audio && files.trial_audio[0])) {
      return res.status(400).json({ error: '启用试听音频克隆时必须先保存试听音频' });
    }

    const preset = voicePresetStore.create({
      type,
      name: name.trim(),
      stylePrompt: style_prompt || '',
      trialAudioPath: trial_audio_path || null,
      originalAudioPath: null,
      designPrompt: design_prompt || null,
      characterImagePath: null,
      useTrialAudioAsClone: false
    });
    createdPresetId = preset.id;

    let finalTrialAudioPath = preset.trial_audio_path;
    let finalOriginalAudioPath = preset.original_audio_path;
    let finalCharacterImagePath = preset.character_image_path;

    // 试听音频：优先使用上传的文件
    if (files.trial_audio && files.trial_audio[0]) {
      const file = files.trial_audio[0];
      finalTrialAudioPath = audioAsset.writePresetUpload({
        presetId: preset.id,
        file,
        kind: 'trial'
      });
    }

    // 参考音频（克隆预设的原始音频）
    if (files.reference_audio && files.reference_audio[0]) {
      const file = files.reference_audio[0];
      finalOriginalAudioPath = audioAsset.writePresetUpload({
        presetId: preset.id,
        file,
        kind: 'original'
      });
    }

    if (type === 'design' && files.character_image && files.character_image[0]) {
      const file = files.character_image[0];
      finalCharacterImagePath = audioAsset.writePresetCharacterImage({
        presetId: preset.id,
        file
      });
      writtenCharacterImagePath = finalCharacterImagePath;
    }

    const updatedPreset = voicePresetStore.updateAudioPaths(preset.id, {
      trialAudioPath: finalTrialAudioPath,
      originalAudioPath: finalOriginalAudioPath,
      characterImagePath: finalCharacterImagePath,
      useTrialAudioAsClone: shouldUseTrialAudioAsClone
    });
    writtenCharacterImagePath = null;

    res.status(201).json({ preset: updatedPreset });
  } catch (error) {
    if (writtenCharacterImagePath) {
      cleanAssetFile(writtenCharacterImagePath);
    }
    if (createdPresetId) {
      voicePresetStore.deleteById(createdPresetId);
    }
    logger.error({ err: error }, '创建预设失败');
    res.status(500).json({ error: error.message || '创建预设失败' });
  }
});

/**
 * PUT /api/voice-presets/:id
 * 更新音色预设（multipart/form-data）
 *
 * Fields:
 *   - name: 预设名称（必填）
 *   - style_prompt: 风格提示（可选）
 *   - design_prompt: 音色描述，design 类型必填
 *   - trial_audio_path: 试听音频路径（可选，来自试听接口返回的 URL）
 *   - trial_audio: 试听音频文件（可选）
 *   - reference_audio: 参考音频文件（可选，仅 clone 类型）
 *   - character_image: 角色立绘图片（可选，仅 design 类型）
 *   - remove_character_image: 'true' 时移除已保存角色立绘
 *   - use_trial_audio_as_clone: 'true' 时设计预设使用试听音频走 voiceclone（需有试听音频）
 */
router.put('/:id', createUpload, (req, res) => {
  let writtenCharacterImagePath = null;
  try {
    const idCheck = validateId(req.params.id, '预设 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });

    const preset = voicePresetStore.getById(idCheck.id);
    if (!preset) {
      return res.status(404).json({ error: '预设不存在' });
    }

    const { name, style_prompt, design_prompt, trial_audio_path, remove_character_image, use_trial_audio_as_clone } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: '请提供预设名称' });
    }
    if (preset.type === 'design' && !design_prompt) {
      return res.status(400).json({ error: '设计类型预设必须提供 design_prompt' });
    }

    const files = req.files || {};
    if (files.character_image && files.character_image[0] && !isSupportedCharacterImage(files.character_image[0])) {
      return res.status(400).json({ error: '仅支持 PNG、JPG 或 WebP 角色立绘' });
    }

    let finalTrialAudioPath = trial_audio_path || preset.trial_audio_path;
    let finalOriginalAudioPath = preset.original_audio_path;
    let finalCharacterImagePath = preset.character_image_path;

    if (files.trial_audio && files.trial_audio[0]) {
      finalTrialAudioPath = audioAsset.writePresetUpload({
        presetId: preset.id,
        file: files.trial_audio[0],
        kind: 'trial'
      });
    }

    if (preset.type === 'clone' && files.reference_audio && files.reference_audio[0]) {
      finalOriginalAudioPath = audioAsset.writePresetUpload({
        presetId: preset.id,
        file: files.reference_audio[0],
        kind: 'original'
      });
    }

    if (preset.type === 'design' && remove_character_image === 'true') {
      finalCharacterImagePath = null;
    }

    const nextUseTrialAudioAsClone = preset.type === 'design'
      ? (use_trial_audio_as_clone === undefined
        ? Boolean(preset.use_trial_audio_as_clone)
        : parseBooleanField(use_trial_audio_as_clone))
      : false;
    if (nextUseTrialAudioAsClone && !finalTrialAudioPath) {
      return res.status(400).json({ error: '启用试听音频克隆时必须先保存试听音频' });
    }

    if (preset.type === 'design' && files.character_image && files.character_image[0]) {
      finalCharacterImagePath = audioAsset.writePresetCharacterImage({
        presetId: preset.id,
        file: files.character_image[0]
      });
      writtenCharacterImagePath = finalCharacterImagePath;
    }

    const updatedPreset = voicePresetStore.update(preset.id, {
      name: name.trim(),
      stylePrompt: style_prompt || '',
      designPrompt: preset.type === 'design' ? design_prompt : null,
      trialAudioPath: finalTrialAudioPath,
      originalAudioPath: finalOriginalAudioPath,
      characterImagePath: preset.type === 'design' ? finalCharacterImagePath : null,
      useTrialAudioAsClone: nextUseTrialAudioAsClone
    });
    writtenCharacterImagePath = null;

    if (preset.trial_audio_path && preset.trial_audio_path !== updatedPreset.trial_audio_path) {
      cleanAudioFile(preset.trial_audio_path);
    }
    if (preset.original_audio_path && preset.original_audio_path !== updatedPreset.original_audio_path) {
      cleanAudioFile(preset.original_audio_path);
    }
    if (preset.character_image_path && preset.character_image_path !== updatedPreset.character_image_path) {
      cleanAssetFile(preset.character_image_path);
    }

    res.json({ preset: updatedPreset });
  } catch (error) {
    if (writtenCharacterImagePath) {
      cleanAssetFile(writtenCharacterImagePath);
    }
    logger.error({
      err: error,
      hasPresetId: Boolean(req.params.id),
      presetIdParamLength: typeof req.params.id === 'string' ? req.params.id.length : undefined,
    }, '更新预设失败');
    res.status(500).json({ error: error.message || '更新预设失败' });
  }
});

/**
 * DELETE /api/voice-presets/:id
 * 删除音色预设及其关联音频文件
 */
router.delete('/:id', (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '预设 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });

    const preset = voicePresetStore.getById(idCheck.id);
    if (!preset) {
      return res.status(404).json({ error: '预设不存在' });
    }

    // 删除关联的音频文件
    if (preset.trial_audio_path) {
      cleanAudioFile(preset.trial_audio_path);
    }
    if (preset.original_audio_path) {
      cleanAudioFile(preset.original_audio_path);
    }
    if (preset.character_image_path) {
      cleanAssetFile(preset.character_image_path);
    }

    voicePresetStore.deleteById(idCheck.id);

    res.json({ message: '预设已删除', id: idCheck.id });
  } catch (error) {
    logger.error({
      err: error,
      hasPresetId: Boolean(req.params.id),
      presetIdParamLength: typeof req.params.id === 'string' ? req.params.id.length : undefined,
    }, '删除预设失败');
    res.status(500).json({ error: '删除预设失败' });
  }
});

module.exports = router;
