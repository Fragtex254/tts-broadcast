const {
  AUTO_SEGMENT_MAX_LENGTH,
  AUTO_SEGMENT_MIN_LENGTH,
  MAX_SEGMENT_TEXT_LENGTH,
  prependStyleTag,
  sanitizeStyleTag,
  splitLongTextByLimit,
  normalizeSegmentTexts,
  normalizeAutoSegmentTexts
} = require('../../src/utils/segmentText');

describe('segmentText', () => {
  describe('sanitizeStyleTag', () => {
    test('剥离半角/全角圆括号并 trim', () => {
      expect(sanitizeStyleTag(' (平静) ')).toBe('平静');
      expect(sanitizeStyleTag('（严肃）')).toBe('严肃');
    });
    test('不剥方括号（方括号是细粒度音频标签的语义边界）', () => {
      expect(sanitizeStyleTag('[活泼]')).toBe('[活泼]');
      expect(sanitizeStyleTag('a[b]c')).toBe('a[b]c');
    });
    test('空值返回空串', () => {
      expect(sanitizeStyleTag('')).toBe('');
      expect(sanitizeStyleTag(null)).toBe('');
      expect(sanitizeStyleTag(undefined)).toBe('');
    });
    test('限长 80 字，允许写短情绪铺垫', () => {
      expect(sanitizeStyleTag('一'.repeat(120)).length).toBe(80);
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
  describe('normalizeSegmentTexts', () => {
    test('保留不超长的语义块', () => {
      expect(normalizeSegmentTexts(['第一段。', '第二段。'])).toEqual(['第一段。', '第二段。']);
    });

    test('把超过上限的文本继续拆成合法长度', () => {
      const long = '一'.repeat(MAX_SEGMENT_TEXT_LENGTH + 20);
      const chunks = splitLongTextByLimit(long);
      expect(chunks.length).toBe(2);
      expect(chunks.every((chunk) => chunk.length <= MAX_SEGMENT_TEXT_LENGTH)).toBe(true);
    });

    test('优先按标点边界拆分', () => {
      const text = '第一句。第二句。第三句。';
      expect(splitLongTextByLimit(text, 6)).toEqual(['第一句。', '第二句。', '第三句。']);
    });
  });

  describe('normalizeAutoSegmentTexts', () => {
    test('把模型返回的碎句稳定合并为 100-200 字文段', () => {
      const sentence = '这是一个用于口播切分测试的自然句，内容保持连续并且适合朗读。';
      const segments = normalizeAutoSegmentTexts(Array.from({ length: 8 }, () => sentence));

      expect(segments.length).toBeGreaterThan(1);
      expect(segments.every((segment) => segment.length >= AUTO_SEGMENT_MIN_LENGTH)).toBe(true);
      expect(segments.every((segment) => segment.length <= AUTO_SEGMENT_MAX_LENGTH)).toBe(true);
      expect(segments.join('')).toBe(sentence.repeat(8));
    });

    test('把没有自然标点的长文本硬切并重平衡到 100-200 字', () => {
      const text = '一'.repeat(450);
      const segments = normalizeAutoSegmentTexts([text]);

      expect(segments.map((segment) => segment.length)).toEqual([200, 125, 125]);
      expect(segments.join('')).toBe(text);
    });

    test('总文本不足 100 字时保留一个短文段', () => {
      const text = '短稿不足一百字，但仍然应该可以切分并生成语音。';
      expect(normalizeAutoSegmentTexts([text])).toEqual([text]);
    });
  });
});
