// TTS 请求队列管理器
// 保留 TTS 专用入口，底层复用通用 RPM/TPM 限速队列。

const { RateLimitedQueueManager, estimateTextTokens } = require('./rateLimitedQueue');
const rateLimitStore = require('./rateLimitStore');

const DEFAULT_TTS_RPM_LIMIT = 90;
const MIMO_TTS_RPM_LIMIT = 100;
const DEFAULT_TTS_TPM_LIMIT = 9000000;
const MIMO_TTS_TPM_LIMIT = 10000000;
const DEFAULT_TTS_PAYLOAD_PER_MINUTE_LIMIT = 60 * 1024 * 1024;
const DEFAULT_TTS_MAX_CONCURRENT = 6;
const DEFAULT_TTS_START_BURST_LIMIT = 1;
const DEFAULT_TTS_RATE_LIMIT_RETRIES = 6;
const DEFAULT_TTS_MAX_RATE_LIMIT_BACKOFF_MS = 120000;
const CLONE_REQUEST_UNIT_BYTES = 1024 * 1024;
const CLONE_CONCURRENCY_UNIT_BYTES = 2 * 1024 * 1024;

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

function estimateTtsRequestCost(params = {}) {
  const payloadBytes = estimateClonePayloadBytes(params);
  if (payloadBytes <= 0) return 1;
  return Math.max(1, Math.ceil(payloadBytes / CLONE_REQUEST_UNIT_BYTES));
}

function estimateTtsConcurrencyCost(params = {}) {
  const payloadBytes = estimateClonePayloadBytes(params);
  if (payloadBytes <= 0) return 1;
  return Math.max(2, Math.ceil(payloadBytes / CLONE_CONCURRENCY_UNIT_BYTES));
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
      defaultMaxConcurrent: DEFAULT_TTS_MAX_CONCURRENT,
      maxConcurrentEnvName: 'MIMO_TTS_MAX_CONCURRENT',
      defaultStartBurstLimit: DEFAULT_TTS_START_BURST_LIMIT,
      startBurstLimitEnvName: 'MIMO_TTS_START_BURST_LIMIT',
      defaultRateLimitRetries: DEFAULT_TTS_RATE_LIMIT_RETRIES,
      rateLimitBackoffMsEnvName: 'MIMO_TTS_RATE_LIMIT_BACKOFF_MS',
      rateLimitRetriesEnvName: 'MIMO_TTS_RATE_LIMIT_RETRIES',
      defaultMaxRateLimitBackoffMs: DEFAULT_TTS_MAX_RATE_LIMIT_BACKOFF_MS,
      maxRateLimitBackoffMsEnvName: 'MIMO_TTS_MAX_RATE_LIMIT_BACKOFF_MS',
    });
  }

  /**
   * 添加 TTS 请求到队列，并自动按文本估算 TPM 成本。
   * @param {Object} speechParams - tts.generateSpeech 参数
   * @param {Function} requestFn - 异步请求函数
   * @returns {Promise} 请求结果
   */
  enqueueTts(speechParams, requestFn) {
    return this.enqueue(requestFn, {
      requestCost: estimateTtsRequestCost(speechParams),
      tokenCost: estimateTtsTokenCost(speechParams),
      payloadCost: estimateClonePayloadBytes(speechParams),
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
