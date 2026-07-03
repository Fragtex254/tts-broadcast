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
});
