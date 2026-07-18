import { beforeEach, describe, expect, test, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  createRevision: vi.fn(),
  getRevisions: vi.fn(),
  getWorkspace: vi.fn(),
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    projectWorkspaceApi: {
      ...actual.projectWorkspaceApi,
      createRevision: apiMocks.createRevision,
      getRevisions: apiMocks.getRevisions,
      getWorkspace: apiMocks.getWorkspace,
    },
  };
});

import useStore, {
  type ContentArtifact,
  type ContentArtifactRevision,
  type ContentProjectWorkspace,
} from './index';

const firstRevision: ContentArtifactRevision = {
  id: 41,
  artifact_id: 30,
  revision_number: 1,
  content: '第一版主稿',
  change_reason: '',
  created_at: '2026-07-18T00:00:00.000Z',
};

const artifact: ContentArtifact = {
  id: 30,
  project_id: 12,
  kind: 'master',
  title: '主稿',
  platform: 'general',
  status: 'draft',
  current_revision: firstRevision,
  created_at: '2026-07-18T00:00:00.000Z',
  updated_at: '2026-07-18T00:00:00.000Z',
};

const workspace: ContentProjectWorkspace = {
  project: {
    id: 12,
    title: '版本保存测试',
    topic: '',
    audience: '',
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
  },
  sources: [],
  artifacts: [artifact],
};

describe('projectWorkspaceSlice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({
      projectWorkspace: workspace,
      projectArtifactRevisions: [firstRevision],
      projectWorkspaceSaveError: null,
      isSavingProjectWorkspace: false,
      projectEditorContext: null,
      isLoadingProjectEditorRevision: false,
      projectEditorRevisionError: null,
    });
  });

  test('显式保存主稿时请求新版本并用服务端 artifact 更新工作区', async () => {
    const revision: ContentArtifactRevision = {
      ...firstRevision,
      id: 42,
      revision_number: 2,
      content: '\n第二版主稿\n',
      change_reason: '补充反方证据',
    };
    const updatedArtifact: ContentArtifact = {
      ...artifact,
      current_revision: revision,
      updated_at: '2026-07-18T00:10:00.000Z',
    };
    apiMocks.createRevision.mockResolvedValue({ data: { revision, artifact: updatedArtifact } });

    await useStore.getState().saveProjectArtifactRevision(12, 30, {
      content: '\n第二版主稿\n',
      changeReason: '补充反方证据',
    });

    expect(apiMocks.createRevision).toHaveBeenCalledWith(12, 30, {
      content: '\n第二版主稿\n',
      changeReason: '补充反方证据',
    });
    expect(useStore.getState().projectWorkspace?.artifacts[0]).toEqual(updatedArtifact);
    expect(useStore.getState().projectArtifactRevisions.map((item) => item.revision_number)).toEqual([2, 1]);
  });

  test('编辑器按 query 加载确切 Revision，并清空旧音频渲染上下文', async () => {
    const requestedRevision = { ...firstRevision, id: 43, revision_number: 3, content: '\n确切口播版本\n' };
    apiMocks.getRevisions.mockResolvedValue({ data: { revisions: [requestedRevision, firstRevision] } });
    apiMocks.getWorkspace.mockResolvedValue({
      data: { workspace: { ...workspace, artifacts: [{ ...artifact, kind: 'audio_script', current_revision: requestedRevision }] } },
    });
    useStore.setState({
      script: '旧稿件',
      currentBroadcast: {
        id: 99,
        title: '旧播报',
        content: '旧稿件',
        artifact_revision_id: null,
        source_artifact_revision_id: null,
        audio_path: null,
        duration: null,
        voice_type: null,
        voice_config: null,
        source_items: null,
        status: 'draft',
        saved: 0,
        mode: 'segmented',
        created_at: '2026-07-18T00:00:00.000Z',
        updated_at: '2026-07-18T00:00:00.000Z',
      },
      segments: [{
        id: 1,
        broadcast_id: 99,
        index: 0,
        text: '旧段落',
        audio_path: null,
        status: 'pending',
        style_tag: '',
        playback_rate: 1,
        error_message: '',
        created_at: '2026-07-18T00:00:00.000Z',
        updated_at: '2026-07-18T00:00:00.000Z',
      }],
    });

    await useStore.getState().loadProjectEditorRevision(12, 30, 43);

    expect(apiMocks.getRevisions).toHaveBeenCalledWith(12, 30);
    expect(apiMocks.getWorkspace).toHaveBeenCalledWith(12);
    expect(useStore.getState().projectEditorContext).toEqual({ projectId: 12, artifactId: 30, revision: requestedRevision });
    expect(useStore.getState().script).toBe('\n确切口播版本\n');
    expect(useStore.getState().currentBroadcast).toBeNull();
    expect(useStore.getState().segments).toEqual([]);
  });
});
