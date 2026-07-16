const express = require('express');
const researchService = require('../services/researchService');
const { createScopedLogger } = require('../services/logger');

const router = express.Router();
const logger = createScopedLogger('research-route');

/** GET /api/research/claims/search - 跨播客搜索观点 */
router.get('/claims/search', async (req, res) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!query) return res.status(400).json({ error: '请输入要研究的问题' });
    if (query.length > 500) return res.status(400).json({ error: '研究问题不能超过 500 个字符' });
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const results = await researchService.searchClaims({ query, limit });
    res.json({ results });
  } catch (error) {
    logger.error({ err: error }, '搜索观点失败');
    res.status(500).json({ error: error.message || '搜索观点失败' });
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
