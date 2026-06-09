// TTS 请求队列管理器
// 使用先进先出队列管理所有 TTS 生成请求，确保不超过 API 限流

class TTSQueueManager {
  constructor() {
    this.queue = []; // 请求队列
    this.isProcessing = false; // 是否正在处理
    this.interval = 700; // 请求间隔（毫秒）
  }

  /**
   * 添加请求到队列
   * @param {Function} requestFn - 异步请求函数
   * @returns {Promise} 请求结果
   */
  enqueue(requestFn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ requestFn, resolve, reject });
      this.processQueue();
    });
  }

  /**
   * 处理队列
   */
  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const { requestFn, resolve, reject } = this.queue.shift();

      try {
        const result = await requestFn();
        resolve(result);
      } catch (error) {
        reject(error);
      }

      // 请求间隔
      if (this.queue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, this.interval));
      }
    }

    this.isProcessing = false;
  }

  /**
   * 获取队列长度
   */
  getQueueLength() {
    return this.queue.length;
  }

  /**
   * 清空队列
   */
  clear() {
    this.queue.forEach(({ reject }) => {
      reject(new Error('队列已清空'));
    });
    this.queue = [];
  }
}

// 单例模式
const ttsQueue = new TTSQueueManager();

module.exports = ttsQueue;
