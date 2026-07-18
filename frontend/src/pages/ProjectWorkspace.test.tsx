import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import useStore, { type ContentArtifact, type ContentProjectWorkspace } from '../store';
import { ProjectWorkspace } from './ProjectWorkspace';

const workspace: ContentProjectWorkspace = {
  project: {
    id: 12,
    title: '证据驱动创作',
    topic: 'AI 内容如何保留人的判断？',
    audience: '独立内容创作者',
    goal: '形成一篇可发布的文章',
    angle: '从证据链切入',
    tone: '冷静、具体',
    content_format: '深度文章',
    target_platform: 'general',
    thesis: '',
    personal_practice: '',
    personal_judgment: '',
    discussion_question: '',
    status: 'draft',
    claims: [],
    created_at: '2026-07-18T00:00:00.000Z',
    updated_at: '2026-07-18T00:00:00.000Z',
  },
  sources: [],
  artifacts: [],
};

const masterArtifact: ContentArtifact = {
  id: 4,
  project_id: 12,
  kind: 'master',
  title: '主稿',
  platform: 'general',
  status: 'draft',
  current_revision: {
    id: 11,
    artifact_id: 4,
    revision_number: 3,
    content: '\n主稿原文\n',
    change_reason: '定稿',
    created_at: '2026-07-18T00:00:00.000Z',
  },
  created_at: '2026-07-18T00:00:00.000Z',
  updated_at: '2026-07-18T00:00:00.000Z',
};

const audioArtifact: ContentArtifact = {
  ...masterArtifact,
  id: 8,
  kind: 'audio_script',
  title: '口播稿',
  current_revision: {
    id: 21,
    artifact_id: 8,
    revision_number: 1,
    content: '\n主稿原文\n',
    change_reason: '从主稿第 3 版创建口播稿',
    created_at: '2026-07-18T00:01:00.000Z',
  },
};

const renderPage = () => {
  const router = createMemoryRouter(
    [{ path: '/projects/:id', element: <ProjectWorkspace /> }],
    { initialEntries: ['/projects/12'] }
  );
  return { router, ...render(<RouterProvider router={router} />) };
};

const EditorLocationProbe = () => {
  const location = useLocation();
  return <div>{`编辑器目标${location.search}`}</div>;
};

const renderPageWithEditor = () => {
  const router = createMemoryRouter(
    [
      { path: '/projects/:id', element: <ProjectWorkspace /> },
      { path: '/editor', element: <EditorLocationProbe /> },
    ],
    { initialEntries: ['/projects/12'] }
  );
  return { router, ...render(<RouterProvider router={router} />) };
};

const renderPageWithBackEntry = () => {
  const router = createMemoryRouter(
    [
      { path: '/projects/:id', element: <ProjectWorkspace /> },
      { path: '/previous', element: <div>前一个页面</div> },
    ],
    { initialEntries: ['/previous', '/projects/12'], initialIndex: 1 }
  );
  return { router, ...render(<RouterProvider router={router} />) };
};

