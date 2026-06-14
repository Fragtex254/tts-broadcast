const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const { createScopedLogger } = require('./services/logger');

const app = express();
const logger = createScopedLogger('app');
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// CORS 配置
const corsOptions = {
  origin: NODE_ENV === 'production'
    ? process.env.FRONTEND_URL || 'http://localhost:5173'  // 生产环境限制来源
    : true,  // 开发环境允许所有来源
  credentials: true,
};

const REQUEST_BODY_LIMIT = process.env.REQUEST_BODY_LIMIT || '20mb';

// 中间件
app.use(cors(corsOptions));
app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: REQUEST_BODY_LIMIT }));

// 静态文件（音频存储）
app.use('/audio', express.static(path.join(__dirname, '../audio')));

// API 路由
app.use('/api/broadcast', require('./routes/broadcast'));
app.use('/api/broadcast', require('./routes/segments'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/schedules', require('./routes/schedule'));
app.use('/api/voice-presets', require('./routes/voicePresets'));
app.use('/api/transcribe', require('./routes/transcribe'));
app.use('/api/sse', require('./routes/sse'));

// 错误处理中间件
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    logger.warn({ method: req.method, path: req.path }, '请求体过大');
    return res.status(413).json({ error: '请求体过大，请压缩音频或使用更短的参考音频' });
  }

  logger.error({ err }, '服务器内部错误');
  res.status(500).json({ error: '服务器内部错误' });
});

/**
 * 启动 HTTP 服务和调度器
 * @returns {import('http').Server} HTTP server 实例
 */
function start() {
  const scheduler = require('./services/scheduler');
  scheduler.init();

  return app.listen(PORT, () => {
    logger.info({ port: PORT }, `服务器运行在 http://localhost:${PORT}`);
  });
}

if (require.main === module) {
  start();
}

module.exports = app;
module.exports.start = start;
