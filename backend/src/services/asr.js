const { getApiKey } = require('./mimo');
const { fileToAsrDataUrls } = require('./media');
const { postChatCompletions } = require('./mimoApiClient');

const ASR_MODEL = 'mimo-v2.5-asr';
const MAX_DATA_URL_SIZE = 10 * 1024 * 1024;
const SUPPORTED_LANGUAGES = new Set(['auto', 'zh', 'en']);

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
 * @returns {Promise<{text: string, usage: Object|null}>}
 */
async function transcribeMedia({ file, language = 'auto' }) {
  if (!SUPPORTED_LANGUAGES.has(language)) {
    throw new Error('语言参数无效，请选择自动、中文或英文');
  }

  const apiKey = getApiKey('tts');
  const dataUrls = await fileToAsrDataUrls({ file, maxDataUrlSize: MAX_DATA_URL_SIZE });
  const texts = [];
  const usages = [];

  for (const dataUrl of dataUrls) {
    if (dataUrl.length > MAX_DATA_URL_SIZE) {
      throw new Error('音频内容过大，转换后超过 ASR 10MB 限制');
    }

    const data = await postChatCompletions({
      apiKey,
      serviceName: 'ASR',
      payload: buildAsrPayload({ dataUrl, language })
    });

    const text = data?.choices?.[0]?.message?.content;
    if (!text || typeof text !== 'string') {
      throw new Error('MiMo ASR API 未返回转录结果');
    }

    texts.push(text.trim());
    usages.push(data.usage || null);
  }

  return { text: texts.filter(Boolean).join('\n'), usage: mergeUsage(usages) };
}

module.exports = { transcribeMedia };
