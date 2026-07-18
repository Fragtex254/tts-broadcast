import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { ContentArtifact, ContentArtifactRevision } from '../../store';
import { ProjectDraftEditor } from './ProjectDraftEditor';

const firstRevision: ContentArtifactRevision = {
  id: 1,
  artifact_id: 8,
  revision_number: 1,
  content: '第一版正文',
  change_reason: '建立初稿',
  created_at: '2026-07-18T00:00:00.000Z',
};

const currentRevision: ContentArtifactRevision = {
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
});
