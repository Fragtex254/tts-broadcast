// TTS 请求队列管理器
// 使用先进先出队列控制请求启动速率，同时允许少量请求在途，避免短句批量生成被单个慢请求阻塞。

const DEFAULT_RPM_LIMIT = 90;
const MIMO_TTS_RPM_LIMIT = 100;
const DEFAULT_MAX_CONCURRENT = 6;
const DEFAULT_RATE_LIMIT_BACKOFF_MS = 15000;
const DEFAULT_RATE_LIMIT_RETRIES = 2;

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

class TTSQueueManager {
  constructor(options = {}) {
    this.queue = []; // 请求队列
    this.activeCount = 0; // 在途请求数
    this.timer = null; // 下一次调度定时器
    this.lastStartAt = 0; // 上一次启动请求的时间戳
    this.backoffUntil = 0; // 429 后暂停启动新请求的时间戳

    const configuredRpm = options.rpmLimit
      || parsePositiveInt(process.env.MIMO_TTS_RPM_LIMIT, DEFAULT_RPM_LIMIT);
    this.rpmLimit = Math.min(configuredRpm, MIMO_TTS_RPM_LIMIT);
    this.minIntervalMs = Math.ceil(60000 / this.rpmLimit);
    this.maxConcurrent = options.maxConcurrent
      || parsePositiveInt(process.env.MIMO_TTS_MAX_CONCURRENT, DEFAULT_MAX_CONCURRENT);
    this.rateLimitBackoffMs = options.rateLimitBackoffMs
      || parsePositiveInt(process.env.MIMO_TTS_RATE_LIMIT_BACKOFF_MS, DEFAULT_RATE_LIMIT_BACKOFF_MS);
    this.rateLimitRetries = options.rateLimitRetries ?? parsePositiveInt(
      process.env.MIMO_TTS_RATE_LIMIT_RETRIES,
      DEFAULT_RATE_LIMIT_RETRIES
    );
  }

  /**
   * 添加请求到队列
   * @param {Function} requestFn - 异步请求函数
   * @returns {Promise} 请求结果
   */
  enqueue(requestFn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ requestFn, resolve, reject, attempts: 0 });
      this.schedule();
    });
  }

  /**
   * 安排队列处理
   */
  schedule() {
    if (this.timer || this.queue.length === 0 || this.activeCount >= this.maxConcurrent) {
      return;
    }

    const now = Date.now();
    const nextStartAt = this.lastStartAt + this.minIntervalMs;
    const delay = Math.max(0, nextStartAt - now, this.backoffUntil - now);

    this.timer = setTimeout(() => {
      this.timer = null;
      this.startNext();
    }, delay);
  }

  /**
   * 启动下一个请求
   */
  startNext() {
    if (this.queue.length === 0 || this.activeCount >= this.maxConcurrent) {
      this.schedule();
      return;
    }

    const task = this.queue.shift();
    this.activeCount += 1;
    this.lastStartAt = Date.now();

    Promise.resolve()
      .then(task.requestFn)
      .then(task.resolve, (error) => {
        if (error?.retryAfterMs && task.attempts < this.rateLimitRetries) {
          task.attempts += 1;
          this.queue.unshift(task);
          this.backoff(error.retryAfterMs);
          return;
        }
        if (error?.retryAfterMs) {
          this.backoff(error.retryAfterMs);
        }
        task.reject(error);
      })
      .finally(() => {
        this.activeCount -= 1;
        this.schedule();
      });

    this.schedule();
  }

  /**
   * 获取队列长度
   */
  getQueueLength() {
    return this.queue.length;
  }

  /**
   * 获取限流状态
   */
  getStatus() {
    return {
      queued: this.queue.length,
      active: this.activeCount,
      rpmLimit: this.rpmLimit,
      minIntervalMs: this.minIntervalMs,
      maxConcurrent: this.maxConcurrent,
      backoffUntil: this.backoffUntil,
      rateLimitRetries: this.rateLimitRetries
    };
  }

  /**
   * MiMo 返回 429 后，暂停启动后续任务一段时间。
   * @param {number} [ms] - 退避毫秒数
   */
  backoff(ms = this.rateLimitBackoffMs) {
    const nextBackoffUntil = Date.now() + Math.max(ms, 0);
    this.backoffUntil = Math.max(this.backoffUntil, nextBackoffUntil);
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.schedule();
  }

  /**
   * 清空队列
   */
  clear() {
    this.queue.forEach(({ reject }) => {
      reject(new Error('队列已清空'));
    });
    this.queue = [];
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.backoffUntil = 0;
  }
}

// 单例模式
const ttsQueue = new TTSQueueManager();

module.exports = ttsQueue;
module.exports.TTSQueueManager = TTSQueueManager;
