const express = require('express');
const contentEvidenceStore = require('../services/contentEvidenceStore');
const contentCreationContext = require('../services/contentCreationContext');
const contentGenerationJobStore = require('../services/contentGenerationJobStore');
const contentGenerationRunner = require('../services/contentGenerationRunner');
const contentSourceStore = require('../services/contentSourceStore');
const { createSourceFragments } = require('../utils/contentSourceFragments');
const { createScopedLogger } = require('../services/logger');
const { validateId } = require('../utils/validation');

const router = express.Router();
const logger = createScopedLogger('content-creation-route');

function statusForBusinessError(error) {
  if (error?.code === 'NOT_FOUND') return 404;
  if (['CONTEXT_CHANGED', 'IDEMPOTENCY_CONFLICT', 'CITATION_CONFLICT'].includes(error?.code)) return 409;
  if (error?.code === 'INPUT_TOO_LARGE') return 413;
  return 400;
}

/**
 * GET /api/content-projects/:id/sources/:sourceId/fragments
 * 返回可由来源原文 offset 回查的确定性片段。
 */
router.get('/:id/sources/:sourceId/fragments', (req, res) => {
  const projectCheck = validateId(req.params.id, '内容项目 ID');
  if (!projectCheck.valid) return res.status(400).json({ error: projectCheck.error });
  const sourceCheck = validateId(req.params.sourceId, '来源 ID');
  if (!sourceCheck.valid) return res.status(400).json({ error: sourceCheck.error });
  try {
    const source = contentSourceStore.getForProjectOrHistoricalCitation({
      projectId: projectCheck.id,
      sourceId: sourceCheck.id,
    });
    if (!source) return res.status(404).json({ error: '项目来源不存在' });
    const fragments = createSourceFragments(source.content).map((fragment) => ({
      index: fragment.index,
      content: fragment.text,
      start_offset: fragment.start_offset,
      end_offset: fragment.end_offset,
    }));
    res.json({ fragments });
  } catch (error) {
    logger.error({ err: error, projectId: projectCheck.id, sourceId: sourceCheck.id }, '获取来源片段失败');
    res.status(500).json({ error: '获取来源片段失败' });
  }
});

/**
 * DELETE /api/content-projects/:id/sources/:sourceId
 * 只移出项目来源；来源快照与历史证据保留。
 */
router.delete('/:id/sources/:sourceId', (req, res) => {
  const projectCheck = validateId(req.params.id, '内容项目 ID');
  if (!projectCheck.valid) return res.status(400).json({ error: projectCheck.error });
  const sourceCheck = validateId(req.params.sourceId, '来源 ID');
  if (!sourceCheck.valid) return res.status(400).json({ error: sourceCheck.error });
  try {
    const source = contentEvidenceStore.unlinkSource({
      projectId: projectCheck.id,
      sourceId: sourceCheck.id,
    });
    if (!source) return res.status(404).json({ error: '项目来源不存在' });
    res.json({ message: '来源已移出项目，历史引用仍保留', source });
  } catch (error) {
    logger.error({ err: error, projectId: projectCheck.id, sourceId: sourceCheck.id }, '移出项目来源失败');
    res.status(500).json({ error: '移出项目来源失败' });
  }
});

/**
 * POST /api/content-projects/:id/evidence
 * 人工定位证据，或以新卡修正已有证据边界。
 */
router.post('/:id/evidence', (req, res) => {
  const projectCheck = validateId(req.params.id, '内容项目 ID');
  if (!projectCheck.valid) return res.status(400).json({ error: projectCheck.error });
  const sourceCheck = validateId(String(req.body?.sourceId || ''), '来源 ID');
  if (!sourceCheck.valid || Number(req.body?.sourceId) !== sourceCheck.id) {
    return res.status(400).json({ error: '无效的来源 ID' });
  }
  if (req.body?.userNote !== undefined
    && (typeof req.body.userNote !== 'string' || req.body.userNote.length > 5000)) {
    return res.status(400).json({ error: '证据用户笔记必须是最多 5000 字符的字符串' });
  }
  if (req.body?.requestKey !== undefined
    && (typeof req.body.requestKey !== 'string' || !req.body.requestKey.trim() || req.body.requestKey.length > 200)) {
    return res.status(400).json({ error: '证据请求标识必须是最多 200 字符的非空字符串' });
  }
  const decisionState = req.body?.decisionState ?? 'candidate';
  if (!['candidate', 'selected'].includes(decisionState)) {
    return res.status(400).json({ error: '新建手工证据只能保存为候选或立即采用' });
  }
  let supersedesEvidenceId;
  if (req.body?.supersedesEvidenceId !== undefined) {
    const evidenceCheck = validateId(String(req.body.supersedesEvidenceId), '待修正证据 ID');
    if (!evidenceCheck.valid || Number(req.body.supersedesEvidenceId) !== evidenceCheck.id) {
      return res.status(400).json({ error: '无效的待修正证据 ID' });
    }
    supersedesEvidenceId = evidenceCheck.id;
  }
  try {
    const result = contentEvidenceStore.create({
      projectId: projectCheck.id,
      sourceId: sourceCheck.id,
      fragmentStart: req.body?.startFragmentIndex ?? req.body?.fragmentStart,
      fragmentEnd: req.body?.endFragmentIndex ?? req.body?.fragmentEnd,
      origin: 'user',
      aiNote: '',
      userNote: req.body?.userNote ?? '',
      supersedesEvidenceId,
      requestKey: req.body?.requestKey?.trim() || '',
      decisionState,
    });
    if (!result) return res.status(404).json({ error: '项目来源不存在' });
    res.status(result.reused ? 200 : 201).json({
      evidence: result.evidence,
      reused: result.reused,
      milestone: result.milestone,
    });
  } catch (error) {
    logger.warn({ err: error, projectId: projectCheck.id, sourceId: sourceCheck.id }, '创建人工证据失败');
    res.status(statusForBusinessError(error)).json({ error: error.message || '创建人工证据失败' });
  }
});

