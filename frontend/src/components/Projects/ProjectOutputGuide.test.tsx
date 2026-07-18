import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { ProjectOutputGuide } from './ProjectOutputGuide';

describe('ProjectOutputGuide', () => {
  test('文字成稿是一等输出，音频明确为可选派生', () => {
    render(
      <ProjectOutputGuide
        hasMasterRevision
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
});
