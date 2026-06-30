const fs = require('fs');
const path = require('path');
const axios = require('axios');

const WSL_ASR_TIMEOUT_MS = Number(process.env.WSL_ASR_TIMEOUT_MS || 60 * 60 * 1000);
const WSL_ASR_POLL_INTERVAL_MS = Number(process.env.WSL_ASR_POLL_INTERVAL_MS || 2000);

function normalizeV1BaseUrl(baseUrl) {
  const normalized = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!normalized) {
    throw new Error('请先配置 WSL ASR 服务地址');
  }
  return normalized.endsWith('/v1') ? normalized : `${normalized}/v1`;
}

function createWslAsrUrl(baseUrl, endpoint) {
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

function buildHeaders(apiKey) {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
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

async function buildFormData({ file, language, model, context }) {
  const blob = await blobForFile(file);
  const formData = new FormData();
  formData.append('file', blob, file.originalname || 'upload.bin');
  formData.append('model', model || 'qwen3-asr-1.7b');
  formData.append('language', language || 'auto');
  formData.append('response_format', 'json');
  formData.append('backend', 'auto');
  formData.append('split_strategy', 'auto');
  if (typeof context === 'string' && context.trim()) {
    formData.append('context', context.trim());
  }
  return formData;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapProgress(job) {
  const progress = job?.progress || {};
  const status = job?.status;
  const phase = progress.phase || status || 'transcribing';
  const total = Number(progress.total_chunks || 0);
  const current = Number(progress.completed_chunks || 0);

  if (status === 'queued' || phase === 'queued') {
    return { phase: 'preparing', percent: 15, current: 0, total, text: '', message: '等待 WSL ASR 队列' };
  }
  if (phase === 'preprocessing') {
    return { phase: 'preparing', percent: 20, current: 0, total, text: '', message: 'WSL ASR 正在预处理音频' };
  }
  if (phase === 'splitting') {
    return { phase: 'preparing', percent: 30, current: 0, total, text: '', message: 'WSL ASR 正在切分音频' };
  }
  if (phase === 'loading_model') {
    return { phase: 'preparing', percent: 40, current: 0, total, text: '', message: 'WSL ASR 正在加载模型' };
  }
  if (phase === 'merging') {
    return { phase: 'transcribing', percent: 98, current: total, total, text: '', message: 'WSL ASR 正在合并结果' };
  }

  const rawPercent = typeof progress.percent === 'number' ? progress.percent : 0;
  const percent = Math.min(95, Math.max(45, Math.round(45 + rawPercent * 0.5)));
  return {
    phase: 'transcribing',
    percent,
    current,
    total,
    text: '',
    message: total > 0 ? `WSL ASR 正在转录 ${current}/${total}` : 'WSL ASR 正在转录'
  };
}

function extractJobId(responseData) {
  const jobId = responseData?.id;
  if (typeof jobId === 'string' && jobId.trim()) {
    return jobId.trim();
  }
  throw new Error('WSL ASR 未返回任务 ID');
}

function extractCompletedResult(job) {
  const result = job?.result;
  if (!result || typeof result.text !== 'string') {
    throw new Error('WSL ASR 未返回转录结果');
  }
  return {
    text: result.text.trim(),
    usage: result.usage || null
  };
}

function errorDetail(errorData) {
  const payload = errorData?.error;
  if (!payload) return null;
  if (typeof payload === 'string') {
    return { code: '', message: payload, details: {} };
  }
  return {
    code: typeof payload.code === 'string' ? payload.code : '',
    message: typeof payload.message === 'string' ? payload.message : '',
    details: payload.details || {}
  };
}

function mapWslAsrError(error) {
  if (error.code === 'ECONNABORTED') {
    return new Error('WSL ASR 处理超时，请尝试更短音频或调大 WSL_ASR_TIMEOUT_MS');
  }
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'EHOSTUNREACH') {
    return new Error('无法连接 WSL ASR 服务，请确认 Windows/WSL 服务已启动且 18080 端口可访问');
  }

  const detail = errorDetail(error.response?.data);
  if (detail) {
    if (detail.code === 'audio_too_large') {
      return new Error('WSL ASR 上传文件超过服务端限制，请压缩音频或调大 ASR_MAX_UPLOAD_MB');
    }
    if (detail.code === 'job_queue_full') {
      return new Error('WSL ASR 队列已满，请等待当前转录完成后重试');
    }
    if (detail.code === 'model_unloading_scheduled') {
      return new Error('WSL ASR 模型正在卸载，请稍后重试');
    }
    if (detail.code === 'model_not_found') {
      return new Error('WSL ASR 模型不存在，请检查模型 ID');
    }
    if (detail.code === 'capability_not_supported') {
      return new Error(`WSL ASR 不支持当前请求能力：${detail.message || detail.code}`);
    }
    if (detail.code === 'audio_decode_failed') {
      return new Error('WSL ASR 无法解码该音视频文件，请检查文件格式或重新转码');
    }
    if (detail.message) {
      return new Error(`WSL ASR 调用失败：${detail.message}`);
    }
  }

  if (error.response?.status === 401 || error.response?.status === 403) {
    return new Error('WSL ASR 鉴权失败，请检查 API Key');
  }
  if (error.response?.status === 404) {
    return new Error('WSL ASR 接口不存在，请检查 Base URL 是否正确');
  }
  if (error.response?.status === 502 || error.response?.status === 503 || error.response?.status === 504) {
    return new Error('WSL ASR 服务暂不可用，请确认 Windows/WSL 服务已启动并可访问');
  }

  return new Error(error.message || 'WSL ASR 调用失败');
}

async function fetchJob({ baseUrl, jobId, headers }) {
  const response = await axios.get(createWslAsrUrl(baseUrl, `/jobs/${encodeURIComponent(jobId)}`), {
    headers,
    proxy: false,
    timeout: WSL_ASR_TIMEOUT_MS
  });
  return response.data;
}

/**
 * 调用 WSL ASR job API 转录上传文件。
 * @param {Object} params
 * @param {Object} params.file - multer 文件对象
 * @param {string} params.baseUrl - WSL ASR Base URL
 * @param {string} params.model - WSL ASR 模型 ID
 * @param {string} [params.apiKey] - 可选 Bearer Token
 * @param {string} [params.language='auto'] - auto/zh/en
 * @param {string} [params.context] - 传给 Qwen3-ASR 的上下文提示词
 * @param {Function} [params.onProgress] - 进度回调
 * @param {number} [params.pollIntervalMs] - 轮询间隔，测试可覆盖
 * @returns {Promise<{text: string, usage: Object|null}>}
 */
async function transcribeFile({
  file,
  baseUrl,
  model,
  apiKey = '',
  language = 'auto',
  context = '',
  onProgress,
  pollIntervalMs = WSL_ASR_POLL_INTERVAL_MS
}) {
  const headers = buildHeaders(apiKey);
  if (typeof onProgress === 'function') {
    onProgress({ phase: 'preparing', percent: 10, current: 0, total: 0, text: '', message: '正在提交 WSL ASR 任务' });
  }

  try {
    const response = await axios.post(
      createWslAsrUrl(baseUrl, '/audio/transcription-jobs'),
      await buildFormData({ file, language, model, context }),
      {
        headers,
        proxy: false,
        timeout: WSL_ASR_TIMEOUT_MS
      }
    );
    const jobId = extractJobId(response.data);
    const startedAt = Date.now();

    while (Date.now() - startedAt < WSL_ASR_TIMEOUT_MS) {
      const job = await fetchJob({ baseUrl, jobId, headers });
      if (typeof onProgress === 'function') {
        onProgress(mapProgress(job));
      }
      if (job.status === 'completed') {
        return extractCompletedResult(job);
      }
      if (job.status === 'failed') {
        const failed = new Error(job.error?.message || 'WSL ASR 转录失败');
        failed.response = { data: { error: job.error } };
        throw failed;
      }
      if (job.status === 'cancelled') {
        throw new Error('WSL ASR 转录任务已取消');
      }
      if (job.status === 'expired') {
        throw new Error('WSL ASR 转录结果已过期，请重新提交');
      }
      await sleep(pollIntervalMs);
    }

    throw new Error('WSL ASR 处理超时，请尝试更短音频或调大 WSL_ASR_TIMEOUT_MS');
  } catch (error) {
    throw mapWslAsrError(error);
  }
}

module.exports = {
  createWslAsrUrl,
  transcribeFile
};
