const express = require('express');
const healthService = require('../services/healthService');
const { createScopedLogger } = require('../services/logger');
const { sendInternalError } = require('../utils/httpResponse');

const router = express.Router();
const logger = createScopedLogger('health-route');

/**
 * GET /api/health
 * 服务健康检查：运行状态、DB 连通性、队列与 SSE 连接概览（不含敏感信息）
 */
router.get('/', (req, res) => {
  try {
    res.json(healthService.getHealthStatus());
  } catch (error) {
    logger.error({ err: error }, '获取健康状态失败');
    sendInternalError(res);
  }
});

module.exports = router;
