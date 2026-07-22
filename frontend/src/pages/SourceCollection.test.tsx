import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import useStore, { type Broadcast, type ContentArtifactRevision, type ContentProject, type ProjectEditorContext } from '../store';
import { defaultSettings } from '../store/defaults';
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

const editorDraft: Broadcast = {
  id: 81,
  title: '可追溯项目口播稿',
  content: audioScriptRevision.content,
  artifact_revision_id: audioScriptRevision.id,
  source_artifact_revision_id: audioScriptRevision.id,
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
      settings: {
        ...defaultSettings,
        mimo_api_key: { masked: '', is_set: false },
        mimo_tts_api_key: { masked: '', is_set: false },
      },
      contentProjects: [],
      isLoadingContentProjects: false,
      fetchContentProjects: vi.fn().mockResolvedValue([]),
      createContentProject: vi.fn().mockResolvedValue(project),
      createEditorDraft: vi.fn().mockResolvedValue(editorDraft),
      forkEditorDraft: vi.fn().mockResolvedValue({ ...editorDraft, id: 82 }),
      cancelEditorDraftCreation: vi.fn(),
      isCreatingEditorDraft: false,
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

    fireEvent.click(screen.getByRole('button', { name: '新建内容项目并填写 Brief' }));
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

  test('项目口播稿在工作台保留版本身份，并创建 ID 草稿继续编辑', async () => {
    useStore.setState({
      script: audioScriptRevision.content,
      projectEditorContext,
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<SourceCollection />} />
          <Route path="/editor/:broadcastId" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('项目口播稿 · 第 4 版')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '继续项目口播稿' }));
    await waitFor(() => expect(screen.getByText('/editor/81')).not.toBeNull());
    expect(useStore.getState().createEditorDraft).toHaveBeenCalledWith({
      text: audioScriptRevision.content,
      artifactRevisionId: audioScriptRevision.id,
    });
  });

  test('工作台遇到已保存 Render 时先派生副本，不复用历史 ID', async () => {
    useStore.setState({
      script: audioScriptRevision.content,
      projectEditorContext,
      currentBroadcast: { ...editorDraft, id: 41, saved: 1, status: 'generated' },
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<SourceCollection />} />
          <Route path="/editor/:broadcastId" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: '继续项目口播稿' }));
    await waitFor(() => expect(screen.getByText('/editor/82')).not.toBeNull());
    expect(useStore.getState().forkEditorDraft).toHaveBeenCalledWith(41);
    expect(useStore.getState().createEditorDraft).not.toHaveBeenCalled();
  });

  test('首屏明确展示从来源、证据到带引用成稿的主线，空态给出第一步动作', () => {
    render(
      <MemoryRouter>
        <SourceCollection />
      </MemoryRouter>
    );

    expect(screen.getByText('从来源到带引用成稿')).not.toBeNull();
    expect(screen.getByText('2 核验并选择证据')).not.toBeNull();
    expect(screen.getByText(/第一步：新建内容项目并填写最小 Brief/)).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '新建内容项目' }));
    expect(screen.getByRole('textbox', { name: '项目名称' })).not.toBeNull();
  });

  test('LLM 或 TTS 未配置时显示持久设置引导并可跳转', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<SourceCollection />} />
          <Route path="/settings" element={<div>设置页面</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('完成 LLM/TTS 配置后解锁全部能力')).not.toBeNull();
    fireEvent.click(screen.getByRole('link', { name: '前往设置 →' }));
    expect(screen.getByText('设置页面')).not.toBeNull();
  });

  test('LLM 与 TTS 均已配置时隐藏设置引导', () => {
    useStore.setState({
      settings: {
        ...defaultSettings,
        mimo_api_key: { masked: '••••••••1234', is_set: true },
        mimo_tts_api_key: { masked: '••••••••5678', is_set: true },
      },
    });

    render(
      <MemoryRouter>
        <SourceCollection />
      </MemoryRouter>
    );

    expect(screen.queryByText('完成 LLM/TTS 配置后解锁全部能力')).toBeNull();
  });
});
