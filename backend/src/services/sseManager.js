/**
 * SSE 连接管理器
 * 管理所有客户端的 SSE 连接，支持按任务 ID 推送事件
 */

const { createScopedLogger } = require('./logger');

const logger = createScopedLogger('sse-manager');

class SSEManager {
  constructor() {
    // Map<taskId, Set<res>>
    this.connections = new Map();
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
    const clients = this.connections.get(taskId);
    if (!clients || clients.size === 0) return;

    const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;

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
   * 关闭全部 SSE 连接。
   * @returns {number} 已关闭的连接数
   */
  closeAll() {
    const clients = [];
    for (const taskClients of this.connections.values()) {
      clients.push(...taskClients);
    }
    this.connections.clear();

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
