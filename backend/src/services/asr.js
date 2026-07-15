const { getApiKey } = require('./mimo');
const { fileToAsrDataUrls } = require('./media');
const { postChatCompletions } = require('./mimoApiClient');
const qwenAsr = require('./qwenAsr');
const wslAsr = require('./wslAsr');
const mossAsr = require('./mossAsr');
const asrModels = require('./asrModels');
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
const SUPPORTED_WSL_ENGINES = new Set(['qwen', 'moss']);
const DEFAULT_ASR_SETTINGS = {
  asr_provider: 'wsl_asr',
  qwen_asr_base_url: 'http://localhost:8765/v1',
  qwen_asr_model: 'Qwen/Qwen3-ASR-1.7B',
  qwen_asr_api_key: '',
  wsl_asr_base_url: 'http://192.168.31.137:18080/v1',
  wsl_asr_engine: 'qwen',
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

function getAsrConfig(providerOverride, engineOverride) {
  const requestedProvider = providerOverride || getSettingValue('asr_provider', DEFAULT_ASR_SETTINGS.asr_provider);
  const isLegacyMossProvider = requestedProvider === 'moss_asr';
  const provider = isLegacyMossProvider
    ? 'wsl_asr'
    : SUPPORTED_ASR_PROVIDERS.has(requestedProvider)
      ? requestedProvider
      : DEFAULT_ASR_SETTINGS.asr_provider;
  const configuredWslEngine = getSettingValue('wsl_asr_engine', DEFAULT_ASR_SETTINGS.wsl_asr_engine);
  const requestedWslEngine = isLegacyMossProvider ? 'moss' : engineOverride;
  const wslEngine = SUPPORTED_WSL_ENGINES.has(requestedWslEngine)
    ? requestedWslEngine
    : SUPPORTED_WSL_ENGINES.has(configuredWslEngine)
      ? configuredWslEngine
      : DEFAULT_ASR_SETTINGS.wsl_asr_engine;
  return {
    provider,
    qwenBaseUrl: getSettingValue('qwen_asr_base_url', DEFAULT_ASR_SETTINGS.qwen_asr_base_url),
    qwenModel: getSettingValue('qwen_asr_model', DEFAULT_ASR_SETTINGS.qwen_asr_model),
    qwenApiKey: getSettingValue('qwen_asr_api_key', DEFAULT_ASR_SETTINGS.qwen_asr_api_key),
    wslBaseUrl: getSettingValue('wsl_asr_base_url', DEFAULT_ASR_SETTINGS.wsl_asr_base_url),
    wslEngine,
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
 * @param {string} [params.provider] - mimo/qwen_mlx/wsl_asr（兼容旧 moss_asr）
 * @param {string} [params.asrEngine] - WSL 引擎 qwen/moss
 * @param {string} [params.wslModel] - 旧 WSL ASR 模型参数，保留兼容
 * @param {string} [params.asrModel] - ASR 模型 ID
 * @param {string} [params.context] - WSL ASR 上下文提示词
 * @param {boolean} [params.podcastMode=false] - 是否请求播客结构化结果
 * @param {Function} [params.onProgress] - 转录进度回调
 * @returns {Promise<{text: string, usage: Object|null}>}
 */
async function transcribeMedia({ file, language = 'auto', provider, asrEngine, wslModel, asrModel, context, podcastMode = false, onProgress }) {
  if (!SUPPORTED_LANGUAGES.has(language)) {
    throw new Error('语言参数无效，请选择自动、中文或英文');
  }

  const config = getAsrConfig(provider, asrEngine);
  if (config.provider === 'wsl_asr') {
    const requestedModel = typeof asrModel === 'string' && asrModel.trim()
      ? asrModel.trim()
      : typeof wslModel === 'string' && wslModel.trim()
        ? wslModel.trim()
        : config.wslModel;
    const adapter = config.wslEngine === 'moss' ? mossAsr : wslAsr;
    const requestLanguage = config.wslEngine === 'moss' && podcastMode ? 'auto' : language;
    return adapter.transcribeFile({
      file,
      language: requestLanguage,
      baseUrl: config.wslBaseUrl,
      model: requestedModel,
      apiKey: config.wslApiKey,
      context,
      ...(config.wslEngine === 'moss' && podcastMode ? { podcastMode: true } : {}),
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

/**
 * 探测当前 ASR provider 的模型列表。
 * @param {Object} params
 * @param {string} params.provider - ASR provider
 * @param {string} [params.baseUrl] - 临时覆盖 Base URL
 * @param {string} [params.apiKey] - 临时覆盖 API Key
 * @returns {Promise<{models: Array, resolvedUrl: string}>}
 */
async function fetchAsrModels({ provider = 'wsl_asr', engine, baseUrl, apiKey } = {}) {
  const config = getAsrConfig(provider, engine);
  if (config.provider === 'mimo') {
    throw new Error('MiMo 云端 ASR 暂不支持模型列表发现');
  }

  const providerConfig = {
    qwen_mlx: { baseUrl: config.qwenBaseUrl, apiKey: config.qwenApiKey },
    wsl_asr: { baseUrl: config.wslBaseUrl, apiKey: config.wslApiKey },
  }[config.provider];

  const result = await asrModels.fetchAsrModelsForConfig({
    baseUrl: typeof baseUrl === 'string' && baseUrl.trim() ? baseUrl.trim() : providerConfig.baseUrl,
    apiKey: typeof apiKey === 'string' ? apiKey : providerConfig.apiKey,
  });
  if (config.provider !== 'wsl_asr' || config.wslEngine !== 'moss') {
    return result;
  }
  const mossModels = result.models.filter((model) => {
    const identity = `${model.id || ''} ${model.owned_by || ''}`.toLowerCase();
    return identity.includes('moss');
  });
  return {
    ...result,
    models: mossModels.length > 0 ? mossModels : result.models
  };
}

module.exports = { DEFAULT_ASR_SETTINGS, fetchAsrModels, getAsrConfig, transcribeMedia };
