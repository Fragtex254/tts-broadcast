// 口播分段（segment）路由
const express = require('express');
const router = express.Router();
const mimo = require('../services/mimo');
const tts = require('../services/tts');
const audio = require('../services/audio');
const audioAsset = require('../services/audioAsset');
const voiceConfigService = require('../services/voiceConfig');
const broadcastStore = require('../services/broadcastStore');
const segmentStore = require('../services/segmentStore');
const generationJobStore = require('../services/generationJobStore');
const sseManager = require('../services/sseManager');
const ttsQueue = require('../services/ttsQueue');
const { createScopedLogger } = require('../services/logger');
const { validateId, cleanAudioFile } = require('../utils/validation');
const { prependStyleTag, sanitizeStyleTag, MAX_SEGMENT_TEXT_LENGTH } = require('../utils/segmentText');

const logger = createScopedLogger('segments-route');
const BATCH_GENERATE_LEASE_MS = 10 * 60 * 1000;
const BATCH_GENERATE_HEARTBEAT_MS = 30 * 1000;

function invalidateMergedAudio(broadcast) {
  if (!broadcast) return;
  cleanAudioFile(broadcast.audio_path);
  broadcastStore.clearAudioPath(broadcast.id);
}

function buildSegmentTagSource(segment) {
  const styleTag = sanitizeStyleTag(segment.style_tag);
  return styleTag ? `[${styleTag}]${segment.text}` : segment.text;
}

function getChangedSegmentAudioPaths(oldSegments, nextSegments) {
  const nextById = new Map(nextSegments.map((segment) => [segment.id, segment]));
  return oldSegments
    .filter((segment) => {
      const next = nextById.get(segment.id);
      return !next || next.text !== segment.text || next.styleTag !== segment.style_tag;
    })
    .map((segment) => segment.audio_path);
}

/**
 * POST /api/broadcast/:id/split
 * AI 切分口播稿为 100-200 字文段
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
    const segmentTexts = await mimo.splitScript(broadcast.content);

    // 创建 segment 记录
    segmentStore.createMany(idCheck.id, segmentTexts);

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
 * POST /api/broadcast/:id/segments/replace
 * 批量替换 segments，用于前端合并、拆分、情绪提示整理
 */
