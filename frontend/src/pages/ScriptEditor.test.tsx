import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import useStore, { type ContentArtifactRevision, type ProjectEditorContext } from '../store';
import { CONTENT_REVISION_DEFAULTS } from '../test/contentProjectFixtures';
import { ScriptEditor } from './ScriptEditor';

const revision: ContentArtifactRevision = {
  ...CONTENT_REVISION_DEFAULTS,
  id: 21,
  artifact_id: 8,
  revision_number: 2,
  content: '\n项目口播正文\n',
  change_reason: '同步自主稿',
  created_at: '2026-07-18T00:00:00.000Z',
};

const context: ProjectEditorContext = { projectId: 2, artifactId: 8, revision };
const originalClearProjectEditorContext = useStore.getState().clearProjectEditorContext;

const LeaveEditorButton = () => {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate('/')}>离开编辑器</button>;
};

const LocationProbe = () => {
  const location = useLocation();
  return <div>{`${location.pathname}${location.search}`}</div>;
};

describe('ScriptEditor 项目上下文', () => {
  beforeEach(() => {
    useStore.setState({
      script: '',
      currentBroadcast: null,
      segments: [],
      projectEditorContext: null,
      isLoadingProjectEditorRevision: false,
      projectEditorRevisionError: null,
      clearProjectEditorContext: vi.fn(),
    });
  });

  test('完整 query 加载确切 Revision 后才展示编辑器', async () => {
    const loadRevision = vi.fn(async () => {
      await Promise.resolve();
      useStore.setState({
        projectEditorContext: context,
        script: revision.content,
        isLoadingProjectEditorRevision: false,
      });
      return revision;
    });
    useStore.setState({ loadProjectEditorRevision: loadRevision });

    render(
      <MemoryRouter initialEntries={['/editor?projectId=2&artifactId=8&revisionId=21']}>
        <ScriptEditor />
      </MemoryRouter>
    );

    expect(screen.getByLabelText('正在加载项目口播稿')).not.toBeNull();
    await waitFor(() => expect(screen.getByText('项目口播正文')).not.toBeNull());
    expect(loadRevision).toHaveBeenCalledWith(2, 8, 21);
    expect(screen.getByText('内容项目口播稿 · 第 2 版')).not.toBeNull();
  });

  test('没有 query 时完全保留旧编辑器稿件且不加载版本', () => {
    const loadRevision = vi.fn();
    useStore.setState({ script: '旧内存口播稿', loadProjectEditorRevision: loadRevision });

    render(
      <MemoryRouter initialEntries={['/editor']}>
        <ScriptEditor />
      </MemoryRouter>
    );

    expect(screen.getByText('旧内存口播稿')).not.toBeNull();
    expect(loadRevision).not.toHaveBeenCalled();
    expect(screen.queryByText(/内容项目口播稿/)).toBeNull();
  });

  test('项目参数不完整时阻止误用内存稿，并能返回真实工作台路由', () => {
    const loadRevision = vi.fn();
    useStore.setState({ script: '不应被误用的内存稿', loadProjectEditorRevision: loadRevision });

    render(
      <MemoryRouter initialEntries={['/editor?projectId=2&artifactId=8']}>
        <Routes>
          <Route path="/editor" element={<ScriptEditor />} />
          <Route path="/" element={<div>工作台落点</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('alert').textContent).toContain('口播稿地址不完整');
    expect(screen.queryByText('不应被误用的内存稿')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '返回工作台' }));
    expect(screen.getByText('工作台落点')).not.toBeNull();
    expect(loadRevision).not.toHaveBeenCalled();
  });

  test('离开项目编辑器后保留确切 Revision 上下文供工作台继续', async () => {
    useStore.setState({
      script: revision.content,
      projectEditorContext: context,
      clearProjectEditorContext: originalClearProjectEditorContext,
    });

    render(
      <MemoryRouter initialEntries={['/editor?projectId=2&artifactId=8&revisionId=21']}>
        <Routes>
          <Route path="/editor" element={<><ScriptEditor /><LeaveEditorButton /></>} />
          <Route path="/" element={<div>工作台落点</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('内容项目口播稿 · 第 2 版')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '离开编辑器' }));

    expect(screen.getByText('工作台落点')).not.toBeNull();
    await waitFor(() => expect(useStore.getState().projectEditorContext).toEqual(context));
  });

  test('裸编辑器地址遇到确切项目 Revision 时补全项目上下文而不降级', async () => {
    const splitScriptAction = vi.fn().mockResolvedValue(undefined);
    useStore.setState({
      script: revision.content,
      projectEditorContext: context,
      clearProjectEditorContext: originalClearProjectEditorContext,
      splitScriptAction,
      voiceConfig: {
        ...useStore.getState().voiceConfig,
        voiceType: 'preset',
        voice: '冰糖',
      },
    });

    render(
      <MemoryRouter initialEntries={['/editor']}>
        <Routes>
          <Route path="/editor" element={<><ScriptEditor /><LocationProbe /></>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('/editor?projectId=2&artifactId=8&revisionId=21')).not.toBeNull();
    });
    expect(screen.getByText('内容项目口播稿 · 第 2 版')).not.toBeNull();
    expect(useStore.getState().projectEditorContext).toEqual(context);
    fireEvent.click(screen.getByRole('button', { name: '✦ 切分口播稿' }));
    await waitFor(() => expect(splitScriptAction).toHaveBeenCalledWith(revision.content, revision.id));
  });
});
