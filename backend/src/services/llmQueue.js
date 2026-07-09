// LLM 全局请求队列。
// 当前生产模型按 MiniMax-M3 管理，默认使用官方付费限额的 75%：150 RPM / 7,500,000 TPM。

const { RateLimitedQueueManager, estimateTextTokens } = require('./rateLimitedQueue');

const DEFAULT_MINIMAX_M3_RPM_LIMIT = 150;
const MINIMAX_M3_RPM_LIMIT = 200;
const DEFAULT_MINIMAX_M3_TPM_LIMIT = 7500000;
const MINIMAX_M3_TPM_LIMIT = 10000000;
const DEFAULT_LLM_MAX_CONCURRENT = 4;

function estimateImageTokenCost(imageBuffer) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) return 0;
  return Math.ceil(imageBuffer.length / 1024);
}

/**
 * 粗略估算一次 LLM 请求消耗的 input + output token。
 * MiniMax 文档按模型聚合统计 TPM；没有本地 tokenizer 时，用文本估算 + maxTokens 做保守预算。
 * @param {Object} params - LLM 请求参数
 * @returns {number} 估算 token 数
 */
function estimateLlmTokenCost(params = {}) {
  const maxTokens = Number.parseInt(params.maxTokens, 10);
  const outputBudget = Number.isInteger(maxTokens) && maxTokens > 0 ? maxTokens : 0;
  const total = estimateTextTokens(params.prompt)
    + estimateTextTokens(params.systemPrompt)
    + estimateImageTokenCost(params.imageBuffer)
    + outputBudget;
  return Math.max(1, total);
}

class LLMQueueManager extends RateLimitedQueueManager {
  constructor(options = {}) {
    super({
      ...options,
      defaultRpmLimit: DEFAULT_MINIMAX_M3_RPM_LIMIT,
      hardRpmLimit: MINIMAX_M3_RPM_LIMIT,
      rpmEnvName: 'MINIMAX_M3_LLM_RPM_LIMIT',
      defaultTpmLimit: DEFAULT_MINIMAX_M3_TPM_LIMIT,
      hardTpmLimit: MINIMAX_M3_TPM_LIMIT,
      tpmEnvName: 'MINIMAX_M3_LLM_TPM_LIMIT',
      defaultMaxConcurrent: DEFAULT_LLM_MAX_CONCURRENT,
      maxConcurrentEnvName: 'MINIMAX_M3_LLM_MAX_CONCURRENT',
      rateLimitBackoffMsEnvName: 'MINIMAX_M3_LLM_RATE_LIMIT_BACKOFF_MS',
      rateLimitRetriesEnvName: 'MINIMAX_M3_LLM_RATE_LIMIT_RETRIES',
    });
  }

  /**
   * 添加 LLM 请求到队列，并自动按 prompt/system/maxTokens 估算 TPM 成本。
   * @param {Object} requestParams - LLM 请求参数
   * @param {Function} requestFn - 异步请求函数
   * @returns {Promise} 请求结果
   */
  enqueueLlm(requestParams, requestFn) {
    return this.enqueue(requestFn, { tokenCost: estimateLlmTokenCost(requestParams) });
  }
}

const llmQueue = new LLMQueueManager();

module.exports = llmQueue;
module.exports.LLMQueueManager = LLMQueueManager;
module.exports.estimateLlmTokenCost = estimateLlmTokenCost;
