// 播报路由
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const aihot = require('../services/aihot');
const db = require('../db');
const broadcastStore = require('../services/broadcastStore');
const segmentStore = require('../services/segmentStore');
const { validateId, cleanAudioFile, audioDir } = require('../utils/validation');

/**
 * GET /api/broadcast/today
 * 获取今日 AI HOT 精选资讯
 */
router.get('/today', async (req, res) => {
  try {
    const { category, take = 30 } = req.query;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const items = await aihot.getSelectedItems({
      category,
      since,
      take: Math.min(parseInt(take, 10) || 30, 100)
    });

    res.json({ items });
  } catch (error) {
    console.error('获取资讯失败:', error);
    res.status(500).json({ error: '获取资讯失败' });
  }
});

/**
 * POST /api/broadcast/rewrite
 * 将资讯改写成口播稿
 */
router.post('/rewrite', async (req, res) => {
  try {
    const { items, opening, closing } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: '请提供资讯列表' });
    }

    // 获取默认开场白和结束语
    const defaultOpening = db.prepare('SELECT value FROM settings WHERE key = ?').get('opening_script');
    const defaultClosing = db.prepare('SELECT value FROM settings WHERE key = ?').get('closing_script');

    const mimo = require('../services/mimo');
    const script = await mimo.rewriteToScript({
      items,
      opening: opening || JSON.parse(defaultOpening?.value || '""'),
      closing: closing || JSON.parse(defaultClosing?.value || '""')
    });

    res.json({ script });
  } catch (error) {
    console.error('改写失败:', error);
    res.status(500).json({ error: error.message || '改写失败' });
  }
});

/**
 * POST /api/broadcast/generate
 * 生成 TTS 语音（支持 whole 和 segmented 模式）
 */
router.post('/generate', async (req, res) => {
  try {
    const { text, voice, voiceType, voiceDesign, voiceClone, stylePrompt, speed, emotion, pitch, sourceItems, mode } = req.body;

    if (!text) {
      return res.status(400).json({ error: '请提供口播稿内容' });
    }

    if (mode === 'segmented') {
      const broadcast = broadcastStore.create({
        title: text.substring(0, 50) + '...',
        content: text,
        voiceType: voiceType || 'preset',
        voiceConfig: { voice, voiceDesign, voiceClone, stylePrompt, speed, emotion, pitch },
        sourceItems,
        status: 'pending',
        mode: 'segmented'
      });
      return res.json({ broadcast });
    }

    // 整篇生成
    const tts = require('../services/tts');
    const audioBuffer = await tts.generateSpeech({
      text,
      voice,
      voiceType,
      voiceDesign,
      voiceClone,
      stylePrompt,
      speed,
      emotion,
      pitch
    });

    const filename = `broadcast_${Date.now()}.wav`;
    const filepath = path.join(audioDir, filename);
    fs.writeFileSync(filepath, audioBuffer);

    const broadcast = broadcastStore.create({
      title: text.substring(0, 50) + '...',
      content: text,
      audioPath: `/audio/${filename}`,
      voiceType: voiceType || 'preset',
      voiceConfig: { voice, voiceDesign, voiceClone, stylePrompt, speed, emotion, pitch },
      sourceItems,
      status: 'generated',
      mode: 'whole'
    });

    // 清理旧的未保存记录，保留最近10条
    const unsavedCount = broadcastStore.countUnsaved();
    if (unsavedCount > 10) {
      const toDelete = broadcastStore.getOldestUnsaved(unsavedCount - 10);
      for (const item of toDelete) {
        broadcastStore.deleteById(item.id);
        cleanAudioFile(item.audio_path);
      }
    }

    res.json({
      broadcast,
      audioUrl: `/audio/${filename}`
    });
  } catch (error) {
    console.error('生成语音失败:', error);
    res.status(500).json({ error: error.message || '生成语音失败' });
  }
});

/**
 * GET /api/broadcast/history
 * 获取历史播报列表
 */
router.get('/history', (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const offset = (page - 1) * limit;

    const broadcasts = broadcastStore.getHistory({ limit, offset });
    const total = broadcastStore.countAll();

    res.json({
      broadcasts,
      pagination: { page, limit, total }
    });
  } catch (error) {
    console.error('获取历史记录失败:', error);
    res.status(500).json({ error: '获取历史记录失败' });
  }
});

