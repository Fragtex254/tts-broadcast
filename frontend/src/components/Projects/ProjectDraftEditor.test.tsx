import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { ContentArtifact, ContentArtifactRevision, ContentEvidence } from '../../store';
import { CONTENT_REVISION_DEFAULTS } from '../../test/contentProjectFixtures';
import { ProjectDraftEditor } from './ProjectDraftEditor';

const firstRevision: ContentArtifactRevision = {
  ...CONTENT_REVISION_DEFAULTS,
  id: 1,
  artifact_id: 8,
  revision_number: 1,
  content: '第一版正文',
  change_reason: '建立初稿',
  created_at: '2026-07-18T00:00:00.000Z',
};

const currentRevision: ContentArtifactRevision = {
  ...CONTENT_REVISION_DEFAULTS,
  id: 2,
  artifact_id: 8,
  revision_number: 2,
  content: '第二版正文',
  change_reason: '补充证据',
  created_at: '2026-07-18T00:10:00.000Z',
};

const artifact: ContentArtifact = {
  id: 8,
  project_id: 3,
  kind: 'master',
  title: '主稿',
  platform: 'general',
  status: 'draft',
  current_revision: currentRevision,
  created_at: '2026-07-18T00:00:00.000Z',
  updated_at: '2026-07-18T00:10:00.000Z',
};

const reusableEvidence: ContentEvidence = {
  id: 5, project_id: 3, source_id: 7, source_title: '原始访谈', origin: 'user', state: 'selected', decision_state: 'selected',
  lifecycle_status: 'active', source_linked: true, source_snapshot_intact: true, reuse_eligible: true, unavailable_reason: '',
  start_fragment_index: 0, end_fragment_index: 0, start_offset: 0, end_offset: 4, excerpt: '可回查原文', source_content_sha256: 'sha',
  ai_note: '', user_note: '支撑开场', supersedes_id: null, generation_job_id: null, sort_order: 0, created_at: '', updated_at: '',
};

