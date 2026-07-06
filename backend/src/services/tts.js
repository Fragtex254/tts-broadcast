const axios = require('axios');
const { getApiKey } = require('./mimo');
const { buildSpeechRequest } = require('./speechRequestBuilder');

const DEFAULT_RATE_LIMIT_RETRY_AFTER_MS = 15000;

function parseRetryAfterMs(headers) {
  const value = headers?.['retry-after'] || headers?.['Retry-After'];
  if (!value) return DEFAULT_RATE_LIMIT_RETRY_AFTER_MS;
  const seconds = Number.parseFloat(value);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.ceil(seconds * 1000);
  }
  const retryAt = Date.parse(value);
  if (!Number.isNaN(retryAt)) {
    return Math.max(retryAt - Date.now(), DEFAULT_RATE_LIMIT_RETRY_AFTER_MS);
  }
  return DEFAULT_RATE_LIMIT_RETRY_AFTER_MS;
}

function createRateLimitError(err) {
  const error = new Error('MiMo API 请求过于频繁，请稍后再试');
  error.code = 'MIMO_RATE_LIMIT';
  error.retryAfterMs = parseRetryAfterMs(err.response?.headers);
  return error;
}

/**
 * 生成 TTS 语音
 * @param {Object} params
 * @param {string} params.text - 口播稿
 * @param {string} [params.voice='冰糖'] - 音色 ID
 * @param {string} [params.voiceType='preset'] - 音色类型 (preset/design/clone)
 * @param {string} [params.voiceDesign] - 音色设计描述
 * @param {string} [params.voiceClone] - 音色克隆音频 (base64)
 * @param {string} [params.stylePrompt] - 简单风格提示
 * @param {boolean} [params.optimizeTextPreview=false] - 是否允许 voicedesign 优化/扩写试听文本
 * @param {Object} [params.speed] - 速度控制 { speed_ratio: 0.5-2.0, style: '固定'|'随机' }
 * @param {string|Array} [params.emotion] - 情感控制，字符串或 [{ emotion, weight }] 数组
 * @param {Object} [params.pitch] - 音调控制 { pitch_ratio: 0.5-2.0, style: '固定'|'随机' }
 * @param {string} [params.format='wav'] - 输出音频格式 (wav/pcm/mp3/ogg)
 * @returns {Promise<Buffer>} 音频 Buffer
 */
async function generateSpeech({ text, voice = '冰糖', voiceType = 'preset', voiceDesign, voiceClone, stylePrompt, optimizeTextPreview = false, speed, emotion, pitch, format = 'wav' }) {
  // 输入校验
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('请提供合成文本');
  }
  if (voiceType === 'clone' && !voiceClone) {
    throw new Error('clone 模式需要提供 voiceClone');
  }
  if (voiceType === 'design' && !voiceDesign) {
    throw new Error('design 模式需要提供 voiceDesign');
  }

  const ttsApiKey = getApiKey('tts');
  const speechRequest = buildSpeechRequest({
    text,
    voice,
    voiceType,
    voiceDesign,
    voiceClone,
    stylePrompt,
    optimizeTextPreview,
    speed,
    emotion,
    pitch,
    format,
  });

  let response;

  try {
    response = await axios.post('https://api.xiaomimimo.com/v1/chat/completions', speechRequest, {
      headers: {
        'api-key': ttsApiKey,
        'Content-Type': 'application/json'
      },
      timeout: 120000
    });
  } catch (err) {
    if (err.response?.status === 429) {
      throw createRateLimitError(err);
    }
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      throw new Error('MiMo TTS API 请求超时，请稍后再试');
    }
    if (!err.response) {
      throw new Error(`MiMo TTS API 网络错误: ${err.message}`);
    }
    throw new Error(`MiMo TTS API 调用失败: ${err.response?.data?.error?.message || err.message}`);
  }

  const audioBase64 = response.data?.choices?.[0]?.message?.audio?.data;
  if (!audioBase64) {
    throw new Error('MiMo TTS API 未返回音频数据');
  }
  return Buffer.from(audioBase64, 'base64');
}

module.exports = { generateSpeech };
