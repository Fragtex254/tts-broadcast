const axios = require('axios');
const { getApiKey } = require('./mimo');

/**
 * 生成 TTS 语音
 * @param {Object} params
 * @param {string} params.text - 口播稿
 * @param {string} [params.voice='冰糖'] - 音色 ID
 * @param {string} [params.voiceType='preset'] - 音色类型 (preset/design/clone)
 * @param {string} [params.voiceDesign] - 音色设计描述
 * @param {string} [params.voiceClone] - 音色克隆音频 (base64)
 * @param {string} [params.stylePrompt] - 风格提示（与精细参数互斥）
 * @param {Object} [params.speed] - 速度控制 { speed_ratio: 0.5-2.0, style: '固定'|'随机' }
 * @param {string|Array} [params.emotion] - 情感控制，字符串或 [{ emotion, weight }] 数组
 * @param {Object} [params.pitch] - 音调控制 { pitch_ratio: 0.5-2.0, style: '固定'|'随机' }
 * @returns {Promise<Buffer>} 音频 Buffer
 */
async function generateSpeech({ text, voice = '冰糖', voiceType = 'preset', voiceDesign, voiceClone, stylePrompt, speed, emotion, pitch }) {
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
        { role: 'user', content: voiceDesign },
        { role: 'assistant', content: text }
      ];
      audioConfig = { format: 'wav', optimize_text_preview: true };
      break;

    case 'clone':
      model = 'mimo-v2.5-tts-voiceclone';
      messages = [
        { role: 'user', content: effectiveStylePrompt },
        { role: 'assistant', content: text }
      ];
      audioConfig = { format: 'wav', voice: voiceClone };
      break;

    default: // preset
      model = 'mimo-v2.5-tts';
      messages = [
        { role: 'user', content: effectiveStylePrompt },
        { role: 'assistant', content: text }
      ];
      audioConfig = { format: 'wav', voice };
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

  // 带重试的 API 调用（429 限流时最多重试 3 次）
  const MAX_RETRIES = 3;
  let response;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
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
      break; // 成功，跳出重试循环
    } catch (err) {
      if (err.response?.status === 429 && attempt < MAX_RETRIES) {
        // 429 限流，指数退避后重试
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // 非 429 错误或重试耗尽
      if (err.response?.status === 429) {
        throw new Error('MiMo API 请求过于频繁，请稍后再试');
      }
      if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
        throw new Error('MiMo TTS API 请求超时，请稍后再试');
      }
      if (!err.response) {
        throw new Error(`MiMo TTS API 网络错误: ${err.message}`);
      }
      throw new Error(`MiMo TTS API 调用失败: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  const audioBase64 = response.data?.choices?.[0]?.message?.audio?.data;
  if (!audioBase64) {
    throw new Error('MiMo TTS API 未返回音频数据');
  }
  return Buffer.from(audioBase64, 'base64');
}

module.exports = { generateSpeech };
