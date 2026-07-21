import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import useStore, { type Broadcast, type ContentArtifactRevision, type ProjectEditorContext } from '../../store';
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

const broadcast: Broadcast = {
  id: 51,
  title: '编辑器草稿',
  content: revision.content,
  artifact_revision_id: null,
  source_artifact_revision_id: null,
  audio_path: null,
  duration: null,
  voice_type: null,
  voice_config: '{}',
  source_items: null,
  status: 'draft',
  saved: 0,
  mode: 'segmented',
  created_at: '2026-07-18T00:00:00.000Z',
  updated_at: '2026-07-18T00:00:00.000Z',
};

describe('ScriptPreview 项目口播模式', () => {
  beforeEach(() => {
    useStore.setState({
      script: revision.content,
      currentBroadcast: broadcast,
      segments: [],
      settings: {
        ...useStore.getState().settings,
        opening_script: '开场白',
        closing_script: '结束语',
      },
    });
  });

  test('人工保存先追加 Revision，再由页面创建新 URL 草稿', async () => {
    const savedRevision = { ...revision, id: 32, revision_number: 3, content: '\n新的口播稿\n' };
    const saveRevision = vi.fn().mockResolvedValue(savedRevision);
    const onRevisionSaved = vi.fn().mockResolvedValue(undefined);
    useStore.setState({ saveProjectArtifactRevision: saveRevision });

    render(<ScriptPreview projectContext={context} onProjectRevisionSaved={onRevisionSaved} />);
    fireEvent.click(screen.getByRole('button', { name: '编辑' }));
    fireEvent.change(screen.getByRole('textbox', { name: '口播稿正文' }), { target: { value: '\n新的口播稿\n' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(saveRevision).toHaveBeenCalledWith(2, 8, {
      content: '\n新的口播稿\n',
      changeReason: '人工编辑口播稿',
      parentRevisionId: 31,
    }));
    expect(onRevisionSaved).toHaveBeenCalledWith(savedRevision);
    expect(saveRevision.mock.invocationCallOrder[0]).toBeLessThan(onRevisionSaved.mock.invocationCallOrder[0]);
  });

  test('新 Revision 已落库但草稿创建失败时，重试不会重复新建 Revision', async () => {
    const savedRevision = { ...revision, id: 35, revision_number: 3, content: '已落库但尚未跳转' };
    const saveRevision = vi.fn().mockResolvedValue(savedRevision);
    const onRevisionSaved = vi.fn()
      .mockRejectedValueOnce(new Error('草稿创建失败'))
      .mockResolvedValueOnce(undefined);
    useStore.setState({ saveProjectArtifactRevision: saveRevision });

    render(<ScriptPreview projectContext={context} onProjectRevisionSaved={onRevisionSaved} />);
    fireEvent.click(screen.getByRole('button', { name: '编辑' }));
    fireEvent.change(screen.getByRole('textbox', { name: '口播稿正文' }), {
      target: { value: savedRevision.content },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await screen.findByText('草稿创建失败');
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(onRevisionSaved).toHaveBeenCalledTimes(2));
    expect(onRevisionSaved).toHaveBeenNthCalledWith(1, savedRevision);
    expect(onRevisionSaved).toHaveBeenNthCalledWith(2, savedRevision);
    expect(saveRevision).toHaveBeenCalledTimes(1);
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
    const onRevisionSaved = vi.fn().mockResolvedValue(undefined);
    useStore.setState({ saveProjectArtifactRevision: saveRevision });

    render(<ScriptPreview projectContext={context} onProjectRevisionSaved={onRevisionSaved} />);
    fireEvent.click(screen.getByRole('button', { name: buttonName }));

    await waitFor(() => expect(saveRevision).toHaveBeenCalledWith(2, 8, { content: expectedContent, changeReason, parentRevisionId: 31 }));
    expect(onRevisionSaved).toHaveBeenCalledWith(savedRevision);
  });

  test('无项目上下文时把修改保存到 URL 对应的持久化草稿', async () => {
    const saveRevision = vi.fn();
    const updated = { ...broadcast, content: '可刷新恢复的草稿' };
    const updateEditorDraft = vi.fn(async () => {
      useStore.setState({ currentBroadcast: updated, script: updated.content });
      return updated;
    });
    useStore.setState({ saveProjectArtifactRevision: saveRevision, updateEditorDraft });

    render(<ScriptPreview />);
    fireEvent.click(screen.getByRole('button', { name: '编辑' }));
    fireEvent.change(screen.getByRole('textbox', { name: '口播稿正文' }), { target: { value: '可刷新恢复的草稿' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(updateEditorDraft).toHaveBeenCalledWith(51, '可刷新恢复的草稿'));
    expect(saveRevision).not.toHaveBeenCalled();
  });

  test('已切分副本隐藏整稿修改动作，引导到分段编辑器', () => {
    useStore.setState({
      currentBroadcast: { ...broadcast, status: 'pending' },
      segments: [{
        id: 1,
        broadcast_id: broadcast.id,
        index: 0,
        text: '精修后分段',
        audio_path: null,
        status: 'pending',
        style_tag: '克制',
        playback_rate: 1.25,
        error_message: '',
        created_at: '2026-07-18T00:00:00.000Z',
        updated_at: '2026-07-18T00:00:00.000Z',
      }],
    });

    render(<ScriptPreview />);

    expect(screen.getByText(/稿件已切分，请在下方分段编辑器中修改/)).not.toBeNull();
    expect(screen.queryByRole('button', { name: '编辑' })).toBeNull();
    expect(screen.queryByRole('button', { name: '+ 添加开场白' })).toBeNull();
    expect(screen.queryByRole('button', { name: '✦ 切分口播稿' })).toBeNull();
  });
});
