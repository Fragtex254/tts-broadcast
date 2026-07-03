const axios = require('axios');
const { getApiKey } = require('./mimo');

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
 * @param {string} [params.stylePrompt] - 风格提示（与精细参数互斥）
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

  // 判断是否使用了精细参数（speed/emotion/pitch），若是则清除 stylePrompt 避免冲突
  const hasFineGrainedParams = speed || emotion || pitch;
  // 无精细参数且无 stylePrompt 时使用默认风格提示
  const effectiveStylePrompt = hasFineGrainedParams
    ? ''
    : (stylePrompt || '用专业新闻主播的语气，语速适中，沉稳大气');

  const ttsApiKey = getApiKey('tts');

  let model, messages, audioConfig;

  switch (voiceType) {
    case 'design':
      model = 'mimo-v2.5-tts-voicedesign';
      messages = [
        { role: 'user', content: stylePrompt ? `${voiceDesign}\n\n风格控制：${stylePrompt}` : voiceDesign },
        { role: 'assistant', content: text }
      ];
      audioConfig = { format };
      if (optimizeTextPreview) {
        audioConfig.optimize_text_preview = true;
      }
      break;

    case 'clone':
      model = 'mimo-v2.5-tts-voiceclone';
      messages = [
        { role: 'user', content: effectiveStylePrompt },
        { role: 'assistant', content: text }
      ];
      audioConfig = { format, voice: voiceClone };
      break;

    default: // preset
      model = 'mimo-v2.5-tts';
      messages = [
        { role: 'user', content: effectiveStylePrompt },
        { role: 'assistant', content: text }
      ];
      audioConfig = { format, voice };
      // 精细控制参数
      if (speed) audioConfig.speed = speed;
      if (emotion) {
        if (Array.isArray(emotion)) {
          audioConfig.emotion_weights = emotion;
        } else {
          audioConfig.emotion = emotion;
        }
      }
      if (pitch) audioConfig.pitch = pitch;
  }

  let response;

  try {
    response = await axios.post('https://api.xiaomimimo.com/v1/chat/completions', {
      model,
      messages,
      audio: audioConfig
    }, {
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
