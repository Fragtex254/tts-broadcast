const fs = require('fs');
const path = require('path');
const axios = require('axios');

const MOSS_ASR_TIMEOUT_MS = Number(process.env.MOSS_ASR_TIMEOUT_MS || 60 * 60 * 1000);
const MOSS_ASR_POLL_INTERVAL_MS = Number(process.env.MOSS_ASR_POLL_INTERVAL_MS || 2000);

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

async function buildFormData({ file, language, model, context, podcastMode }) {
  const trimmedModel = typeof model === 'string' ? model.trim() : '';
  if (!trimmedModel) {
    throw new Error('请选择 MOSS ASR 模型');
  }

  const formData = new FormData();
  formData.append('file', await blobForFile(file), file.originalname || 'upload.bin');
  formData.append('model', trimmedModel);
  formData.append('response_format', podcastMode ? 'verbose_json' : 'json');
  if (podcastMode) {
    formData.append('split_strategy', 'auto');
    formData.append('preserve_segments', 'true');
    formData.append('speaker_resolution', 'auto');
  }
  if (!podcastMode && language && language !== 'auto') {
    formData.append('language', language);
  }
  if (typeof context === 'string' && context.trim()) {
    formData.append('context', context.trim());
  }
  return formData;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function partialTextFields(progress) {
  const text = typeof progress.text === 'string' ? progress.text.trim() : '';
  const chunkText = typeof progress.chunk_text === 'string' ? progress.chunk_text.trim() : '';
  const chunks = Array.isArray(progress.chunks)
    ? progress.chunks.filter((chunk) => Number.isInteger(chunk?.index) && typeof chunk?.text === 'string')
    : [];
  return {
    ...(text ? { text } : {}),
    ...(chunkText ? { chunkText } : {}),
    ...(chunks.length > 0 ? { chunks } : {})
  };
}

function extractJobId(responseData) {
  const jobId = responseData?.id || responseData?.job_id;
  if (typeof jobId === 'string' && jobId.trim()) {
    return jobId.trim();
  }
  throw new Error('MOSS ASR 未返回任务 ID');
}

function mapJobProgress(job) {
  const progress = job?.progress || {};
  const status = job?.status;
  const phase = progress.phase || status || 'transcribing';
  const total = Number(progress.total_chunks || 0);
  const current = Number(progress.completed_chunks || 0);
  const partialText = partialTextFields(progress);

  if (status === 'queued' || phase === 'queued') {
    return { phase: 'preparing', percent: 15, current: 0, total, ...partialText, message: '等待 MOSS ASR 队列' };
  }
  if (phase === 'preprocessing') {
    return { phase: 'preparing', percent: 20, current: 0, total, ...partialText, message: 'MOSS ASR 正在预处理音频' };
  }
  if (phase === 'splitting') {
    return { phase: 'preparing', percent: 30, current: 0, total, ...partialText, message: 'MOSS ASR 正在切分音频' };
  }
  if (phase === 'loading_model') {
    return { phase: 'preparing', percent: 40, current: 0, total, ...partialText, message: 'MOSS ASR 正在加载模型' };
  }
  if (phase === 'merging') {
    return { phase: 'transcribing', percent: 98, current, total, ...partialText, message: 'MOSS ASR 正在合并结果' };
  }
  if (status === 'completed' || phase === 'completed') {
    return { phase: 'transcribing', percent: 99, current, total, ...partialText, message: 'MOSS ASR 正在整理最终结果' };
  }

  const rawPercent = typeof progress.percent === 'number' ? progress.percent : 0;
  const percent = Math.min(95, Math.max(45, Math.round(45 + rawPercent * 0.5)));
  return {
    phase: 'transcribing',
    percent,
    current,
    total,
    ...partialText,
    message: total > 0 ? `MOSS ASR 正在转录 ${current}/${total}` : 'MOSS ASR 正在转录'
  };
}

function extractMossResult(result) {
  if (!result || typeof result.text !== 'string') {
    throw new Error('MOSS ASR 未返回转录结果');
  }
  return {
    text: result.text.trim(),
    usage: result.usage || null,
    ...(Array.isArray(result.segments) ? { segments: result.segments } : {}),
    ...(Array.isArray(result.chunks) ? { chunks: result.chunks } : {}),
    ...(result.execution && typeof result.execution === 'object' ? { execution: result.execution } : {}),
    ...(result.diarization && typeof result.diarization === 'object' ? { diarization: result.diarization } : {}),
    ...(result.generation && typeof result.generation === 'object' ? { generation: result.generation } : {}),
    ...(Array.isArray(result.warnings) ? { warnings: result.warnings } : {})
  };
}

function extractCompletedJob(job) {
  const result = job?.result;
  return extractMossResult(result);
}

async function pollJob({ baseUrl, jobId, headers, onProgress, pollIntervalMs }) {
  let lastProgressSnapshot = '';
  while (true) {
    const response = await axios.get(createMossAsrUrl(baseUrl, `/jobs/${encodeURIComponent(jobId)}`), {
      headers,
      proxy: false,
      timeout: MOSS_ASR_TIMEOUT_MS
    });
    const job = response.data;
    if (typeof onProgress === 'function') {
      const mappedProgress = mapJobProgress(job);
      const snapshot = JSON.stringify(mappedProgress);
      if (snapshot !== lastProgressSnapshot) {
        lastProgressSnapshot = snapshot;
        onProgress(mappedProgress);
      }
    }
    if (job?.status === 'completed') {
      return extractCompletedJob(job);
    }
    if (job?.status === 'failed') {
      const failed = new Error(job.error?.message || 'MOSS ASR 转录失败');
      failed.response = { data: { error: job.error } };
      throw failed;
    }
    if (job?.status === 'cancelled') {
      throw new Error('MOSS ASR 转录任务已取消');
    }
    if (job?.status === 'expired') {
      throw new Error('MOSS ASR 转录结果已过期，请重新提交');
    }
    await sleep(pollIntervalMs);
  }
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
 * @param {boolean} [params.podcastMode=false] - 是否请求播客结构化事实
 * @param {Function} [params.onProgress] - 进度回调
 * @param {number} [params.pollIntervalMs] - job 轮询间隔，测试可覆盖
 * @returns {Promise<{text: string, usage: Object|null}>}
 */
async function transcribeFile({
  file,
  baseUrl,
  model,
  apiKey = '',
  language = 'auto',
  context = '',
  podcastMode = false,
  onProgress,
  pollIntervalMs = MOSS_ASR_POLL_INTERVAL_MS
}) {
  if (typeof onProgress === 'function') {
    onProgress({ phase: 'preparing', percent: 10, current: 0, total: 0, message: '正在提交 MOSS ASR 任务' });
  }

  try {
    const headers = buildHeaders(apiKey);
    const response = await axios.post(
      createMossAsrUrl(baseUrl, '/audio/transcriptions'),
      await buildFormData({ file, language, model, context, podcastMode }),
      {
        headers,
        proxy: false,
        timeout: MOSS_ASR_TIMEOUT_MS
      }
    );

    if (response.status === 202 || response.data?.status === 'queued') {
      return await pollJob({
        baseUrl,
        jobId: extractJobId(response.data),
        headers,
        onProgress,
        pollIntervalMs
      });
    }

    if (typeof onProgress === 'function') {
      onProgress({ phase: 'transcribing', percent: 95, current: 1, total: 1, message: 'MOSS ASR 正在返回结果' });
    }

    if (podcastMode) {
      return extractMossResult(response.data);
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
