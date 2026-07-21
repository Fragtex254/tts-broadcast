const express = require('express');
const podcastTranscriptStore = require('../services/podcastTranscriptStore');
const transcriptionSummaryRunner = require('../services/transcriptionSummaryRunner');
const transcriptionClaimRunner = require('../services/transcriptionClaimRunner');
const researchStore = require('../services/researchStore');
const { createScopedLogger } = require('../services/logger');
const { validateId } = require('../utils/validation');

const router = express.Router();
const logger = createScopedLogger('transcript-workspace-route');

function validateStringArray(value, label, { maxItems, maxLength }) {
  if (!Array.isArray(value)) return { valid: false, error: `${label}必须是数组` };
  if (value.length > maxItems) return { valid: false, error: `${label}数量不能超过 ${maxItems} 个` };
  const normalized = [];
  for (const item of value) {
    if (typeof item !== 'string' || !item.trim()) return { valid: false, error: `${label}不能包含空值` };
    const text = item.trim();
    if (text.length > maxLength) return { valid: false, error: `${label}单项不能超过 ${maxLength} 个字符` };
    if (!normalized.includes(text)) normalized.push(text);
  }
  return { valid: true, value: normalized };
}

/**
 * GET /api/transcribe/results/:id
 * 获取一个 Transcript 的内容详情工作区数据
 */
router.get('/results/:id', (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '转录结果 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });
    transcriptionSummaryRunner.reconcile(idCheck.id);
    transcriptionClaimRunner.reconcile(idCheck.id);
    const transcript = podcastTranscriptStore.getDetail(idCheck.id);
    if (!transcript) return res.status(404).json({ error: '转录结果不存在' });
    res.json({ transcript });
  } catch (error) {
    logger.error({ err: error }, '获取转录内容详情失败');
    res.status(500).json({ error: error.message || '获取转录内容详情失败' });
  }
});

/**
 * PATCH /api/transcribe/results/:id/metadata
 * 更新播客节目、单集、嘉宾与来源元数据
 */
router.patch('/results/:id/metadata', (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '转录结果 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });
    const current = podcastTranscriptStore.getDetail(idCheck.id)?.record;
    if (!current) return res.status(404).json({ error: '转录结果不存在' });
    const guestNames = validateStringArray(req.body.guestNames ?? current.guest_names, '嘉宾名称', { maxItems: 20, maxLength: 100 });
    if (!guestNames.valid) return res.status(400).json({ error: guestNames.error });
    const topicTags = validateStringArray(req.body.topicTags ?? current.topic_tags, '主题标签', { maxItems: 30, maxLength: 50 });
    if (!topicTags.valid) return res.status(400).json({ error: topicTags.error });
    const fields = {
      podcastName: req.body.podcastName ?? current.podcast_name,
      episodeTitle: req.body.episodeTitle ?? current.episode_title,
      sourceUrl: req.body.sourceUrl ?? current.source_url,
      publishedAt: req.body.publishedAt ?? current.published_at,
    };
    for (const [key, value] of Object.entries(fields)) {
      if (typeof value !== 'string') return res.status(400).json({ error: `${key} 必须是字符串` });
    }
    const metadata = {
      podcastName: fields.podcastName.trim().slice(0, 200),
      episodeTitle: fields.episodeTitle.trim().slice(0, 300),
      guestNames: guestNames.value,
      sourceUrl: fields.sourceUrl.trim().slice(0, 2000),
      publishedAt: fields.publishedAt.trim().slice(0, 50),
      topicTags: topicTags.value,
    };
    if (!metadata.episodeTitle) return res.status(400).json({ error: '单集标题不能为空' });
    if (metadata.sourceUrl) {
      try { new URL(metadata.sourceUrl); } catch { return res.status(400).json({ error: '原始链接格式无效' }); }
    }
    const record = podcastTranscriptStore.updateMetadata(idCheck.id, metadata);
    res.json({ record });
  } catch (error) {
    logger.error({ err: error }, '更新播客元数据失败');
    res.status(500).json({ error: error.message || '更新播客元数据失败' });
  }
});

