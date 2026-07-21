// SSE 端点路由
const express = require('express');
const router = express.Router();
const sseManager = require('../services/sseManager');

/**
 * GET /api/sse/:taskId
 * 建立 SSE 连接，订阅指定任务的事件
 */
router.get('/:taskId', (req, res) => {
  const { taskId } = req.params;

  // 设置 SSE 响应头
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // 禁用 Nginx 缓冲
  });

  // 发送初始连接成功消息
  res.write(`event: connected\ndata: ${JSON.stringify({ taskId, timestamp: Date.now() })}\n\n`);

  // 添加到连接管理器
  sseManager.addClient(taskId, res);

  // 心跳保活（每 30 秒）
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30000);

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    clearInterval(heartbeat);
    sseManager.removeClient(taskId, res);
  };

  // 客户端断开或服务端主动结束时清理
  req.on('close', cleanup);
  res.on('close', cleanup);
  res.on('finish', cleanup);
});

module.exports = router;
