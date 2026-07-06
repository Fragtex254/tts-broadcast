import { describe, expect, test } from 'vitest';
import { defaultVoiceConfig } from './defaults';
import { buildVoicePayload, hasSelectedVoice, VOICE_REQUIRED_MESSAGE } from './voiceConfigModel';
import type { VoiceConfig } from './types';

describe('voiceConfigModel', () => {
  test('默认音色配置必须保持未选择状态', () => {
    expect(hasSelectedVoice(defaultVoiceConfig)).toBe(false);
    expect(() => buildVoicePayload(defaultVoiceConfig)).toThrow(VOICE_REQUIRED_MESSAGE);
  });

  test('preset 音色必须显式包含 voice', () => {
    const config: VoiceConfig = {
      ...defaultVoiceConfig,
      voiceType: 'preset',
      voice: '冰糖',
    };

    expect(hasSelectedVoice(config)).toBe(true);
    expect(buildVoicePayload(config)).toMatchObject({
      voiceType: 'preset',
      voice: '冰糖',
    });
  });

  test('生成 payload 时只保留音色与风格提示', () => {
    const config: VoiceConfig = {
      ...defaultVoiceConfig,
      voiceType: 'design',
      voiceDesign: '低柔冷静的女性声线',
      stylePrompt: '语速偏慢，尾音轻收',
    };

    expect(buildVoicePayload(config)).toMatchObject({
      voiceType: 'design',
      voiceDesign: '低柔冷静的女性声线',
      stylePrompt: '语速偏慢，尾音轻收',
    });
    expect(buildVoicePayload(config)).not.toHaveProperty('performance');
  });
});
