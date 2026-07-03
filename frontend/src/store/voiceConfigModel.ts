import type { VoiceConfig } from './types';

export const VOICE_REQUIRED_MESSAGE = '请先选择音色';

const hasText = (value: string | undefined | null) => Boolean(value?.trim());

export function hasSelectedVoice(voiceConfig: VoiceConfig): boolean {
  if (voiceConfig.voiceType === 'preset') return hasText(voiceConfig.voice);
  if (voiceConfig.voiceType === 'design') return hasText(voiceConfig.voiceDesign);
  if (voiceConfig.voiceType === 'clone') return hasText(voiceConfig.voiceClone);
  return false;
}

export function getVoiceSelectionLabel(voiceConfig: VoiceConfig): string {
  if (voiceConfig.voiceType === 'preset' && hasText(voiceConfig.voice)) {
    return voiceConfig.voice;
  }
  if (voiceConfig.voiceType === 'design' && hasText(voiceConfig.voiceDesign)) {
    return '设计音色';
  }
  if (voiceConfig.voiceType === 'clone' && hasText(voiceConfig.voiceClone)) {
    return '克隆音色';
  }
  return '未选择';
}

export function buildVoicePayload(voiceConfig: VoiceConfig) {
  if (!hasSelectedVoice(voiceConfig)) {
    throw new Error(VOICE_REQUIRED_MESSAGE);
  }

  return {
    voiceType: voiceConfig.voiceType,
    voice: voiceConfig.voiceType === 'preset' ? voiceConfig.voice : undefined,
    voiceDesign: voiceConfig.voiceType === 'design' ? voiceConfig.voiceDesign : undefined,
    voiceClone: voiceConfig.voiceType === 'clone' ? voiceConfig.voiceClone : undefined,
    stylePrompt: voiceConfig.stylePrompt || undefined,
    optimizeTextPreview: voiceConfig.voiceType === 'design' ? voiceConfig.optimizeTextPreview : undefined,
    speed: voiceConfig.voiceType === 'preset' ? voiceConfig.speed : null,
    emotion: voiceConfig.voiceType === 'preset' ? voiceConfig.emotion : null,
    pitch: voiceConfig.voiceType === 'preset' ? voiceConfig.pitch : null,
  };
}
