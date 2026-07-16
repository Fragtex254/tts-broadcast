import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { TranscriptClaim } from '../../store';
import { CompactClaimCard } from './CompactClaimCard';

const claim: TranscriptClaim = {
  id: 23, transcription_id: 9, speaker_key: 'speaker-0001', speaker_name: '嘉宾', question: 'Agent 下一步是什么？',
  claim: 'Agent 会从单体走向协作', reasoning: '复杂任务需要多个角色分工', evidence_excerpt: '下一步是 Agent 蜂群。',
  evidence_start_index: 4, evidence_end_index: 6, start_seconds: 45, end_seconds: 72, topic_tags: ['Agent', '协作'],
  content_value: 92, confidence: 0.9, user_note: '', is_starred: false, status: 'active', analysis_model: 'test', embedding: null,
  podcast_name: '研究播客', episode_title: 'Agent 未来', source_url: '', published_at: '', created_at: '', updated_at: '',
};

describe('CompactClaimCard', () => {
  test('信息流只展示核心结论，不泄漏推理和证据正文', () => {
    const onOpen = vi.fn();
    render(<CompactClaimCard claim={claim} onOpen={onOpen} />);

    expect(screen.getByText('Agent 会从单体走向协作')).toBeTruthy();
    expect(screen.queryByText('复杂任务需要多个角色分工')).toBeNull();
    expect(screen.queryByText('下一步是 Agent 蜂群。')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /打开观点详情/ }));
    expect(onOpen).toHaveBeenCalledWith(claim);
  });

  test('研究选择框与打开详情是两个独立操作', () => {
    const onOpen = vi.fn();
    const onSelectionChange = vi.fn();
    render(<CompactClaimCard claim={claim} onOpen={onOpen} onSelectionChange={onSelectionChange} />);

    fireEvent.click(screen.getByRole('checkbox', { name: /选择观点/ }));
    expect(onSelectionChange).toHaveBeenCalledWith(claim.id);
    expect(onOpen).not.toHaveBeenCalled();
  });
});
