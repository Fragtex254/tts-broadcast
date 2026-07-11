// 通用 RPM/TPM 限速队列。
// 控制“请求启动”速率，同时允许少量请求在途，适合 TTS/LLM 这类外部 API 批量任务。

const DEFAULT_RATE_LIMIT_BACKOFF_MS = 15000;
const DEFAULT_RATE_LIMIT_RETRIES = 2;
const DEFAULT_CIRCUIT_BREAKER_MS = 60000;
const MAX_TIMER_DELAY_MS = 2147000000;
const RATE_WINDOW_MS = 60000;

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
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

function resolveNonNegativeOption({ value, envName, defaultValue }) {
  if (value !== undefined && value !== null) {
    return parseNonNegativeInt(value, defaultValue);
  }
  return parseNonNegativeInt(envName ? process.env[envName] : undefined, defaultValue);
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
    this.activePayloadCost = 0;
    this.activeTasks = new Set();
    this.timer = null;
    this.lastStartAt = 0;
    this.requestStarts = [];
    this.tokenStarts = [];
    this.payloadStarts = [];
    this.backoffUntil = 0;
    this.queueGeneration = 0;
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

    this.maxConcurrent = clampLimit(resolvePositiveOption({
      value: options.maxConcurrent,
      envName: options.maxConcurrentEnvName,
      defaultValue: options.defaultMaxConcurrent || 4,
    }), options.hardMaxConcurrent);
    this.initialConcurrent = Math.min(
      this.maxConcurrent,
      resolvePositiveOption({
        value: options.initialConcurrent,
        envName: options.initialConcurrentEnvName,
        defaultValue: options.defaultInitialConcurrent || this.maxConcurrent,
      })
    );
    this.adaptiveConcurrency = options.adaptiveConcurrency === true;
    this.minAdaptiveConcurrent = Math.min(
      this.initialConcurrent,
      resolvePositiveOption({
        value: options.minAdaptiveConcurrent,
        envName: options.minAdaptiveConcurrentEnvName,
        defaultValue: options.defaultMinAdaptiveConcurrent || 1,
      })
    );
    this.adaptiveRecoverySuccesses = resolvePositiveOption({
      value: options.adaptiveRecoverySuccesses,
      envName: options.adaptiveRecoverySuccessesEnvName,
      defaultValue: options.defaultAdaptiveRecoverySuccesses || 3,
    });
    this.adaptiveRecoveryCooldownMs = resolveNonNegativeOption({
      value: options.adaptiveRecoveryCooldownMs,
      envName: options.adaptiveRecoveryCooldownMsEnvName,
      defaultValue: options.defaultAdaptiveRecoveryCooldownMs ?? RATE_WINDOW_MS,
    });
    this.adaptiveSuccessCount = 0;
    this.effectiveMaxConcurrent = this.initialConcurrent;
    this.adaptiveConcurrencyCeiling = 0;
    this.lastRateLimitAt = 0;
    this.concurrencyDecreaseUntil = 0;

    const maxActivePayloadCost = resolveNonNegativeOption({
      value: options.maxActivePayloadCost,
      envName: options.maxActivePayloadCostEnvName,
      defaultValue: options.defaultMaxActivePayloadCost || 0,
    });
    this.maxActivePayloadCost = clampLimit(maxActivePayloadCost, options.hardMaxActivePayloadCost);
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
    this.rateLimitRetries = options.rateLimitRetries ?? parseNonNegativeInt(
      options.rateLimitRetriesEnvName ? process.env[options.rateLimitRetriesEnvName] : undefined,
      options.defaultRateLimitRetries ?? DEFAULT_RATE_LIMIT_RETRIES
    );
    this.circuitBreakerMs = resolvePositiveOption({
      value: options.circuitBreakerMs,
      envName: options.circuitBreakerMsEnvName,
      defaultValue: options.defaultCircuitBreakerMs || DEFAULT_CIRCUIT_BREAKER_MS,
    });
    this.circuitUntil = 0;
    this.circuitReason = '';
    this.clearMessage = options.clearMessage || '队列已清空';
    this.onRateLimit = typeof options.onRateLimit === 'function' ? options.onRateLimit : null;
    this.onConcurrencyChange = typeof options.onConcurrencyChange === 'function'
      ? options.onConcurrencyChange
      : null;

    this.loadPersistedState();
  }

  /**
   * 添加请求到队列。
   * @param {Function} requestFn - 异步请求函数
   * @param {Object} [options]
   * @param {number} [options.tokenCost=1] - 本次请求估算 token 成本
   * @returns {Promise} 请求结果
   */
  enqueue(requestFn, options = {}) {
    let circuitError;
    try {
      circuitError = this.getCircuitError();
    } catch (error) {
      return Promise.reject(error);
    }
    if (circuitError) {
      return Promise.reject(circuitError);
    }
    const activePayloadCost = this.normalizeActivePayloadCost(options.payloadCost);
    if (this.maxActivePayloadCost > 0 && activePayloadCost > this.maxActivePayloadCost) {
      return Promise.reject(new Error('请求 payload 超过队列允许的在途字节上限'));
    }
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
        activePayloadCost,
        generation: this.queueGeneration,
      });
      this.schedule();
    });
  }

  schedule() {
    if (this.timer || this.queue.length === 0) {
      return;
    }

    try {
      const circuitError = this.getCircuitError();
      if (circuitError) {
        this.rejectQueued(circuitError);
        return;
      }
      const plan = this.getNextTaskPlan(Date.now());
      this.armTimer(plan.delay);
    } catch (error) {
      this.rejectQueued(error);
    }
  }

  armTimer(delay) {
    if (this.timer || !Number.isFinite(delay)) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.startNext();
    }, Math.min(Math.max(0, delay), MAX_TIMER_DELAY_MS));
  }

  startNext() {
    let pendingPlan = null;
    while (this.queue.length > 0) {
      const now = Date.now();
      let plan;
      try {
        const circuitError = this.getCircuitError(now);
        if (circuitError) {
          this.rejectQueued(circuitError);
          return;
        }
        plan = this.getNextTaskPlan(now);
      } catch (error) {
        this.rejectQueued(error);
        return;
      }
      if (plan.index < 0 || plan.delay > 0) {
        pendingPlan = plan;
        break;
      }

      const [task] = this.queue.splice(plan.index, 1);
      this.activeCount += 1;
      this.activeCost += task.concurrencyCost;
      this.activePayloadCost += task.activePayloadCost;
      try {
        this.recordRequestStart(now, task.requestCost, task.tokenCost, task.payloadCost);
        this.recordTokenStart(now, task.tokenCost);
        this.recordPayloadStart(now, task.payloadCost);
        this.lastStartAt = now;
      } catch (error) {
        this.activeCount -= 1;
        this.activeCost -= task.concurrencyCost;
        this.activePayloadCost -= task.activePayloadCost;
        this.activeTasks.delete(task);
        task.reject(error);
        continue;
      }
      task.attemptPeakConcurrency = this.activeCost;
      this.activeTasks.add(task);
      for (const activeTask of this.activeTasks) {
        activeTask.attemptPeakConcurrency = Math.max(
          activeTask.attemptPeakConcurrency || 0,
          this.activeCost
        );
      }

      Promise.resolve()
        .then(task.requestFn)
        .then((result) => {
          try {
            this.handleTaskSuccess();
          } catch {
            // 队列观测或持久化失败不能吞掉已经成功的远端结果。
          }
          task.resolve(result);
        }, (error) => {
          try {
            const retryAfterMs = getRetryAfterMs(error, this.rateLimitBackoffMs);
            const isRateLimit = Boolean(retryAfterMs || error?.isRateLimit);
            const retryable = error?.retryable !== false;
            if (isRateLimit) {
              this.handleRateLimit({
                error,
                retryAfterMs,
                attemptConcurrency: task.attemptPeakConcurrency,
              });
            }
            if (
              retryAfterMs
              && retryable
              && task.generation === this.queueGeneration
              && task.attempts < this.rateLimitRetries
            ) {
              task.attempts += 1;
              this.queue.unshift(task);
              this.backoff(this.getRetryDelayMs(retryAfterMs, task.attempts));
              return;
            }
            if (retryAfterMs && retryable) {
              this.backoff(this.getRetryDelayMs(retryAfterMs, task.attempts + 1));
            }
            if (isRateLimit && !retryable) {
              this.openCircuit(error, retryAfterMs);
            }
          } catch {
            // 即使队列控制面失败，也必须让调用方收到原始请求错误。
          }
          task.reject(error);
        })
        .catch((error) => {
          task.reject(error);
        })
        .finally(() => {
          this.activeCount -= 1;
          this.activeCost -= task.concurrencyCost;
          this.activePayloadCost -= task.activePayloadCost;
          this.activeTasks.delete(task);
          this.schedule();
        });
    }

    if (pendingPlan) this.armTimer(pendingPlan.delay);
  }

  rejectQueued(error) {
    const pending = this.queue.splice(0);
    pending.forEach(({ reject }) => reject(error));
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
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
      initialConcurrent: this.initialConcurrent,
      effectiveMaxConcurrent: this.effectiveMaxConcurrent,
      adaptiveConcurrencyCeiling: this.adaptiveConcurrencyCeiling,
      activeCost: this.activeCost,
      activePayloadCost: this.activePayloadCost,
      maxActivePayloadCost: this.maxActivePayloadCost,
      startBurstLimit: this.startBurstLimit,
      backoffUntil: this.getBackoffUntil(),
      rateLimitRetries: this.rateLimitRetries,
      maxRateLimitBackoffMs: this.maxRateLimitBackoffMs,
      circuitUntil: this.getCircuitUntil(),
      circuitReason: this.circuitReason,
    };
  }

  backoff(ms = this.rateLimitBackoffMs) {
    const nextBackoffUntil = Date.now() + Math.max(ms, 0);
    this.backoffUntil = Math.max(this.backoffUntil, nextBackoffUntil);
    if (this.usageStore && this.usageScope) {
      try {
        this.usageStore.setBackoffUntil({
          scope: this.usageScope,
          backoffUntilMs: nextBackoffUntil,
        });
      } catch {
        // 当前进程的绝对退避时间仍然生效。
      }
    }
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.schedule();
  }

  clear() {
    this.queueGeneration += 1;
    this.queue.forEach(({ reject }) => {
      reject(new Error(this.clearMessage));
    });
    this.queue = [];
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.backoffUntil = 0;
    this.circuitUntil = 0;
    this.circuitReason = '';
    this.requestStarts = [];
    this.tokenStarts = [];
    this.payloadStarts = [];
    this.effectiveMaxConcurrent = this.initialConcurrent;
    this.adaptiveConcurrencyCeiling = 0;
    this.adaptiveSuccessCount = 0;
    this.lastRateLimitAt = 0;
    this.concurrencyDecreaseUntil = 0;
    if (this.usageStore && this.usageScope) {
      this.usageStore.clearScope(this.usageScope);
    }
  }

  loadPersistedState() {
    if (!this.usageStore || !this.usageScope || typeof this.usageStore.getState !== 'function') {
      return;
    }
    let state;
    try {
      state = this.usageStore.getState(this.usageScope);
    } catch {
      return;
    }
    if (this.adaptiveConcurrency && state.adaptiveConcurrencyLimit > 0) {
      this.effectiveMaxConcurrent = Math.max(
        this.minAdaptiveConcurrent,
        Math.min(state.adaptiveConcurrencyLimit, this.maxConcurrent)
      );
    }
    this.adaptiveConcurrencyCeiling = Math.min(
      state.adaptiveConcurrencyCeiling || 0,
      this.maxConcurrent
    );
    if (this.adaptiveConcurrencyCeiling > 0) {
      this.effectiveMaxConcurrent = Math.min(
        this.effectiveMaxConcurrent,
        this.adaptiveConcurrencyCeiling
      );
    }
    const now = Date.now();
    this.lastRateLimitAt = Math.min(state.lastRateLimitAtMs || 0, now);
    this.circuitUntil = state.circuitUntilMs || 0;
    this.circuitReason = state.circuitReason || '';
  }

  getCircuitUntil() {
    if (this.usageStore && this.usageScope && typeof this.usageStore.getState === 'function') {
      const state = this.usageStore.getState(this.usageScope);
      const storedCircuitUntil = state.circuitUntilMs || 0;
      if (storedCircuitUntil > this.circuitUntil) {
        this.circuitReason = state.circuitReason || this.circuitReason;
      }
      return Math.max(this.circuitUntil, storedCircuitUntil);
    }
    return this.circuitUntil;
  }

  createCircuitError() {
    const error = new Error(
      this.circuitReason === 'quota'
        ? 'MiMo TTS 套餐额度不足，请检查账户额度后重试'
        : 'MiMo TTS 暂时不可用，请稍后再试'
    );
    error.code = 'MIMO_RATE_LIMIT_CIRCUIT';
    error.retryable = false;
    return error;
  }

  getCircuitError(now = Date.now()) {
    const circuitUntil = this.getCircuitUntil();
    if (circuitUntil <= now) {
      if (this.circuitUntil > 0 || this.circuitReason) {
        if (this.usageStore && this.usageScope && typeof this.usageStore.setCircuit === 'function') {
          try {
            const cleared = this.usageStore.setCircuit({
              scope: this.usageScope,
              circuitUntilMs: 0,
              circuitReason: '',
              observedUntilMs: circuitUntil,
            });
            if (cleared === false && typeof this.usageStore.getState === 'function') {
              const latestState = this.usageStore.getState(this.usageScope);
              const latestUntil = latestState.circuitUntilMs || 0;
              if (latestUntil > now) {
                this.circuitUntil = latestUntil;
                this.circuitReason = latestState.circuitReason || this.circuitReason;
                return this.createCircuitError();
              }
            }
          } catch {
            // 过期熔断已在当前进程清除；持久化清理下次再试。
          }
        }
        this.circuitUntil = 0;
        this.circuitReason = '';
      }
      return null;
    }
    return this.createCircuitError();
  }

  openCircuit(error, retryAfterMs = 0) {
    const now = Date.now();
    this.queueGeneration += 1;
    this.circuitUntil = now + Math.max(this.circuitBreakerMs, retryAfterMs);
    this.circuitReason = error?.rateLimitReason || 'non-retryable';
    if (this.usageStore && this.usageScope && typeof this.usageStore.setCircuit === 'function') {
      try {
        this.usageStore.setCircuit({
          scope: this.usageScope,
          circuitUntilMs: this.circuitUntil,
          circuitReason: this.circuitReason,
        });
      } catch {
        // 当前进程仍保持熔断。
      }
    }
    const circuitError = this.createCircuitError();
    const pending = this.queue.splice(0);
    pending.forEach(({ reject }) => reject(circuitError));
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  getTaskDelay(now, task) {
    return Math.max(
      0,
      this.getBackoffUntil() - now,
      this.getStartDelay(now, task),
      this.getTokenDelay(now, task),
      this.getPayloadDelay(now, task)
    );
  }

  getNextTaskPlan(now = Date.now()) {
    if (this.queue.length === 0) {
      return { index: -1, delay: Number.POSITIVE_INFINITY };
    }

    // 仅当队首因在途请求/字节容量放不下时绕行；TPM/RPM 等预算仍保持 FIFO，避免大任务饥饿。
    let index = this.hasCapacity(this.queue[0]) ? 0 : -1;
    if (index < 0) {
      index = this.queue.findIndex((task, taskIndex) => taskIndex > 0 && this.hasCapacity(task));
    }
    if (index < 0) return { index: -1, delay: Number.POSITIVE_INFINITY };
    return { index, delay: this.getTaskDelay(now, this.queue[index]) };
  }

  handleRateLimit({ error, retryAfterMs, attemptConcurrency = this.activeCost }) {
    const now = Date.now();
    const rpmUsed = this.getRpmUsed(now);
    const tokenUsed = this.getTokenUsed(now);
    const hasLocalRateHeadroom = rpmUsed < this.rpmLimit * 0.8
      && tokenUsed < this.tpmLimit * 0.8;
    let concurrencyChanged = false;

    if (this.adaptiveConcurrency && error?.retryable !== false) {
      this.adaptiveSuccessCount = 0;
      this.lastRateLimitAt = now;
    }

    if (
      this.adaptiveConcurrency
      && error?.retryable !== false
      && hasLocalRateHeadroom
      && attemptConcurrency > 1
      && now >= this.concurrencyDecreaseUntil
    ) {
      const previous = this.effectiveMaxConcurrent;
      const learnedCeiling = Math.max(this.minAdaptiveConcurrent, attemptConcurrency - 1);
      this.adaptiveConcurrencyCeiling = this.adaptiveConcurrencyCeiling > 0
        ? Math.min(this.adaptiveConcurrencyCeiling, learnedCeiling)
        : learnedCeiling;
      const next = Math.max(this.minAdaptiveConcurrent, Math.ceil(previous / 2));
      this.effectiveMaxConcurrent = Math.min(
        previous,
        next,
        this.adaptiveConcurrencyCeiling
      );
      this.concurrencyDecreaseUntil = now + Math.max(retryAfterMs || this.rateLimitBackoffMs, 1);
      concurrencyChanged = this.effectiveMaxConcurrent !== previous;
      if (concurrencyChanged && this.onConcurrencyChange) {
        this.invokeObserver(this.onConcurrencyChange, {
          direction: 'decrease',
          previous,
          current: this.effectiveMaxConcurrent,
          reason: error?.rateLimitReason || '429',
        });
      }
    }

    if (this.adaptiveConcurrency && error?.retryable !== false) {
      this.persistAdaptiveConcurrency();
    }

    if (this.onRateLimit) {
      this.invokeObserver(this.onRateLimit, {
        error,
        retryAfterMs,
        concurrencyChanged,
        activeCount: this.activeCount,
        queued: this.queue.length,
        effectiveMaxConcurrent: this.effectiveMaxConcurrent,
        attemptConcurrency,
        rpmUsed,
        tokenUsed,
      });
    }
  }

  handleTaskSuccess() {
    const recoveryLimit = this.adaptiveConcurrencyCeiling > 0
      ? Math.min(this.maxConcurrent, this.adaptiveConcurrencyCeiling)
      : this.maxConcurrent;
    if (!this.adaptiveConcurrency || this.effectiveMaxConcurrent >= recoveryLimit) return;
    const now = Date.now();
    const hadQueuePressure = this.queue.length > 0 && this.activeCost >= this.effectiveMaxConcurrent;
    const recoveringTooSoon = this.lastRateLimitAt > 0
      && now < this.lastRateLimitAt + this.adaptiveRecoveryCooldownMs;
    if (!hadQueuePressure || recoveringTooSoon) return;

    this.adaptiveSuccessCount += 1;
    if (this.adaptiveSuccessCount < this.adaptiveRecoverySuccesses) return;

    const previous = this.effectiveMaxConcurrent;
    this.effectiveMaxConcurrent = Math.min(recoveryLimit, previous + 1);
    this.adaptiveSuccessCount = 0;
    this.persistAdaptiveConcurrency();
    if (this.onConcurrencyChange) {
      this.invokeObserver(this.onConcurrencyChange, {
        direction: 'increase',
        previous,
        current: this.effectiveMaxConcurrent,
        reason: 'success-window',
      });
    }
  }

  persistAdaptiveConcurrency() {
    if (
      !this.usageStore
      || !this.usageScope
      || typeof this.usageStore.setAdaptiveConcurrency !== 'function'
    ) {
      return;
    }
    try {
      this.usageStore.setAdaptiveConcurrency({
        scope: this.usageScope,
        concurrencyLimit: this.effectiveMaxConcurrent,
        concurrencyCeiling: this.adaptiveConcurrencyCeiling,
        lastRateLimitAtMs: this.lastRateLimitAt,
      });
    } catch {
      // 当前进程的安全并发仍然生效。
    }
  }

  invokeObserver(observer, payload) {
    if (!observer) return;
    try {
      observer(payload);
    } catch {
      // observer 只用于日志/指标，绝不能影响业务 Promise。
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

  normalizeActivePayloadCost(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
  }

  hasCapacity(task) {
    if (!task) return false;
    const hasRequestCapacity = this.activeCost + task.concurrencyCost <= this.effectiveMaxConcurrent;
    const hasPayloadCapacity = this.maxActivePayloadCost <= 0
      || this.activePayloadCost + task.activePayloadCost <= this.maxActivePayloadCost;
    return hasRequestCapacity && hasPayloadCapacity;
  }

  getRetryDelayMs(retryAfterMs, attempt) {
    const multiplier = Math.max(1, 2 ** Math.max(0, attempt - 1));
    const exponentialDelay = Math.min(retryAfterMs * multiplier, this.maxRateLimitBackoffMs);
    return Math.max(retryAfterMs, exponentialDelay);
  }

  getBackoffUntil() {
    if (this.usageStore && this.usageScope) {
      return Math.max(this.backoffUntil, this.usageStore.getBackoffUntil(this.usageScope));
    }
    return this.backoffUntil;
  }

  getStoredWindow(now = Date.now()) {
    if (!this.usageStore || !this.usageScope) return [];
    return this.usageStore.getWindow({
      scope: this.usageScope,
      sinceMs: now - RATE_WINDOW_MS,
      untilMs: now + 1000,
    });
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
  parseNonNegativeInt,
  parsePositiveInt,
};
