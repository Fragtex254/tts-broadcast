const axios = require('axios');
const db = require('../db');
const llmQueue = require('./llmQueue');

const EMBEDDING_TIMEOUT_MS = 60000;

function getSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return fallback; }
}

function getConfig() {
  return {
    enabled: Boolean(getSetting('embedding_enabled', false)),
    baseUrl: String(getSetting('embedding_base_url', '') || '').trim(),
    apiKey: String(getSetting('embedding_api_key', '') || '').trim(),
    model: String(getSetting('embedding_model', '') || '').trim(),
  };
}

function createEmbeddingUrl(baseUrl) {
  const normalized = baseUrl.replace(/\/+$/, '');
  if (normalized.endsWith('/embeddings')) return normalized;
  return /\/v\d+$/.test(new URL(normalized).pathname) ? `${normalized}/embeddings` : `${normalized}/v1/embeddings`;
}

async function embedText({ text, config = getConfig() }) {
  if (!config.enabled) return null;
  if (!config.baseUrl || !config.apiKey || !config.model) throw new Error('Embedding 配置不完整');
  return llmQueue.enqueueLlm({ prompt: text, maxTokens: 1 }, async () => {
    try {
      const response = await axios.post(createEmbeddingUrl(config.baseUrl), {
        model: config.model,
        input: text,
      }, {
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
        timeout: EMBEDDING_TIMEOUT_MS,
      });
      const vector = response?.data?.data?.[0]?.embedding;
      if (!Array.isArray(vector) || vector.length === 0 || vector.length > 32768 || vector.some((value) => !Number.isFinite(value))) {
        throw new Error('Embedding API 返回了无效向量');
      }
      return vector.map(Number);
    } catch (error) {
      if (error?.response?.status === 401) throw new Error('Embedding API Key 无效或已过期');
      if (error?.response?.status === 429) throw new Error('Embedding API 请求过于频繁，请稍后重试');
      if (error?.code === 'ECONNABORTED') throw new Error('Embedding API 请求超时');
      throw error;
    }
  });
}

function claimText(claim) {
  return [claim.question, claim.claim, claim.reasoning, ...(claim.topic_tags || claim.topicTags || [])].filter(Boolean).join('\n');
}

module.exports = { claimText, createEmbeddingUrl, embedText, getConfig };
