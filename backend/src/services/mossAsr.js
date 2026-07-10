const fs = require('fs');
const path = require('path');
const axios = require('axios');

const MOSS_ASR_TIMEOUT_MS = Number(process.env.MOSS_ASR_TIMEOUT_MS || 60 * 60 * 1000);

function normalizeV1BaseUrl(baseUrl) {
  const normalized = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!normalized) {
    throw new Error('请先配置 MOSS ASR 服务地址');
  }
  return normalized.endsWith('/v1') ? normalized : `${normalized}/v1`;
}

function createMossAsrUrl(baseUrl, endpoint) {
  const base = normalizeV1BaseUrl(baseUrl);
  const suffix = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${base}${suffix}`;
}

function mimeTypeForFile(file) {
  if (file?.mimetype && typeof file.mimetype === 'string') {
    return file.mimetype;
  }
  const ext = path.extname(file?.originalname || '').toLowerCase();
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.mp3' || ext === '.mpeg') return 'audio/mpeg';
  if (ext === '.m4a') return 'audio/mp4';
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.webm') return 'video/webm';
  return 'application/octet-stream';
}

function ensureFileData(file) {
  if (!file || (!file.buffer && !file.path)) {
    throw new Error('请上传需要转录的音频或视频文件');
  }
}

async function blobForFile(file) {
  ensureFileData(file);
  const type = mimeTypeForFile(file);
  if (file.buffer) {
    return new Blob([file.buffer], { type });
  }
  if (typeof fs.openAsBlob === 'function') {
    return fs.openAsBlob(file.path, { type });
  }
  return new Blob([fs.readFileSync(file.path)], { type });
}

function buildHeaders(apiKey) {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

async function buildFormData({ file, language, model, context }) {
  const trimmedModel = typeof model === 'string' ? model.trim() : '';
  if (!trimmedModel) {
    throw new Error('请选择 MOSS ASR 模型');
  }

  const formData = new FormData();
  formData.append('file', await blobForFile(file), file.originalname || 'upload.bin');
  formData.append('model', trimmedModel);
  formData.append('response_format', 'json');
  if (language && language !== 'auto') {
    formData.append('language', language);
  }
  if (typeof context === 'string' && context.trim()) {
    formData.append('prompt', context.trim());
  }
  return formData;
}

function extractText(responseData) {
  if (typeof responseData?.text === 'string') return responseData.text;
  if (typeof responseData === 'string') return responseData;
  const chatText = responseData?.choices?.[0]?.message?.content;
  if (typeof chatText === 'string') return chatText;
  throw new Error('MOSS ASR 未返回转录结果');
}

function mapMossError(error) {
  if (error.code === 'ECONNABORTED') {
    return new Error('MOSS ASR 处理超时，请尝试更短音频或调大 MOSS_ASR_TIMEOUT_MS');
  }
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'EHOSTUNREACH') {
    return new Error('无法连接 MOSS ASR 服务，请确认 192.168.31.137:18080 端口可访问');
  }
  if (error.response?.status === 401 || error.response?.status === 403) {
    return new Error('MOSS ASR 鉴权失败，请检查 API Key');
  }
  if (error.response?.status === 404) {
    return new Error('MOSS ASR 接口不存在，请检查 Base URL 是否包含正确的 /v1 路径');
  }
  if (error.response?.status === 422 || error.response?.status === 400) {
    const detail = error.response?.data?.error?.message || error.response?.data?.detail || error.message;
    return new Error(`MOSS ASR 请求参数无效：${detail}`);
  }
  if (error.response?.status === 502 || error.response?.status === 503 || error.response?.status === 504) {
    return new Error('MOSS ASR 服务暂不可用，请确认服务已启动并可访问');
  }
  if (error.response?.data?.error) {
    const detail = typeof error.response.data.error === 'string'
      ? error.response.data.error
      : error.response.data.error.message;
    if (detail) return new Error(`MOSS ASR 调用失败：${detail}`);
  }
  return new Error(error.message || 'MOSS ASR 调用失败');
}

/**
 * 调用 MOSS OpenAI-compatible ASR 转录端点。
 * @param {Object} params
 * @param {Object} params.file - multer 文件对象
 * @param {string} params.baseUrl - MOSS ASR Base URL
 * @param {string} params.model - MOSS ASR 模型 ID
 * @param {string} [params.apiKey] - 可选 Bearer Token
 * @param {string} [params.language='auto'] - auto/zh/en
 * @param {string} [params.context] - 转录提示词
 * @param {Function} [params.onProgress] - 进度回调
 * @returns {Promise<{text: string, usage: Object|null}>}
 */
async function transcribeFile({ file, baseUrl, model, apiKey = '', language = 'auto', context = '', onProgress }) {
  if (typeof onProgress === 'function') {
    onProgress({ phase: 'preparing', percent: 10, current: 0, total: 0, text: '', message: '正在提交 MOSS ASR 任务' });
  }

  try {
    const response = await axios.post(
      createMossAsrUrl(baseUrl, '/audio/transcriptions'),
      await buildFormData({ file, language, model, context }),
      {
        headers: buildHeaders(apiKey),
        proxy: false,
        timeout: MOSS_ASR_TIMEOUT_MS
      }
    );

    if (typeof onProgress === 'function') {
      onProgress({ phase: 'transcribing', percent: 95, current: 1, total: 1, text: '', message: 'MOSS ASR 正在返回结果' });
    }

    return { text: extractText(response.data).trim(), usage: response.data?.usage || null };
  } catch (error) {
    throw mapMossError(error);
  }
}

module.exports = {
  createMossAsrUrl,
  transcribeFile,
};
