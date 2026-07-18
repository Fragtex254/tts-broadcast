import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  updateProject: vi.fn(),
}));

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api')>();
  return {
    ...actual,
    contentProjectApi: {
      ...actual.contentProjectApi,
      update: apiMocks.updateProject,
    },
  };
});

import useStore, { type ContentProject } from '../../store';
import { ContentProjectWorkspace } from './ContentProjectWorkspace';

const project: ContentProject = {
  id: 9,
  title: '自动保存测试',
  topic: '',
  audience: '',
  goal: '',
  angle: '',
  tone: '',
  content_format: '',
  target_platform: 'xiaohongshu',
  thesis: '',
  personal_practice: '',
  personal_judgment: '',
  discussion_question: '',
  status: 'draft',
  claims: [],
  created_at: '2026-07-17',
  updated_at: '2026-07-17',
};

describe('ContentProjectWorkspace 自动保存', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    useStore.setState({ currentContentProject: project, contentProjects: [project] });
    apiMocks.updateProject.mockImplementation((_id: number, data: { topic?: string }) => Promise.resolve({
      data: { project: { ...project, topic: data.topic || '', updated_at: '2026-07-17T00:00:01Z' } },
    }));
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  test('停止输入一秒后保存，失焦会立即保存最新草稿', async () => {
    render(<ContentProjectWorkspace project={project} />);
    const topic = screen.getByRole('textbox', { name: '研究问题' });

    fireEvent.change(topic, { target: { value: '新的研究问题' } });
    expect(screen.getByRole('status').textContent).toContain('保存中');

    await act(async () => { await vi.advanceTimersByTimeAsync(999); });
    expect(apiMocks.updateProject).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(apiMocks.updateProject).toHaveBeenCalledTimes(1);
    expect(apiMocks.updateProject).toHaveBeenLastCalledWith(project.id, expect.objectContaining({ topic: '新的研究问题' }));
    expect(screen.getByRole('status').textContent).toContain('已保存');

    fireEvent.change(topic, { target: { value: '失焦立即保存' } });
    fireEvent.blur(topic);
    await act(async () => { await Promise.resolve(); });
    expect(apiMocks.updateProject).toHaveBeenCalledTimes(2);
    expect(apiMocks.updateProject).toHaveBeenLastCalledWith(project.id, expect.objectContaining({ topic: '失焦立即保存' }));
  });

  test('保存失败后保留手动重试入口', async () => {
    apiMocks.updateProject.mockRejectedValueOnce(new Error('网络暂不可用'));
    render(<ContentProjectWorkspace project={project} />);
    const topic = screen.getByRole('textbox', { name: '研究问题' });

    fireEvent.change(topic, { target: { value: '会失败的内容' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(screen.getByRole('status').textContent).toContain('保存失败');

    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    await act(async () => { await Promise.resolve(); });
    expect(apiMocks.updateProject).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status').textContent).toContain('已保存');
  });
});
