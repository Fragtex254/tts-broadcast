const express = require('express');
const researchService = require('../services/researchService');
const researchStore = require('../services/researchStore');
const { createScopedLogger } = require('../services/logger');
const { validateId } = require('../utils/validation');
const { sendInternalError } = require('../utils/httpResponse');

const router = express.Router();
const logger = createScopedLogger('research-route');

/** GET /api/research/claims/search - 跨播客搜索观点（统一分页协议） */
router.get('/claims/search', async (req, res) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!query) return res.status(400).json({ error: '请输入要研究的问题' });
    if (query.length > 500) return res.status(400).json({ error: '研究问题不能超过 500 个字符' });
    const rawPage = Number(req.query.page || 1);
    const page = Number.isInteger(rawPage) ? Math.max(rawPage, 1) : 1;
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const { items, total } = await researchService.searchClaims({ query, limit, offset });
    res.json({ results: items, pagination: { page, limit, total } });
  } catch (error) {
    logger.error({ err: error }, '搜索观点失败');
    sendInternalError(res);
  }
});

/** GET /api/research/claims/:id - 获取单条观点详情 */
router.get('/claims/:id', (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '观点 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });
    const claim = researchStore.getClaim(idCheck.id);
    if (!claim) return res.status(404).json({ error: '观点不存在' });
    res.json({ claim });
  } catch (error) {
    logger.error({ err: error }, '获取观点详情失败');
    sendInternalError(res);
  }
});

/** POST /api/research/claims/relations - 分析已选候选观点关系 */
router.post('/claims/relations', async (req, res) => {
  try {
    if (!Array.isArray(req.body.claimIds) || req.body.claimIds.some((id) => !Number.isInteger(id) || id <= 0)) {
      return res.status(400).json({ error: '请选择有效观点' });
    }
    const analysis = await researchService.analyzeRelations({ claimIds: req.body.claimIds });
    res.json({ analysis });
  } catch (error) {
    logger.error({ err: error }, '分析观点关系失败');
    res.status(400).json({ error: error.message || '分析观点关系失败' });
  }
});

module.exports = router;
