const { prependStyleTag, sanitizeStyleTag } = require('../../src/utils/segmentText');

describe('segmentText', () => {
  describe('sanitizeStyleTag', () => {
    test('剥离半角/全角括号与方括号并 trim', () => {
      expect(sanitizeStyleTag(' (平静) ')).toBe('平静');
      expect(sanitizeStyleTag('（严肃）')).toBe('严肃');
      expect(sanitizeStyleTag('[活泼]')).toBe('活泼');
    });
    test('空值返回空串', () => {
      expect(sanitizeStyleTag('')).toBe('');
      expect(sanitizeStyleTag(null)).toBe('');
      expect(sanitizeStyleTag(undefined)).toBe('');
    });
    test('限长 20 字', () => {
      expect(sanitizeStyleTag('一'.repeat(30)).length).toBe(20);
    });
  });
  describe('prependStyleTag', () => {
    test('有标签时前置 (标签)', () => {
      expect(prependStyleTag('你好', '平静')).toBe('(平静)你好');
    });
    test('无标签时原样返回', () => {
      expect(prependStyleTag('你好', '')).toBe('你好');
      expect(prependStyleTag('你好', null)).toBe('你好');
    });
    test('标签自带括号会被清洗后再包裹', () => {
      expect(prependStyleTag('你好', '(平静)')).toBe('(平静)你好');
    });
  });
});
