import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import useStore, { type ContentArtifactRevision, type ContentProject, type ProjectEditorContext } from '../store';
import { CONTENT_REVISION_DEFAULTS } from '../test/contentProjectFixtures';
import { SourceCollection } from './SourceCollection';

const LocationProbe = () => {
  const location = useLocation();
  return <div>{`${location.pathname}${location.search}`}</div>;
};

const audioScriptRevision: ContentArtifactRevision = {
  ...CONTENT_REVISION_DEFAULTS,
  id: 31,
  artifact_id: 17,
  revision_number: 4,
  content: '可追溯项目口播稿',
  change_reason: '同步自主稿',
  created_at: '2026-07-18T00:00:00.000Z',
};

const projectEditorContext: ProjectEditorContext = {
  projectId: 21,
  artifactId: 17,
  revision: audioScriptRevision,
};

const project: ContentProject = {
  id: 21,
  title: '证据驱动内容工具',
  topic: 'AI 应该替创作者完成哪部分工作？',
  audience: '独立内容创作者',
  goal: '',
  angle: '',
  tone: '',
  content_format: '',
  target_platform: 'general',
  thesis: '',
  personal_practice: '',
  personal_judgment: '',
  discussion_question: '',
  status: 'draft',
  claims: [],
  created_at: '2026-07-18T00:00:00.000Z',
  updated_at: '2026-07-18T00:00:00.000Z',
};

describe('SourceCollection', () => {
  beforeEach(() => {
    useStore.setState({
      todayItems: [],
      script: '',
      currentBroadcast: null,
      isRewriting: false,
      projectEditorContext: null,
      contentProjects: [],
      isLoadingContentProjects: false,
      fetchContentProjects: vi.fn().mockResolvedValue([]),
      createContentProject: vi.fn().mockResolvedValue(project),
    });
  });

  test('只挂载一份资讯采集任务，并在点击入口后把焦点交给筛选器', () => {
    render(
      <MemoryRouter>
        <SourceCollection />
      </MemoryRouter>
    );

    const filters = screen.getAllByRole('combobox');
    expect(filters).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: /采集资讯并写成稿/ }));

    expect(document.activeElement).toBe(filters[0]);
  });

  test('先填写最小 Brief，再创建项目并进入创作工作区', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<SourceCollection />} />
          <Route path="/projects/:id" element={<div>项目创作工作区</div>} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /新建内容项目/ }));
    expect(useStore.getState().createContentProject).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('textbox', { name: '项目名称' }), {
      target: { value: '  证据驱动内容工具  ' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: '核心问题' }), {
      target: { value: 'AI 应该替创作者完成哪部分工作？' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: '目标读者（可选）' }), {
      target: { value: '独立内容创作者' },
    });
    fireEvent.click(screen.getByRole('button', { name: '创建并进入项目' }));

    await waitFor(() => expect(screen.getByText('项目创作工作区')).not.toBeNull());
    expect(useStore.getState().createContentProject).toHaveBeenCalledWith({
      title: '证据驱动内容工具',
      topic: 'AI 应该替创作者完成哪部分工作？',
      audience: '独立内容创作者',
      targetPlatform: 'general',
    });
  });

  test('项目口播稿在工作台保留版本身份，并通过完整上下文继续编辑', () => {
    useStore.setState({
      script: audioScriptRevision.content,
      projectEditorContext,
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<SourceCollection />} />
          <Route path="/editor" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('项目口播稿 · 第 4 版')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '继续项目口播稿' }));
    expect(screen.getByText('/editor?projectId=21&artifactId=17&revisionId=31')).not.toBeNull();
  });
});
