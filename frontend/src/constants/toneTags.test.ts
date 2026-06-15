import { describe, test, expect } from 'vitest';
import { STYLE_TAGS, AUDIO_TAGS, sanitizeStyleTag, sanitizeAudioTag } from './toneTags';

describe('toneTags', () => {
  test('清单非空', () => {
    expect(STYLE_TAGS.length).toBeGreaterThan(0);
    expect(AUDIO_TAGS.length).toBeGreaterThan(0);
  });
  test('sanitizeStyleTag 去括号/trim/限长', () => {
    expect(sanitizeStyleTag(' (平静) ')).toBe('平静');
    expect(sanitizeStyleTag('（严肃）')).toBe('严肃');
    expect(sanitizeStyleTag('一'.repeat(30)).length).toBe(20);
  });
  test('sanitizeAudioTag 去方括号', () => {
    expect(sanitizeAudioTag('[停顿]')).toBe('停顿');
    expect(sanitizeAudioTag('')).toBe('');
  });
});
