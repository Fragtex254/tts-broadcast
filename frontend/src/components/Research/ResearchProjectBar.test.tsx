import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { ResearchProjectBar } from './ResearchProjectBar';

describe('ResearchProjectBar', () => {
  test('新建项目先收集标题、研究问题与目标平台', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(
      <ResearchProjectBar
        projects={[]}
        currentProject={null}
        isLoading={false}
        onSelect={vi.fn().mockResolvedValue(undefined)}
        onCreate={onCreate}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '新建项目' }));
    const submit = screen.getByRole('button', { name: '创建并开始研究' });
    expect(submit.hasAttribute('disabled')).toBe(true);

    fireEvent.change(screen.getByLabelText('项目标题'), { target: { value: 'AI 与程序员' } });
    fireEvent.change(screen.getByLabelText('研究问题'), { target: { value: 'AI 会改变哪些能力结构？' } });
    fireEvent.change(screen.getByLabelText('目标平台'), { target: { value: 'wechat' } });
    fireEvent.click(submit);

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({
      title: 'AI 与程序员',
      topic: 'AI 会改变哪些能力结构？',
      targetPlatform: 'wechat',
    }));
  });

  test('项目列表加载失败时提供可重试入口', async () => {
    const onRetry = vi.fn().mockResolvedValue(undefined);
    render(
      <ResearchProjectBar
        projects={[]}
        currentProject={null}
        isLoading={false}
        loadError="获取内容项目失败"
        onRetry={onRetry}
        onSelect={vi.fn().mockResolvedValue(undefined)}
        onCreate={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByRole('alert').textContent).toContain('获取内容项目失败');
    fireEvent.click(screen.getByRole('button', { name: '重试加载' }));
    await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1));
  });
});
