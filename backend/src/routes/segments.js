// 口播句子（segment）路由
const express = require('express');
const router = express.Router();
const path = require('path');
const mimo = require('../services/mimo');
const tts = require('../services/tts');
const audio = require('../services/audio');
const audioAsset = require('../services/audioAsset');
const voiceConfigService = require('../services/voiceConfig');
const broadcastStore = require('../services/broadcastStore');
const segmentStore = require('../services/segmentStore');
const sseManager = require('../services/sseManager');
const ttsQueue = require('../services/ttsQueue');
const { createScopedLogger } = require('../services/logger');
const { validateId, cleanAudioFile } = require('../utils/validation');

const logger = createScopedLogger('segments-route');

/**
 * POST /api/broadcast/:id/split
 * AI 切分口播稿为短句
 */
router.post('/:id/split', async (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '播报 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });

    const broadcast = broadcastStore.getById(idCheck.id);
    if (!broadcast) return res.status(404).json({ error: '播报记录不存在' });

    // 若已有 segments，先删除旧的及其音频文件
    const oldSegments = segmentStore.getByBroadcastId(idCheck.id);
    for (const seg of oldSegments) {
      cleanAudioFile(seg.audio_path);
    }
    segmentStore.deleteByBroadcastId(idCheck.id);

    // 调用 AI 切分
    const sentences = await mimo.splitScript(broadcast.content);

    // 创建 segment 记录
    segmentStore.createMany(idCheck.id, sentences);

    // 更新广播 mode，删除旧的整段音频文件
    cleanAudioFile(broadcast.audio_path);
    broadcastStore.clearAudioAndSetMode(idCheck.id, 'segmented');

    const segments = segmentStore.getByBroadcastId(idCheck.id);
    res.json({ segments });
  } catch (error) {
    logger.error({
      err: error,
      hasBroadcastId: Boolean(req.params.id),
      broadcastIdParamLength: typeof req.params.id === 'string' ? req.params.id.length : undefined,
    }, '切分失败');
    res.status(500).json({ error: error.message || '切分失败' });
  }
});

/**
 * GET /api/broadcast/:id/segments
 * 获取 segments 列表
 */
router.get('/:id/segments', (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '播报 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });

    const broadcast = broadcastStore.getById(idCheck.id);
    if (!broadcast) return res.status(404).json({ error: '播报记录不存在' });

    const segments = segmentStore.getByBroadcastId(idCheck.id);
    res.json({ segments });
  } catch (error) {
    logger.error({
      err: error,
      hasBroadcastId: Boolean(req.params.id),
      broadcastIdParamLength: typeof req.params.id === 'string' ? req.params.id.length : undefined,
    }, '获取 segments 失败');
    res.status(500).json({ error: '获取 segments 失败' });
  }
});

/**
 * POST /api/broadcast/:id/segments/batch-generate
 * 批量生成 segment 音频（支持 SSE 实时推送）
 */