/**
 * PATCH /api/transcribe/results/:id/speakers/:speakerId
 * 更新 Transcript 内 Speaker 的统一显示名称
 */
router.patch('/results/:id/speakers/:speakerId', (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '转录结果 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });
    const speakerIdCheck = validateId(req.params.speakerId, '说话人 ID');
    if (!speakerIdCheck.valid) return res.status(400).json({ error: speakerIdCheck.error });
    const displayName = typeof req.body.displayName === 'string' ? req.body.displayName.trim() : '';
    if (!displayName) return res.status(400).json({ error: '请输入说话人名称' });
    if (displayName.length > 50) return res.status(400).json({ error: '说话人名称不能超过 50 个字符' });
    const speaker = podcastTranscriptStore.renameSpeaker(idCheck.id, speakerIdCheck.id, displayName);
    if (!speaker) return res.status(404).json({ error: '说话人不存在' });
    res.json({ speaker });
  } catch (error) {
    logger.error({ err: error }, '更新说话人名称失败');
    res.status(500).json({ error: error.message || '更新说话人名称失败' });
  }
});

/**
 * PATCH /api/transcribe/results/:id/turns/:turnId
 * 校对一个阅读 Turn，不覆盖原始 Segment 事实
 */
router.patch('/results/:id/turns/:turnId', (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '转录结果 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });
    const turnIdCheck = validateId(req.params.turnId, '发言轮次 ID');
    if (!turnIdCheck.valid) return res.status(400).json({ error: turnIdCheck.error });
    const correctedText = typeof req.body.correctedText === 'string' ? req.body.correctedText.trim() : '';
    if (!correctedText) return res.status(400).json({ error: '校对文本不能为空' });
    if (correctedText.length > 5000) return res.status(400).json({ error: '单个发言轮次不能超过 5000 个字符' });
    const updated = podcastTranscriptStore.updateTurnCorrection(idCheck.id, turnIdCheck.id, correctedText);
    if (!updated) return res.status(404).json({ error: '发言轮次不存在' });
    res.json(updated);
  } catch (error) {
    logger.error({ err: error }, '校对逐字稿失败');
    res.status(500).json({ error: error.message || '校对逐字稿失败' });
  }
});

/**
 * POST /api/transcribe/results/:id/summarize
 * 受理一个可幂等重试的 Transcript 总结任务
 */
router.post('/results/:id/summarize', (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '转录结果 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });
    const taskId = typeof req.body.taskId === 'string' ? req.body.taskId.trim() : '';
    if (!taskId) return res.status(400).json({ error: '请提供总结任务 ID' });
    if (taskId.length > 128) return res.status(400).json({ error: '总结任务 ID 过长' });
    const result = transcriptionSummaryRunner.start({ transcriptionId: idCheck.id, taskId });
    if (!result.accepted) return res.status(409).json({ error: '该内容正在总结，请勿重复提交' });
    res.status(202).json({ accepted: true, taskId });
  } catch (error) {
    logger.error({ err: error }, '受理 Transcript 总结任务失败');
    const status = error.message === '转录结果不存在' ? 404 : 400;
    res.status(status).json({ error: error.message || '无法开始播客总结' });
  }
});

/** POST /api/transcribe/results/:id/analyze-claims - 受理幂等观点提取任务 */
router.post('/results/:id/analyze-claims', (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '转录结果 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });
    const taskId = typeof req.body.taskId === 'string' ? req.body.taskId.trim() : '';
    if (!taskId) return res.status(400).json({ error: '请提供观点分析任务 ID' });
    if (taskId.length > 128) return res.status(400).json({ error: '观点分析任务 ID 过长' });
    const result = transcriptionClaimRunner.start({ transcriptionId: idCheck.id, taskId });
    if (!result.accepted) return res.status(409).json({ error: '该内容正在分析观点，请勿重复提交' });
    res.status(202).json({ accepted: true, taskId });
  } catch (error) {
    logger.error({ err: error }, '受理观点分析任务失败');
    const status = error.message === '转录结果不存在' ? 404 : 400;
    res.status(status).json({ error: error.message || '无法开始观点分析' });
  }
});

