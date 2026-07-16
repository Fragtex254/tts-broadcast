import { beforeEach, describe, expect, test, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  getAllProjects: vi.fn(),
  createProject: vi.fn(),
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    contentProjectApi: {
      ...actual.contentProjectApi,
      getAll: apiMocks.getAllProjects,
      create: apiMocks.createProject,
    },
  };
});

import useStore, { type ContentProject } from './index';

const project: ContentProject = {
  id: 7,
  title: 'Agent 与游戏开发',
  topic: 'Agent 会怎样改变游戏开发？',
  target_platform: 'general',
  thesis: '',
  personal_practice: '',
  personal_judgment: '',
  discussion_question: '',
  status: 'draft',
  claim_count: 0,
  claims: [],
  created_at: '2026-07-16T00:00:00.000Z',
  updated_at: '2026-07-16T00:00:00.000Z',
};

describe('researchSlice content project concurrency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({
      contentProjects: [],
      currentContentProject: null,
      isLoadingContentProjects: false,
    });
  });

  test('创建项目会使更早的列表请求失效并收敛 loading 状态', async () => {
    let resolveList: ((value: { data: { projects: ContentProject[] } }) => void) | undefined;
    apiMocks.getAllProjects.mockReturnValue(new Promise((resolve) => { resolveList = resolve; }));
    apiMocks.createProject.mockResolvedValue({ data: { project } });

    const staleFetch = useStore.getState().fetchContentProjects();
    expect(useStore.getState().isLoadingContentProjects).toBe(true);

    await useStore.getState().createContentProject({
      title: project.title,
      topic: project.topic,
      targetPlatform: project.target_platform,
    });
    expect(useStore.getState().isLoadingContentProjects).toBe(false);
    expect(useStore.getState().currentContentProject?.id).toBe(project.id);

    resolveList?.({ data: { projects: [] } });
    await staleFetch;
    expect(useStore.getState().contentProjects.map((item) => item.id)).toEqual([project.id]);
  });
});
