const axios = require('axios');

const MODEL_DISCOVERY_TIMEOUT_MS = 15000;
const MODEL_DISCOVERY_SUFFIXES = [
  '/api/coding/paas/v4',
  '/apps/anthropic',
  '/api/coding',
  '/anthropic',
];

/**
 * 去重追加候选 URL
 * @param {string[]} candidates - 候选列表
 * @param {string} value - 候选 URL
 */
function addCandidate(candidates, value) {
  if (!candidates.includes(value)) {
    candidates.push(value);
  }
}

/**
 * 判断 URL 路径是否包含版本段
 * @param {string} baseUrl - baseURL
 * @returns {boolean} 是否包含版本段
 */
function hasVersionSegment(baseUrl) {
  return /\/v\d+(?:\/|$)/.test(new URL(baseUrl).pathname);
}

/**
 * 为一个 baseURL 追加模型端点候选
 * @param {string[]} candidates - 候选列表
 * @param {string} baseUrl - baseURL
 * @param {boolean} includePlainModels - 是否追加 /models
 */
function addModelCandidatesForBase(candidates, baseUrl, includePlainModels = false) {
  addCandidate(candidates, `${baseUrl}/v1/models`);
  if (includePlainModels || hasVersionSegment(baseUrl)) {
    addCandidate(candidates, `${baseUrl}/models`);
  }
}

/**
 * 构建 OpenAI-compatible 模型列表端点候选
 * @param {string} baseUrl - LLM baseURL
 * @returns {string[]} 候选 URL
 */
function buildModelEndpointCandidates(baseUrl) {
  const normalized = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!normalized) {
    throw new Error('请提供 LLM Base URL');
  }

  const candidates = [];
  addModelCandidatesForBase(candidates, normalized);

  const lower = normalized.toLowerCase();
  for (const suffix of MODEL_DISCOVERY_SUFFIXES) {
    if (lower.endsWith(suffix)) {
      addModelCandidatesForBase(candidates, normalized, true);
      const parent = normalized.slice(0, normalized.length - suffix.length).replace(/\/+$/, '');
      if (parent) {
        addModelCandidatesForBase(candidates, parent);
      }
      break;
    }
  }

  return candidates;
}

/**
 * 获取当前配置可用的模型列表
 * @param {Object} params
 * @param {string} params.baseUrl - LLM baseURL
 * @param {string} params.apiKey - LLM API Key
 * @returns {Promise<{models: Array, resolvedUrl: string}>} 模型列表和命中的端点
 */
async function fetchModelsForConfig({ baseUrl, apiKey }) {
  const trimmedKey = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!trimmedKey) {
    throw new Error('请提供 LLM API Key');
  }

  const candidates = buildModelEndpointCandidates(baseUrl);
  const errors = [];

  for (const candidate of candidates) {
    try {
      const response = await axios.get(candidate, {
        headers: {
          Authorization: `Bearer ${trimmedKey}`,
          'api-key': trimmedKey,
          'User-Agent': 'tts-broadcast',
        },
        timeout: MODEL_DISCOVERY_TIMEOUT_MS,
      });

      const rawModels = response?.data?.data;
      if (!Array.isArray(rawModels)) {
        throw new Error('模型列表响应格式不正确');
      }

      const models = rawModels
        .filter(model => model && typeof model.id === 'string' && model.id.trim())
        .map(model => ({
          id: model.id,
          ...(model.owned_by ? { owned_by: model.owned_by } : {}),
        }))
        .sort((a, b) => a.id.localeCompare(b.id));

      if (models.length === 0) {
        throw new Error('模型列表为空');
      }

      return { models, resolvedUrl: candidate };
    } catch (error) {
      errors.push({ candidate, message: error.message });
    }
  }

  throw new Error(`获取模型列表失败，已尝试 ${errors.length} 个候选端点`);
}

module.exports = {
  buildModelEndpointCandidates,
  fetchModelsForConfig,
};
