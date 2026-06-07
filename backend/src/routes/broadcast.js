const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const aihot = require('../services/aihot');
const mimo = require('../services/mimo');
const audio = require('../services/audio');
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
 * 生成 TTS 语音（支持 whole 和 segmented 模式）
 */
router.post('/generate', async (req, res) => {
  try {
    const { text, voice, voiceType, voiceDesign, voiceClone, stylePrompt, sourceItems, mode } = req.body;

    if (!text) {
      return res.status(400).json({ error: '请提供口播稿内容' });
    }

    if (mode === 'segmented') {
      const result = db.prepare(`
        INSERT INTO broadcasts (title, content, voice_type, voice_config, source_items, status, mode)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        text.substring(0, 50) + '...',
        text,
        voiceType || 'preset',
        JSON.stringify({ voice, voiceDesign, voiceClone, stylePrompt }),
        sourceItems ? JSON.stringify(sourceItems) : null,
        'pending',
        'segmented'
      );

      const broadcast = db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(result.lastInsertRowid);
      return res.json({ broadcast });
    }

    // Original whole-script flow
    const audioBuffer = await mimo.generateSpeech({
      text,
      voice,
      voiceType,
      voiceDesign,
      voiceClone,
      stylePrompt
    });

    const filename = `broadcast_${Date.now()}.wav`;
    const filepath = path.join(audioDir, filename);
    fs.writeFileSync(filepath, audioBuffer);

    const result = db.prepare(`
      INSERT INTO broadcasts (title, content, audio_path, voice_type, voice_config, source_items, status, mode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      text.substring(0, 50) + '...',
      text,
      `/audio/${filename}`,
      voiceType || 'preset',
      JSON.stringify({ voice, voiceDesign, voiceClone, stylePrompt }),
      sourceItems ? JSON.stringify(sourceItems) : null,
      'generated',
      'whole'
    );

    const broadcast = db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(result.lastInsertRowid);

    // 清理旧的未保存记录，保留最近10条未保存的
    const unsavedCount = db.prepare('SELECT COUNT(*) as count FROM broadcasts WHERE saved = 0').get().count;
    if (unsavedCount > 10) {
      const toDelete = db.prepare(
        'SELECT id, audio_path FROM broadcasts WHERE saved = 0 ORDER BY created_at ASC LIMIT ?'
      ).all(unsavedCount - 10);

      const deleteStmt = db.prepare('DELETE FROM broadcasts WHERE id = ?');
      for (const item of toDelete) {
        deleteStmt.run(item.id);
        if (item.audio_path) {
          const fp = path.join(__dirname, '../..', item.audio_path);
          if (fs.existsSync(fp)) {
            fs.unlinkSync(fp);
          }
        }
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

// ============ Segment API ============

router.post('/:id/split', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: '无效的播报 ID' });
    }

    const broadcast = db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(id);
    if (!broadcast) {
      return res.status(404).json({ error: '播报记录不存在' });
    }

    // 若已有 segments，先删除旧的及其音频文件
    const oldSegments = db.prepare('SELECT * FROM segments WHERE broadcast_id = ?').all(id);
    for (const seg of oldSegments) {
      if (seg.audio_path) {
        const fp = path.join(__dirname, '../..', seg.audio_path);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      }
    }
    db.prepare('DELETE FROM segments WHERE broadcast_id = ?').run(id);

    // 调用 AI 切分
    const sentences = await mimo.splitScript(broadcast.content);

    // 创建 segment 记录
    const insertStmt = db.prepare(
      'INSERT INTO segments (broadcast_id, "index", text, status) VALUES (?, ?, ?, ?)'
    );
    const insertMany = db.transaction((items) => {
      for (const item of items) {
        insertStmt.run(item.broadcastId, item.index, item.text, 'pending');
      }
    });

    insertMany(sentences.map((text, index) => ({
      broadcastId: id,
      index,
      text
    })));

    // 更新广播 mode
    db.prepare("UPDATE broadcasts SET mode = 'segmented', audio_path = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);

    const segments = db.prepare('SELECT * FROM segments WHERE broadcast_id = ? ORDER BY "index"').all(id);
    res.json({ segments });
  } catch (error) {
    console.error('切分失败:', error);
    res.status(500).json({ error: error.message || '切分失败' });
  }
});

router.get('/:id/segments', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: '无效的播报 ID' });
    }

    const broadcast = db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(id);
    if (!broadcast) {
      return res.status(404).json({ error: '播报记录不存在' });
    }

    const segments = db.prepare('SELECT * FROM segments WHERE broadcast_id = ? ORDER BY "index"').all(id);
    res.json({ segments });
  } catch (error) {
    console.error('获取 segments 失败:', error);
    res.status(500).json({ error: '获取 segments 失败' });
  }
});

