const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const aihot = require('../services/aihot');
const mimo = require('../services/mimo');
const db = require('../db');

// 确保音频目录存在
const audioDir = path.join(__dirname, '../../audio');
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
}

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
      take: Math.min(parseInt(take, 10) || 30, 100) // 限制最大值为 100
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
 * 生成 TTS 语音
 */
router.post('/generate', async (req, res) => {
  try {
    const { text, voice, voiceType, voiceDesign, voiceClone, stylePrompt, sourceItems } = req.body;

    if (!text) {
      return res.status(400).json({ error: '请提供口播稿内容' });
    }

    // 生成音频
    const audioBuffer = await mimo.generateSpeech({
      text,
      voice,
      voiceType,
      voiceDesign,
      voiceClone,
      stylePrompt
    });

    // 保存音频文件
    const filename = `broadcast_${Date.now()}.wav`;
    const filepath = path.join(audioDir, filename);
    fs.writeFileSync(filepath, audioBuffer);

    // 保存到数据库（包含 source_items）
    const result = db.prepare(`
      INSERT INTO broadcasts (title, content, audio_path, voice_type, voice_config, source_items, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      text.substring(0, 50) + '...',
      text,
      `/audio/${filename}`,
      voiceType || 'preset',
      JSON.stringify({ voice, voiceDesign, voiceClone, stylePrompt }),
      sourceItems ? JSON.stringify(sourceItems) : null,
      'generated'
    );

    const broadcast = db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(result.lastInsertRowid);

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

    const broadcasts = db.prepare(`
      SELECT * FROM broadcasts ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(limit, offset);

    const total = db.prepare('SELECT COUNT(*) as count FROM broadcasts').get().count;

    res.json({
      broadcasts,
      pagination: {
        page,
        limit,
        total
      }
    });
  } catch (error) {
    console.error('获取历史记录失败:', error);
    res.status(500).json({ error: '获取历史记录失败' });
  }
});

/**
 * GET /api/broadcast/:id
 * 获取单条播报详情
 */
router.get('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: '无效的播报 ID' });
    }

    const broadcast = db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(id);

    if (!broadcast) {
      return res.status(404).json({ error: '播报记录不存在' });
    }

    res.json({ broadcast });
  } catch (error) {
    console.error('获取播报详情失败:', error);
    res.status(500).json({ error: '获取播报详情失败' });
  }
});

/**
 * GET /api/broadcast/:id/audio
 * 获取播报音频文件
 */
router.get('/:id/audio', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: '无效的播报 ID' });
    }

    const broadcast = db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(id);

    if (!broadcast) {
      return res.status(404).json({ error: '播报记录不存在' });
    }

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
