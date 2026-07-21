import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { TranscriptSpeaker, TranscriptSummaryItem, TranscriptTurn } from '../../store';
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
  test('观点证据区间内的所有发言都保持高亮', () => {
    render(
      <TranscriptConversationModal
        isOpen
        title="AI时代是谁的黄金时代？"
        turns={turns}
        speakers={speakers}
        onClose={vi.fn()}
        onCorrect={vi.fn().mockResolvedValue(undefined)}
        initialEvidenceSegmentIndex={0}
        evidenceEndSegmentIndex={1}
      />,
    );

    expect(within(screen.getByLabelText('发言 1，主持人，0:07 到 0:29')).getByText('观点证据')).toBeTruthy();
    expect(within(screen.getByLabelText('发言 2，Zara，0:29 到 1:07')).getByText('观点证据')).toBeTruthy();
  });

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

    expect(within(zaraTurn).getByText('当前发言')).toBeTruthy();
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
    expect(screen.getByText(/找到 0 个匹配/)).toBeTruthy();
    expect(screen.getByText(/我觉得二零二五对于我来说是行动的一年/)).toBeTruthy();
  });

  test('右侧 AI 核心观点随当前聚焦语块的时间范围切换', () => {
    render(
      <TranscriptConversationModal
        isOpen
        title="AI时代是谁的黄金时代？"
        turns={turns}
        speakers={speakers}
        onClose={vi.fn()}
        onCorrect={vi.fn().mockResolvedValue(undefined)}
        summaryItems={[{
          id: 91,
          transcription_id: 9,
          item_type: 'speaker_viewpoint',
          sort_order: 0,
          speaker_key: 'speaker-0002',
          title: '行动带来真实反馈',
          content: '先做，再带着具体问题继续学习。',
          evidence_start_index: 1,
          evidence_end_index: 1,
          start_seconds: 29,
          end_seconds: 67,
          created_at: '',
          updated_at: '',
        }]}
      />,
    );

    const zaraTurn = screen.getByLabelText('发言 2，Zara，0:29 到 1:07');
    fireEvent.mouseEnter(zaraTurn);

    expect(screen.getByText('行动带来真实反馈')).toBeTruthy();
    expect(screen.getByText('先做，再带着具体问题继续学习。')).toBeTruthy();
    expect(screen.getByText('AI 总结，需结合左侧逐字稿核对')).toBeTruthy();
  });

  test('长逐字稿只渲染视口附近发言，并可搜索跳转到远端发言', () => {
    const longTurns: TranscriptTurn[] = Array.from({ length: 240 }, (_, index) => ({
      id: 1000 + index,
      transcription_id: 9,
      turn_index: index,
      speaker_key: index % 2 === 0 ? 'speaker-0001' : 'speaker-0002',
      start_seconds: index * 10,
      end_seconds: index * 10 + 8,
      text: index === 120 || index === 239 ? `这里是第 ${index + 1} 处远端关键词` : `普通发言 ${index + 1}`,
      corrected_text: '',
      evidence_segment_indexes: [index],
      created_at: '',
      updated_at: '',
    }));

    render(
      <TranscriptConversationModal
        isOpen
        title="长播客"
        turns={longTurns}
        speakers={speakers}
        onClose={vi.fn()}
        onCorrect={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getAllByRole('article').length).toBeLessThan(20);
    expect(screen.queryByText('这里是第 121 处远端关键词')).toBeNull();

    const firstTurn = screen.getByLabelText('发言 1，主持人，0:00 到 0:08');
    fireEvent.focus(firstTurn);
    fireEvent.keyDown(firstTurn, { key: 'ArrowDown' });
    expect(within(screen.getByTestId('active-turn-context')).getByText('发言 2 / 240')).toBeTruthy();

    const searchInput = screen.getByLabelText('搜索逐字稿');
    fireEvent.change(searchInput, { target: { value: '远端关键词' } });

    expect(screen.getByText('这里是第 121 处远端关键词')).toBeTruthy();
    expect(screen.getByText('1 / 2')).toBeTruthy();
    expect(within(screen.getByTestId('active-turn-context')).getByText('发言 121 / 240')).toBeTruthy();

    fireEvent.keyDown(searchInput, { key: 'Enter' });
    expect(screen.getByText('这里是第 240 处远端关键词')).toBeTruthy();
    expect(screen.getByText('2 / 2')).toBeTruthy();
    expect(within(screen.getByTestId('active-turn-context')).getByText('发言 240 / 240')).toBeTruthy();

    fireEvent.keyDown(searchInput, { key: 'Enter', shiftKey: true });
    expect(screen.getByText('1 / 2')).toBeTruthy();
    expect(within(screen.getByTestId('active-turn-context')).getByText('发言 121 / 240')).toBeTruthy();
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

  test('未保存校对时阻止关闭，并保留草稿直到用户取消', () => {
    const onClose = vi.fn();
    render(
      <TranscriptConversationModal
        isOpen
        title="AI时代是谁的黄金时代？"
        turns={turns}
        speakers={speakers}
        onClose={onClose}
        onCorrect={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const zaraTurn = screen.getByLabelText('发言 2，Zara，0:29 到 1:07');
    fireEvent.mouseEnter(zaraTurn);
    fireEvent.click(within(zaraTurn).getByRole('button', { name: '校对文字' }));
    fireEvent.change(within(zaraTurn).getByRole('textbox'), { target: { value: '尚未保存的校对草稿' } });
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('请先保存或取消当前校对');
    expect(within(zaraTurn).getByRole<HTMLTextAreaElement>('textbox').value).toBe('尚未保存的校对草稿');

    fireEvent.click(within(zaraTurn).getByRole('button', { name: '取消' }));
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('先关闭挂载再打开时仍会响应真实滚动并更新位置', async () => {
    const longTurns: TranscriptTurn[] = Array.from({ length: 120 }, (_, index) => ({
      ...turns[index % turns.length],
      id: 2000 + index,
      turn_index: index,
      start_seconds: index * 10,
      end_seconds: index * 10 + 8,
      text: `滚动发言 ${index + 1}`,
    }));
    const summaryItems: TranscriptSummaryItem[] = [{
      id: 92,
      transcription_id: 9,
      item_type: 'speaker_viewpoint',
      sort_order: 0,
      speaker_key: 'speaker-0001',
      title: '中段核心观点',
      content: '滚动到中段后展示。',
      evidence_start_index: 50,
      evidence_end_index: 70,
      start_seconds: 500,
      end_seconds: 708,
      created_at: '',
      updated_at: '',
    }];
    const props = {
      title: '延迟打开的长播客',
      turns: longTurns,
      speakers,
      onClose: vi.fn(),
      onCorrect: vi.fn().mockResolvedValue(undefined),
      summaryItems,
      initialEvidenceSegmentIndex: 0,
    };
    const { rerender } = render(<TranscriptConversationModal {...props} isOpen={false} />);
    rerender(<TranscriptConversationModal {...props} isOpen />);

    const progress = screen.getByRole('progressbar', { name: '逐字稿阅读进度' });
    const initialProgress = Number(progress.getAttribute('aria-valuenow'));
    const scroller = screen.getByTestId('transcript-virtual-scroll');
    scroller.scrollTop = 10000;
    fireEvent.scroll(scroller);

    await waitFor(() => expect(Number(progress.getAttribute('aria-valuenow'))).toBeGreaterThan(initialProgress));
    await waitFor(() => expect(screen.getByText('中段核心观点')).toBeTruthy());
  });
});
