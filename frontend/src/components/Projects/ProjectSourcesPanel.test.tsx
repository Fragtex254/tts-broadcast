import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { ContentProject, ContentProjectSource, TranscriptClaim } from '../../store';
import { ProjectSourcesPanel } from './ProjectSourcesPanel';

const savedSource: ContentProjectSource = {
  id: 5,
  project_id: 2,
  project_source_id: 7,
  source_type: 'manual',
  title: '现场记录',
  content: '\n原样素材\n',
  url: '',
  external_ref: '',
  metadata: {},
  usage_note: '',
  sort_order: 0,
  linked_at: '2026-07-18T00:00:00.000Z',
  link_updated_at: '2026-07-18T00:00:00.000Z',
  created_at: '2026-07-18T00:00:00.000Z',
  updated_at: '2026-07-18T00:00:00.000Z',
};

const claim: TranscriptClaim = {
  id: 23, transcription_id: 9, speaker_key: 'speaker-0001', speaker_name: '嘉宾', question: 'AI 应该替人做判断吗？',
  claim: 'AI 应该压缩机械劳动，而不是替代人的判断', reasoning: '创作者要为最终取舍负责', evidence_excerpt: '真正稀缺的是人的取舍与责任。',
  evidence_start_index: 4, evidence_end_index: 6, start_seconds: 45, end_seconds: 72, topic_tags: ['创作'],
  content_value: 92, confidence: 0.9, user_note: '', is_starred: true, is_hidden: false, status: 'active', analysis_model: 'test', embedding: null,
  podcast_name: '创作者播客', episode_title: 'AI 与判断', source_url: 'https://example.com', published_at: '', created_at: '', updated_at: '',
};

const claimLinks: ContentProject['claims'] = [{
  id: 4,
  project_id: 2,
  claim_id: claim.id,
  sort_order: 0,
  usage_note: '作为核心论点',
  claim,
}];

describe('ProjectSourcesPanel', () => {
  test('手写来源只在显式保存时提交，并保留正文首尾换行', async () => {
    const onAdd = vi.fn().mockResolvedValue(savedSource);
    render(<ProjectSourcesPanel sources={[]} isSaving={false} saveError={null} onAdd={onAdd} />);

    fireEvent.change(screen.getByRole('textbox', { name: '来源标题' }), { target: { value: '  现场记录  ' } });
    fireEvent.change(screen.getByRole('textbox', { name: '来源内容' }), { target: { value: '\n原样素材\n' } });
    expect(onAdd).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '保存来源' }));

    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({
      sourceType: 'manual',
      title: '现场记录',
      content: '\n原样素材\n',
      url: '',
      usageNote: '',
    }));
  });

  test('把旧研究工作区加入的播客观点作为项目证据展示', () => {
    render(<ProjectSourcesPanel sources={[]} claims={claimLinks} isSaving={false} saveError={null} onAdd={vi.fn()} />);

    expect(screen.getByText('AI 应该压缩机械劳动，而不是替代人的判断')).not.toBeNull();
    expect(screen.getByText(/真正稀缺的是人的取舍与责任/)).not.toBeNull();
    expect(screen.getByText('用途：作为核心论点')).not.toBeNull();
  });

  test('保存来源期间锁定表单，避免成功响应清空继续输入的内容', () => {
    const { rerender } = render(
      <ProjectSourcesPanel sources={[]} isSaving={false} saveError={null} onAdd={vi.fn()} />
    );

    rerender(<ProjectSourcesPanel sources={[]} isSaving saveError={null} onAdd={vi.fn()} />);

    expect(screen.getByRole('textbox', { name: '来源标题' }).matches(':disabled')).toBe(true);
    expect(screen.getByRole('textbox', { name: '来源内容' }).matches(':disabled')).toBe(true);
    expect(screen.getByRole('textbox', { name: '原始链接（可选）' }).matches(':disabled')).toBe(true);
    expect(screen.getByRole('textbox', { name: '使用备注（可选）' }).matches(':disabled')).toBe(true);
  });

  test('提供带项目上下文的继续研究入口', () => {
    const onContinueResearch = vi.fn();
    render(
      <ProjectSourcesPanel
        sources={[]}
        isSaving={false}
        saveError={null}
        onAdd={vi.fn()}
        onContinueResearch={onContinueResearch}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '继续播客观点研究' }));
    expect(onContinueResearch).toHaveBeenCalledTimes(1);
  });
});
