// 通用 RPM/TPM 限速队列。
// 控制“请求启动”速率，同时允许少量请求在途，适合 TTS/LLM 这类外部 API 批量任务。

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

function resolvePositiveOption({ value, envName, defaultValue }) {
  if (value !== undefined && value !== null) {
    return parsePositiveInt(value, defaultValue);
  }
  return parsePositiveInt(envName ? process.env[envName] : undefined, defaultValue);
}

function clampLimit(value, hardLimit) {
  return hardLimit ? Math.min(value, hardLimit) : value;
}

function parseRetryAfterMs(headers, fallbackMs) {
  const value = headers?.['retry-after'] || headers?.['Retry-After'];
  if (!value) return fallbackMs;
  const seconds = Number.parseFloat(value);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.ceil(seconds * 1000);
  }
  const retryAt = Date.parse(value);
  if (!Number.isNaN(retryAt)) {
    return Math.max(retryAt - Date.now(), fallbackMs);
  }
  return fallbackMs;
}

function getRetryAfterMs(error, fallbackMs) {
  if (error?.retryAfterMs) return error.retryAfterMs;
  const status = error?.status || error?.response?.status || error?.response?.data?.error?.code;
  if (status === 429 || status === '429') {
    return parseRetryAfterMs(error?.response?.headers, fallbackMs);
  }
  return 0;
}

class RateLimitedQueueManager {
  constructor(options = {}) {
    this.queue = [];
    this.activeCount = 0;
    this.activeCost = 0;
    this.timer = null;
    this.lastStartAt = 0;
    this.requestStarts = [];
    this.tokenStarts = [];
    this.payloadStarts = [];
    this.backoffUntil = 0;
    this.usageStore = options.usageStore || null;
    this.usageScope = options.usageScope || '';

    const rpmLimit = resolvePositiveOption({
      value: options.rpmLimit,
      envName: options.rpmEnvName,
      defaultValue: options.defaultRpmLimit || 60,
    });
    this.rpmLimit = clampLimit(rpmLimit, options.hardRpmLimit);
    this.minIntervalMs = Math.ceil(60000 / this.rpmLimit);

    const tpmLimit = resolvePositiveOption({
      value: options.tpmLimit,
      envName: options.tpmEnvName,
      defaultValue: options.defaultTpmLimit || 1000000,
    });
    this.tpmLimit = clampLimit(tpmLimit, options.hardTpmLimit);
    const payloadPerMinuteLimit = resolvePositiveOption({
      value: options.payloadPerMinuteLimit,
      envName: options.payloadPerMinuteEnvName,
      defaultValue: options.defaultPayloadPerMinuteLimit || 0,
    });
    this.payloadPerMinuteLimit = clampLimit(payloadPerMinuteLimit, options.hardPayloadPerMinuteLimit);

    this.maxConcurrent = resolvePositiveOption({
      value: options.maxConcurrent,
      envName: options.maxConcurrentEnvName,
      defaultValue: options.defaultMaxConcurrent || 4,
    });
    this.startBurstLimit = Math.min(
      this.maxConcurrent,
      resolvePositiveOption({
        value: options.startBurstLimit,
        envName: options.startBurstLimitEnvName,
        defaultValue: options.defaultStartBurstLimit || this.maxConcurrent,
      })
    );
    this.rateLimitBackoffMs = resolvePositiveOption({
      value: options.rateLimitBackoffMs,
      envName: options.rateLimitBackoffMsEnvName,
      defaultValue: options.defaultRateLimitBackoffMs || DEFAULT_RATE_LIMIT_BACKOFF_MS,
    });
    this.maxRateLimitBackoffMs = resolvePositiveOption({
      value: options.maxRateLimitBackoffMs,
      envName: options.maxRateLimitBackoffMsEnvName,
      defaultValue: options.defaultMaxRateLimitBackoffMs || this.rateLimitBackoffMs,
    });
    this.rateLimitRetries = options.rateLimitRetries ?? parsePositiveInt(
      options.rateLimitRetriesEnvName ? process.env[options.rateLimitRetriesEnvName] : undefined,
      options.defaultRateLimitRetries ?? DEFAULT_RATE_LIMIT_RETRIES
    );
    this.clearMessage = options.clearMessage || '队列已清空';
  }