/**
 * PATCH /api/content-projects/:id/evidence/:evidenceId
 * 更新证据选择状态或用户笔记，不覆盖来源摘录。
 */
router.patch('/:id/evidence/:evidenceId', (req, res) => {
  const projectCheck = validateId(req.params.id, '内容项目 ID');
  if (!projectCheck.valid) return res.status(400).json({ error: projectCheck.error });
  const evidenceCheck = validateId(req.params.evidenceId, '证据 ID');
  if (!evidenceCheck.valid) return res.status(400).json({ error: evidenceCheck.error });
  if (req.body?.state !== undefined && !contentEvidenceStore.USER_STATES.has(req.body.state)) {
    return res.status(400).json({ error: '证据选择状态无效' });
  }
  if (req.body?.userNote !== undefined
    && (typeof req.body.userNote !== 'string' || req.body.userNote.length > 5000)) {
    return res.status(400).json({ error: '证据用户笔记必须是最多 5000 字符的字符串' });
  }
  try {
    const result = contentEvidenceStore.update({
      projectId: projectCheck.id,
      evidenceId: evidenceCheck.id,
      state: req.body?.state,
      userNote: req.body?.userNote,
    });
    if (!result) return res.status(404).json({ error: '项目证据不存在' });
    res.json(result);
  } catch (error) {
    logger.warn({ err: error, projectId: projectCheck.id, evidenceId: evidenceCheck.id }, '更新项目证据失败');
    res.status(statusForBusinessError(error)).json({ error: error.message || '更新项目证据失败' });
  }
});

/**
 * POST /api/content-projects/:id/creation-jobs
 * 幂等受理证据提取、提纲草案或主稿草案任务。
 */
router.post('/:id/creation-jobs', (req, res) => {
  const projectCheck = validateId(req.params.id, '内容项目 ID');
  if (!projectCheck.valid) return res.status(400).json({ error: projectCheck.error });
  const body = req.body || {};
  if (!contentCreationContext.OPERATIONS.has(body.operation)) {
    return res.status(400).json({ error: '创作任务类型无效' });
  }
  if (typeof body.requestKey !== 'string' || !body.requestKey.trim() || body.requestKey.length > 200) {
    return res.status(400).json({ error: '请提供不超过 200 字符的请求标识' });
  }
  if (typeof body.taskId !== 'string' || !body.taskId.trim() || body.taskId.length > 200) {
    return res.status(400).json({ error: '请提供不超过 200 字符的 SSE 任务标识' });
  }
  try {
    contentGenerationJobStore.reconcileExpired({ projectId: projectCheck.id });
    const context = contentCreationContext.build({
      projectId: projectCheck.id,
      operation: body.operation,
      input: {
        sourceIds: body.sourceIds,
        evidenceIds: body.evidenceIds,
        outlineRevisionId: body.outlineRevisionId,
        creatorInputKeys: body.creatorInputKeys,
      },
    });
    const acquired = contentGenerationJobStore.acquire({
      projectId: projectCheck.id,
      operation: body.operation,
      requestKey: body.requestKey.trim(),
      inputSha256: context.inputSha256,
      snapshot: context.snapshot,
      leaseMs: contentGenerationRunner.LEASE_MS,
    });
    if (acquired.job.status !== 'completed') {
      contentGenerationRunner.start({ job: acquired.job, taskId: body.taskId.trim() });
    }
    res.status(acquired.job.status === 'completed' ? 200 : 202).json({ job: acquired.job });
  } catch (error) {
    const statusCode = statusForBusinessError(error);
    logger.warn({ err: error, projectId: projectCheck.id, operation: body.operation }, '受理内容创作任务失败');
    res.status(statusCode).json({ error: error.message || '受理内容创作任务失败' });
  }
});

module.exports = router;
