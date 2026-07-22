import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import useStore, { type Broadcast, type ContentArtifactRevision, type ProjectEditorContext } from '../store';
import { CONTENT_REVISION_DEFAULTS } from '../test/contentProjectFixtures';
import { ScriptEditor } from './ScriptEditor';

const revision: ContentArtifactRevision = {
  ...CONTENT_REVISION_DEFAULTS,
  id: 21,
  artifact_id: 8,
  revision_number: 2,
  content: '项目口播正文',
  change_reason: '准备口播',
  created_at: '2026-07-18T00:00:00.000Z',
};
const projectContext: ProjectEditorContext = { projectId: 2, artifactId: 8, revision };
const broadcast: Broadcast = {
  id: 51,
  title: '项目口播',
  content: revision.content,
  artifact_revision_id: revision.id,
  source_artifact_revision_id: revision.id,
  audio_path: null,
  duration: null,
  voice_type: 'preset',
  voice_config: '{"voice":"冰糖"}',
  source_items: null,
  status: 'draft',
  saved: 0,
  mode: 'segmented',
  created_at: '2026-07-18T00:00:00.000Z',
  updated_at: '2026-07-18T00:00:00.000Z',
};

const TestRouteControls = () => {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate('/editor/62')}>打开播报 62</button>;
};

function renderEditor(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TestRouteControls />
      <Routes>
        <Route path="/editor/:broadcastId" element={<ScriptEditor />} />
        <Route path="/editor" element={<ScriptEditor />} />
        <Route path="/" element={<div>工作台落点</div>} />
        <Route path="/history" element={<div>内容库落点</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ScriptEditor URL 上下文', () => {
  beforeEach(() => {
    useStore.setState({
      script: '',
      currentBroadcast: null,
      segments: [],
      projectEditorContext: null,
      isLoadingEditorBroadcast: false,
      editorBroadcastError: null,
      voiceConfig: {
        ...useStore.getState().voiceConfig,
        voiceType: 'preset',
        voice: '冰糖',
      },
      cancelEditorBroadcastLoad: vi.fn(),
      clearEditorBroadcast: vi.fn(() => {
        useStore.setState({ currentBroadcast: null, script: '', segments: [], projectEditorContext: null });
      }),
    });
  });

  test('空 store 刷新 /editor/:id 时按 URL 加载完整 Broadcast 上下文', async () => {
    const loadEditorBroadcast = vi.fn(async (id: number) => {
      useStore.setState({ isLoadingEditorBroadcast: true });
      await Promise.resolve();
      useStore.setState({
        currentBroadcast: { ...broadcast, id },
        script: revision.content,
        projectEditorContext: projectContext,
        isLoadingEditorBroadcast: false,
      });
      return { ...broadcast, id };
    });
    useStore.setState({ loadEditorBroadcast });

    renderEditor('/editor/51');

    expect(screen.getByLabelText('正在加载口播稿')).not.toBeNull();
    await waitFor(() => expect(screen.getByText('项目口播正文')).not.toBeNull());
    expect(loadEditorBroadcast).toHaveBeenCalledWith(51);
    expect(screen.getByText('内容项目口播稿 · 第 2 版')).not.toBeNull();
  });

  test('同 ID 的旧 Zustand 快照也不作为路由交接，GET 完成前只显示加载态', async () => {
    let resolveLoad!: () => void;
    const loadEditorBroadcast = vi.fn(async () => {
      useStore.setState({ isLoadingEditorBroadcast: true });
      await new Promise<void>((resolve) => { resolveLoad = resolve; });
      useStore.setState({
        currentBroadcast: broadcast,
        script: revision.content,
        projectEditorContext: projectContext,
        isLoadingEditorBroadcast: false,
      });
      return broadcast;
    });
    useStore.setState({
      currentBroadcast: { ...broadcast, title: '旧内存标题', content: '旧内存正文' },
      script: '旧内存正文',
      projectEditorContext: projectContext,
      loadEditorBroadcast,
    });

    renderEditor('/editor/51');

    expect(screen.getByLabelText('正在加载口播稿')).not.toBeNull();
    expect(screen.queryByText('旧内存正文')).toBeNull();
    resolveLoad();
    await waitFor(() => expect(screen.getByText('项目口播正文')).not.toBeNull());
  });

  test.each(['/editor/nope', '/editor/0', '/editor/9007199254740992'])(
    '无效地址 %s 不发请求并显示返回入口',
    (path) => {
      const loadEditorBroadcast = vi.fn();
      useStore.setState({ loadEditorBroadcast });

      renderEditor(path);

      expect(screen.getByRole('alert').textContent).toContain('口播稿地址无效');
      expect(loadEditorBroadcast).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: '返回工作台' }));
      expect(screen.getByText('工作台落点')).not.toBeNull();
    }
  );

  test('缺少 ID 的旧地址明确拒绝内存交接', () => {
    const loadEditorBroadcast = vi.fn();
    useStore.setState({
      loadEditorBroadcast,
      script: '不应展示的旧内存稿',
      currentBroadcast: broadcast,
    });

    renderEditor('/editor');

    expect(screen.getByRole('alert').textContent).toContain('地址缺少播报 ID');
    expect(screen.queryByText('不应展示的旧内存稿')).toBeNull();
    expect(loadEditorBroadcast).not.toHaveBeenCalled();
  });

  test('资源不存在时显示明确错误、重试和内容库入口', async () => {
    const loadEditorBroadcast = vi.fn(async () => {
      useStore.setState({
        currentBroadcast: null,
        isLoadingEditorBroadcast: false,
        editorBroadcastError: '播报记录不存在',
      });
      throw new Error('not found');
    });
    useStore.setState({ loadEditorBroadcast });

    renderEditor('/editor/404');

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('播报记录不存在'));
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
    await waitFor(() => expect(loadEditorBroadcast).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: '返回内容库' }));
    expect(screen.getByText('内容库落点')).not.toBeNull();
  });

  test('旧 ID 重试迟到不会覆盖新 ID 的路由就绪标记', async () => {
    let resolveRetry!: () => void;
    let oldCalls = 0;
    const loadEditorBroadcast = vi.fn(async (id: number) => {
      if (id === 61) {
        oldCalls += 1;
        if (oldCalls === 1) {
          useStore.setState({ currentBroadcast: null, editorBroadcastError: '旧地址加载失败' });
          throw new Error('旧地址加载失败');
        }
        await new Promise<void>((resolve) => { resolveRetry = resolve; });
        return { ...broadcast, id: 61 };
      }
      const next = { ...broadcast, id, title: '新播报', content: '新 ID 正文' };
      useStore.setState({
        currentBroadcast: next,
        script: next.content,
        projectEditorContext: null,
        editorBroadcastError: null,
        isLoadingEditorBroadcast: false,
      });
      return next;
    });
    useStore.setState({ loadEditorBroadcast });

    renderEditor('/editor/61');
    await screen.findByText('旧地址加载失败');
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
    await waitFor(() => expect(oldCalls).toBe(2));
    fireEvent.click(screen.getByRole('button', { name: '打开播报 62' }));
    await screen.findByText('新 ID 正文');

    resolveRetry();
    await Promise.resolve();
    await Promise.resolve();

    expect(screen.getByText('新 ID 正文')).not.toBeNull();
    expect(screen.queryByLabelText('正在加载口播稿')).toBeNull();
  });
});