/**
 * POST /api/broadcast/batch-delete
 * 批量删除播报记录
 */
router.post('/batch-delete', (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: '请提供要删除的记录 ID 列表' });
    }

    // 获取要删除的记录，用于清理音频文件
    const records = [];
    for (const id of ids) {
      const record = broadcastStore.getById(id);
      if (record) {
        records.push(record);
      }
    }

    // 清理音频文件
    for (const record of records) {
      if (record.audio_path) {
        cleanAudioFile(record.audio_path);
      }
      // 清理关联的 segment 音频文件
      const segments = segmentStore.getByBroadcastId(record.id);
      for (const seg of segments) {
        if (seg.audio_path) {
          cleanAudioFile(seg.audio_path);
        }
      }
    }

    // 批量删除数据库记录（含级联删除 segments）
    const result = broadcastStore.batchDeleteByIds(ids);

    res.json(result);
  } catch (error) {
    console.error('批量删除失败:', error);
    res.status(500).json({ error: '批量删除失败' });
  }
});

/**
 * GET /api/broadcast/:id
 * 获取单条播报详情
 */
router.get('/:id', (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '播报 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });

    const broadcast = broadcastStore.getById(idCheck.id);
    if (!broadcast) return res.status(404).json({ error: '播报记录不存在' });

    res.json({ broadcast });
  } catch (error) {
    console.error('获取播报详情失败:', error);
    res.status(500).json({ error: '获取播报详情失败' });
  }
});

/**
 * PATCH /api/broadcast/:id/voice-config
 * 更新播报的音色配置
 */
router.patch('/:id/voice-config', (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '播报 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });

    const { voiceType, voice, voiceDesign, voiceClone, stylePrompt, speed, emotion, pitch } = req.body;
    const voiceConfig = JSON.stringify({ voice, voiceDesign, voiceClone, stylePrompt, speed, emotion, pitch });

    broadcastStore.updateVoiceConfig(idCheck.id, { voiceType, voiceConfig });

    const broadcast = broadcastStore.getById(idCheck.id);
    res.json({ broadcast });
  } catch (error) {
    console.error('更新音色配置失败:', error);
    res.status(500).json({ error: '更新音色配置失败' });
  }
});

/**
 * POST /api/broadcast/:id/save
 * 保存/取消保存播报
 */
router.post('/:id/save', (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '播报 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });

    const broadcast = broadcastStore.getById(idCheck.id);
    if (!broadcast) return res.status(404).json({ error: '播报记录不存在' });

    const result = broadcastStore.toggleSaved(idCheck.id);
    const { newSaved } = result;

    // 如果是保存操作，检查上限（最多50条已保存）
    if (newSaved === 1) {
      const savedCount = broadcastStore.countSaved();
      if (savedCount >= 50) {
        const oldest = broadcastStore.getOldestSaved(savedCount - 49);
        for (const item of oldest) {
          broadcastStore.deleteById(item.id);
          cleanAudioFile(item.audio_path);
          // 清理关联的 segment 音频文件
          const segs = segmentStore.getByBroadcastId(item.id);
          for (const seg of segs) {
            cleanAudioFile(seg.audio_path);
          }
        }
      }
    }

    const updated = broadcastStore.getById(idCheck.id);
    res.json({ broadcast: updated });
  } catch (error) {
    console.error('保存播报失败:', error);
    res.status(500).json({ error: '保存播报失败' });
  }
});

/**
 * GET /api/broadcast/:id/audio
 * 获取播报音频文件
 */
router.get('/:id/audio', (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '播报 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });

    const broadcast = broadcastStore.getById(idCheck.id);
    if (!broadcast) return res.status(404).json({ error: '播报记录不存在' });

    if (!broadcast.audio_path) {
      return res.status(404).json({ error: '音频文件不存在' });
    }

    const filepath = path.join(__dirname, '../..', broadcast.audio_path);
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: '音频文件不存在' });
    }

    res.sendFile(filepath);
  } catch (error) {
    console.error('获取音频失败:', error);
    res.status(500).json({ error: '获取音频失败' });
  }
});

module.exports = router;
