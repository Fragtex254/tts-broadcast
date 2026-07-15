const axios = require('axios');

const ASR_MODEL_DISCOVERY_TIMEOUT_MS = 15000;

function addCandidate(candidates, value) {
  if (!candidates.includes(value)) {
    candidates.push(value);
  }
}

function normalizeBaseUrl(baseUrl) {
  const normalized = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!normalized) {
    throw new Error('请提供 ASR Base URL');
  }
  return normalized;
}

function buildAsrModelEndpointCandidates(baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl);
  const candidates = [];

  if (normalized.endsWith('/models')) {
    addCandidate(candidates, normalized);
    return candidates;
  }

  if (normalized.endsWith('/v1')) {
    addCandidate(candidates, `${normalized}/models`);
  } else {
    addCandidate(candidates, `${normalized}/v1/models`);
    addCandidate(candidates, `${normalized}/models`);
  }

  return candidates;
}

function extractModels(responseData) {
  if (Array.isArray(responseData)) {
    return responseData;
  }
  if (Array.isArray(responseData?.data)) {
    return responseData.data;
  }
  if (Array.isArray(responseData?.models)) {
    return responseData.models;
  }
  throw new Error('模型列表响应格式不正确');
}

function extractCapabilities(model) {
  if (model.capabilities && typeof model.capabilities === 'object') return model.capabilities;
  const keys = [
    'transcription', 'diarization', 'segment_timestamps', 'languages',
    'speaker_resolution_modes', 'execution_modes', 'speaker_scopes'
  ];
  const capabilities = {};
  for (const key of keys) {
    if (model[key] !== undefined) capabilities[key] = model[key];
  }
  return Object.keys(capabilities).length > 0 ? capabilities : null;
}

/**
 * 探测 OpenAI-compatible ASR 模型列表。
 * @param {Object} params
 * @param {string} params.baseUrl - ASR Base URL
 * @param {string} [params.apiKey] - 可选 Bearer Token
 * @returns {Promise<{models: Array, resolvedUrl: string}>} 模型列表和命中的端点
 */
async function fetchAsrModelsForConfig({ baseUrl, apiKey = '' }) {
  const candidates = buildAsrModelEndpointCandidates(baseUrl);
  const trimmedKey = typeof apiKey === 'string' ? apiKey.trim() : '';
  const errors = [];

  for (const candidate of candidates) {
    try {
      const headers = { 'User-Agent': 'tts-broadcast' };
      if (trimmedKey) {
        headers.Authorization = `Bearer ${trimmedKey}`;
        headers['api-key'] = trimmedKey;
      }

      const response = await axios.get(candidate, {
        headers,
        proxy: false,
        timeout: ASR_MODEL_DISCOVERY_TIMEOUT_MS,
      });

      const models = extractModels(response.data)
        .filter(model => model && typeof model.id === 'string' && model.id.trim())
        .map(model => {
          const capabilities = extractCapabilities(model);
          return {
            id: model.id,
            ...(model.owned_by ? { owned_by: model.owned_by } : {}),
            ...(capabilities ? { capabilities } : {}),
          };
        })
        .sort((a, b) => a.id.localeCompare(b.id));

      if (models.length === 0) {
        throw new Error('模型列表为空');
      }

      return { models, resolvedUrl: candidate };
    } catch (error) {
      errors.push({ candidate, message: error.message });
    }
  }

  throw new Error(`获取 ASR 模型列表失败，已尝试 ${errors.length} 个候选端点`);
}

module.exports = {
  buildAsrModelEndpointCandidates,
  fetchAsrModelsForConfig,
};
