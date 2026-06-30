const { TTSQueueManager } = require('../../src/services/ttsQueue');

describe('TTS 请求队列', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('按 RPM 控制启动间隔，但不等待上一个请求完成才启动下一个', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);

    const queue = new TTSQueueManager({ rpmLimit: 60, maxConcurrent: 2 });
    queue.lastStartAt = -queue.minIntervalMs;
    const starts = [];
    const deferred = [];

    const makeJob = (label) => () => new Promise((resolve) => {
      starts.push({ label, at: Date.now() });
      deferred.push(resolve);
    });

    const first = queue.enqueue(makeJob('first'));
    const second = queue.enqueue(makeJob('second'));
    const third = queue.enqueue(makeJob('third'));

    await jest.advanceTimersByTimeAsync(0);
    expect(starts).toEqual([{ label: 'first', at: 0 }]);

    await jest.advanceTimersByTimeAsync(999);
    expect(starts).toHaveLength(1);

    await jest.advanceTimersByTimeAsync(1);
    expect(starts).toEqual([
      { label: 'first', at: 0 },
      { label: 'second', at: 1000 }
    ]);

    await jest.advanceTimersByTimeAsync(1000);
    expect(starts).toHaveLength(2);

    deferred[0]('first-done');
    await first;
    await jest.advanceTimersByTimeAsync(0);
    expect(starts).toEqual([
      { label: 'first', at: 0 },
      { label: 'second', at: 1000 },
      { label: 'third', at: 2000 }
    ]);

    deferred[1]('second-done');
    deferred[2]('third-done');
    await Promise.all([second, third]);
  });

  test('清空队列会拒绝未启动任务并取消等待中的定时器', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);

    const queue = new TTSQueueManager({ rpmLimit: 60, maxConcurrent: 1 });
    queue.lastStartAt = -queue.minIntervalMs;
    const first = queue.enqueue(() => new Promise(() => {}));
    const second = queue.enqueue(() => Promise.resolve('second'));

    await jest.advanceTimersByTimeAsync(0);
    queue.clear();

    await expect(second).rejects.toThrow('队列已清空');
    expect(queue.getStatus()).toEqual(expect.objectContaining({
      queued: 0,
      active: 1
    }));

    // 防止未使用的 promise 被 lint/测试误判为同步错误；第一个任务已启动，clear 不会取消在途请求。
    expect(first).toBeInstanceOf(Promise);
  });
});
