import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { ClaimSearchResult, TranscriptClaim } from '../../store';
import { ResearchCandidateShelf } from './ResearchCandidateShelf';

const claim: TranscriptClaim = {
  id: 23, transcription_id: 9, speaker_key: 'speaker-0001', speaker_name: '嘉宾', question: 'Agent 下一步是什么？',
  claim: 'Agent 会从单体走向协作', reasoning: '复杂任务需要多个角色分工', evidence_excerpt: '下一步是 Agent 蜂群。',
  evidence_start_index: 4, evidence_end_index: 6, start_seconds: 45, end_seconds: 72, topic_tags: ['Agent', '协作'],
  content_value: 92, confidence: 0.9, user_note: '', is_starred: false, status: 'active', analysis_model: 'test', embedding: null,
  podcast_name: '研究播客', episode_title: 'Agent 未来', source_url: '', published_at: '', created_at: '', updated_at: '',
};

const results: ClaimSearchResult[] = [{ claim, similarity: 0.86, search_mode: 'keyword' }];

describe('ResearchCandidateShelf', () => {
  test('观点在横向区域中可预览、勾选并直接加入当前项目', async () => {
    const onPreview = vi.fn();
    const onToggleSelection = vi.fn();
    const onAddToProject = vi.fn().mockResolvedValue(undefined);
    render(
      <ResearchCandidateShelf
        results={results}
        activeClaimId={null}
        selectedIds={new Set()}
        projectClaimIds={new Set()}
        hasProject
        onPreview={onPreview}
        onToggleSelection={onToggleSelection}
        onAddToProject={onAddToProject}
      />,
    );

    expect(screen.getByLabelText('候选观点横向列表').className).toContain('overflow-x-auto');
    fireEvent.click(screen.getByRole('button', { name: /预览观点/ }));
    expect(onPreview).toHaveBeenCalledWith(claim);

    fireEvent.click(screen.getByRole('checkbox', { name: /选择观点/ }));
    expect(onToggleSelection).toHaveBeenCalledWith(claim.id);

    fireEvent.click(screen.getByRole('button', { name: '加入项目' }));
    await waitFor(() => expect(onAddToProject).toHaveBeenCalledWith(claim.id));
  });

  test('没有项目时明确阻止加入候选观点', () => {
    render(
      <ResearchCandidateShelf
        results={results}
        activeClaimId={claim.id}
        selectedIds={new Set()}
        projectClaimIds={new Set()}
        hasProject={false}
        onPreview={vi.fn()}
        onToggleSelection={vi.fn()}
        onAddToProject={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '先选择项目' }).hasAttribute('disabled')).toBe(true);
  });
});
