import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { TranscriptSpeaker, TranscriptTurn } from '../../store';
import { TranscriptConversationModal } from './TranscriptConversationModal';

const speakers: TranscriptSpeaker[] = [
  {
    id: 1,
    transcription_id: 9,
    speaker_key: 'speaker-0001',
    display_name: '主持人',
    sort_order: 0,
    speaker_scope: 'global',
    created_at: '',
    updated_at: '',
  },
  {
    id: 2,
    transcription_id: 9,
    speaker_key: 'speaker-0002',
    display_name: 'Zara',
    sort_order: 1,
    speaker_scope: 'global',
    created_at: '',
    updated_at: '',
  },
];

const turns: TranscriptTurn[] = [
  {
    id: 11,
    transcription_id: 9,
    turn_index: 0,
    speaker_key: 'speaker-0001',
    start_seconds: 7,
    end_seconds: 29,
    text: '如果要找一个词来总结自己过去这一年的话，你会想到一个什么词？',
    corrected_text: '',
    evidence_segment_indexes: [0],
    created_at: '',
    updated_at: '',
  },
  {
    id: 12,
    transcription_id: 9,
    turn_index: 1,
    speaker_key: 'speaker-0002',
    start_seconds: 29,
    end_seconds: 67,
    text: '我觉得二零二五对于我来说是行动的一年，最好的学习方式就是 learn by doing。',
    corrected_text: '',
    evidence_segment_indexes: [1],
    created_at: '',
    updated_at: '',
  },
];

describe('TranscriptConversationModal', () => {
  test('悬浮发言时同步强调发言、说话人与当前定位', () => {
    render(
      <TranscriptConversationModal
        isOpen
        title="AI时代是谁的黄金时代？"
        turns={turns}
        speakers={speakers}
        onClose={vi.fn()}
        onCorrect={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const zaraTurn = screen.getByLabelText('发言 2，Zara，0:29 到 1:07');
    fireEvent.mouseEnter(zaraTurn);

    expect(within(zaraTurn).getByText('当前悬浮区域')).toBeTruthy();
    const context = screen.getByTestId('active-turn-context');
    expect(within(context).getByText('Zara')).toBeTruthy();
    expect(within(context).getByText('0:29–1:07')).toBeTruthy();
    expect(within(context).getByText('发言 2 / 2')).toBeTruthy();
  });

  test('说话人筛选与逐字稿搜索都真实生效', () => {
    render(
      <TranscriptConversationModal
        isOpen
        title="AI时代是谁的黄金时代？"
        turns={turns}
        speakers={speakers}
        onClose={vi.fn()}
        onCorrect={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const zaraFilter = screen.getByRole('button', { name: /Zara.*只看此人/ });
    fireEvent.click(zaraFilter);
    expect(screen.queryByText('如果要找一个词来总结自己过去这一年的话，你会想到一个什么词？')).toBeNull();
    expect(screen.getByText(/我觉得二零二五对于我来说是行动的一年/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('搜索逐字稿'), { target: { value: '不存在的关键词' } });
    expect(screen.getByText('没有找到匹配的发言')).toBeTruthy();
  });

  test('高亮发言可以直接进入校对并保存', async () => {
    const onCorrect = vi.fn().mockResolvedValue(undefined);
    render(
      <TranscriptConversationModal
        isOpen
        title="AI时代是谁的黄金时代？"
        turns={turns}
        speakers={speakers}
        onClose={vi.fn()}
        onCorrect={onCorrect}
      />,
    );

    const zaraTurn = screen.getByLabelText('发言 2，Zara，0:29 到 1:07');
    fireEvent.mouseEnter(zaraTurn);
    fireEvent.click(within(zaraTurn).getByRole('button', { name: '校对文字' }));
    fireEvent.change(within(zaraTurn).getByRole('textbox'), { target: { value: '行动之后，再带着问题学习。' } });
    fireEvent.click(within(zaraTurn).getByRole('button', { name: '保存校对' }));

    await waitFor(() => expect(onCorrect).toHaveBeenCalledWith(12, '行动之后，再带着问题学习。'));
  });
});
