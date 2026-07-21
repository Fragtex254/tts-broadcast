import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import useStore, { type ContentArtifactRevision, type ProjectEditorContext } from '../../store';
import { CONTENT_REVISION_DEFAULTS } from '../../test/contentProjectFixtures';
import { ScriptPreview } from './ScriptPreview';

const revision: ContentArtifactRevision = {
  ...CONTENT_REVISION_DEFAULTS,
  id: 31,
  artifact_id: 8,
  revision_number: 2,
  content: '已持久化口播稿',
  change_reason: '准备口播',
  created_at: '2026-07-18T00:00:00.000Z',
};

const context: ProjectEditorContext = {
  projectId: 2,
  artifactId: 8,
  revision,
};

describe('ScriptPreview 项目口播模式', () => {
  beforeEach(() => {
    useStore.setState({
      script: revision.content,
      currentBroadcast: null,
      segments: [],
      settings: {
        ...useStore.getState().settings,
        opening_script: '开场白',
        closing_script: '结束语',
      },
    });
  });

  test('人工保存先追加 Revision，再更新全局稿件和 URL 上下文', async () => {
    const savedRevision = { ...revision, id: 32, revision_number: 3, content: '\n新的口播稿\n' };
    const saveRevision = vi.fn().mockResolvedValue(savedRevision);
    const updateScript = vi.fn((content: string) => useStore.setState({ script: content }));
    const onRevisionSaved = vi.fn();
    useStore.setState({ saveProjectArtifactRevision: saveRevision, updateScript });

    render(<ScriptPreview projectContext={context} onProjectRevisionSaved={onRevisionSaved} />);
    fireEvent.click(screen.getByRole('button', { name: '编辑' }));
    fireEvent.change(screen.getByRole('textbox', { name: '口播稿正文' }), { target: { value: '\n新的口播稿\n' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(saveRevision).toHaveBeenCalledWith(2, 8, {
      content: '\n新的口播稿\n',
      changeReason: '人工编辑口播稿',
      parentRevisionId: 31,
    }));
    expect(updateScript).toHaveBeenCalledWith('\n新的口播稿\n');
    expect(onRevisionSaved).toHaveBeenCalledWith(savedRevision);
    expect(saveRevision.mock.invocationCallOrder[0]).toBeLessThan(updateScript.mock.invocationCallOrder[0]);
  });

  test('项目口播稿保存进行中锁定正文，避免吞掉请求期间的继续输入', async () => {
    let resolveSave: ((value: ContentArtifactRevision) => void) | undefined;
    const saveRevision = vi.fn(() => new Promise<ContentArtifactRevision>((resolve) => { resolveSave = resolve; }));
    useStore.setState({ saveProjectArtifactRevision: saveRevision });

    render(<ScriptPreview projectContext={context} onProjectRevisionSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '编辑' }));
    fireEvent.change(screen.getByRole('textbox', { name: '口播稿正文' }), { target: { value: '等待保存的口播稿' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(screen.getByRole('textbox', { name: '口播稿正文' }).hasAttribute('disabled')).toBe(true));
    resolveSave?.({ ...revision, id: 34, revision_number: 3, content: '等待保存的口播稿' });
  });

  test.each([
    ['+ 添加开场白', '开场白\n\n已持久化口播稿', '添加口播开场白'],
    ['+ 添加结束语', '已持久化口播稿\n\n结束语', '添加口播结束语'],
  ])('%s 也先持久化为新版本', async (buttonName, expectedContent, changeReason) => {
    const savedRevision = { ...revision, id: 33, revision_number: 3, content: expectedContent };
    const saveRevision = vi.fn().mockResolvedValue(savedRevision);
    const updateScript = vi.fn((content: string) => useStore.setState({ script: content }));
    useStore.setState({ saveProjectArtifactRevision: saveRevision, updateScript });

    render(<ScriptPreview projectContext={context} onProjectRevisionSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: buttonName }));

    await waitFor(() => expect(saveRevision).toHaveBeenCalledWith(2, 8, { content: expectedContent, changeReason, parentRevisionId: 31 }));
    expect(updateScript).toHaveBeenCalledWith(expectedContent);
  });

  test('无项目上下文时保持原有内存保存行为', () => {
    const saveRevision = vi.fn();
    const updateScript = vi.fn((content: string) => useStore.setState({ script: content }));
    useStore.setState({ saveProjectArtifactRevision: saveRevision, updateScript });

    render(<ScriptPreview />);
    fireEvent.click(screen.getByRole('button', { name: '编辑' }));
    fireEvent.change(screen.getByRole('textbox', { name: '口播稿正文' }), { target: { value: '旧流程内存稿' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(saveRevision).not.toHaveBeenCalled();
    expect(updateScript).toHaveBeenCalledWith('旧流程内存稿');
  });
});
