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

import { transcribeApi } from './api';

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
