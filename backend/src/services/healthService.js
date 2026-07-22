const db = require('../db');
const ttsQueue = require('./ttsQueue');
const llmQueue = require('./llmQueue');
const sseManager = require('./sseManager');

const startedAt = Date.now();

/**
 * 队列状态裁剪为非敏感子集（去掉 token/payload 等容易与凭证混淆的字段）。
 * @param {Object} status - rateLimitedQueue.getStatus() 原始状态
 * @returns {Object} 可对外暴露的队列概览
 */
function publicQueueStatus(status) {
  return {
    queued: status.queued,
    active: status.active,
    rpmLimit: status.rpmLimit,
    tpmLimit: status.tpmLimit,
    maxConcurrent: status.maxConcurrent,
    requestStartedLastMinute: status.requestStartedLastMinute,
  };
}

/**
 * 汇总服务健康状态。不得返回任何敏感信息（密钥、路径、配置值）。
 * @returns {{ status: string, uptime: number, db: string, queues: Object, sseConnections: number }}
 */
function getHealthStatus() {
  let dbStatus = 'ok';
  try {
    db.prepare('SELECT 1 AS ok').get();
  } catch {
    dbStatus = 'error';
  }
  return {
    status: dbStatus === 'ok' ? 'ok' : 'degraded',
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    db: dbStatus,
    queues: {
      tts: publicQueueStatus(ttsQueue.getStatus()),
      llm: publicQueueStatus(llmQueue.getStatus()),
    },
    sseConnections: sseManager.getConnectionCount(),
  };
}

module.exports = { getHealthStatus };
