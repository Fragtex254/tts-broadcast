import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { TranscriptClaim } from '../../store';
import { ClaimDetailModal } from './ClaimDetailModal';

const claim: TranscriptClaim = {
  id: 23, transcription_id: 9, speaker_key: 'speaker-0001', speaker_name: '嘉宾', question: 'Agent 下一步是什么？',
  claim: 'Agent 会从单体走向协作', reasoning: '复杂任务需要多个角色分工', evidence_excerpt: '下一步是 Agent 蜂群。',
  evidence_start_index: 4, evidence_end_index: 6, start_seconds: 45, end_seconds: 72, topic_tags: ['Agent', '协作'],
  content_value: 92, confidence: 0.9, user_note: '', is_starred: false, status: 'active', analysis_model: 'test', embedding: null,
  podcast_name: '研究播客', episode_title: 'Agent 未来', source_url: 'https://example.com', published_at: '', created_at: '', updated_at: '',
};

describe('ClaimDetailModal', () => {
  test('异步加载完成后显示服务器已有笔记，不会初始化为空', () => {
    const props = {
      isOpen: true,
      onClose: vi.fn(),
      onUpdate: vi.fn().mockResolvedValue(claim),
      onDelete: vi.fn().mockResolvedValue(undefined),
      onOpenEvidence: vi.fn().mockResolvedValue(undefined),
    };
    const { rerender } = render(<ClaimDetailModal {...props} claim={null} isLoading />);
    rerender(<ClaimDetailModal {...props} claim={{ ...claim, user_note: '服务器已有笔记' }} />);

    expect(screen.getByLabelText<HTMLTextAreaElement>('我的笔记').value).toBe('服务器已有笔记');
    expect(screen.getByRole('button', { name: '保存笔记' }).hasAttribute('disabled')).toBe(true);
  });

  test('集中展示推理、证据和笔记，并能进入逐字稿证据层', async () => {
    const onUpdate = vi.fn().mockResolvedValue({ ...claim, user_note: '值得继续验证' });
    const onOpenEvidence = vi.fn().mockResolvedValue(undefined);
    render(
      <ClaimDetailModal
        isOpen
        claim={claim}
        onClose={vi.fn()}
        onUpdate={onUpdate}
        onDelete={vi.fn().mockResolvedValue(undefined)}
        onOpenEvidence={onOpenEvidence}
      />,
    );

    expect(screen.getByText('复杂任务需要多个角色分工')).toBeTruthy();
    expect(screen.getByText(/下一步是 Agent 蜂群/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('我的笔记'), { target: { value: '值得继续验证' } });
    fireEvent.click(screen.getByRole('button', { name: '保存笔记' }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(claim.id, { userNote: '值得继续验证' }));

    fireEvent.click(screen.getByRole('button', { name: /打开对应逐字稿片段/ }));
    expect(onOpenEvidence).toHaveBeenCalledWith(claim);
  });

  test('删除需要二次确认', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<ClaimDetailModal isOpen claim={claim} onClose={onClose} onUpdate={vi.fn()} onDelete={onDelete} onOpenEvidence={vi.fn().mockResolvedValue(undefined)} />);

    fireEvent.click(screen.getByRole('button', { name: '删除观点' }));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(claim.id));
    expect(onClose).toHaveBeenCalled();
  });
});
