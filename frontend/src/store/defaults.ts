import type { Settings, VoiceConfig } from './types';

export const defaultSettings: Settings = {
  mimo_api_key: '',
  mimo_tts_api_key: '',
  default_voice: '冰糖',
  opening_script: '大家好，欢迎收听今日 AI 简讯。',
  closing_script: '以上就是今天的 AI 简讯，感谢收听，我们明天再见。',
  content_categories: '["ai-models", "ai-products", "industry", "paper", "tip"]',
};

export const defaultVoiceConfig: VoiceConfig = {
  voice: defaultSettings.default_voice,
  voiceType: 'preset',
  voiceDesign: '',
  voiceClone: '',
  stylePrompt: '',
  speed: null,
  emotion: null,
  pitch: null,
};
