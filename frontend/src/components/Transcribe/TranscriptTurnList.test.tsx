import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { TranscriptSpeaker, TranscriptTurn } from '../../store';
import { TranscriptTurnList } from './TranscriptTurnList';

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
    display_name: '嘉宾',
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
    start_seconds: 0,
    end_seconds: 12,
    text: '主持人提出问题。',
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
    start_seconds: 12,
    end_seconds: 32,
    text: '嘉宾给出完整回答。',
    corrected_text: '',
    evidence_segment_indexes: [1],
    created_at: '',
    updated_at: '',
  },
];

describe('TranscriptTurnList', () => {
  test('一级页复用完整逐字稿阅读器而不是单段切换器', () => {
    const onOpenConversation = vi.fn();
    render(
      <TranscriptTurnList
        title="测试播客"
        turns={turns}
        speakers={speakers}
        onOpenConversation={onOpenConversation}
        onCorrect={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByTestId('transcript-virtual-scroll')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: '逐字稿阅读进度' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /嘉宾.*只看此人/ })).toBeTruthy();
    expect(screen.queryByText('上一段')).toBeNull();

    fireEvent.change(screen.getByLabelText('搜索逐字稿'), { target: { value: '完整回答' } });
    expect(screen.getByText(/找到 1 个匹配/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '打开全屏阅读' }));
    expect(onOpenConversation).toHaveBeenCalledTimes(1);
  });

  test('Bilibili 来源在底部嵌入播放器，并支持双击、键盘与显式按钮定位', () => {
    const onSeekToVideo = vi.fn();
    render(
      <TranscriptTurnList
        title="测试播客"
        turns={turns}
        speakers={speakers}
        onOpenConversation={vi.fn()}
        onCorrect={vi.fn().mockResolvedValue(undefined)}
        bilibiliVideo={{ idType: 'bvid', id: 'BV1B7411m7LV', page: 1, initialSeconds: 0 }}
        sourceUrl="https://www.bilibili.com/video/BV1B7411m7LV"
        videoSeekSeconds={12}
        videoSeekRequestId={1}
        onSeekToVideo={onSeekToVideo}
      />,
    );

    const secondTurn = screen.getByLabelText('发言 2，嘉宾，0:12 到 0:32');
    fireEvent.doubleClick(secondTurn);
    fireEvent.keyDown(secondTurn, { key: 'Enter' });
    fireEvent.click(within(secondTurn).getByRole('button', { name: '播放此处' }));

    expect(onSeekToVideo).toHaveBeenNthCalledWith(1, 12);
    expect(onSeekToVideo).toHaveBeenNthCalledWith(2, 12);
    expect(onSeekToVideo).toHaveBeenNthCalledWith(3, 12);
    const player = screen.getByTitle('Bilibili 原视频，当前定位 0:12');
    expect(player.getAttribute('src')).toContain('bvid=BV1B7411m7LV');
    expect(player.getAttribute('src')).toContain('t=12');
  });
});
