const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { createScopedLogger } = require('./services/logger');
const { createProcessLifecycle } = require('./services/processLifecycle');
const { sendInternalError } = require('./utils/httpResponse');
const { audioDir, assetDir } = require('./utils/validation');

const app = express();
const logger = createScopedLogger('app');
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '127.0.0.1';

const DEFAULT_CORS_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];

function getAllowedCorsOrigins(value = process.env.CORS_ORIGINS) {
  const configuredOrigins = typeof value === 'string'
    ? value.split(',').map((origin) => origin.trim()).filter(Boolean)
    : [];
  return new Set([...DEFAULT_CORS_ORIGINS, ...configuredOrigins]);
}

// CORS 配置
const allowedCorsOrigins = getAllowedCorsOrigins();
const corsOptions = {
  origin(origin, callback) {
    callback(null, !origin || allowedCorsOrigins.has(origin));
  },
  credentials: true,
};

const REQUEST_BODY_LIMIT = process.env.REQUEST_BODY_LIMIT || '20mb';

// 中间件
app.use((req, res, next) => {
  const origin = req.get('Origin');
  if (origin && !allowedCorsOrigins.has(origin)) {
    return res.status(403).json({ error: '不允许的跨域来源' });
  }
  next();
});
app.use(cors(corsOptions));
app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: REQUEST_BODY_LIMIT }));

// 静态文件（音频存储）
app.use('/audio', express.static(audioDir));
app.use('/assets', express.static(assetDir));

// API 路由
app.use('/api/broadcast', require('./routes/broadcast'));
app.use('/api/broadcast', require('./routes/segments'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/schedules', require('./routes/schedule'));
app.use('/api/voice-presets', require('./routes/voicePresets'));
app.use('/api/transcribe', require('./routes/transcribe'));
app.use('/api/transcribe', require('./routes/transcriptWorkspace'));
app.use('/api/research', require('./routes/research'));
app.use('/api/content-projects', require('./routes/contentProjects'));
app.use('/api/content-projects', require('./routes/contentWorkspace'));
app.use('/api/content-projects', require('./routes/contentCreation'));
app.use('/api/sse', require('./routes/sse'));
app.use('/api/health', require('./routes/health'));

// 错误处理中间件
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    logger.warn({
      method: req.method,
      hasPath: Boolean(req.path),
      pathLength: typeof req.path === 'string' ? req.path.length : undefined,
    }, '请求体过大');
    return res.status(413).json({ error: '请求体过大，请压缩音频或使用更短的参考音频' });
  }

  logger.error({ err }, '服务器内部错误');
  sendInternalError(res);
});

/**
 * 启动 HTTP 服务和调度器
 * @param {Object} [options]
 * @param {boolean} [options.manageProcess=true] - 是否注册进程生命周期监听
 * @returns {import('http').Server} HTTP server 实例
 */
function start({ manageProcess = true } = {}) {
  const scheduler = require('./services/scheduler');
  scheduler.init();

  const server = app.listen(PORT, HOST, () => {
    logger.info({ host: HOST, port: PORT }, `服务器运行在 http://${HOST}:${PORT}`);
  });

  if (manageProcess) {
    const db = require('./db');
    const sseManager = require('./services/sseManager');
    const lifecycle = createProcessLifecycle({
      processRef: process,
      scheduler,
      sseManager,
      server,
      db,
      logger,
    });
    lifecycle.register();
  }

  return server;
}

if (require.main === module) {
  start();
}

module.exports = app;
module.exports.start = start;
module.exports.getAllowedCorsOrigins = getAllowedCorsOrigins;
