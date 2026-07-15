const express = require('express');
const podcastTranscriptStore = require('../services/podcastTranscriptStore');
const transcriptionSummaryRunner = require('../services/transcriptionSummaryRunner');
const { createScopedLogger } = require('../services/logger');
const { validateId } = require('../utils/validation');

const router = express.Router();
const logger = createScopedLogger('transcript-workspace-route');

/**
 * GET /api/transcribe/results/:id
 * 获取一个 Transcript 的内容详情工作区数据
 */
router.get('/results/:id', (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '转录结果 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });
    transcriptionSummaryRunner.reconcile(idCheck.id);
    const transcript = podcastTranscriptStore.getDetail(idCheck.id);
    if (!transcript) return res.status(404).json({ error: '转录结果不存在' });
    res.json({ transcript });
  } catch (error) {
    logger.error({ err: error }, '获取转录内容详情失败');
    res.status(500).json({ error: error.message || '获取转录内容详情失败' });
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

module.exports = router;
