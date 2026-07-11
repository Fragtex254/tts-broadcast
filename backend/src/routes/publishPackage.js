const express = require('express');
const broadcastStore = require('../services/broadcastStore');
const segmentStore = require('../services/segmentStore');
const mimo = require('../services/mimo');
const publishPackage = require('../services/publishPackage');
const { createScopedLogger } = require('../services/logger');
const { validateId } = require('../utils/validation');

const router = express.Router();
const logger = createScopedLogger('publish-package-route');

function parseTemplateSnapshot(value) {
  try {
    return JSON.parse(value || '{}');
  } catch {
    return {};
  }
}

function normalizeMetadata(body) {
  if (!body || typeof body.primaryTitle !== 'string' || body.primaryTitle.trim().length === 0) {
    return { error: '请提供主标题' };
  }
  if (typeof body.summary !== 'string' || typeof body.publishCopy !== 'string') {
    return { error: '内容简介和发布文案必须是文本' };
  }
  if (!Array.isArray(body.alternativeTitles) || !body.alternativeTitles.every((item) => typeof item === 'string')) {
    return { error: '备选标题格式无效' };
  }
  if (!Array.isArray(body.tags) || !body.tags.every((item) => typeof item === 'string')) {
    return { error: '标签格式无效' };
  }
  return {
    metadata: {
      primaryTitle: body.primaryTitle.trim().slice(0, 100),
      alternativeTitles: body.alternativeTitles.map((item) => item.trim()).filter(Boolean).slice(0, 8),
      summary: body.summary.trim().slice(0, 1000),
      publishCopy: body.publishCopy.trim().slice(0, 5000),
      tags: body.tags.map((item) => item.replace(/^#+/, '').trim()).filter(Boolean).slice(0, 20),
    }
  };
}

/** POST /api/broadcast/:id/publish-metadata/generate - 生成发布信息 */
router.post('/:id/publish-metadata/generate', async (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '播报 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });
    const broadcast = broadcastStore.getById(idCheck.id);
    if (!broadcast) return res.status(404).json({ error: '播报记录不存在' });

    const metadata = await mimo.generatePublishMetadata({
      title: broadcast.title,
      content: broadcast.content,
      template: parseTemplateSnapshot(broadcast.template_snapshot),
    });
    const updated = broadcastStore.updatePublishMetadata(idCheck.id, metadata);
    res.json({ metadata, broadcast: updated });
  } catch (error) {
    logger.error({ err: error, hasBroadcastId: Boolean(req.params.id) }, '生成发布信息失败');
    res.status(500).json({ error: error.message || '生成发布信息失败' });
  }
});

/** PUT /api/broadcast/:id/publish-metadata - 保存编辑后的发布信息 */
router.put('/:id/publish-metadata', (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '播报 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });
    if (!broadcastStore.getById(idCheck.id)) return res.status(404).json({ error: '播报记录不存在' });
    const normalized = normalizeMetadata(req.body);
    if (normalized.error) return res.status(400).json({ error: normalized.error });
    const broadcast = broadcastStore.updatePublishMetadata(idCheck.id, normalized.metadata);
    res.json({ metadata: normalized.metadata, broadcast });
  } catch (error) {
    logger.error({ err: error, hasBroadcastId: Boolean(req.params.id) }, '保存发布信息失败');
    res.status(500).json({ error: '保存发布信息失败' });
  }
});

/** GET /api/broadcast/:id/publish-package - 获取发布包文本资产 */
router.get('/:id/publish-package', (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '播报 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });
    const broadcast = broadcastStore.getById(idCheck.id);
    if (!broadcast) return res.status(404).json({ error: '播报记录不存在' });
    const segments = segmentStore.getByBroadcastId(idCheck.id);
    const publishPackageData = publishPackage.buildPublishAssets({ broadcast, segments });
    res.json({ publishPackage: publishPackageData });
  } catch (error) {
    logger.error({ err: error, hasBroadcastId: Boolean(req.params.id) }, '获取发布包失败');
    res.status(500).json({ error: error.message || '获取发布包失败' });
  }
});

/** GET /api/broadcast/:id/publish-audio - 下载发布版 MP3 */
router.get('/:id/publish-audio', async (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '播报 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });
    const broadcast = broadcastStore.getById(idCheck.id);
    if (!broadcast) return res.status(404).json({ error: '播报记录不存在' });
    const segments = segmentStore.getByBroadcastId(idCheck.id);
    const buffer = await publishPackage.buildPublishAudio({ broadcast, segments });
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', 'attachment; filename="publish-audio.mp3"');
    res.send(buffer);
  } catch (error) {
    logger.error({ err: error, hasBroadcastId: Boolean(req.params.id) }, '生成发布音频失败');
    res.status(500).json({ error: error.message || '生成发布音频失败' });
  }
});

module.exports = router;
