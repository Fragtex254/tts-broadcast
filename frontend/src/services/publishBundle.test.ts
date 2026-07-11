import { describe, expect, test } from 'vitest';
import { sanitizePublishFileName } from './publishBundle';

describe('发布包文件名', () => {
  test('替换文件系统非法字符和空格', () => {
    expect(sanitizePublishFileName('AI / 创作：第一期')).toBe('AI___创作：第一期');
  });
});
