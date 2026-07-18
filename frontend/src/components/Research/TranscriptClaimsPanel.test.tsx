import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { TranscriptClaim, TranscriptSpeaker, TranscriptSummaryProgress } from '../../store';
import { TranscriptClaimsPanel } from './TranscriptClaimsPanel';
import { sortTranscriptClaims } from './transcriptClaimsModel';

const speaker: TranscriptSpeaker = {
  id: 1,
  transcription_id: 9,
  speaker_key: 'speaker-0001',
  display_name: '嘉宾',
  sort_order: 0,
  speaker_scope: 'global',
  created_at: '',
  updated_at: '',
};

const createClaim = (id: number, overrides: Partial<TranscriptClaim> = {}): TranscriptClaim => ({
  id,
  transcription_id: 9,
  speaker_key: 'speaker-0001',
  speaker_name: '嘉宾',
  question: `问题 ${id}`,
  claim: `观点 ${id}`,
  reasoning: '',
  evidence_excerpt: '',
  evidence_start_index: id,
  evidence_end_index: id,
  start_seconds: id * 10,
  end_seconds: id * 10 + 5,
  topic_tags: ['AI'],
  content_value: 50 + id,
  confidence: 0.9,
  user_note: '',
  is_starred: false,
  is_hidden: false,
  status: 'active',
  analysis_model: 'test',
  embedding: null,
  podcast_name: '研究播客',
  episode_title: '测试节目',
  source_url: '',
  published_at: '',
  created_at: '',
  updated_at: '',
  ...overrides,
});

const progress: TranscriptSummaryProgress = {
  phase: 'idle',
  percent: 0,
  current: 0,
  total: 0,
  message: '',
};

describe('TranscriptClaimsPanel', () => {
  test('收藏观点始终排在主要观点前面', () => {
    const regular = createClaim(1, { content_value: 99 });
    const starred = createClaim(2, { content_value: 30, is_starred: true });

    expect(sortTranscriptClaims([regular, starred], 'value').map((claim) => claim.id)).toEqual([2, 1]);
  });

  test('隐藏观点退出一级卡片区并可从折叠区域恢复', async () => {
    const visible = createClaim(1);
    const hidden = createClaim(2, { is_hidden: true });
    const onUpdateClaim = vi.fn().mockResolvedValue({ ...hidden, is_hidden: false });

    render(
      <TranscriptClaimsPanel
        claims={[visible, hidden]}
        speakers={[speaker]}
        isAnalyzing={false}
        progress={progress}
        claimsStatus="completed"
        claimsError=""
        onAnalyze={vi.fn()}
        onOpenClaim={vi.fn()}
        onUpdateClaim={onUpdateClaim}
      />,
    );

    expect(screen.getByText('已隐藏 1 条观点')).toBeTruthy();
    fireEvent.click(screen.getByText('已隐藏 1 条观点'));
    fireEvent.click(screen.getByRole('button', { name: '恢复到主要观点' }));
    await waitFor(() => expect(onUpdateClaim).toHaveBeenCalledWith(hidden.id, { isHidden: false }));
  });

  test('观点以无需悬停的网格呈现并直接展示推理', () => {
    render(
      <TranscriptClaimsPanel
        claims={[
          createClaim(1, { reasoning: '第一条观点的推理过程需要在卡片上直接展示。' }),
          createClaim(2),
          createClaim(3),
        ]}
        speakers={[speaker]}
        isAnalyzing={false}
        progress={progress}
        claimsStatus="completed"
        claimsError=""
        onAnalyze={vi.fn()}
        onOpenClaim={vi.fn()}
        onUpdateClaim={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('观点卡片列表')).toBeTruthy();
    expect(screen.getByText('第一条观点的推理过程需要在卡片上直接展示。')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /打开观点详情/ })).toHaveLength(3);
  });
});