router.post('/:id/segments/batch-generate', async (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '播报 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });

    const broadcast = broadcastStore.getById(idCheck.id);
    if (!broadcast) return res.status(404).json({ error: '播报记录不存在' });

    const { voiceType, voiceConfig } = voiceConfigService.parseBroadcastVoiceConfig(broadcast);
    const pendingSegments = segmentStore.getPendingByBroadcastId(idCheck.id);

    // 如果没有待生成的 segments，直接返回完成
    if (pendingSegments.length === 0) {
      const segments = segmentStore.getByBroadcastId(idCheck.id);
      sseManager.sendComplete(String(idCheck.id), {
        segments,
        results: [],
        timestamp: Date.now()
      });
      return res.json({ segments, results: [] });
    }

    // 批量开始前一次性解析 clone 音色，避免在每段回调里重复读取文件 / 重复 base64 转换。
    // 解析失败时不直接中断批量任务，记录错误并让每段落到可重试的 failed 状态。
    let resolvedVoiceConfig = voiceConfig;
    let cloneResolveError = null;
    try {
      resolvedVoiceConfig = await voiceConfigService.resolveCloneVoiceConfig({ voiceType, voiceConfig });
    } catch (resolveError) {
      cloneResolveError = resolveError;
    }

    // 发送开始事件
    sseManager.send(String(idCheck.id), 'batch-generate-start', {
      total: pendingSegments.length,
      timestamp: Date.now()
    });

    const results = [];
    for (let i = 0; i < pendingSegments.length; i++) {
      const segment = pendingSegments[i];

      // 更新状态为生成中
      segmentStore.updateStatus(segment.id, 'generating');

      // 推送进度事件
      sseManager.sendProgress(String(idCheck.id), {
        segmentId: segment.id,
        status: 'generating',
        current: i + 1,
        total: pendingSegments.length,
        text: segment.text
      });

      try {
        // clone 音色解析失败则整批都无法生成，直接抛出统一错误
        if (cloneResolveError) throw cloneResolveError;

        // 使用队列管理 TTS 请求，避免触发限流
        const audioBuffer = await ttsQueue.enqueue(async () => {
          const speechParams = await voiceConfigService.toSpeechParams({
            text: segment.text,
            voiceType,
            voiceConfig: resolvedVoiceConfig,
            resolveClone: false // clone 音色已在批量开始时统一解析
          });
          return tts.generateSpeech(speechParams);
        });

        const audioPath = audioAsset.writeSegmentAudio(idCheck.id, segment.index, audioBuffer);

        segmentStore.updateStatus(segment.id, 'generated', audioPath);
        results.push({ id: segment.id, status: 'generated' });

        // 推送成功事件
        sseManager.sendProgress(String(idCheck.id), {
          segmentId: segment.id,
          status: 'generated',
          audioPath,
          current: i + 1,
          total: pendingSegments.length
        });
      } catch (ttsError) {
        segmentStore.updateStatus(segment.id, 'failed');
        results.push({ id: segment.id, status: 'failed', error: ttsError.message });

        // 推送失败事件
        sseManager.sendProgress(String(idCheck.id), {
          segmentId: segment.id,
          status: 'failed',
          error: ttsError.message,
          current: i + 1,
          total: pendingSegments.length
        });
      }
    }

    const segments = segmentStore.getByBroadcastId(idCheck.id);

    // 推送完成事件
    sseManager.sendComplete(String(idCheck.id), {
      segments,
      results,
      timestamp: Date.now()
    });

    // 仍然返回 HTTP 响应（向后兼容）
    res.json({ segments, results });
  } catch (error) {
    logger.error({
      err: error,
      hasBroadcastId: Boolean(req.params.id),
      broadcastIdParamLength: typeof req.params.id === 'string' ? req.params.id.length : undefined,
    }, '批量生成失败');
    sseManager.sendError(String(idCheck.id), error.message || '批量生成失败');
    res.status(500).json({ error: error.message || '批量生成失败' });
  }
});

/**
 * POST /api/broadcast/:id/segments/merge
 * 合并所有 segment 音频
 */
router.post('/:id/segments/merge', (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '播报 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });

    const broadcast = broadcastStore.getById(idCheck.id);
    if (!broadcast) return res.status(404).json({ error: '播报记录不存在' });

    const segments = segmentStore.getByBroadcastId(idCheck.id);

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

    cleanAudioFile(broadcast.audio_path);

    const audioPath = audioAsset.writeMergedBroadcastAudio(idCheck.id, mergedBuffer);

    broadcastStore.updateAudioPath(idCheck.id, audioPath);
    broadcastStore.updateStatus(idCheck.id, 'generated');

    const updated = broadcastStore.getById(idCheck.id);
    res.json({ broadcast: updated });
  } catch (error) {
    logger.error({
      err: error,
      hasBroadcastId: Boolean(req.params.id),
      broadcastIdParamLength: typeof req.params.id === 'string' ? req.params.id.length : undefined,
    }, '合并失败');
    res.status(500).json({ error: error.message || '合并失败' });
  }
});

/**
 * POST /api/broadcast/:id/segments/reorder
 * 重排序 segments
 */
router.post('/:id/segments/reorder', (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '播报 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });

    const { segmentIds } = req.body;
    if (!Array.isArray(segmentIds)) {
      return res.status(400).json({ error: '请提供 segmentIds 数组' });
    }

    // 验证所有 segment 都属于当前 broadcast
    const ownedCount = segmentStore.countByIds(idCheck.id, segmentIds);
    if (ownedCount !== segmentIds.length) {
      return res.status(400).json({ error: '部分句子不属于当前播报' });
    }

    segmentStore.reorder(idCheck.id, segmentIds);

    const segments = segmentStore.getByBroadcastId(idCheck.id);
    res.json({ segments });
  } catch (error) {
    logger.error({
      err: error,
      hasBroadcastId: Boolean(req.params.id),
      broadcastIdParamLength: typeof req.params.id === 'string' ? req.params.id.length : undefined,
    }, '重排序失败');
    res.status(500).json({ error: '重排序失败' });
  }
});

