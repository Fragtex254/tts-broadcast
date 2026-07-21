import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { ProjectOutputGuide } from './ProjectOutputGuide';

describe('ProjectOutputGuide', () => {
  test('文字成稿是一等输出，音频明确为可选派生', () => {
    render(
      <ProjectOutputGuide
        hasMasterRevision
        isMasterConfirmed
        masterRevisionNumber={3}
        targetPlatform="wechat"
        contentFormat="深度文章"
        hasAudioScriptRevision={false}
        isAudioScriptDifferentFromMaster={false}
        hasUnsavedChanges={false}
        isPreparing={false}
        error={null}
        onContinue={vi.fn()}
        onSyncMaster={vi.fn()}
      />
    );

    expect(screen.getByText('文字成稿')).not.toBeNull();
    expect(screen.getByText(/公众号 · 深度文章/)).not.toBeNull();
    expect(screen.getByText('音频口播（可选）')).not.toBeNull();
  });

  test('存在未保存修改时阻止旧主稿进入口播输出', () => {
    render(
      <ProjectOutputGuide
        hasMasterRevision
        isMasterConfirmed
        masterRevisionNumber={3}
        targetPlatform="general"
        contentFormat=""
        hasAudioScriptRevision={false}
        isAudioScriptDifferentFromMaster={false}
        hasUnsavedChanges
        isPreparing={false}
        error={null}
        onContinue={vi.fn()}
        onSyncMaster={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: '准备口播版本' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('先保存上方修改，再准备输出。')).not.toBeNull();
  });

  test('复制文字成稿时保留主稿原文的首尾空白', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    render(
      <ProjectOutputGuide
        hasMasterRevision
        isMasterConfirmed
        masterRevisionNumber={1}
        masterContent={'\n原样主稿\n'}
        targetPlatform="general"
        contentFormat="文章"
        hasAudioScriptRevision={false}
        isAudioScriptDifferentFromMaster={false}
        hasUnsavedChanges={false}
        isPreparing={false}
        error={null}
        onContinue={vi.fn()}
        onSyncMaster={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '复制主稿' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('\n原样主稿\n'));
    expect(screen.getByRole('status').textContent).toContain('主稿已复制');
  });

  test('复制对外稿时隐藏内部证据 ID，并附可读参考依据', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(
      <ProjectOutputGuide
        hasMasterRevision
        isMasterConfirmed
        masterRevisionNumber={2}
        masterContent="正文 [证据#5]"
        masterCitations={[{
          id: 1, revision_id: 2, evidence_id: 5, marker: '[证据#5]', excerpt: '原文摘录', source_id: 3,
          source_title: '访谈材料', source_content_sha256: 'sha', start_fragment_index: 0, end_fragment_index: 0,
          start_offset: 0, end_offset: 4, evidence_decision_state: 'selected', evidence_lifecycle_status: 'active',
          source_linked: true, reuse_eligible: true, is_stale: false,
        }]}
        targetPlatform="general"
        contentFormat="文章"
        hasAudioScriptRevision={false}
        isAudioScriptDifferentFromMaster={false}
        hasUnsavedChanges={false}
        isPreparing={false}
        error={null}
        onContinue={vi.fn()}
        onSyncMaster={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '复制主稿' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('正文 [引用 1]')));
    expect(writeText.mock.calls[0][0]).toContain('## 参考依据');
    expect(writeText.mock.calls[0][0]).not.toContain('[证据#5]');
  });

  test('内部证据标记缺少引用快照时阻止伪装成发布版', () => {
    render(
      <ProjectOutputGuide
        hasMasterRevision
        isMasterConfirmed
        masterRevisionNumber={2}
        masterContent="正文 [证据#5]"
        masterCitations={[]}
        targetPlatform="general"
        contentFormat="文章"
        hasAudioScriptRevision={false}
        isAudioScriptDifferentFromMaster={false}
        hasUnsavedChanges={false}
        isPreparing={false}
        error={null}
        onContinue={vi.fn()}
        onSyncMaster={vi.fn()}
      />
    );

    expect(screen.getByText(/引用快照不完整/)).not.toBeNull();
    expect(screen.getByRole('button', { name: '复制主稿' }).matches(':disabled')).toBe(true);
  });

  test('AI 主稿必须先显式保存为人工版本，才能复制、下载或准备口播', () => {
    render(
      <ProjectOutputGuide
        hasMasterRevision
        isMasterConfirmed={false}
        masterRevisionNumber={4}
        masterContent="AI 草案"
        targetPlatform="general"
        contentFormat="文章"
        hasAudioScriptRevision={false}
        isAudioScriptDifferentFromMaster={false}
        hasUnsavedChanges={false}
        isPreparing={false}
        error={null}
        onContinue={vi.fn()}
        onSyncMaster={vi.fn()}
      />
    );

    expect(screen.getByText(/AI 草案尚未由你确认/)).not.toBeNull();
    expect(screen.getByRole('button', { name: '复制主稿' }).matches(':disabled')).toBe(true);
    expect(screen.getByRole('button', { name: '下载 Markdown' }).matches(':disabled')).toBe(true);
    expect(screen.getByRole('button', { name: '准备口播版本' }).matches(':disabled')).toBe(true);
  });
});
