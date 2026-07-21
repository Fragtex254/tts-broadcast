const { createSourceFragments } = require('../../src/utils/contentSourceFragments');

describe('内容来源确定性分片', () => {
  test('分片索引稳定且正文只能由原始来源 offset 派生', () => {
    const content = '  第一段保留原文。\n\n第二段很长，需要继续切分；但不能改写来源正文，也不能丢失原始位置。  ';

    const first = createSourceFragments(content, { maxLength: 18 });
    const second = createSourceFragments(content, { maxLength: 18 });

    expect(second).toEqual(first);
    expect(first.map((fragment) => fragment.index)).toEqual(first.map((_, index) => index));
    expect(first.length).toBeGreaterThan(2);
    for (const fragment of first) {
      expect(content.slice(fragment.start_offset, fragment.end_offset)).toBe(fragment.text);
      expect(fragment.text.trim()).toBe(fragment.text);
      expect(fragment.text.length).toBeLessThanOrEqual(18);
    }
  });
});
