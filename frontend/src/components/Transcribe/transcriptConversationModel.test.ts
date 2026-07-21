import { describe, expect, test } from 'vitest';
import type { TranscriptSpeaker, TranscriptSummaryItem, TranscriptTurn } from '../../store';
import {
  createTranscriptSpeakerIndexes,
  findTranscriptViewpointsForTurn,
  filterTranscriptConversationTurns,
  getTranscriptSpeakerInitial,
  getTranscriptSpeakerTone,
} from './transcriptConversationModel';
import {
  createTranscriptVirtualLayout,
  getVisibleTranscriptVirtualItems,
} from './transcriptVirtualListModel';

const speakers: TranscriptSpeaker[] = [
  { id: 1, transcription_id: 2, speaker_key: 'a', display_name: '主持人', sort_order: 0, speaker_scope: 'global', created_at: '', updated_at: '' },
  { id: 2, transcription_id: 2, speaker_key: 'b', display_name: 'Zara', sort_order: 1, speaker_scope: 'global', created_at: '', updated_at: '' },
];

const turns: TranscriptTurn[] = [
  { id: 1, transcription_id: 2, turn_index: 0, speaker_key: 'a', start_seconds: 0, end_seconds: 4, text: '欢迎来到节目', corrected_text: '', evidence_segment_indexes: [0], created_at: '', updated_at: '' },
  { id: 2, transcription_id: 2, turn_index: 1, speaker_key: 'b', start_seconds: 4, end_seconds: 9, text: '原始内容', corrected_text: 'Learn by doing', evidence_segment_indexes: [1], created_at: '', updated_at: '' },
];

describe('逐字稿对话视图模型', () => {
  test('为 Speaker 生成稳定的顺序、首字与视觉色', () => {
    expect(createTranscriptSpeakerIndexes(speakers).get('b')).toBe(1);
    expect(getTranscriptSpeakerInitial('Zara', 'b')).toBe('Z');
    expect(getTranscriptSpeakerInitial('主持人', 'a')).toBe('主');
    expect(getTranscriptSpeakerTone(5)).toEqual(getTranscriptSpeakerTone(1));
  });

  test('搜索使用校对文本并可叠加说话人筛选', () => {
    const names = new Map(speakers.map((speaker) => [speaker.speaker_key, speaker.display_name]));
    expect(filterTranscriptConversationTurns(turns, names, 'learn', null).map((turn) => turn.id)).toEqual([2]);
    expect(filterTranscriptConversationTurns(turns, names, '', 'a').map((turn) => turn.id)).toEqual([1]);
    expect(filterTranscriptConversationTurns(turns, names, 'Zara', 'b').map((turn) => turn.id)).toEqual([2]);
  });

  test('只把时间范围与当前语块相交的 AI 人物观点放进跟随栏', () => {
    const summaryItems: TranscriptSummaryItem[] = [
      {
        id: 11, transcription_id: 2, item_type: 'speaker_viewpoint', sort_order: 1,
        speaker_key: 'b', title: '行动优先', content: '先行动再学习。', evidence_start_index: 1,
        evidence_end_index: 1, start_seconds: 4, end_seconds: 9, created_at: '', updated_at: '',
      },
      {
        id: 12, transcription_id: 2, item_type: 'chapter', sort_order: 0,
        speaker_key: '', title: '章节', content: '不是核心观点。', evidence_start_index: 0,
        evidence_end_index: 1, start_seconds: 0, end_seconds: 9, created_at: '', updated_at: '',
      },
    ];
    expect(findTranscriptViewpointsForTurn(summaryItems, turns[1]).map((item) => item.id)).toEqual([11]);
    expect(findTranscriptViewpointsForTurn(summaryItems, turns[0])).toEqual([]);
    expect(findTranscriptViewpointsForTurn(summaryItems, { ...turns[1], start_seconds: 4, end_seconds: 4 }).map((item) => item.id)).toEqual([11]);
    expect(findTranscriptViewpointsForTurn(summaryItems, null)).toEqual([]);
  });

  test('虚拟列表使用实测高度计算布局，并只返回视口与固定发言', () => {
    const layout = createTranscriptVirtualLayout([11, 12, 13, 14], new Map([[12, 240]]), 100, 10);
    expect(layout.items.map((item) => [item.key, item.start, item.size])).toEqual([
      [11, 0, 100],
      [12, 110, 240],
      [13, 360, 100],
      [14, 470, 100],
    ]);
    expect(layout.totalSize).toBe(570);
    expect(getVisibleTranscriptVirtualItems(layout, 360, 80, 0, 11).map((item) => item.key)).toEqual([11, 13]);
  });
});