describe('ProjectWorkspace', () => {
  beforeEach(() => {
    useStore.setState({
      projectWorkspace: null,
      projectWorkspaceError: null,
      isLoadingProjectWorkspace: false,
      fetchProjectWorkspace: vi.fn().mockResolvedValue(workspace),
      clearProjectWorkspace: vi.fn(),
      isSavingProjectWorkspace: false,
      projectWorkspaceSaveError: null,
    });
  });

  test('加载时显示工作区骨架而不是 spinner', () => {
    const pendingWorkspace = new Promise<ContentProjectWorkspace>(() => undefined);
    useStore.setState({
      isLoadingProjectWorkspace: true,
      fetchProjectWorkspace: vi.fn(() => pendingWorkspace),
    });

    renderPage();

    expect(screen.getByLabelText('正在加载内容项目')).not.toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  test('加载失败时说明问题并保留重试入口', () => {
    useStore.setState({
      projectWorkspaceError: '项目工作区暂时无法读取',
      fetchProjectWorkspace: vi.fn().mockRejectedValue(new Error('项目工作区暂时无法读取')),
    });

    renderPage();

    expect(screen.getByRole('alert').textContent).toContain('项目工作区暂时无法读取');
    expect(screen.getByRole('button', { name: '重新加载' })).not.toBeNull();
  });

  test('空项目仍按 Brief、来源、主稿和输出顺序给出下一步', () => {
    useStore.setState({ projectWorkspace: workspace });

    renderPage();

    const orderedSteps = screen.getAllByRole('heading')
      .map((heading) => heading.textContent)
      .filter((heading) => heading === '创作 Brief' || heading === '来源与证据' || heading === '主稿与版本' || heading === '输出准备');
    expect(orderedSteps).toEqual(['创作 Brief', '来源与证据', '主稿与版本', '输出准备']);
    expect(screen.getByText('还没有手写来源')).not.toBeNull();
    expect(screen.getByText('还没有主稿')).not.toBeNull();
    expect(screen.getByRole('button', { name: '准备口播版本' }).hasAttribute('disabled')).toBe(true);
  });

  test('从主稿创建口播 Artifact 后载入原文并导航到确切 Revision', async () => {
    const createArtifact = vi.fn().mockResolvedValue(audioArtifact);
    const updateScript = vi.fn((content: string) => useStore.setState({ script: content }));
    useStore.setState({
      projectWorkspace: { ...workspace, artifacts: [masterArtifact] },
      createProjectWorkspaceArtifact: createArtifact,
      saveProjectArtifactRevision: vi.fn(),
      updateScript,
    });

    renderPageWithEditor();
    fireEvent.click(screen.getByRole('button', { name: '准备口播版本' }));

    await waitFor(() => expect(screen.getByText(/编辑器目标\?projectId=12&artifactId=8&revisionId=21/)).not.toBeNull());
    expect(createArtifact).toHaveBeenCalledWith(12, {
      kind: 'audio_script',
      title: '口播稿',
      platform: 'general',
      status: 'draft',
      content: '\n主稿原文\n',
      changeReason: '从主稿第 3 版创建口播稿',
    });
    expect(updateScript).toHaveBeenCalledWith('\n主稿原文\n');
  });

  test('主稿有未保存修改时不允许用旧 Revision 准备输出', async () => {
    useStore.setState({
      projectWorkspace: { ...workspace, artifacts: [masterArtifact] },
      createProjectWorkspaceArtifact: vi.fn(),
      saveProjectArtifactRevision: vi.fn(),
    });

    renderPage();
    fireEvent.change(screen.getByRole('textbox', { name: '主稿正文' }), {
      target: { value: '还没有保存的新主稿' },
    });

    await waitFor(() => expect(screen.getByRole('button', { name: '准备口播版本' }).hasAttribute('disabled')).toBe(true));
    expect(screen.getByText('项目里有尚未保存的修改')).not.toBeNull();
  });

  test('浏览器式后退会先确认，继续编辑或明确放弃后才处理导航', async () => {
    useStore.setState({ projectWorkspace: workspace });
    const { router } = renderPageWithBackEntry();
    fireEvent.change(screen.getByRole('textbox', { name: '核心问题' }), {
      target: { value: '尚未保存的问题' },
    });

    await waitFor(() => expect(screen.getByText('项目里有尚未保存的修改')).not.toBeNull());
    void router.navigate(-1);
    expect(await screen.findByRole('dialog', { name: '还有修改没有保存' })).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '继续编辑' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: '创作 Brief' })).not.toBeNull());

    void router.navigate(-1);
    expect(await screen.findByRole('dialog', { name: '还有修改没有保存' })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '放弃修改并离开' }));
    await waitFor(() => expect(screen.getByText('前一个页面')).not.toBeNull());
  });
});
