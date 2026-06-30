const { getApiKey } = require('./mimo');
const { fileToAsrDataUrls } = require('./media');
const { postChatCompletions } = require('./mimoApiClient');
const qwenAsr = require('./qwenAsr');
const wslAsr = require('./wslAsr');
const db = require('../db');

const ASR_MODEL = 'mimo-v2.5-asr';
const MIMO_MAX_DATA_URL_SIZE = 10 * 1024 * 1024;
const QWEN_MAX_DATA_URL_SIZE = 256 * 1024 * 1024;
const QWEN_CHUNK_OPTIONS = {
  targetSeconds: 10 * 60,
  minSeconds: 60,
  maxSeconds: 20 * 60,
  tooLargeMessage: '音频内容过大，转换后超过 Qwen 本地 ASR 单片限制'
};
const SUPPORTED_LANGUAGES = new Set(['auto', 'zh', 'en']);
const SUPPORTED_ASR_PROVIDERS = new Set(['mimo', 'qwen_mlx', 'wsl_asr']);
const DEFAULT_ASR_SETTINGS = {
  asr_provider: 'wsl_asr',
  qwen_asr_base_url: 'http://localhost:8765/v1',
  qwen_asr_model: 'Qwen/Qwen3-ASR-1.7B',
  qwen_asr_api_key: '',
  wsl_asr_base_url: 'http://192.168.31.137:18080/v1',
  wsl_asr_model: 'qwen3-asr-1.7b',
  wsl_asr_api_key: ''
};

function getSettingValue(key, fallback) {
  const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!setting) return fallback;
  try {
    const value = JSON.parse(setting.value);
    return value === undefined || value === null || value === '' ? fallback : value;
  } catch {
    return fallback;
  }
}

function getAsrConfig(providerOverride) {
  const provider = providerOverride || getSettingValue('asr_provider', DEFAULT_ASR_SETTINGS.asr_provider);
  return {
    provider: SUPPORTED_ASR_PROVIDERS.has(provider) ? provider : DEFAULT_ASR_SETTINGS.asr_provider,
    qwenBaseUrl: getSettingValue('qwen_asr_base_url', DEFAULT_ASR_SETTINGS.qwen_asr_base_url),
    qwenModel: getSettingValue('qwen_asr_model', DEFAULT_ASR_SETTINGS.qwen_asr_model),
    qwenApiKey: getSettingValue('qwen_asr_api_key', DEFAULT_ASR_SETTINGS.qwen_asr_api_key),
    wslBaseUrl: getSettingValue('wsl_asr_base_url', DEFAULT_ASR_SETTINGS.wsl_asr_base_url),
    wslModel: getSettingValue('wsl_asr_model', DEFAULT_ASR_SETTINGS.wsl_asr_model),
    wslApiKey: getSettingValue('wsl_asr_api_key', DEFAULT_ASR_SETTINGS.wsl_asr_api_key)
  };
}

function buildAsrPayload({ dataUrl, language }) {
  return {
    model: ASR_MODEL,
    messages: [{
      role: 'user',
      content: [{
        type: 'input_audio',
        input_audio: { data: dataUrl }
      }]
    }],
    asr_options: { language }
  };
}

function mergeUsage(usages) {
  const availableUsages = usages.filter(Boolean);
  if (availableUsages.length === 0) {
    return null;
  }

  return availableUsages.reduce((merged, usage) => {
    Object.entries(usage).forEach(([key, value]) => {
      if (typeof value === 'number') {
        merged[key] = (merged[key] || 0) + value;
      }
    });
    return merged;
  }, {});
}

/**
 * 转录上传媒体为文字
 * @param {Object} params
 * @param {Object} params.file - multer 文件对象
 * @param {string} [params.language='auto'] - auto/zh/en
 * @param {string} [params.provider] - mimo/qwen_mlx/wsl_asr
 * @param {string} [params.wslModel] - WSL ASR 模型 ID
 * @param {string} [params.context] - WSL ASR 上下文提示词
 * @param {Function} [params.onProgress] - 转录进度回调
 * @returns {Promise<{text: string, usage: Object|null}>}
 */
async function transcribeMedia({ file, language = 'auto', provider, wslModel, context, onProgress }) {
  if (!SUPPORTED_LANGUAGES.has(language)) {
    throw new Error('语言参数无效，请选择自动、中文或英文');
  }

  const config = getAsrConfig(provider);
  if (config.provider === 'wsl_asr') {
    return wslAsr.transcribeFile({
      file,
      language,
      baseUrl: config.wslBaseUrl,
      model: typeof wslModel === 'string' && wslModel.trim() ? wslModel.trim() : config.wslModel,
      apiKey: config.wslApiKey,
      context,
      onProgress
    });
  }

  const apiKey = config.provider === 'mimo' ? getApiKey('tts') : '';
  if (typeof onProgress === 'function') {
    onProgress({ phase: 'preparing', percent: 10, text: '' });
  }

  const maxDataUrlSize = config.provider === 'qwen_mlx' ? QWEN_MAX_DATA_URL_SIZE : MIMO_MAX_DATA_URL_SIZE;
  const dataUrls = await fileToAsrDataUrls({
    file,
    maxDataUrlSize,
    chunkOptions: config.provider === 'qwen_mlx' ? QWEN_CHUNK_OPTIONS : undefined
  });
  const texts = [];
  const usages = [];
  const total = dataUrls.length;

  if (typeof onProgress === 'function') {
    onProgress({ phase: 'transcribing', current: 0, total, percent: 20, text: '' });
  }

  for (let index = 0; index < dataUrls.length; index++) {
    const dataUrl = dataUrls[index];
    if (dataUrl.length > maxDataUrlSize) {
      throw new Error(config.provider === 'qwen_mlx'
        ? '音频内容过大，转换后超过 Qwen 本地 ASR 单片限制'
        : '音频内容过大，转换后超过 ASR 10MB 限制');
    }

    const data = config.provider === 'qwen_mlx'
      ? await qwenAsr.transcribeDataUrl({
          dataUrl,
          language,
          baseUrl: config.qwenBaseUrl,
          model: config.qwenModel,
          apiKey: config.qwenApiKey
        })
      : await postChatCompletions({
          apiKey,
          serviceName: 'ASR',
          payload: buildAsrPayload({ dataUrl, language })
        });

    const text = config.provider === 'qwen_mlx' ? data.text : data?.choices?.[0]?.message?.content;
    if (!text || typeof text !== 'string') {
      throw new Error(config.provider === 'qwen_mlx' ? 'Qwen 本地 ASR 未返回转录结果' : 'MiMo ASR API 未返回转录结果');
    }

    texts.push(text.trim());
    usages.push(data.usage || null);

    if (typeof onProgress === 'function') {
      const current = index + 1;
      onProgress({
        phase: 'transcribing',
        current,
        total,
        percent: Math.round(20 + (current / total) * 80),
        chunkText: text.trim(),
        text: texts.filter(Boolean).join('\n')
      });
    }
  }

  return { text: texts.filter(Boolean).join('\n'), usage: mergeUsage(usages) };
}

module.exports = { DEFAULT_ASR_SETTINGS, getAsrConfig, transcribeMedia };