/** GET /api/transcribe/results/:id/claims - 获取当前播客观点卡 */
router.get('/results/:id/claims', (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '转录结果 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });
    const detail = podcastTranscriptStore.getDetail(idCheck.id);
    if (!detail) return res.status(404).json({ error: '转录结果不存在' });
    const status = detail.record.claims_status === 'stale' ? 'stale' : 'active';
    res.json({ claims: researchStore.listClaims({ transcriptionId: idCheck.id, status }) });
  } catch (error) {
    logger.error({ err: error }, '获取观点卡失败');
    res.status(500).json({ error: error.message || '获取观点卡失败' });
  }
});

/** PATCH /api/transcribe/claims/:claimId - 更新收藏、笔记或状态 */
router.patch('/claims/:claimId', (req, res) => {
  try {
    const check = validateId(req.params.claimId, '观点 ID');
    if (!check.valid) return res.status(400).json({ error: check.error });
    if (req.body.userNote !== undefined && (typeof req.body.userNote !== 'string' || req.body.userNote.length > 5000)) return res.status(400).json({ error: '个人笔记不能超过 5000 个字符' });
    if (req.body.isStarred !== undefined && typeof req.body.isStarred !== 'boolean') return res.status(400).json({ error: '收藏状态无效' });
    if (req.body.isHidden !== undefined && typeof req.body.isHidden !== 'boolean') return res.status(400).json({ error: '隐藏状态无效' });
    if (req.body.status !== undefined && !['active', 'stale'].includes(req.body.status)) return res.status(400).json({ error: '观点状态无效' });
    const claim = researchStore.updateClaim(check.id, {
      userNote: req.body.userNote?.trim(),
      isStarred: req.body.isStarred,
      isHidden: req.body.isHidden,
      status: req.body.status,
    });
    if (!claim) return res.status(404).json({ error: '观点不存在' });
    res.json({ claim });
  } catch (error) {
    logger.error({ err: error }, '更新观点卡失败');
    res.status(500).json({ error: error.message || '更新观点卡失败' });
  }
});

/** DELETE /api/transcribe/claims/:claimId - 删除观点卡 */
router.delete('/claims/:claimId', (req, res) => {
  try {
    const check = validateId(req.params.claimId, '观点 ID');
    if (!check.valid) return res.status(400).json({ error: check.error });
    if (!researchStore.removeClaim(check.id)) return res.status(404).json({ error: '观点不存在' });
    res.json({ message: '观点已删除' });
  } catch (error) {
    if (error.code === 'TRANSCRIPTION_CLAIM_IN_USE') {
      return res.status(409).json({ error: error.message });
    }
    logger.error({ err: error }, '删除观点卡失败');
    res.status(500).json({ error: error.message || '删除观点卡失败' });
  }
});

/** POST /api/transcribe/claims/:claimId/regenerate - 重新分析观点所属播客 */
router.post('/claims/:claimId/regenerate', (req, res) => {
  try {
    const check = validateId(req.params.claimId, '观点 ID');
    if (!check.valid) return res.status(400).json({ error: check.error });
    const claim = researchStore.getClaim(check.id);
    if (!claim) return res.status(404).json({ error: '观点不存在' });
    const taskId = typeof req.body.taskId === 'string' ? req.body.taskId.trim() : '';
    if (!taskId || taskId.length > 128) return res.status(400).json({ error: '观点分析任务 ID 无效' });
    const result = transcriptionClaimRunner.start({ transcriptionId: claim.transcription_id, taskId });
    if (!result.accepted) return res.status(409).json({ error: '该内容正在分析观点，请勿重复提交' });
    res.status(202).json({ accepted: true, taskId });
  } catch (error) {
    logger.error({ err: error }, '重新分析观点失败');
    res.status(400).json({ error: error.message || '重新分析观点失败' });
  }
});

module.exports = router;
