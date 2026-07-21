import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import useStore from './index';

describe('backgroundTaskSlice', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-22T01:00:00.000Z'));
    useStore.setState({ backgroundTasks: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('starts and updates a JSON-serializable task snapshot', () => {
    const store = useStore.getState();
    store.startBackgroundTask({
      taskId: 'transcribe-42',
      kind: 'transcription',
      entityId: 42,
      title: '访谈录音.mp3',
      href: '/transcribe',
    });

    vi.advanceTimersByTime(500);
    useStore.getState().updateBackgroundTask('transcribe-42', {
      status: 'running',
      phase: 'transcribing',
      percent: 38.5,
      message: '正在转录第 2 个片段',
    });

    const tasks = useStore.getState().backgroundTasks;
    expect(tasks).toEqual([
      {
        taskId: 'transcribe-42',
        kind: 'transcription',
        entityId: 42,
        title: '访谈录音.mp3',
        href: '/transcribe',
        status: 'running',
        phase: 'transcribing',
        percent: 38.5,
        message: '正在转录第 2 个片段',
        retryAttempt: 0,
        startedAt: Date.parse('2026-07-22T01:00:00.000Z'),
        updatedAt: Date.parse('2026-07-22T01:00:00.500Z'),
      },
    ]);
    expect(JSON.parse(JSON.stringify(tasks))).toEqual(tasks);
  });

  test('upserts by task id, marks a lost connection, and removes terminal tasks', () => {
    const store = useStore.getState();
    store.startBackgroundTask({
      taskId: 'batch-7',
      kind: 'batch_transcription',
      title: '批量转录 7 个文件',
      href: '/transcribe',
      status: 'running',
      phase: 'file-progress',
      percent: 20,
      message: '正在处理第 2 个文件',
    });
    store.startBackgroundTask({
      taskId: 'batch-7',
      kind: 'batch_transcription',
      title: '批量转录 7 个文件',
      href: '/transcribe',
      status: 'reconnecting',
      phase: 'reconnecting',
      percent: 120,
      message: '正在重新连接',
      retryAttempt: 2.8,
    });

    expect(useStore.getState().backgroundTasks).toHaveLength(1);
    expect(useStore.getState().backgroundTasks[0]).toMatchObject({
      status: 'reconnecting',
      percent: 100,
      retryAttempt: 2,
    });

    useStore.getState().markBackgroundTaskConnectionLost('batch-7', '连接重试次数已用尽');
    expect(useStore.getState().backgroundTasks[0]).toMatchObject({
      status: 'connection_lost',
      phase: 'connection_lost',
      message: '连接重试次数已用尽',
    });

    useStore.getState().startBackgroundTask({
      taskId: 'batch-8',
      kind: 'batch_transcription',
      title: '重新批量转录',
      href: '/transcribe',
    });
    expect(useStore.getState().backgroundTasks).toEqual([
      expect.objectContaining({ taskId: 'batch-8', status: 'connecting' }),
    ]);

    useStore.getState().endBackgroundTask('batch-8');
    expect(useStore.getState().backgroundTasks).toEqual([]);
  });
});
