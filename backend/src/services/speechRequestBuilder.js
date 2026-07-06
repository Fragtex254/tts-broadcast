const DEFAULT_STYLE_PROMPT = '用专业新闻主播的语气，语速适中，沉稳大气';

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function appendSection(lines, title, content) {
  if (!content) return;
  lines.push(`${title}：${content}`);
}

function buildUserContent({ voiceType, voiceDesign, stylePrompt, hasFineGrainedParams }) {
  const lines = [];

  if (voiceType === 'design') {
    appendSection(lines, '音色设计', cleanText(voiceDesign));
  }

  if (stylePrompt && !hasFineGrainedParams) {
    appendSection(lines, '风格提示', stylePrompt);
  }

  if (lines.length > 0) return lines.join('\n');
  if (hasFineGrainedParams && (voiceType === 'preset' || voiceType === 'clone')) return '';
  if (voiceType === 'preset' || voiceType === 'clone') return DEFAULT_STYLE_PROMPT;
  return cleanText(voiceDesign);
}

/**
 * 将业务音色配置编译为 MiMo TTS 请求体
 * @param {Object} params
 * @param {string} params.text - 合成文本
 * @param {string} [params.voice] - 预置音色
 * @param {string} [params.voiceType] - 音色类型
 * @param {string} [params.voiceDesign] - 音色设计描述
 * @param {string} [params.voiceClone] - 克隆音频 data URI
 * @param {string} [params.stylePrompt] - 简单风格提示
 * @param {boolean} [params.optimizeTextPreview] - 是否允许优化试听文本
 * @param {Object} [params.speed] - 预置音色速度控制
 * @param {string|Array} [params.emotion] - 预置音色情绪控制
 * @param {Object} [params.pitch] - 预置音色音调控制
 * @param {string} [params.format] - 输出格式
 * @returns {{model:string,messages:Array,audio:Object}}
 */
function buildSpeechRequest({
  text,
  voice = '冰糖',
  voiceType = 'preset',
  voiceDesign,
  voiceClone,
  stylePrompt,
  optimizeTextPreview = false,
  speed,
  emotion,
  pitch,
  format = 'wav',
}) {
  const hasFineGrainedParams = Boolean(speed || emotion || pitch);
  const userContent = buildUserContent({
    voiceType,
    voiceDesign,
    stylePrompt: cleanText(stylePrompt),
    hasFineGrainedParams,
  });
  const assistantContent = cleanText(text);

  if (voiceType === 'design') {
    const audio = { format };
    if (optimizeTextPreview) audio.optimize_text_preview = true;
    return {
      model: 'mimo-v2.5-tts-voicedesign',
      messages: [
        { role: 'user', content: userContent },
        { role: 'assistant', content: assistantContent },
      ],
      audio,
    };
  }

  if (voiceType === 'clone') {
    return {
      model: 'mimo-v2.5-tts-voiceclone',
      messages: [
        { role: 'user', content: userContent },
        { role: 'assistant', content: assistantContent },
      ],
      audio: { format, voice: voiceClone },
    };
  }

  const audio = { format, voice };
  if (speed) audio.speed = speed;
  if (emotion) {
    if (Array.isArray(emotion)) {
      audio.emotion_weights = emotion;
    } else {
      audio.emotion = emotion;
    }
  }
  if (pitch) audio.pitch = pitch;

  return {
    model: 'mimo-v2.5-tts',
    messages: [
      { role: 'user', content: userContent },
      { role: 'assistant', content: assistantContent },
    ],
    audio,
  };
}

module.exports = {
  buildSpeechRequest,
};