router.put('/:id/segments/:segId', (req, res) => {
  try {
    const segId = parseInt(req.params.segId, 10);
    const { text } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: '请提供有效的文本内容' });
    }

    const segment = db.prepare('SELECT * FROM segments WHERE id = ?').get(segId);
    if (!segment) {
      return res.status(404).json({ error: '句子不存在' });
    }

    if (segment.audio_path) {
      const fp = path.join(__dirname, '../..', segment.audio_path);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }

    db.prepare(
      "UPDATE segments SET text = ?, status = 'pending', audio_path = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(text.trim(), segId);

    const updated = db.prepare('SELECT * FROM segments WHERE id = ?').get(segId);
    res.json({ segment: updated });
  } catch (error) {
    console.error('编辑句子失败:', error);
    res.status(500).json({ error: '编辑句子失败' });
  }
});

router.post('/:id/segments/:segId/regenerate', async (req, res) => {
  try {
    const broadcastId = parseInt(req.params.id, 10);
    const segId = parseInt(req.params.segId, 10);

    const segment = db.prepare('SELECT * FROM segments WHERE id = ? AND broadcast_id = ?').get(segId, broadcastId);
    if (!segment) {
      return res.status(404).json({ error: '句子不存在' });
    }

    const broadcast = db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(broadcastId);
    const voiceConfig = JSON.parse(broadcast.voice_config || '{}');

    db.prepare("UPDATE segments SET status = 'generating', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(segId);

    try {
      const audioBuffer = await mimo.generateSpeech({
        text: segment.text,
        voice: voiceConfig.voice,
        voiceType: broadcast.voice_type,
        voiceDesign: voiceConfig.voiceDesign,
        voiceClone: voiceConfig.voiceClone,
        stylePrompt: voiceConfig.stylePrompt
      });

      const filename = `segment_${broadcastId}_${segment.index}.wav`;
      const filepath = path.join(audioDir, filename);
      fs.writeFileSync(filepath, audioBuffer);

      db.prepare(
        "UPDATE segments SET audio_path = ?, status = 'generated', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).run(`/audio/${filename}`, segId);
    } catch (ttsError) {
      db.prepare("UPDATE segments SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(segId);
      return res.status(500).json({ error: '语音生成失败: ' + ttsError.message });
    }

    const updated = db.prepare('SELECT * FROM segments WHERE id = ?').get(segId);
    res.json({ segment: updated });
  } catch (error) {
    console.error('重新生成失败:', error);
    res.status(500).json({ error: '重新生成失败' });
  }
});

router.post('/:id/segments/batch-generate', async (req, res) => {
  try {
    const broadcastId = parseInt(req.params.id, 10);
    const broadcast = db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(broadcastId);
    if (!broadcast) {
      return res.status(404).json({ error: '播报记录不存在' });
    }

    const voiceConfig = JSON.parse(broadcast.voice_config || '{}');
    const pendingSegments = db.prepare(
      "SELECT * FROM segments WHERE broadcast_id = ? AND status IN ('pending', 'failed') ORDER BY \"index\""
    ).all(broadcastId);

    const results = [];
    for (const segment of pendingSegments) {
      db.prepare("UPDATE segments SET status = 'generating', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(segment.id);

      try {
        const audioBuffer = await mimo.generateSpeech({
          text: segment.text,
          voice: voiceConfig.voice,
          voiceType: broadcast.voice_type,
          voiceDesign: voiceConfig.voiceDesign,
          voiceClone: voiceConfig.voiceClone,
          stylePrompt: voiceConfig.stylePrompt
        });

        const filename = `segment_${broadcastId}_${segment.index}.wav`;
        const filepath = path.join(audioDir, filename);
        fs.writeFileSync(filepath, audioBuffer);

        db.prepare(
          "UPDATE segments SET audio_path = ?, status = 'generated', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).run(`/audio/${filename}`, segment.id);

        results.push({ id: segment.id, status: 'generated' });
      } catch (ttsError) {
        db.prepare("UPDATE segments SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(segment.id);
        results.push({ id: segment.id, status: 'failed', error: ttsError.message });
      }
    }

    const segments = db.prepare('SELECT * FROM segments WHERE broadcast_id = ? ORDER BY "index"').all(broadcastId);
    res.json({ segments, results });
  } catch (error) {
    console.error('批量生成失败:', error);
    res.status(500).json({ error: '批量生成失败' });
  }
});

router.post('/:id/segments/merge', (req, res) => {
  try {
    const broadcastId = parseInt(req.params.id, 10);
    const broadcast = db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(broadcastId);
    if (!broadcast) {
      return res.status(404).json({ error: '播报记录不存在' });
    }

    const segments = db.prepare('SELECT * FROM segments WHERE broadcast_id = ? ORDER BY "index"').all(broadcastId);

    if (segments.length === 0) {
      return res.status(400).json({ error: '没有可合并的句子' });
    }

    const notGenerated = segments.filter(s => s.status !== 'generated');
    if (notGenerated.length > 0) {
      return res.status(400).json({
        error: `还有 ${notGenerated.length} 个句子未生成音频，请先完成所有句子的生成`
      });
    }

    const audioPaths = segments.map(s => path.join(__dirname, '../..', s.audio_path));
    const mergedBuffer = audio.mergeWavFiles(audioPaths);

    if (broadcast.audio_path) {
      const oldPath = path.join(__dirname, '../..', broadcast.audio_path);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const filename = `broadcast_${broadcastId}_merged.wav`;
    const filepath = path.join(audioDir, filename);
    fs.writeFileSync(filepath, mergedBuffer);

    db.prepare(
      "UPDATE broadcasts SET audio_path = ?, status = 'generated', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(`/audio/${filename}`, broadcastId);

    const updated = db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(broadcastId);
    res.json({ broadcast: updated });
  } catch (error) {
    console.error('合并失败:', error);
    res.status(500).json({ error: error.message || '合并失败' });
  }
});

router.delete('/:id/segments/:segId', (req, res) => {
  try {
    const broadcastId = parseInt(req.params.id, 10);
    const segId = parseInt(req.params.segId, 10);

    const segment = db.prepare('SELECT * FROM segments WHERE id = ? AND broadcast_id = ?').get(segId, broadcastId);
    if (!segment) {
      return res.status(404).json({ error: '句子不存在' });
    }

    if (segment.audio_path) {
      const fp = path.join(__dirname, '../..', segment.audio_path);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }

    const deletedIndex = segment.index;
    db.prepare('DELETE FROM segments WHERE id = ?').run(segId);

    const laterSegments = db.prepare(
      'SELECT * FROM segments WHERE broadcast_id = ? AND "index" > ? ORDER BY "index"'
    ).all(broadcastId, deletedIndex);

    for (const seg of laterSegments) {
      const newIndex = seg.index - 1;

      if (seg.audio_path) {
        const oldPath = path.join(__dirname, '../..', seg.audio_path);
        const newFilename = `segment_${broadcastId}_${newIndex}.wav`;
        const newPath = path.join(audioDir, newFilename);
        if (fs.existsSync(oldPath)) {
          fs.renameSync(oldPath, newPath);
        }
        db.prepare(
          'UPDATE segments SET "index" = ?, audio_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).run(newIndex, `/audio/${newFilename}`, seg.id);
      } else {
        db.prepare(
          'UPDATE segments SET "index" = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).run(newIndex, seg.id);
      }
    }

    const segments = db.prepare('SELECT * FROM segments WHERE broadcast_id = ? ORDER BY "index"').all(broadcastId);
    res.json({ segments });
  } catch (error) {
    console.error('删除句子失败:', error);
    res.status(500).json({ error: '删除句子失败' });
  }
});

router.post('/:id/segments/reorder', (req, res) => {
  try {
    const broadcastId = parseInt(req.params.id, 10);
    const { segmentIds } = req.body;

    if (!Array.isArray(segmentIds)) {
      return res.status(400).json({ error: '请提供 segmentIds 数组' });
    }

    const updateStmt = db.prepare(
      'UPDATE segments SET "index" = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND broadcast_id = ?'
    );

    const reorder = db.transaction((ids) => {
      for (let i = 0; i < ids.length; i++) {
        updateStmt.run(i, ids[i], broadcastId);
      }
    });

    reorder(segmentIds);

    const segments = db.prepare('SELECT * FROM segments WHERE broadcast_id = ? ORDER BY "index"').all(broadcastId);
    res.json({ segments });
  } catch (error) {
    console.error('重排序失败:', error);
    res.status(500).json({ error: '重排序失败' });
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
 * POST /api/broadcast/:id/save
 * 保存/取消保存播报（标记为永久保存）
 */
router.post('/:id/save', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: '无效的播报 ID' });
    }

    const broadcast = db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(id);
    if (!broadcast) {
      return res.status(404).json({ error: '播报记录不存在' });
    }

    const newSaved = broadcast.saved ? 0 : 1;

    // 如果是保存操作，检查上限（最多50条已保存）
    if (newSaved === 1) {
      const savedCount = db.prepare('SELECT COUNT(*) as count FROM broadcasts WHERE saved = 1').get().count;
      if (savedCount >= 50) {
        // 删除最旧的已保存记录（保留最新的49条）
        const oldest = db.prepare(
          'SELECT id, audio_path FROM broadcasts WHERE saved = 1 ORDER BY created_at ASC LIMIT ?'
        ).all(savedCount - 49);

        const deleteStmt = db.prepare('DELETE FROM broadcasts WHERE id = ?');
        for (const item of oldest) {
          deleteStmt.run(item.id);
          // 删除对应的音频文件
          if (item.audio_path) {
            const filepath = path.join(__dirname, '../..', item.audio_path);
            if (fs.existsSync(filepath)) {
              fs.unlinkSync(filepath);
            }
          }
          // 清理关联的 segment 音频文件
          const segs = db.prepare('SELECT audio_path FROM segments WHERE broadcast_id = ?').all(item.id);
          for (const seg of segs) {
            if (seg.audio_path) {
              const segFp = path.join(__dirname, '../..', seg.audio_path);
              if (fs.existsSync(segFp)) fs.unlinkSync(segFp);
            }
          }
        }
      }
    }

    db.prepare('UPDATE broadcasts SET saved = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newSaved, id);

    const updated = db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(id);
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
