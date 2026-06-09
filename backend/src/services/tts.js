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
 * @param {string} [params.stylePrompt] - 风格提示
 * @returns {Promise<Buffer>} 音频 Buffer
 */
async function generateSpeech({ text, voice = '冰糖', voiceType = 'preset', voiceDesign, voiceClone, stylePrompt }) {
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
        { role: 'user', content: stylePrompt || '' },
        { role: 'assistant', content: text }
      ];
      audioConfig = { format: 'wav', voice: voiceClone };
      break;

    default: // preset
      model = 'mimo-v2.5-tts';
      messages = [
        { role: 'user', content: stylePrompt || '用专业新闻主播的语气，语速适中，沉稳大气' },
        { role: 'assistant', content: text }
      ];
      audioConfig = { format: 'wav', voice };
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
      timeout: 120000  // 2 分钟超时，TTS 长文本需要较长时间
    });
  } catch (err) {
    if (err.response?.status === 429) {
      throw new Error('MiMo API 请求过于频繁，请稍后再试');
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
