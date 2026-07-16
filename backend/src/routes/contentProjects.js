const express = require('express');
const store = require('../services/contentProjectStore');
const exportService = require('../services/contentExportService');
const { createScopedLogger } = require('../services/logger');
const { validateId } = require('../utils/validation');

const router = express.Router();
const logger = createScopedLogger('content-project-route');

function stringValue(value, fallback = '', max = 12000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : fallback;
}

/** GET /api/content-projects - 列出内容项目 */
router.get('/', (req, res) => {
  try { res.json({ projects: store.list() }); }
  catch (error) { logger.error({ err: error }, '获取内容项目失败'); res.status(500).json({ error: '获取内容项目失败' }); }
});

/** POST /api/content-projects - 创建内容项目 */
router.post('/', (req, res) => {
  try {
    const title = stringValue(req.body.title, '', 300);
    if (!title) return res.status(400).json({ error: '请输入内容项目标题' });
    const project = store.create({ title, topic: stringValue(req.body.topic, '', 1000), targetPlatform: req.body.targetPlatform || 'general', thesis: stringValue(req.body.thesis) });
    res.status(201).json({ project });
  } catch (error) { logger.error({ err: error }, '创建内容项目失败'); res.status(400).json({ error: error.message || '创建内容项目失败' }); }
});

router.get('/:id', (req, res) => {
  try { const check = validateId(req.params.id, '内容项目 ID'); if (!check.valid) return res.status(400).json({ error: check.error }); const project = store.getById(check.id); if (!project) return res.status(404).json({ error: '内容项目不存在' }); res.json({ project }); }
  catch (error) { logger.error({ err: error }, '获取内容项目详情失败'); res.status(500).json({ error: '获取内容项目详情失败' }); }
});

router.patch('/:id', (req, res) => {
  try { const check = validateId(req.params.id, '内容项目 ID'); if (!check.valid) return res.status(400).json({ error: check.error }); const values = { title: req.body.title === undefined ? undefined : stringValue(req.body.title, '', 300), topic: req.body.topic === undefined ? undefined : stringValue(req.body.topic, '', 1000), targetPlatform: req.body.targetPlatform, thesis: req.body.thesis === undefined ? undefined : stringValue(req.body.thesis), personalPractice: req.body.personalPractice === undefined ? undefined : stringValue(req.body.personalPractice), personalJudgment: req.body.personalJudgment === undefined ? undefined : stringValue(req.body.personalJudgment), discussionQuestion: req.body.discussionQuestion === undefined ? undefined : stringValue(req.body.discussionQuestion), status: req.body.status === undefined ? undefined : stringValue(req.body.status, '', 50) }; if (values.title === '') return res.status(400).json({ error: '项目标题不能为空' }); const project = store.update(check.id, values); if (!project) return res.status(404).json({ error: '内容项目不存在' }); res.json({ project }); }
  catch (error) { logger.error({ err: error }, '更新内容项目失败'); res.status(400).json({ error: error.message || '更新内容项目失败' }); }
});

router.delete('/:id', (req, res) => {
  try { const check = validateId(req.params.id, '内容项目 ID'); if (!check.valid) return res.status(400).json({ error: check.error }); if (!store.remove(check.id)) return res.status(404).json({ error: '内容项目不存在' }); res.json({ message: '内容项目已删除' }); }
  catch (error) { logger.error({ err: error }, '删除内容项目失败'); res.status(500).json({ error: '删除内容项目失败' }); }
});

router.post('/:id/claims', (req, res) => {
  try { const check = validateId(req.params.id, '内容项目 ID'); if (!check.valid) return res.status(400).json({ error: check.error }); const claimId = Number(req.body.claimId); if (!Number.isInteger(claimId) || claimId <= 0) return res.status(400).json({ error: '观点 ID 无效' }); const project = store.addClaim(check.id, { claimId, usageNote: stringValue(req.body.usageNote, '', 2000) }); if (!project) return res.status(404).json({ error: '内容项目或观点不存在' }); res.status(201).json({ project }); }
  catch (error) { logger.error({ err: error }, '添加项目观点失败'); res.status(400).json({ error: error.message || '添加项目观点失败' }); }
});

router.patch('/:id/claims/reorder', (req, res) => {
  try { const check = validateId(req.params.id, '内容项目 ID'); if (!check.valid) return res.status(400).json({ error: check.error }); if (!Array.isArray(req.body.claimIds) || req.body.claimIds.some((id) => !Number.isInteger(id) || id <= 0)) return res.status(400).json({ error: '观点排序无效' }); const project = store.reorderClaims(check.id, req.body.claimIds); if (!project) return res.status(404).json({ error: '内容项目不存在' }); res.json({ project }); }
  catch (error) { logger.error({ err: error }, '调整项目观点排序失败'); res.status(400).json({ error: error.message || '调整项目观点排序失败' }); }
});

router.delete('/:id/claims/:claimId', (req, res) => {
  try { const a = validateId(req.params.id, '内容项目 ID'); const b = validateId(req.params.claimId, '观点 ID'); if (!a.valid) return res.status(400).json({ error: a.error }); if (!b.valid) return res.status(400).json({ error: b.error }); if (!store.removeClaim(a.id, b.id)) return res.status(404).json({ error: '项目观点不存在' }); res.json({ message: '观点已移出项目' }); }
  catch (error) { logger.error({ err: error }, '移除项目观点失败'); res.status(500).json({ error: '移除项目观点失败' }); }
});

router.post('/:id/export', (req, res) => {
  try { const check = validateId(req.params.id, '内容项目 ID'); if (!check.valid) return res.status(400).json({ error: check.error }); const project = store.getById(check.id); if (!project) return res.status(404).json({ error: '内容项目不存在' }); const platform = req.body.platform || project.target_platform; const markdown = exportService.exportProject({ project, platform }); res.json({ markdown, platform }); }
  catch (error) { logger.error({ err: error }, '导出内容项目失败'); res.status(400).json({ error: error.message || '导出内容项目失败' }); }
});

module.exports = router;