/**
 * PUT /api/broadcast/:id/segments/:segId
 * 编辑单个 segment 文本
 */
router.put('/:id/segments/:segId', (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '播报 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });
    const segIdCheck = validateId(req.params.segId, '句子 ID');
    if (!segIdCheck.valid) return res.status(400).json({ error: segIdCheck.error });

    const { text } = req.body;
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: '请提供有效的文本内容' });
    }

    const segment = segmentStore.getByIdAndBroadcastId(segIdCheck.id, idCheck.id);
    if (!segment) return res.status(404).json({ error: '句子不存在' });

    cleanAudioFile(segment.audio_path);
    segmentStore.updateText(segIdCheck.id, text.trim());

    const updated = segmentStore.getByIdAndBroadcastId(segIdCheck.id, idCheck.id);
    res.json({ segment: updated });
  } catch (error) {
    logger.error({
      err: error,
      hasBroadcastId: Boolean(req.params.id),
      broadcastIdParamLength: typeof req.params.id === 'string' ? req.params.id.length : undefined,
      hasSegmentId: Boolean(req.params.segId),
      segmentIdParamLength: typeof req.params.segId === 'string' ? req.params.segId.length : undefined,
    }, '编辑句子失败');
    res.status(500).json({ error: '编辑句子失败' });
  }
});

/**
 * POST /api/broadcast/:id/segments/:segId/regenerate
 * 重新生成单个 segment 音频
 */
router.post('/:id/segments/:segId/regenerate', async (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '播报 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });
    const segIdCheck = validateId(req.params.segId, '句子 ID');
    if (!segIdCheck.valid) return res.status(400).json({ error: segIdCheck.error });

    const segment = segmentStore.getByIdAndBroadcastId(segIdCheck.id, idCheck.id);
    if (!segment) return res.status(404).json({ error: '句子不存在' });

    const broadcast = broadcastStore.getById(idCheck.id);
    const { voiceType, voiceConfig } = voiceConfigService.parseBroadcastVoiceConfig(broadcast);

    segmentStore.updateStatus(segIdCheck.id, 'generating');

    try {
      const speechParams = await voiceConfigService.toSpeechParams({
        text: segment.text,
        voiceType,
        voiceConfig,
        resolveClone: true
      });
      const audioBuffer = await tts.generateSpeech(speechParams);

      const audioPath = audioAsset.writeSegmentAudio(idCheck.id, segment.index, audioBuffer);

      segmentStore.updateStatus(segIdCheck.id, 'generated', audioPath);
    } catch (ttsError) {
      segmentStore.updateStatus(segIdCheck.id, 'failed');
      return res.status(500).json({ error: '语音生成失败: ' + ttsError.message });
    }

    const updated = segmentStore.getByIdAndBroadcastId(segIdCheck.id, idCheck.id);
    res.json({ segment: updated });
  } catch (error) {
    logger.error({
      err: error,
      hasBroadcastId: Boolean(req.params.id),
      broadcastIdParamLength: typeof req.params.id === 'string' ? req.params.id.length : undefined,
      hasSegmentId: Boolean(req.params.segId),
      segmentIdParamLength: typeof req.params.segId === 'string' ? req.params.segId.length : undefined,
    }, '重新生成失败');
    res.status(500).json({ error: '重新生成失败' });
  }
});

/**
 * DELETE /api/broadcast/:id/segments/:segId
 * 删除单个 segment（含后续重索引）
 */
router.delete('/:id/segments/:segId', (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '播报 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });
    const segIdCheck = validateId(req.params.segId, '句子 ID');
    if (!segIdCheck.valid) return res.status(400).json({ error: segIdCheck.error });

    const segment = segmentStore.getByIdAndBroadcastId(segIdCheck.id, idCheck.id);
    if (!segment) return res.status(404).json({ error: '句子不存在' });

    cleanAudioFile(segment.audio_path);
    segmentStore.deleteAndReindex(idCheck.id, segIdCheck.id);

    const segments = segmentStore.getByBroadcastId(idCheck.id);
    res.json({ segments });
  } catch (error) {
    logger.error({
      err: error,
      hasBroadcastId: Boolean(req.params.id),
      broadcastIdParamLength: typeof req.params.id === 'string' ? req.params.id.length : undefined,
      hasSegmentId: Boolean(req.params.segId),
      segmentIdParamLength: typeof req.params.segId === 'string' ? req.params.segId.length : undefined,
    }, '删除句子失败');
    res.status(500).json({ error: '删除句子失败' });
  }
});

module.exports = router;
