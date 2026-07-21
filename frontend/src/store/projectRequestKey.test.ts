import { describe, expect, test } from 'vitest';
import { CONTENT_CREATION_PROMPT_VERSION, createStableProjectRequestKey, normalizeCreationJobInput } from './projectRequestKey';

describe('project request keys', () => {
  test('相同逻辑输入跨重试和数组顺序复用同一 key', () => {
    const first = normalizeCreationJobInput({ operation: 'generate_master', evidenceIds: [8, 3, 8], outlineRevisionId: 21 });
    const retry = normalizeCreationJobInput({ operation: 'generate_master', evidenceIds: [3, 8], outlineRevisionId: 21 });

    expect(createStableProjectRequestKey('project-2-generate-master', first))
      .toBe(createStableProjectRequestKey('project-2-generate-master', retry));
  });

  test('真实输入变化会产生新 key', () => {
    const first = createStableProjectRequestKey('revision-2-4', { content: '第一版', changeReason: '' });
    const changed = createStableProjectRequestKey('revision-2-4', { content: '第二版', changeReason: '' });

    expect(first).not.toBe(changed);
    expect(first.length).toBeLessThanOrEqual(128);
    expect(CONTENT_CREATION_PROMPT_VERSION).toBe('evidence-creation-v2');
  });
});