describe('ProjectDraftEditor', () => {
  test('旧版本可以查看并只载入本地编辑区', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onLoadRevisions = vi.fn().mockResolvedValue(undefined);
    render(
      <ProjectDraftEditor
        artifact={artifact}
        revisions={[currentRevision, firstRevision]}
        isSaving={false}
        saveError={null}
        isLoadingRevisions={false}
        revisionsError={null}
        onSave={onSave}
        onLoadRevisions={onLoadRevisions}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '查看版本记录' }));
    await waitFor(() => expect(onLoadRevisions).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getAllByRole('button', { name: '查看内容' })[1]);
    expect(screen.getByText('第一版正文')).not.toBeNull();

    fireEvent.click(screen.getAllByRole('button', { name: '载入到编辑区' })[1]);
    expect(screen.getByDisplayValue('第一版正文')).not.toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });

  test('只在点击保存时提交，并原样保留正文首尾空白', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <ProjectDraftEditor
        artifact={artifact}
        revisions={[]}
        isSaving={false}
        saveError={null}
        isLoadingRevisions={false}
        revisionsError={null}
        onSave={onSave}
        onLoadRevisions={vi.fn().mockResolvedValue(undefined)}
      />
    );

    fireEvent.change(screen.getByRole('textbox', { name: '主稿正文' }), { target: { value: '\n保留首尾换行\n' } });
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '保存为新版本' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({
      title: '主稿',
      content: '\n保留首尾换行\n',
      changeReason: '',
      parentRevisionId: 2,
    }));
  });

  test('保存进行中锁定编辑区，避免响应覆盖用户继续输入的文字', () => {
    const { rerender } = render(
      <ProjectDraftEditor
        artifact={artifact}
        revisions={[]}
        isSaving={false}
        saveError={null}
        isLoadingRevisions={false}
        revisionsError={null}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onLoadRevisions={vi.fn().mockResolvedValue(undefined)}
      />
    );

    rerender(
      <ProjectDraftEditor
        artifact={artifact}
        revisions={[]}
        isSaving
        saveError={null}
        isLoadingRevisions={false}
        revisionsError={null}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onLoadRevisions={vi.fn().mockResolvedValue(undefined)}
      />
    );

    expect(screen.getByRole('textbox', { name: '主稿正文' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('textbox', { name: '本次修改说明（可选）' }).hasAttribute('disabled')).toBe(true);
  });

  test('正文变化时向工作区报告未保存状态', async () => {
    const onDirtyChange = vi.fn();
    render(
      <ProjectDraftEditor
        artifact={artifact}
        revisions={[]}
        isSaving={false}
        saveError={null}
        isLoadingRevisions={false}
        revisionsError={null}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onLoadRevisions={vi.fn().mockResolvedValue(undefined)}
        onDirtyChange={onDirtyChange}
      />
    );

    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
    fireEvent.change(screen.getByRole('textbox', { name: '主稿正文' }), { target: { value: '尚未保存的新内容' } });
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
  });

  test('只填写修改说明也报告未保存状态，空白说明按保存归一化处理', async () => {
    const onDirtyChange = vi.fn();
    render(
      <ProjectDraftEditor
        artifact={artifact}
        revisions={[]}
        isSaving={false}
        saveError={null}
        isLoadingRevisions={false}
        revisionsError={null}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onLoadRevisions={vi.fn().mockResolvedValue(undefined)}
        onDirtyChange={onDirtyChange}
      />
    );

    fireEvent.change(screen.getByRole('textbox', { name: '本次修改说明（可选）' }), { target: { value: '   ' } });
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
    fireEvent.change(screen.getByRole('textbox', { name: '本次修改说明（可选）' }), { target: { value: '补充反例' } });
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
  });

  test('载入正文相同的历史版本仍因父 Revision 改变而保持未保存状态', async () => {
    const onDirtyChange = vi.fn();
    const sameContentHistoricalRevision = { ...firstRevision, content: currentRevision.content };
    render(
      <ProjectDraftEditor
        artifact={artifact}
        revisions={[currentRevision, sameContentHistoricalRevision]}
        isSaving={false}
        saveError={null}
        isLoadingRevisions={false}
        revisionsError={null}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onLoadRevisions={vi.fn().mockResolvedValue(undefined)}
        onDirtyChange={onDirtyChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '查看版本记录' }));
    fireEvent.click(screen.getAllByRole('button', { name: '载入到编辑区' })[1]);
    fireEvent.change(screen.getByRole('textbox', { name: '本次修改说明（可选）' }), { target: { value: '' } });

    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
    expect(screen.getByText('有未保存修改')).not.toBeNull();
  });

  test('手工主稿可在光标处插入合法证据标记，无需猜测 ID', () => {
    render(
      <ProjectDraftEditor
        artifact={artifact}
        revisions={[]}
        evidence={[reusableEvidence]}
        isSaving={false}
        saveError={null}
        isLoadingRevisions={false}
        revisionsError={null}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onLoadRevisions={vi.fn().mockResolvedValue(undefined)}
      />
    );
    const editor = screen.getByRole('textbox', { name: '主稿正文' }) as HTMLTextAreaElement;
    editor.setSelectionRange(4, 4);
    fireEvent.click(screen.getByRole('button', { name: '在主稿中插入证据 #5 引用' }));

    expect(editor.value).toBe('第二版正[证据#5]文');
    expect(screen.getByText('可回查原文')).not.toBeNull();
  });

  test('AI 生成的当前主稿明确要求显式保存为人工版本', () => {
    const aiRevision: ContentArtifactRevision = {
      ...currentRevision,
      generation_job_id: 91,
      change_reason: 'ai_generated',
      provenance: { ...currentRevision.provenance, origin: 'ai', operation: 'generate_master' },
    };
    render(
      <ProjectDraftEditor
        artifact={{ ...artifact, current_revision: aiRevision }}
        revisions={[]}
        isSaving={false}
        saveError={null}
        isLoadingRevisions={false}
        revisionsError={null}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onLoadRevisions={vi.fn().mockResolvedValue(undefined)}
      />
    );

    expect(screen.getByText(/AI 草案待确认/)).not.toBeNull();
    expect(screen.getByRole('button', { name: '确认并保存为人工版本' })).not.toBeNull();
  });

  test('生成主稿期间锁定目标编辑区，避免任务完成覆盖本地输入', () => {
    render(
      <ProjectDraftEditor
        artifact={artifact}
        revisions={[]}
        isSaving={false}
        isGenerationActive
        saveError={null}
        isLoadingRevisions={false}
        revisionsError={null}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onLoadRevisions={vi.fn().mockResolvedValue(undefined)}
      />
    );

    expect(screen.getByRole('textbox', { name: '主稿正文' }).matches(':disabled')).toBe(true);
    expect(screen.getByText(/主稿生成期间已锁定编辑区/)).not.toBeNull();
  });

  test('历史版本可用同一核验面板查看自己的引用和 provenance', async () => {
    const historicalRevision: ContentArtifactRevision = {
      ...firstRevision,
      content: '历史正文 [证据#5]',
      generation_job_id: 77,
      provenance: {
        ...firstRevision.provenance,
        origin: 'ai',
        operation: 'generate_master',
        model: '历史模型',
        blocks: [{ basis: 'evidence', text: '历史摘录', evidence_ids: [5] }],
        evidence_ids: [5],
      },
      citations: [{
        id: 101,
        revision_id: firstRevision.id,
        evidence_id: 5,
        marker: '[证据#5]',
        excerpt: '历史摘录',
        source_id: 7,
        source_title: '历史来源',
        source_content_sha256: 'sha',
        start_fragment_index: 0,
        end_fragment_index: 0,
        start_offset: 0,
        end_offset: 4,
        evidence_decision_state: 'selected',
        evidence_lifecycle_status: 'active',
        source_linked: true,
        reuse_eligible: true,
        is_stale: false,
      }],
      citation_status: 'valid',
    };
    render(
      <ProjectDraftEditor
        artifact={artifact}
        revisions={[currentRevision, historicalRevision]}
        isSaving={false}
        saveError={null}
        isLoadingRevisions={false}
        revisionsError={null}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onLoadRevisions={vi.fn().mockResolvedValue(undefined)}
        onFetchFragments={vi.fn().mockResolvedValue([])}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '查看版本记录' }));
    fireEvent.click(await screen.findByRole('button', { name: '核验第 1 版依据' }));

    expect(screen.getByRole('heading', { name: '历史主稿的依据' })).not.toBeNull();
    expect(screen.getAllByText('历史摘录').length).toBeGreaterThan(0);
    expect(screen.getByText(/历史模型/)).not.toBeNull();
  });
});
