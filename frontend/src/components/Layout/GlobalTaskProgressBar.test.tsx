import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { sseRegistry } from '../../services/sseRegistry';
import useStore from '../../store';
import { GlobalTaskProgressBar } from './GlobalTaskProgressBar';

const LocationProbe = () => {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
};

describe('GlobalTaskProgressBar', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useStore.setState({ backgroundTasks: [] });
  });

  test('lists active tasks and exposes accessible progress', () => {
    const store = useStore.getState();
    store.startBackgroundTask({
      taskId: 'transcribe-1',
      kind: 'transcription',
      title: '访谈录音.mp3',
      href: '/transcribe',
      status: 'running',
      phase: 'transcribing',
      percent: 42,
      message: '正在转录第 3 个片段',
    });
    store.startBackgroundTask({
      taskId: 'segments-8',
      kind: 'segment_generation',
      title: '生成口播音频',
      href: '/editor/8',
      status: 'connecting',
    });

    render(
      <MemoryRouter>
        <GlobalTaskProgressBar />
      </MemoryRouter>,
    );

    expect(screen.getByText('后台任务进行中')).not.toBeNull();
    expect(screen.getByText('2 项')).not.toBeNull();
    expect(screen.getByText('访谈录音.mp3')).not.toBeNull();
    expect(screen.getByText('生成口播音频')).not.toBeNull();
    expect(screen.getByRole('progressbar', { name: '访谈录音.mp3进度' }).getAttribute('aria-valuenow')).toBe('42');
  });

  test('opens the task href when clicked', () => {
    useStore.getState().startBackgroundTask({
      taskId: 'summary-9',
      kind: 'transcript_summary',
      title: '生成播客总结',
      href: '/history/transcriptions/9',
      status: 'running',
      phase: 'summarizing',
      percent: 66,
      message: '正在汇总章节',
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <GlobalTaskProgressBar />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: '打开任务：生成播客总结' }));
    expect(screen.getByTestId('location').textContent).toBe('/history/transcriptions/9');
  });

  test('shows an explicit recovery message after the connection is lost', () => {
    const store = useStore.getState();
    store.startBackgroundTask({
      taskId: 'batch-4',
      kind: 'batch_transcription',
      title: '批量转录',
      href: '/transcribe',
      status: 'reconnecting',
      retryAttempt: 3,
    });
    store.markBackgroundTaskConnectionLost('batch-4', '三次重连均失败');

    render(
      <MemoryRouter>
        <GlobalTaskProgressBar />
      </MemoryRouter>,
    );

    expect(screen.getByText(/连接中断，可返回任务页重试/).textContent).toContain('三次重连均失败');
    expect(
      screen.getByRole('progressbar', { name: '批量转录进度' }).getAttribute('aria-valuetext'),
    ).toContain('连接中断，可返回任务页重试');
  });

  test('reconnects a lost task with its original task id', () => {
    const reconnect = vi.spyOn(sseRegistry, 'reconnect').mockReturnValue(true);
    const store = useStore.getState();
    store.startBackgroundTask({
      taskId: 'summary-original-task',
      kind: 'transcript-summary',
      entityId: 9,
      title: '播客总结',
      href: '/history/transcriptions/9',
    });
    store.markBackgroundTaskConnectionLost('summary-original-task', '三次重连均失败');

    render(
      <MemoryRouter>
        <GlobalTaskProgressBar />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: '重新连接' }));

    expect(reconnect).toHaveBeenCalledWith('summary-original-task');
    expect(useStore.getState().backgroundTasks[0]).toMatchObject({
      taskId: 'summary-original-task',
      status: 'connecting',
      retryAttempt: 0,
    });
  });
});
