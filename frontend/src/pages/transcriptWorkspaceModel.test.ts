import { describe, expect, test } from 'vitest';
import { createSpeakerNameMap, formatTranscriptTime } from './transcriptWorkspaceModel';

describe('Transcript 工作区模型', () => {
  test('把秒数格式化为适合长音频阅读的时间', () => {
    expect(formatTranscriptTime(65.8)).toBe('1:05');
    expect(formatTranscriptTime(3661)).toBe('1:01:01');
  });

  test('Speaker 显示名称映射与匿名 key 分离', () => {
    const names = createSpeakerNameMap([{
      id: 1, transcription_id: 2, speaker_key: 'speaker-0001', display_name: '主持人',
      sort_order: 0, speaker_scope: 'global', created_at: '', updated_at: '',
    }]);
    expect(names.get('speaker-0001')).toBe('主持人');
  });
});