router.post('/:id/segments/replace', (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '播报 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });

    const { segments } = req.body;
    if (!Array.isArray(segments) || segments.length === 0) {
      return res.status(400).json({ error: '请提供 segments 数组' });
    }

    const broadcast = broadcastStore.getById(idCheck.id);
    if (!broadcast) return res.status(404).json({ error: '播报记录不存在' });

    const oldSegments = segmentStore.getByBroadcastId(idCheck.id);
    const oldById = new Map(oldSegments.map((segment) => [segment.id, segment]));
    const usedIds = new Set();

    const nextSegments = [];
    for (const item of segments) {
      if (!item || typeof item !== 'object') {
        return res.status(400).json({ error: 'segments 中包含无效段落' });
      }
      if (typeof item.text !== 'string' || item.text.trim().length === 0) {
        return res.status(400).json({ error: '每个段落都必须包含有效文本' });
      }

      const text = item.text.trim();
      if (text.length > MAX_SEGMENT_TEXT_LENGTH) {
        return res.status(400).json({ error: `单个段落不能超过 ${MAX_SEGMENT_TEXT_LENGTH} 个字` });
      }

      let id;
      if (item.id !== undefined && item.id !== null) {
        if (!Number.isInteger(item.id) || item.id <= 0) {
          return res.status(400).json({ error: 'segments 中包含无效句子 ID' });
        }
        if (!oldById.has(item.id)) {
          return res.status(400).json({ error: '部分句子不属于当前播报' });
        }
        if (usedIds.has(item.id)) {
          return res.status(400).json({ error: 'segments 中包含重复句子 ID' });
        }
        usedIds.add(item.id);
        id = item.id;
      }

      nextSegments.push({
        id,
        text,
        styleTag: sanitizeStyleTag(item.styleTag),
      });
    }

    const invalidatedAudioPaths = oldSegments
      .filter((segment) => {
        const next = nextSegments.find((item) => item.id === segment.id);
        return !next || next.text !== segment.text || next.styleTag !== segment.style_tag;
      })
      .map((segment) => segment.audio_path);

    segmentStore.replaceAll(idCheck.id, nextSegments);
    cleanAudioFile(broadcast.audio_path);
    broadcastStore.clearAudioAndSetMode(idCheck.id, 'segmented');
    invalidatedAudioPaths.forEach((audioPath) => cleanAudioFile(audioPath));

    res.json({ segments: segmentStore.getByBroadcastId(idCheck.id) });
  } catch (error) {
    logger.error({
      err: error,
      hasBroadcastId: Boolean(req.params.id),
      broadcastIdParamLength: typeof req.params.id === 'string' ? req.params.id.length : undefined,
    }, '批量整理句子失败');
    res.status(500).json({ error: error.message || '批量整理句子失败' });
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
 * POST /api/broadcast/:id/segments/suggest-tags
 * AI 为各段建议整体风格标签
 */
router.post('/:id/segments/suggest-tags', async (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '播报 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });

    const { allowedTags } = req.body;
    if (!Array.isArray(allowedTags) || allowedTags.length === 0
        || !allowedTags.every((t) => typeof t === 'string')) {
      return res.status(400).json({ error: '请提供候选风格标签 allowedTags' });
    }

    const broadcast = broadcastStore.getById(idCheck.id);
    if (!broadcast) return res.status(404).json({ error: '播报记录不存在' });

    const segments = segmentStore.getByBroadcastId(idCheck.id);
    if (segments.length === 0) return res.status(400).json({ error: '没有可建议的句子' });

    const tags = await mimo.suggestStyleTags(segments.map((s) => s.text), allowedTags);
    const updates = segments.map((s, i) => ({ id: s.id, styleTag: sanitizeStyleTag(tags[i] || '') }));
    const invalidatedAudioPaths = getChangedSegmentAudioPaths(
      segments,
      updates.map((item) => ({
        id: item.id,
        text: segments.find((segment) => segment.id === item.id)?.text || '',
        styleTag: item.styleTag,
      }))
    );

    segmentStore.bulkUpdateStyleTags(idCheck.id, updates);
    if (invalidatedAudioPaths.length > 0) {
      invalidateMergedAudio(broadcast);
      invalidatedAudioPaths.forEach((audioPath) => cleanAudioFile(audioPath));
    }

    const updated = segmentStore.getByBroadcastId(idCheck.id);
    res.json({ segments: updated });
  } catch (error) {
    logger.error({
      err: error,
      hasBroadcastId: Boolean(req.params.id),
      broadcastIdParamLength: typeof req.params.id === 'string' ? req.params.id.length : undefined,
    }, 'AI 建议风格失败');
    res.status(500).json({ error: error.message || 'AI 建议风格失败' });
  }
});

/**
 * POST /api/broadcast/:id/segments/suggest-audio-tags
 * AI 为各段优化 MiMo 方括号内联音频标签
 */
router.post('/:id/segments/suggest-audio-tags', async (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '播报 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });

    const broadcast = broadcastStore.getById(idCheck.id);
    if (!broadcast) return res.status(404).json({ error: '播报记录不存在' });

    const segments = segmentStore.getByBroadcastId(idCheck.id);
    if (segments.length === 0) return res.status(400).json({ error: '没有可优化标签的句子' });

    const { voiceConfig } = voiceConfigService.parseBroadcastVoiceConfig(broadcast);
    const suggestions = await mimo.suggestSegmentAudioTags({
      texts: segments.map(buildSegmentTagSource),
      voiceDesign: voiceConfig.voiceDesign || '',
      stylePrompt: voiceConfig.stylePrompt || '',
    });

    const nextSegments = segments.map((segment, index) => ({
      id: segment.id,
      text: String(suggestions[index]?.taggedText || segment.text).trim(),
      styleTag: '',
    }));
    if (nextSegments.some((segment) => !segment.text)) {
      return res.status(500).json({ error: 'AI 标签优化结果包含空段落' });
    }
    if (nextSegments.some((segment) => segment.text.length > MAX_SEGMENT_TEXT_LENGTH)) {
      return res.status(500).json({ error: `AI 标签优化结果超过 ${MAX_SEGMENT_TEXT_LENGTH} 字限制` });
    }

    const invalidatedAudioPaths = getChangedSegmentAudioPaths(segments, nextSegments);
    segmentStore.replaceAll(idCheck.id, nextSegments);
    if (invalidatedAudioPaths.length > 0) {
      invalidateMergedAudio(broadcast);
      invalidatedAudioPaths.forEach((audioPath) => cleanAudioFile(audioPath));
    }

    res.json({ segments: segmentStore.getByBroadcastId(idCheck.id) });
  } catch (error) {
    logger.error({
      err: error,
      hasBroadcastId: Boolean(req.params.id),
      broadcastIdParamLength: typeof req.params.id === 'string' ? req.params.id.length : undefined,
    }, 'AI 标签优化失败');
    res.status(500).json({ error: error.message || 'AI 标签优化失败' });
  }
});

