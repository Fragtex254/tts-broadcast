// TTS 请求队列管理器
// 使用先进先出队列控制请求启动速率，同时允许少量请求在途，避免短句批量生成被单个慢请求阻塞。

const DEFAULT_RPM_LIMIT = 90;
const MIMO_TTS_RPM_LIMIT = 100;
const DEFAULT_TPM_LIMIT = 9000000;
const MIMO_TTS_TPM_LIMIT = 10000000;
const DEFAULT_MAX_CONCURRENT = 6;
const DEFAULT_RATE_LIMIT_BACKOFF_MS = 15000;
const DEFAULT_RATE_LIMIT_RETRIES = 2;
const RATE_WINDOW_MS = 60000;

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function estimateTextTokens(value) {
  if (!value || typeof value !== 'string') {
    return 0;
  }

  const cjkChars = value.match(/[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/g)?.length || 0;
  const nonCjkChars = value.length - cjkChars;
  return cjkChars + Math.ceil(nonCjkChars / 4);
}

/**
 * 粗略估算一次 TTS 请求消耗的文本 token。
 * MiMo 未返回预检 tokenizer，队列用保守估算控制全局 TPM，避免绕过 10M 硬限制。
 * @param {Object} params - TTS 参数
 * @returns {number} 估算 token 数
 */
function estimateTtsTokenCost(params = {}) {
  const total = estimateTextTokens(params.text)
    + estimateTextTokens(params.voiceDesign)
    + estimateTextTokens(params.stylePrompt);
  return Math.max(1, total);
}

class TTSQueueManager {
  constructor(options = {}) {
    this.queue = []; // 请求队列
    this.activeCount = 0; // 在途请求数
    this.timer = null; // 下一次调度定时器
    this.lastStartAt = 0; // 上一次启动请求的时间戳
    this.tokenStarts = []; // 最近一分钟已启动请求的 token 成本
    this.backoffUntil = 0; // 429 后暂停启动新请求的时间戳

    const configuredRpm = options.rpmLimit
      || parsePositiveInt(process.env.MIMO_TTS_RPM_LIMIT, DEFAULT_RPM_LIMIT);
    this.rpmLimit = Math.min(configuredRpm, MIMO_TTS_RPM_LIMIT);
    this.minIntervalMs = Math.ceil(60000 / this.rpmLimit);
    const configuredTpm = options.tpmLimit
      || parsePositiveInt(process.env.MIMO_TTS_TPM_LIMIT, DEFAULT_TPM_LIMIT);
    this.tpmLimit = Math.min(configuredTpm, MIMO_TTS_TPM_LIMIT);
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
   * @param {Object} [options]
   * @param {number} [options.tokenCost=1] - 本次请求估算 token 成本
   * @returns {Promise} 请求结果
   */
  enqueue(requestFn, options = {}) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        requestFn,
        resolve,
        reject,
        attempts: 0,
        tokenCost: this.normalizeTokenCost(options.tokenCost)
      });
      this.schedule();
    });
  }

  /**
   * 添加 TTS 请求到队列，并自动按文本估算 TPM 成本。
   * @param {Object} speechParams - tts.generateSpeech 参数
   * @param {Function} requestFn - 异步请求函数
   * @returns {Promise} 请求结果
   */
  enqueueTts(speechParams, requestFn) {
    return this.enqueue(requestFn, { tokenCost: estimateTtsTokenCost(speechParams) });
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
    const tokenDelay = this.getTokenDelay(now, this.queue[0]);
    const delay = Math.max(0, nextStartAt - now, this.backoffUntil - now, tokenDelay);

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

    const now = Date.now();
    const tokenDelay = this.getTokenDelay(now, this.queue[0]);
    if (tokenDelay > 0) {
      this.schedule();
      return;
    }

    const task = this.queue.shift();
    this.activeCount += 1;
    this.lastStartAt = now;
    this.recordTokenStart(now, task.tokenCost);

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
      tpmLimit: this.tpmLimit,
      tokenUsedLastMinute: this.getTokenUsed(Date.now()),
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
    this.tokenStarts = [];
  }

  normalizeTokenCost(value) {
    const parsed = Number.parseInt(value, 10);
    const cost = Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
    return Math.min(cost, this.tpmLimit);
  }

  pruneTokenStarts(now = Date.now()) {
    const cutoff = now - RATE_WINDOW_MS;
    while (this.tokenStarts.length > 0 && this.tokenStarts[0].at <= cutoff) {
      this.tokenStarts.shift();
    }
  }

  getTokenUsed(now = Date.now()) {
    this.pruneTokenStarts(now);
    return this.tokenStarts.reduce((sum, item) => sum + item.cost, 0);
  }

  getTokenDelay(now, task) {
    if (!task) return 0;
    this.pruneTokenStarts(now);
    const tokenCost = this.normalizeTokenCost(task.tokenCost);
    let used = this.tokenStarts.reduce((sum, item) => sum + item.cost, 0);
    if (used + tokenCost <= this.tpmLimit) {
      return 0;
    }

    for (const item of this.tokenStarts) {
      used -= item.cost;
      if (used + tokenCost <= this.tpmLimit) {
        return Math.max(0, item.at + RATE_WINDOW_MS - now);
      }
    }

    return RATE_WINDOW_MS;
  }

  recordTokenStart(now, tokenCost) {
    this.pruneTokenStarts(now);
    this.tokenStarts.push({ at: now, cost: this.normalizeTokenCost(tokenCost) });
  }
}

// 单例模式
const ttsQueue = new TTSQueueManager();

module.exports = ttsQueue;
module.exports.TTSQueueManager = TTSQueueManager;
module.exports.estimateTtsTokenCost = estimateTtsTokenCost;
