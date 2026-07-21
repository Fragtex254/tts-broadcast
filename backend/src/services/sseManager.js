/**
 * SSE 连接管理器
 * 管理所有客户端的 SSE 连接，支持按任务 ID 推送事件
 */

const { createScopedLogger } = require('./logger');

const logger = createScopedLogger('sse-manager');
const TERMINAL_REPLAY_TTL_MS = 5 * 60 * 1000;
const MAX_TERMINAL_REPLAYS = 256;
const MAX_TERMINAL_REPLAY_BYTES = 64 * 1024 * 1024;

class SSEManager {
  constructor() {
    // Map<taskId, Set<res>>
    this.connections = new Map();
    // Map<taskId, { message, bytes, expiresAt }>；仅短期保留 complete/error，供断线重连收口。
    this.terminalReplays = new Map();
    this.terminalReplayBytes = 0;
  }

  /**
   * 添加客户端连接
   * @param {string} taskId - 任务 ID（如 broadcast ID）
   * @param {object} res - Express response 对象
   */
  addClient(taskId, res) {
    if (!this.connections.has(taskId)) {
      this.connections.set(taskId, new Set());
    }
    this.connections.get(taskId).add(res);

    // 客户端断开时移除
    res.on('close', () => {
      this.removeClient(taskId, res);
    });
  }

  /**
   * 移除客户端连接
   * @param {string} taskId - 任务 ID
   * @param {object} res - Express response 对象
   */
  removeClient(taskId, res) {
    const clients = this.connections.get(taskId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) {
        this.connections.delete(taskId);
      }
    }
  }

  /**
   * 向指定任务的所有客户端推送事件
   * @param {string} taskId - 任务 ID
   * @param {string} eventType - 事件类型
   * @param {object} data - 事件数据
   */
  send(taskId, eventType, data) {
    const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    if (eventType === 'complete' || eventType === 'error') {
      this.rememberTerminal(taskId, message);
    }

    const clients = this.connections.get(taskId);
    if (!clients || clients.size === 0) return;

    for (const res of clients) {
      try {
        res.write(message);
      } catch (error) {
        logger.error({
          err: error,
          hasTaskId: Boolean(taskId),
          taskIdLength: typeof taskId === 'string' ? taskId.length : undefined,
          eventType,
        }, 'SSE 推送失败');
        this.removeClient(taskId, res);
      }
    }
  }

  /**
   * 向指定任务的所有客户端推送进度事件
   * @param {string} taskId - 任务 ID
   * @param {object} progress - 进度数据
   */
  sendProgress(taskId, progress) {
    this.send(taskId, 'progress', progress);
  }

  /**
   * 向指定任务的所有客户端推送完成事件
   * @param {string} taskId - 任务 ID
   * @param {object} result - 结果数据
   */
  sendComplete(taskId, result) {
    this.send(taskId, 'complete', result);
  }

  /**
   * 向指定任务的所有客户端推送错误事件
   * @param {string} taskId - 任务 ID
   * @param {string} error - 错误信息
   */
  sendError(taskId, error) {
    this.send(taskId, 'error', { error });
  }

  /**
   * 获取当前连接数
   * @returns {number}
   */
  getConnectionCount() {
    let count = 0;
    for (const clients of this.connections.values()) {
      count += clients.size;
    }
    return count;
  }

  /**
   * 获取指定任务的连接数
   * @param {string} taskId - 任务 ID
   * @returns {number}
   */
  getTaskConnectionCount(taskId) {
    const clients = this.connections.get(taskId);
    return clients ? clients.size : 0;
  }

  /**
   * 清除任务的旧 terminal 快照。新任务首次订阅时调用，避免复用 taskId 回放旧结果。
   * @param {string} taskId - 任务 ID
   */
  clearReplay(taskId) {
    this.deleteReplay(taskId);
  }

  /**
   * 向重连响应回放断线窗口内错过的 terminal 事件。
   * @param {string} taskId - 任务 ID
   * @param {object} res - Express response 对象
   * @returns {boolean} 是否完成回放
   */
  replayTerminal(taskId, res) {
    const replay = this.terminalReplays.get(taskId);
    if (!replay) return false;
    if (replay.expiresAt <= Date.now()) {
      this.deleteReplay(taskId);
      return false;
    }
    try {
      res.write(replay.message);
      return true;
    } catch (error) {
      logger.warn({ err: error, hasTaskId: Boolean(taskId) }, 'SSE terminal 事件回放失败');
      return false;
    }
  }

  rememberTerminal(taskId, message) {
    const now = Date.now();
    for (const [storedTaskId, replay] of this.terminalReplays) {
      if (replay.expiresAt <= now) this.deleteReplay(storedTaskId);
    }
    this.deleteReplay(taskId);
    const bytes = Buffer.byteLength(message);
    if (bytes > MAX_TERMINAL_REPLAY_BYTES) {
      logger.warn({ bytes }, 'SSE terminal 事件超过回放内存上限');
      return;
    }
    this.terminalReplays.set(taskId, {
      message,
      bytes,
      expiresAt: now + TERMINAL_REPLAY_TTL_MS,
    });
    this.terminalReplayBytes += bytes;
    while (
      this.terminalReplays.size > MAX_TERMINAL_REPLAYS
      || this.terminalReplayBytes > MAX_TERMINAL_REPLAY_BYTES
    ) {
      const oldestTaskId = this.terminalReplays.keys().next().value;
      if (oldestTaskId === undefined) break;
      this.deleteReplay(oldestTaskId);
    }
  }

  deleteReplay(taskId) {
    const replay = this.terminalReplays.get(taskId);
    if (!replay) return;
    this.terminalReplayBytes = Math.max(0, this.terminalReplayBytes - replay.bytes);
    this.terminalReplays.delete(taskId);
  }

  /**
   * 关闭全部 SSE 连接。
   * @returns {number} 已关闭的连接数
   */
  closeAll() {
    const clients = [];
    for (const taskClients of this.connections.values()) {
      clients.push(...taskClients);
    }
    this.connections.clear();
    this.terminalReplays.clear();
    this.terminalReplayBytes = 0;

    for (const res of clients) {
      try {
        res.end();
      } catch (error) {
        logger.warn({ err: error }, '关闭 SSE 连接失败');
      }
    }

    logger.info({ count: clients.length }, '已关闭全部 SSE 连接');
    return clients.length;
  }
}

// 单例模式
const sseManager = new SSEManager();

module.exports = sseManager;
