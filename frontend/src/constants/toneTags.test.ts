import { describe, test, expect } from 'vitest';
import { STYLE_TAGS, AUDIO_TAGS, sanitizeStyleTag, sanitizeAudioTag } from './toneTags';

describe('toneTags', () => {
  test('清单非空', () => {
    expect(STYLE_TAGS.length).toBeGreaterThan(0);
    expect(AUDIO_TAGS.length).toBeGreaterThan(0);
  });
  test('sanitizeStyleTag 只剥圆括号（不剥方括号，那是音频标签边界）', () => {
    expect(sanitizeStyleTag(' (平静) ')).toBe('平静');
    expect(sanitizeStyleTag('（严肃）')).toBe('严肃');
    expect(sanitizeStyleTag('[活泼]')).toBe('[活泼]');
    expect(sanitizeStyleTag('一'.repeat(120)).length).toBe(80);
  });
  test('sanitizeAudioTag 剥方括号', () => {
    expect(sanitizeAudioTag('[停顿]')).toBe('停顿');
    expect(sanitizeAudioTag('a[b]c')).toBe('abc');
    expect(sanitizeAudioTag('')).toBe('');
  });
});
