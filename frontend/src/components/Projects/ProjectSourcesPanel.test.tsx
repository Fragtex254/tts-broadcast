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
  content_sha256: 'sha',
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

    fireEvent.change(screen.getByRole('textbox', { name: '原文标题' }), { target: { value: '  现场记录  ' } });
    fireEvent.change(screen.getByRole('textbox', { name: '粘贴的原文内容' }), { target: { value: '\n原样素材\n' } });
    expect(onAdd).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '保存原文快照' }));

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

    expect(screen.getByRole('textbox', { name: '原文标题' }).matches(':disabled')).toBe(true);
    expect(screen.getByRole('textbox', { name: '粘贴的原文内容' }).matches(':disabled')).toBe(true);
    expect(screen.getByRole('textbox', { name: '用户提供的出处链接（可选，未抓取／未核验）' }).matches(':disabled')).toBe(true);
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

  test('来源表单草稿报告 dirty，且拒绝非 http/https URL', async () => {
    const onDirtyChange = vi.fn();
    const onAdd = vi.fn();
    render(
      <ProjectSourcesPanel
        sources={[]}
        isSaving={false}
        saveError={null}
        onAdd={onAdd}
        onDirtyChange={onDirtyChange}
      />
    );

    fireEvent.change(screen.getByRole('textbox', { name: '原文标题' }), { target: { value: '待保存材料' } });
    fireEvent.change(screen.getByRole('textbox', { name: '粘贴的原文内容' }), { target: { value: '原始材料' } });
    fireEvent.change(screen.getByRole('textbox', { name: '用户提供的出处链接（可选，未抓取／未核验）' }), { target: { value: 'javascript:alert(1)' } });
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));

    fireEvent.click(screen.getByRole('button', { name: '保存原文快照' }));
    expect(await screen.findByRole('alert')).not.toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('http:// 或 https://');
    expect(onAdd).not.toHaveBeenCalled();
  });

  test('长来源通过 ModalShell 查看全文，移出项目明确不删除原始素材', async () => {
    const source = { ...savedSource, content: '长原文'.repeat(200) };
    const onUnlink = vi.fn().mockResolvedValue(undefined);
    render(
      <ProjectSourcesPanel
        sources={[source]}
        isSaving={false}
        saveError={null}
        onAdd={vi.fn()}
        onUnlink={onUnlink}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '查看现场记录完整原文' }));
    expect(await screen.findByRole('dialog', { name: '现场记录' })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));

    fireEvent.click(screen.getByRole('button', { name: '将现场记录移出项目' }));
    expect(await screen.findByRole('dialog', { name: '移出项目来源' })).not.toBeNull();
    expect(screen.getByText(/不会删除原始素材/)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '移出项目，不删除原始素材' }));
    await waitFor(() => expect(onUnlink).toHaveBeenCalledWith(source.id));
  });

  test('播客观点明确区分 AI 提取说明与逐字稿原文摘录', () => {
    render(<ProjectSourcesPanel sources={[]} claims={claimLinks} isSaving={false} saveError={null} onAdd={vi.fn()} />);

    expect(screen.getByText('AI 提取的播客观点')).not.toBeNull();
    expect(screen.getByText('逐字稿原文摘录')).not.toBeNull();
  });

  test('旧 URL-only 来源明确提示未采集原文，且不提供虚假的全文入口', () => {
    render(
      <ProjectSourcesPanel
        sources={[{ ...savedSource, content: '', content_sha256: '' }]}
        isSaving={false}
        saveError={null}
        onAdd={vi.fn()}
      />
    );

    expect(screen.getByText(/仅保存用户提供的出处，未抓取、未核验原文/)).not.toBeNull();
    expect(screen.queryByRole('button', { name: '查看现场记录完整原文' })).toBeNull();
  });

  test('采集入口只邀请粘贴原文，并明确链接和材料都未经抓取核验', () => {
    render(<ProjectSourcesPanel sources={[{ ...savedSource, url: 'https://example.com' }]} isSaving={false} saveError={null} onAdd={vi.fn()} />);

    expect(screen.getByText('用户粘贴材料（未核验）')).not.toBeNull();
    expect(screen.getByText(/用户提供链接（未抓取／未核验）/)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '粘贴一份原文' }));
    expect(screen.getAllByText(/个人观察、经验与判断请写在 Brief/).length).toBeGreaterThan(0);
    expect(screen.getByRole('textbox', { name: '粘贴的原文内容' }).getAttribute('placeholder')).not.toContain('写下观察');
  });
});
