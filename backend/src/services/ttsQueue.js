// TTS 请求队列管理器
// 保留 TTS 专用入口，底层复用通用 RPM/TPM 限速队列。

const { RateLimitedQueueManager, estimateTextTokens } = require('./rateLimitedQueue');
const rateLimitStore = require('./rateLimitStore');
const { createScopedLogger } = require('./logger');

const logger = createScopedLogger('tts-queue');

const DEFAULT_TTS_RPM_LIMIT = 90;
const MIMO_TTS_RPM_LIMIT = 100;
const DEFAULT_TTS_TPM_LIMIT = 9000000;
const MIMO_TTS_TPM_LIMIT = 10000000;
const DEFAULT_TTS_PAYLOAD_PER_MINUTE_LIMIT = 0;
const DEFAULT_TTS_MAX_ACTIVE_PAYLOAD = 40 * 1024 * 1024;
const MIMO_TTS_MAX_ACTIVE_PAYLOAD = 60 * 1024 * 1024;
const DEFAULT_TTS_MAX_CONCURRENT = 12;
const MIMO_TTS_MAX_CONCURRENT = 24;
const DEFAULT_TTS_INITIAL_CONCURRENT = 3;
const DEFAULT_TTS_START_BURST_LIMIT = 1;
const DEFAULT_TTS_RATE_LIMIT_RETRIES = 2;
const DEFAULT_TTS_MAX_RATE_LIMIT_BACKOFF_MS = 120000;
const DEFAULT_TTS_ADAPTIVE_RECOVERY_SUCCESSES = 3;
const DEFAULT_TTS_ADAPTIVE_RECOVERY_COOLDOWN_MS = 60000;
const MIMO_TTS_MAX_CLONE_PAYLOAD = 10 * 1024 * 1024;

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

function estimateClonePayloadBytes(params = {}) {
  if (params.voiceType !== 'clone' || typeof params.voiceClone !== 'string') {
    return 0;
  }
  return Buffer.byteLength(params.voiceClone, 'utf8');
}

function estimateTtsRequestCost() {
  return 1;
}

function estimateTtsConcurrencyCost() {
  return 1;
}

class TTSQueueManager extends RateLimitedQueueManager {
  constructor(options = {}) {
    super({
      ...options,
      usageStore: options.usageStore,
      usageScope: options.usageScope,
      defaultRpmLimit: DEFAULT_TTS_RPM_LIMIT,
      hardRpmLimit: MIMO_TTS_RPM_LIMIT,
      rpmEnvName: 'MIMO_TTS_RPM_LIMIT',
      defaultTpmLimit: DEFAULT_TTS_TPM_LIMIT,
      hardTpmLimit: MIMO_TTS_TPM_LIMIT,
      tpmEnvName: 'MIMO_TTS_TPM_LIMIT',
      defaultPayloadPerMinuteLimit: DEFAULT_TTS_PAYLOAD_PER_MINUTE_LIMIT,
      payloadPerMinuteEnvName: 'MIMO_TTS_PAYLOAD_PER_MINUTE_LIMIT',
      defaultMaxActivePayloadCost: DEFAULT_TTS_MAX_ACTIVE_PAYLOAD,
      hardMaxActivePayloadCost: MIMO_TTS_MAX_ACTIVE_PAYLOAD,
      maxActivePayloadCostEnvName: 'MIMO_TTS_MAX_IN_FLIGHT_PAYLOAD_BYTES',
      defaultMaxConcurrent: DEFAULT_TTS_MAX_CONCURRENT,
      hardMaxConcurrent: MIMO_TTS_MAX_CONCURRENT,
      maxConcurrentEnvName: 'MIMO_TTS_MAX_CONCURRENT',
      defaultInitialConcurrent: DEFAULT_TTS_INITIAL_CONCURRENT,
      initialConcurrentEnvName: 'MIMO_TTS_INITIAL_CONCURRENT',
      adaptiveConcurrency: options.adaptiveConcurrency ?? true,
      defaultAdaptiveRecoverySuccesses: DEFAULT_TTS_ADAPTIVE_RECOVERY_SUCCESSES,
      adaptiveRecoverySuccessesEnvName: 'MIMO_TTS_ADAPTIVE_RECOVERY_SUCCESSES',
      defaultAdaptiveRecoveryCooldownMs: DEFAULT_TTS_ADAPTIVE_RECOVERY_COOLDOWN_MS,
      adaptiveRecoveryCooldownMsEnvName: 'MIMO_TTS_ADAPTIVE_RECOVERY_COOLDOWN_MS',
      defaultStartBurstLimit: DEFAULT_TTS_START_BURST_LIMIT,
      startBurstLimitEnvName: 'MIMO_TTS_START_BURST_LIMIT',
      defaultRateLimitRetries: DEFAULT_TTS_RATE_LIMIT_RETRIES,
      rateLimitBackoffMsEnvName: 'MIMO_TTS_RATE_LIMIT_BACKOFF_MS',
      rateLimitRetriesEnvName: 'MIMO_TTS_RATE_LIMIT_RETRIES',
      defaultMaxRateLimitBackoffMs: DEFAULT_TTS_MAX_RATE_LIMIT_BACKOFF_MS,
      maxRateLimitBackoffMsEnvName: 'MIMO_TTS_MAX_RATE_LIMIT_BACKOFF_MS',
      onRateLimit: options.onRateLimit || (({
        error,
        retryAfterMs,
        activeCount,
        queued,
        effectiveMaxConcurrent,
        attemptConcurrency,
        rpmUsed,
      }) => {
        logger.warn({
          err: error,
          retryAfterMs,
          activeCount,
          queued,
          effectiveMaxConcurrent,
          attemptConcurrency,
          rpmUsed,
          rateLimitReason: error?.rateLimitReason || 'unknown',
        }, 'TTS 触发远端限流，队列已调整并退避');
      }),
      onConcurrencyChange: options.onConcurrencyChange || (({
        direction,
        previous,
        current,
        reason,
      }) => {
        logger.info({ direction, previous, current, reason }, 'TTS 自适应并发已调整');
      }),
    });
    if (this.maxActivePayloadCost <= 0) {
      this.maxActivePayloadCost = DEFAULT_TTS_MAX_ACTIVE_PAYLOAD;
    }
  }

  /**
   * 添加 TTS 请求到队列，并自动按文本估算 TPM 成本。
   * @param {Object} speechParams - tts.generateSpeech 参数
   * @param {Function} requestFn - 异步请求函数
   * @returns {Promise} 请求结果
   */
  enqueueTts(speechParams, requestFn) {
    const payloadCost = estimateClonePayloadBytes(speechParams);
    if (payloadCost > MIMO_TTS_MAX_CLONE_PAYLOAD) {
      return Promise.reject(new Error('克隆参考音频 Base64 不能超过 10 MB'));
    }
    return this.enqueue(requestFn, {
      requestCost: estimateTtsRequestCost(speechParams),
      tokenCost: estimateTtsTokenCost(speechParams),
      payloadCost,
      concurrencyCost: estimateTtsConcurrencyCost(speechParams),
    });
  }
}

// 单例模式
const ttsQueue = new TTSQueueManager({
  usageStore: rateLimitStore,
  usageScope: 'mimo-tts',
});

module.exports = ttsQueue;
module.exports.TTSQueueManager = TTSQueueManager;
module.exports.estimateTtsTokenCost = estimateTtsTokenCost;
module.exports.estimateClonePayloadBytes = estimateClonePayloadBytes;
module.exports.estimateTtsRequestCost = estimateTtsRequestCost;
module.exports.estimateTtsConcurrencyCost = estimateTtsConcurrencyCost;
