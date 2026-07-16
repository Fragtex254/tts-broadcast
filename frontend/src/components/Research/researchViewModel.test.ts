import { describe, expect, test } from 'vitest';
import { compactResearchText } from './researchViewModel';

describe('compactResearchText', () => {
  test('压缩空白并为过长观点补充省略号', () => {
    expect(compactResearchText('  Agent   会从单体走向协作  ', 40)).toBe('Agent 会从单体走向协作');
    expect(compactResearchText('这是一个需要被压缩的很长观点结论', 8)).toBe('这是一个需要被压…');
  });
});
