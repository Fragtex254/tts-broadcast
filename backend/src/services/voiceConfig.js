// 音色配置规范化与 TTS 参数转换
const audio = require('./audio');

const DEFAULT_VOICE = '冰糖';
const VALID_VOICE_TYPES = new Set(['preset', 'clone', 'design']);

/**
 * 规范化音色类型
 * @param {string} voiceType - 原始音色类型
 * @returns {string} 规范化后的音色类型
 */
function normalizeVoiceType(voiceType) {
  return VALID_VOICE_TYPES.has(voiceType) ? voiceType : 'preset';
}

/**
 * 规范化音色配置，过滤与当前音色类型无关的字段
 * @param {Object} input - 原始音色配置
 * @returns {{ voiceType: string, voiceConfig: Object }} 规范化结果
 */
function normalizeVoiceConfig(input = {}) {
  const voiceType = normalizeVoiceType(input.voiceType);
  const voiceConfig = {
    voice: voiceType === 'preset' ? (input.voice || DEFAULT_VOICE) : undefined,
    voiceDesign: voiceType === 'design' ? (input.voiceDesign || '') : undefined,
    voiceClone: voiceType === 'clone' ? (input.voiceClone || '') : undefined,
    stylePrompt: input.stylePrompt || '',
    speed: voiceType === 'preset' ? (input.speed || null) : null,
    emotion: voiceType === 'preset' ? (input.emotion || null) : null,
    pitch: voiceType === 'preset' ? (input.pitch || null) : null,
  };

  return { voiceType, voiceConfig };
}

/**
 * 解析数据库中的 voice_config JSON
 * @param {Object} broadcast - 播报记录
 * @returns {{ voiceType: string, voiceConfig: Object }} 规范化结果
 */
function parseBroadcastVoiceConfig(broadcast) {
  let storedConfig = {};
  try {
    storedConfig = JSON.parse(broadcast?.voice_config || '{}');
  } catch {
    storedConfig = {};
  }
  return normalizeVoiceConfig({
    ...storedConfig,
    voiceType: broadcast?.voice_type,
  });
}

/**
 * 将规范化音色配置转换为 tts.generateSpeech 参数
 * @param {Object} params
 * @param {string} params.text - 合成文本
 * @param {string} params.voiceType - 音色类型
 * @param {Object} params.voiceConfig - 规范化音色配置
 * @param {boolean} [params.resolveClone=false] - 是否将 /audio/ 克隆音频解析为 data URI
 * @returns {Promise<Object>} TTS 参数
 */
async function toSpeechParams({ text, voiceType, voiceConfig, resolveClone = false }) {
  const normalizedType = normalizeVoiceType(voiceType);
  const params = {
    text,
    voiceType: normalizedType,
    voice: voiceConfig.voice,
    voiceDesign: voiceConfig.voiceDesign,
    voiceClone: voiceConfig.voiceClone,
    stylePrompt: voiceConfig.stylePrompt,
    speed: voiceConfig.speed,
    emotion: voiceConfig.emotion,
    pitch: voiceConfig.pitch,
  };

  if (resolveClone && normalizedType === 'clone' && params.voiceClone) {
    params.voiceClone = await audio.resolveVoiceClone(params.voiceClone);
  }

  return params;
}

/**
 * 预解析 clone 音色：将 voiceClone 中的 /audio 文件路径转换为 base64 data URI（仅一次）。
 * 用于批量生成场景，避免在每个 segment 回调里重复读取文件和重复 base64 转换。
 * 非 clone 类型或空 voiceClone 时原样返回。
 * @param {Object} params
 * @param {string} params.voiceType - 音色类型
 * @param {Object} params.voiceConfig - 规范化音色配置
 * @returns {Promise<Object>} 解析后的 voiceConfig（clone 时 voiceClone 已是 data URI）
 */
async function resolveCloneVoiceConfig({ voiceType, voiceConfig }) {
  if (normalizeVoiceType(voiceType) !== 'clone' || !voiceConfig.voiceClone) {
    return voiceConfig;
  }
  const resolvedClone = await audio.resolveVoiceClone(voiceConfig.voiceClone);
  return { ...voiceConfig, voiceClone: resolvedClone };
}

module.exports = {
  normalizeVoiceType,
  normalizeVoiceConfig,
  parseBroadcastVoiceConfig,
  toSpeechParams,
  resolveCloneVoiceConfig,
};