  /**
   * 添加请求到队列。
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
        requestCost: this.normalizeCost(options.requestCost),
        tokenCost: this.normalizeTokenCost(options.tokenCost),
        payloadCost: this.normalizePayloadCost(options.payloadCost),
        concurrencyCost: this.normalizeConcurrencyCost(options.concurrencyCost),
      });
      this.schedule();
    });
  }

  schedule() {
    if (this.timer || this.queue.length === 0 || !this.hasCapacity(this.queue[0])) {
      return;
    }

    const now = Date.now();
    const backoffUntil = this.getBackoffUntil();
    const rpmDelay = this.getStartDelay(now, this.queue[0]);
    const tokenDelay = this.getTokenDelay(now, this.queue[0]);
    const payloadDelay = this.getPayloadDelay(now, this.queue[0]);
    const delay = Math.max(0, backoffUntil - now, rpmDelay, tokenDelay, payloadDelay);

    this.timer = setTimeout(() => {
      this.timer = null;
      this.startNext();
    }, delay);
  }

  startNext() {
    while (this.queue.length > 0 && this.hasCapacity(this.queue[0])) {
      const now = Date.now();
      const backoffUntil = this.getBackoffUntil();
      const delay = Math.max(
        0,
        backoffUntil - now,
        this.getStartDelay(now, this.queue[0]),
        this.getTokenDelay(now, this.queue[0]),
        this.getPayloadDelay(now, this.queue[0])
      );
      if (delay > 0) break;

      const task = this.queue.shift();
      this.activeCount += 1;
      this.activeCost += task.concurrencyCost;
      this.lastStartAt = now;
      this.recordRequestStart(now, task.requestCost, task.tokenCost, task.payloadCost);
      this.recordTokenStart(now, task.tokenCost);
      this.recordPayloadStart(now, task.payloadCost);

      Promise.resolve()
        .then(task.requestFn)
        .then(task.resolve, (error) => {
          const retryAfterMs = getRetryAfterMs(error, this.rateLimitBackoffMs);
          if (retryAfterMs && task.attempts < this.rateLimitRetries) {
            task.attempts += 1;
            this.queue.unshift(task);
            this.backoff(this.getRetryDelayMs(retryAfterMs, task.attempts));
            return;
          }
          if (retryAfterMs) {
            this.backoff(this.getRetryDelayMs(retryAfterMs, task.attempts + 1));
          }
          task.reject(error);
        })
        .finally(() => {
          this.activeCount -= 1;
          this.activeCost -= task.concurrencyCost;
          this.schedule();
        });
    }

    this.schedule();
  }

  getQueueLength() {
    return this.queue.length;
  }

  getStatus() {
    return {
      queued: this.queue.length,
      active: this.activeCount,
      rpmLimit: this.rpmLimit,
      tpmLimit: this.tpmLimit,
      payloadPerMinuteLimit: this.payloadPerMinuteLimit,
      requestStartedLastMinute: this.getRpmUsed(Date.now()),
      tokenUsedLastMinute: this.getTokenUsed(Date.now()),
      payloadUsedLastMinute: this.getPayloadUsed(Date.now()),
      minIntervalMs: this.minIntervalMs,
      maxConcurrent: this.maxConcurrent,
      activeCost: this.activeCost,
      startBurstLimit: this.startBurstLimit,
      backoffUntil: this.getBackoffUntil(),
      rateLimitRetries: this.rateLimitRetries,
      maxRateLimitBackoffMs: this.maxRateLimitBackoffMs,
    };
  }

  backoff(ms = this.rateLimitBackoffMs) {
    const nextBackoffUntil = Date.now() + Math.max(ms, 0);
    this.backoffUntil = Math.max(this.backoffUntil, nextBackoffUntil);
    if (this.usageStore && this.usageScope) {
      this.usageStore.setBackoffUntil({
        scope: this.usageScope,
        backoffUntilMs: nextBackoffUntil,
      });
    }
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.schedule();
  }

  clear() {
    this.queue.forEach(({ reject }) => {
      reject(new Error(this.clearMessage));
    });
    this.queue = [];
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.backoffUntil = 0;
    this.requestStarts = [];
    this.tokenStarts = [];
    this.payloadStarts = [];
    if (this.usageStore && this.usageScope) {
      this.usageStore.clearScope(this.usageScope);
    }
  }

  pruneRequestStarts(now = Date.now()) {
    if (this.usageStore && this.usageScope) {
      this.usageStore.prune({ scope: this.usageScope, beforeMs: now - RATE_WINDOW_MS });
      return;
    }
    const cutoff = now - RATE_WINDOW_MS;
    while (this.requestStarts.length > 0 && this.requestStarts[0].at <= cutoff) {
      this.requestStarts.shift();
    }
  }

  getRpmUsed(now = Date.now()) {
    this.pruneRequestStarts(now);
    if (this.usageStore && this.usageScope) {
      return this.getStoredWindow(now).reduce((sum, item) => sum + this.normalizeCost(item.request_cost), 0);
    }
    return this.requestStarts.reduce((sum, item) => sum + item.cost, 0);
  }

  getRpmDelay(now = Date.now(), task) {
    this.pruneRequestStarts(now);
    const requestCost = this.normalizeCost(task?.requestCost);
    let used = 0;
    const entries = this.getRequestWindow(now);
    for (const entry of entries) {
      used += entry.cost;
    }
    if (used + requestCost <= this.rpmLimit) {
      return 0;
    }
    for (const entry of entries) {
      used -= entry.cost;
      if (used + requestCost <= this.rpmLimit) {
        return Math.max(0, entry.at + RATE_WINDOW_MS - now);
      }
    }
    return RATE_WINDOW_MS;
  }

  getBurstDelay(now = Date.now(), task) {
    this.pruneRequestStarts(now);
    const requestCost = this.normalizeCost(task?.requestCost);
    const intervalMs = this.minIntervalMs * requestCost;
    const lastStartAt = this.getLastStartAt(now);
    if (this.startBurstLimit <= 1 && this.hasPreviousStart(now)) {
      return Math.max(0, lastStartAt + intervalMs - now);
    }
    if (this.getRpmUsed(now) < this.startBurstLimit) {
      return 0;
    }
    return Math.max(0, lastStartAt + intervalMs - now);
  }

  getStartDelay(now = Date.now(), task) {
    return Math.max(this.getRpmDelay(now, task), this.getBurstDelay(now, task));
  }

  normalizeCost(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
  }

  normalizeTokenCost(value) {
    const parsed = Number.parseInt(value, 10);
    const cost = Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
    return Math.min(cost, this.tpmLimit);
  }

  normalizePayloadCost(value) {
    const parsed = Number.parseInt(value, 10);
    const cost = Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
    return this.payloadPerMinuteLimit > 0 ? Math.min(cost, this.payloadPerMinuteLimit) : cost;
  }

  normalizeConcurrencyCost(value) {
    const parsed = Number.parseInt(value, 10);
    const cost = Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
    return Math.min(cost, this.maxConcurrent);
  }

  hasCapacity(task) {
    if (!task) return false;
    return this.activeCost + task.concurrencyCost <= this.maxConcurrent;
  }

  getRetryDelayMs(retryAfterMs, attempt) {
    const multiplier = Math.max(1, 2 ** Math.max(0, attempt - 1));
    return Math.min(retryAfterMs * multiplier, this.maxRateLimitBackoffMs);
  }

  getBackoffUntil() {
    if (this.usageStore && this.usageScope) {
      return Math.max(this.backoffUntil, this.usageStore.getBackoffUntil(this.usageScope));
    }
    return this.backoffUntil;
  }

  getStoredWindow(now = Date.now()) {
    if (!this.usageStore || !this.usageScope) return [];
    return this.usageStore.getWindow({ scope: this.usageScope, sinceMs: now - RATE_WINDOW_MS });
  }

  getRequestWindow(now = Date.now()) {
    if (this.usageStore && this.usageScope) {
      return this.getStoredWindow(now).map((item) => ({
        at: item.started_at_ms,
        cost: this.normalizeCost(item.request_cost),
      }));
    }
    return this.requestStarts;
  }

  getLastStartAt(now = Date.now()) {
    const entries = this.getRequestWindow(now);
    const storedLastStartAt = entries.length > 0 ? entries[entries.length - 1].at : 0;
    return Math.max(this.lastStartAt, storedLastStartAt);
  }

  hasPreviousStart(now = Date.now()) {
    return this.lastStartAt > 0 || this.getRequestWindow(now).length > 0;
  }

  pruneTokenStarts(now = Date.now()) {
    if (this.usageStore && this.usageScope) {
      this.usageStore.prune({ scope: this.usageScope, beforeMs: now - RATE_WINDOW_MS });
      return;
    }
    const cutoff = now - RATE_WINDOW_MS;
    while (this.tokenStarts.length > 0 && this.tokenStarts[0].at <= cutoff) {
      this.tokenStarts.shift();
    }
  }

  getTokenUsed(now = Date.now()) {
    this.pruneTokenStarts(now);
    if (this.usageStore && this.usageScope) {
      return this.getStoredWindow(now).reduce((sum, item) => sum + this.normalizeTokenCost(item.token_cost), 0);
    }
    return this.tokenStarts.reduce((sum, item) => sum + item.cost, 0);
  }

  getTokenDelay(now, task) {
    if (!task) return 0;
    this.pruneTokenStarts(now);
    const tokenCost = this.normalizeTokenCost(task.tokenCost);
    let used = this.getTokenUsed(now);
    if (used + tokenCost <= this.tpmLimit) {
      return 0;
    }

    for (const item of this.getTokenWindow(now)) {
      used -= item.cost;
      if (used + tokenCost <= this.tpmLimit) {
        return Math.max(0, item.at + RATE_WINDOW_MS - now);
      }
    }

    return RATE_WINDOW_MS;
  }

  recordTokenStart(now, tokenCost) {
    if (this.usageStore && this.usageScope) return;
    this.pruneTokenStarts(now);
    this.tokenStarts.push({ at: now, cost: this.normalizeTokenCost(tokenCost) });
  }

  getTokenWindow(now = Date.now()) {
    if (this.usageStore && this.usageScope) {
      return this.getStoredWindow(now).map((item) => ({
        at: item.started_at_ms,
        cost: this.normalizeTokenCost(item.token_cost),
      }));
    }
    return this.tokenStarts;
  }

  getPayloadUsed(now = Date.now()) {
    this.prunePayloadStarts(now);
    if (this.usageStore && this.usageScope) {
      return this.getStoredWindow(now).reduce((sum, item) => sum + this.normalizePayloadCost(item.payload_cost), 0);
    }
    return this.payloadStarts.reduce((sum, item) => sum + item.cost, 0);
  }

  getPayloadDelay(now, task) {
    if (!task || this.payloadPerMinuteLimit <= 0) return 0;
    this.prunePayloadStarts(now);
    const payloadCost = this.normalizePayloadCost(task.payloadCost);
    let used = this.getPayloadUsed(now);
    if (used + payloadCost <= this.payloadPerMinuteLimit) {
      return 0;
    }

    const entries = this.getPayloadWindow(now);
    for (const entry of entries) {
      used -= entry.cost;
      if (used + payloadCost <= this.payloadPerMinuteLimit) {
        return Math.max(0, entry.at + RATE_WINDOW_MS - now);
      }
    }

    return RATE_WINDOW_MS;
  }

  prunePayloadStarts(now = Date.now()) {
    if (this.usageStore && this.usageScope) {
      this.usageStore.prune({ scope: this.usageScope, beforeMs: now - RATE_WINDOW_MS });
      return;
    }
    const cutoff = now - RATE_WINDOW_MS;
    while (this.payloadStarts.length > 0 && this.payloadStarts[0].at <= cutoff) {
      this.payloadStarts.shift();
    }
  }

  getPayloadWindow(now = Date.now()) {
    if (this.usageStore && this.usageScope) {
      return this.getStoredWindow(now).map((item) => ({
        at: item.started_at_ms,
        cost: this.normalizePayloadCost(item.payload_cost),
      }));
    }
    return this.payloadStarts;
  }

  recordPayloadStart(now, payloadCost) {
    if (this.usageStore && this.usageScope) return;
    this.prunePayloadStarts(now);
    const cost = this.normalizePayloadCost(payloadCost);
    if (cost > 0) {
      this.payloadStarts.push({ at: now, cost });
    }
  }

  recordRequestStart(now, requestCost, tokenCost, payloadCost) {
    this.pruneRequestStarts(now);
    if (this.usageStore && this.usageScope) {
      this.usageStore.recordStart({
        scope: this.usageScope,
        startedAtMs: now,
        requestCost: this.normalizeCost(requestCost),
        tokenCost: this.normalizeTokenCost(tokenCost),
        payloadCost: this.normalizePayloadCost(payloadCost),
      });
      return;
    }
    this.requestStarts.push({ at: now, cost: this.normalizeCost(requestCost) });
  }
}

module.exports = {
  RATE_WINDOW_MS,
  RateLimitedQueueManager,
  estimateTextTokens,
  parsePositiveInt,
};
