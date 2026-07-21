import { beforeEach, describe, expect, test, vi } from 'vitest';

const axiosMocks = vi.hoisted(() => {
  const api = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    interceptors: { response: { use: vi.fn() } },
  };
  return {
    api,
    create: vi.fn(() => api),
    isCancel: vi.fn(() => false),
  };
});

vi.mock('axios', () => ({
  default: {
    create: axiosMocks.create,
    isCancel: axiosMocks.isCancel,
  },
}));

import { projectWorkspaceApi, transcribeApi } from './api';

describe('转录 API', () => {
  beforeEach(() => {
    axiosMocks.api.post.mockReset();
  });

  test('单文件长转录不使用全局 30 分钟墙钟超时', () => {
    const formData = new FormData();

    transcribeApi.transcribe(formData);

    expect(axiosMocks.api.post).toHaveBeenCalledWith(
      '/transcribe',
      formData,
      expect.objectContaining({ timeout: 0 })
    );
  });
});

describe('内容创作工作区 API', () => {
  beforeEach(() => {
    axiosMocks.api.get.mockReset();
    axiosMocks.api.post.mockReset();
    axiosMocks.api.patch.mockReset();
    axiosMocks.api.delete.mockReset();
  });

  test('按项目作用域读取 fragments、更新证据并启动幂等任务', () => {
    projectWorkspaceApi.getSourceFragments(12, 8);
    projectWorkspaceApi.updateEvidence(12, 5, { state: 'selected', userNote: '用于开头' });
    projectWorkspaceApi.createJob(12, {
      operation: 'generate_master', requestKey: 'request-1', taskId: 'task-1', evidenceIds: [5], outlineRevisionId: 9,
    });

    expect(axiosMocks.api.get).toHaveBeenCalledWith('/content-projects/12/sources/8/fragments');
    expect(axiosMocks.api.patch).toHaveBeenCalledWith('/content-projects/12/evidence/5', { state: 'selected', userNote: '用于开头' });
    expect(axiosMocks.api.post).toHaveBeenCalledWith('/content-projects/12/creation-jobs', {
      operation: 'generate_master', requestKey: 'request-1', taskId: 'task-1', evidenceIds: [5], outlineRevisionId: 9,
    });
  });

  test('移出项目明确只删除项目来源关联', () => {
    projectWorkspaceApi.unlinkSource(12, 8);

    expect(axiosMocks.api.delete).toHaveBeenCalledWith('/content-projects/12/sources/8');
  });
});