/**
 * POST /api/broadcast/:id/segments/batch-generate
 * 批量生成 segment 音频（支持 SSE 实时推送）
 */
router.post('/:id/segments/batch-generate', async (req, res) => {
  let broadcastIdForEvents = String(req.params.id || '');
  let generationJob = null;
  let heartbeatTimer = null;
  let jobFinalStatus = 'completed';
  try {
    const idCheck = validateId(req.params.id, '播报 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });
    broadcastIdForEvents = String(idCheck.id);

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

    const voiceSelection = voiceConfigService.validateVoiceSelection({
      ...voiceConfig,
      voiceType
    });
    if (!voiceSelection.valid) {
      return res.status(400).json({ error: voiceSelection.error });
    }

    generationJob = generationJobStore.acquire({
      broadcastId: idCheck.id,
      leaseMs: BATCH_GENERATE_LEASE_MS,
    });
    if (!generationJob) {
      return res.status(409).json({ error: '当前播报正在生成语音，请等待当前任务完成' });
    }

    const heartbeatGenerationJob = () => {
      try {
        generationJobStore.heartbeat({
          jobId: generationJob.id,
          leaseMs: BATCH_GENERATE_LEASE_MS,
        });
      } catch (heartbeatError) {
        logger.warn({
          err: heartbeatError,
          broadcastId: idCheck.id,
          jobId: generationJob.id,
        }, '批量生成任务续租失败');
      }
    };
    heartbeatTimer = setInterval(heartbeatGenerationJob, BATCH_GENERATE_HEARTBEAT_MS);
    heartbeatTimer.unref?.();

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

    const results = new Array(pendingSegments.length);
    const markSegmentFailed = (segment, index, error) => {
      const errorMessage = error.message || '语音生成失败';
      logger.warn({
        err: error,
        broadcastId: idCheck.id,
        segmentId: segment.id,
        segmentIndex: segment.index,
        textLength: segment.text.length,
      }, '分段语音生成失败');
      segmentStore.updateStatus(segment.id, 'failed', null, errorMessage);
      results[index] = { id: segment.id, status: 'failed', error: errorMessage };
      sseManager.sendProgress(String(idCheck.id), {
        segmentId: segment.id,
        status: 'failed',
        error: errorMessage,
        current: index + 1,
        total: pendingSegments.length
      });
    };

    const generateSegment = async (segment, index) => {
      try {
        const speechParams = await voiceConfigService.toSpeechParams({
          text: prependStyleTag(segment.text, segment.style_tag),
          voiceType,
          voiceConfig: resolvedVoiceConfig,
          resolveClone: false // clone 音色已在批量开始时统一解析
        });
        const audioBuffer = await ttsQueue.enqueueTts(speechParams, () => {
          heartbeatGenerationJob();
          segmentStore.updateStatus(segment.id, 'generating');
          sseManager.sendProgress(String(idCheck.id), {
            segmentId: segment.id,
            status: 'generating',
            current: index + 1,
            total: pendingSegments.length,
            text: segment.text
          });
          return tts.generateSpeech(speechParams);
        });

        const audioPath = audioAsset.writeSegmentAudio(idCheck.id, segment.index, audioBuffer);

        segmentStore.updateStatus(segment.id, 'generated', audioPath);
        results[index] = { id: segment.id, status: 'generated' };

        // 推送成功事件
        sseManager.sendProgress(String(idCheck.id), {
          segmentId: segment.id,
          status: 'generated',
          audioPath,
          current: index + 1,
          total: pendingSegments.length
        });
      } catch (ttsError) {
        markSegmentFailed(segment, index, ttsError);
      }
    };

    if (cloneResolveError) {
      pendingSegments.forEach((segment, index) => {
        markSegmentFailed(segment, index, cloneResolveError);
      });
    } else {
      await Promise.all(pendingSegments.map((segment, index) => generateSegment(segment, index)));
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
    jobFinalStatus = 'failed';
    logger.error({
      err: error,
      hasBroadcastId: Boolean(req.params.id),
      broadcastIdParamLength: typeof req.params.id === 'string' ? req.params.id.length : undefined,
    }, '批量生成失败');
    sseManager.sendError(broadcastIdForEvents, error.message || '批量生成失败');
    res.status(500).json({ error: error.message || '批量生成失败' });
  } finally {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
    }
    if (generationJob) {
      try {
        generationJobStore.finish({ jobId: generationJob.id, status: jobFinalStatus });
      } catch (finishError) {
        logger.warn({
          err: finishError,
          jobId: generationJob.id,
        }, '批量生成任务释放失败');
      }
    }
  }
});

/**
 * POST /api/broadcast/:id/segments/merge
 * 合并所有 segment 音频
 */
router.post('/:id/segments/merge', async (req, res) => {
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

    cleanAudioFile(broadcast.audio_path);
    broadcastStore.clearAudioPath(idCheck.id);
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
 * PATCH /api/broadcast/:id/segments/playback-rate
 * 一次性设置当前播报下所有 segments 的播放/导出倍速
 */
router.patch('/:id/segments/playback-rate', (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '播报 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });

    const { playbackRate } = req.body;
    let normalizedRate;
    try {
      normalizedRate = audio.normalizePlaybackRate(playbackRate);
    } catch (validationError) {
      return res.status(400).json({ error: validationError.message });
    }

    const broadcast = broadcastStore.getById(idCheck.id);
    if (!broadcast) return res.status(404).json({ error: '播报记录不存在' });

    const segments = segmentStore.getByBroadcastId(idCheck.id);
    if (segments.length === 0) {
      return res.status(400).json({ error: '没有可设置倍速的句子' });
    }

    segmentStore.bulkUpdatePlaybackRate(idCheck.id, normalizedRate);
    invalidateMergedAudio(broadcast);

    res.json({ segments: segmentStore.getByBroadcastId(idCheck.id) });
  } catch (error) {
    logger.error({
      err: error,
      hasBroadcastId: Boolean(req.params.id),
      broadcastIdParamLength: typeof req.params.id === 'string' ? req.params.id.length : undefined,
    }, '批量设置倍速失败');
    res.status(500).json({ error: error.message || '批量设置倍速失败' });
  }
});

/**
 * PUT /api/broadcast/:id/segments/:segId
 * 编辑单个 segment（支持 text、styleTag 和/或 playbackRate）
 */
router.put('/:id/segments/:segId', (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '播报 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });
    const segIdCheck = validateId(req.params.segId, '句子 ID');
    if (!segIdCheck.valid) return res.status(400).json({ error: segIdCheck.error });

    const { text, styleTag, playbackRate } = req.body;
    const hasText = text !== undefined;
    const hasStyleTag = styleTag !== undefined;
    const hasPlaybackRate = playbackRate !== undefined;
    if (!hasText && !hasStyleTag && !hasPlaybackRate) {
      return res.status(400).json({ error: '请提供 text、styleTag 或 playbackRate' });
    }
    if (hasText && (typeof text !== 'string' || text.trim().length === 0)) {
      return res.status(400).json({ error: '请提供有效的文本内容' });
    }
    let normalizedRate;
    if (hasPlaybackRate) {
      try {
        normalizedRate = audio.normalizePlaybackRate(playbackRate);
      } catch (validationError) {
        return res.status(400).json({ error: validationError.message });
      }
    }

    const segment = segmentStore.getByIdAndBroadcastId(segIdCheck.id, idCheck.id);
    if (!segment) return res.status(404).json({ error: '句子不存在' });

    const broadcast = broadcastStore.getById(idCheck.id);
    const changesSynthesis = hasText || hasStyleTag;

    // 改文本或改风格会改变 TTS 合成结果；改倍速只影响浏览器播放和下载后处理，不删原始段音频。
    if (changesSynthesis) {
      cleanAudioFile(segment.audio_path);
      if (hasText) segmentStore.updateText(segIdCheck.id, text.trim());
      if (hasStyleTag) segmentStore.updateStyleTag(segIdCheck.id, sanitizeStyleTag(styleTag));
    }
    if (hasPlaybackRate) {
      segmentStore.updatePlaybackRate(segIdCheck.id, normalizedRate);
    }
    if (changesSynthesis || (hasPlaybackRate && segment.playback_rate !== normalizedRate)) {
      invalidateMergedAudio(broadcast);
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
    const voiceSelection = voiceConfigService.validateVoiceSelection({
      ...voiceConfig,
      voiceType
    });
    if (!voiceSelection.valid) {
      return res.status(400).json({ error: voiceSelection.error });
    }

    segmentStore.updateStatus(segIdCheck.id, 'generating');

    try {
      const speechParams = await voiceConfigService.toSpeechParams({
        text: prependStyleTag(segment.text, segment.style_tag),
        voiceType,
        voiceConfig,
        resolveClone: true
      });
      const audioBuffer = await ttsQueue.enqueueTts(speechParams, () => tts.generateSpeech(speechParams));

      const audioPath = audioAsset.writeSegmentAudio(idCheck.id, segment.index, audioBuffer);

      segmentStore.updateStatus(segIdCheck.id, 'generated', audioPath);
    } catch (ttsError) {
      segmentStore.updateStatus(segIdCheck.id, 'failed', null, ttsError.message || '语音生成失败');
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
