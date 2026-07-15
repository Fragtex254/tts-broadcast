import { describe, expect, it } from 'vitest';
import { mergeTranscriptionChunk, mergeTranscriptionText } from './transcriptionProgressModel';

describe('transcriptionProgressModel', () => {
  it('中间事件缺少文字时保留已经收到的累计结果', () => {
    expect(mergeTranscriptionText('第一段', undefined)).toBe('第一段');
    expect(mergeTranscriptionText('第一段', '')).toBe('第一段');
  });

  it('按已完成 chunk 序号追加并去重最新文字', () => {
    const first = mergeTranscriptionChunk([], { current: 1, chunkText: '第一段' });
    const repeated = mergeTranscriptionChunk(first, { current: 1, chunkText: '第一段' });
    const second = mergeTranscriptionChunk(repeated, { current: 2, chunkText: '第二段' });

    expect(repeated).toBe(first);
    expect(second).toEqual([
      { index: 1, text: '第一段' },
      { index: 2, text: '第二段' },
    ]);
  });

  it('轮询跨过多个 chunk 时使用服务端完整列表恢复遗漏内容', () => {
    const chunks = mergeTranscriptionChunk([], {
      current: 3,
      chunkText: '第三段',
      chunks: [
        { index: 1, text: '第一段' },
        { index: 2, text: '第二段' },
        { index: 3, text: '第三段' },
      ],
    });

    expect(chunks.map((chunk) => chunk.text)).toEqual(['第一段', '第二段', '第三段']);
  });
});
