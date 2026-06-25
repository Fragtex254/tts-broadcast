const axios = require('axios');

const LOCAL_ASR_TIMEOUT_MS = Number(process.env.QWEN_ASR_TIMEOUT_MS || 30 * 60 * 1000);

function createTranscriptionsUrl(baseUrl) {
  const normalized = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!normalized) {
    throw new Error('请先配置 Qwen 本地 ASR 服务地址');
  }
  if (normalized.endsWith('/audio/transcriptions')) return normalized;
  if (normalized.endsWith('/v1')) return `${normalized}/audio/transcriptions`;
  return `${normalized}/v1/audio/transcriptions`;
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) {
    throw new Error('音频切片格式无效，无法发送到 Qwen 本地 ASR');
  }

  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64')
  };
}

function filenameForMime(mimeType) {
  if (mimeType === 'audio/wav') return 'chunk.wav';
  if (mimeType === 'audio/mpeg' || mimeType === 'audio/mp3') return 'chunk.mp3';
  return 'chunk.bin';
}

function extractText(responseData) {
  if (typeof responseData?.text === 'string') return responseData.text;
  if (typeof responseData === 'string') return responseData;
  const chatText = responseData?.choices?.[0]?.message?.content;
  if (typeof chatText === 'string') return chatText;
  throw new Error('Qwen 本地 ASR 未返回转录结果');
}

function mapQwenError(error) {
  if (error.code === 'ECONNABORTED') {
    return new Error('Qwen 本地 ASR 处理超时，请尝试更短音频或调大 QWEN_ASR_TIMEOUT_MS');
  }
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'EHOSTUNREACH') {
    return new Error('无法连接 Qwen 本地 ASR 服务，请确认 mlx-qwen3-asr serve 已启动');
  }
  if (error.response?.status === 401 || error.response?.status === 403) {
    return new Error('Qwen 本地 ASR 鉴权失败，请检查 API Key');
  }
  if (error.response?.status === 404) {
    return new Error('Qwen 本地 ASR 接口不存在，请检查 Base URL 是否包含正确的 /v1 路径');
  }
  if (error.response?.status === 502 || error.response?.status === 503 || error.response?.status === 504) {
    return new Error('Qwen 本地 ASR 服务暂不可用，请确认 mlx-qwen3-asr serve 已启动并可访问');
  }
  if (error.response?.data?.error) {
    const detail = typeof error.response.data.error === 'string'
      ? error.response.data.error
      : error.response.data.error.message;
    if (detail) return new Error(`Qwen 本地 ASR 调用失败：${detail}`);
  }
  return new Error(error.message || 'Qwen 本地 ASR 调用失败');
}

/**
 * 调用 Mac 本地 mlx-qwen3-asr OpenAI-compatible 转录端点。
 * @param {Object} params
 * @param {string} params.dataUrl - 音频 data URL
 * @param {string} params.baseUrl - 本地服务 Base URL
 * @param {string} params.model - ASR 模型 ID
 * @param {string} [params.apiKey] - 可选 Bearer Token
 * @param {string} [params.language='auto'] - auto/zh/en
 * @returns {Promise<{text: string, usage: Object|null}>}
 */
async function transcribeDataUrl({ dataUrl, baseUrl, model, apiKey = '', language = 'auto' }) {
  const { mimeType, buffer } = parseDataUrl(dataUrl);
  const formData = new FormData();
  formData.append('file', new Blob([buffer], { type: mimeType }), filenameForMime(mimeType));
  formData.append('model', model || 'Qwen/Qwen3-ASR-1.7B');
  if (language && language !== 'auto') {
    formData.append('language', language);
  }

  const headers = {};
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  try {
    const response = await axios.post(createTranscriptionsUrl(baseUrl), formData, {
      headers,
      proxy: false,
      timeout: LOCAL_ASR_TIMEOUT_MS
    });
    return { text: extractText(response.data).trim(), usage: response.data?.usage || null };
  } catch (error) {
    throw mapQwenError(error);
  }
}

module.exports = {
  createTranscriptionsUrl,
  transcribeDataUrl
};
