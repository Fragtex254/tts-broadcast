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

  test('请求返回 retryAfterMs 时重试当前任务', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);

    const queue = new TTSQueueManager({ rpmLimit: 60, maxConcurrent: 1, rateLimitRetries: 1 });
    queue.lastStartAt = -queue.minIntervalMs;
    const starts = [];
    let attempts = 0;

    const job = queue.enqueue(() => {
      attempts += 1;
      starts.push({ label: 'job', at: Date.now() });
      if (attempts === 1) {
        const error = new Error('rate limited');
        error.retryAfterMs = 5000;
        throw error;
      }
      return 'done';
    });

    await jest.advanceTimersByTimeAsync(0);
    expect(starts).toEqual([{ label: 'job', at: 0 }]);

    await jest.advanceTimersByTimeAsync(4999);
    expect(starts).toHaveLength(1);

    await jest.advanceTimersByTimeAsync(1);
    expect(starts).toEqual([
      { label: 'job', at: 0 },
      { label: 'job', at: 5000 }
    ]);
    await expect(job).resolves.toBe('done');
  });

  test('rate limit 重试耗尽后暂停后续任务启动并返回错误', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);

    const queue = new TTSQueueManager({ rpmLimit: 60, maxConcurrent: 1, rateLimitRetries: 0 });
    queue.lastStartAt = -queue.minIntervalMs;
    const starts = [];

    const first = queue.enqueue(() => {
      starts.push({ label: 'first', at: Date.now() });
      const error = new Error('rate limited');
      error.retryAfterMs = 5000;
      throw error;
    });
    const firstExpectation = expect(first).rejects.toThrow('rate limited');
    const second = queue.enqueue(() => {
      starts.push({ label: 'second', at: Date.now() });
      return 'second-done';
    });

    await jest.advanceTimersByTimeAsync(0);
    await firstExpectation;

    await jest.advanceTimersByTimeAsync(4999);
    expect(starts).toEqual([{ label: 'first', at: 0 }]);

    await jest.advanceTimersByTimeAsync(1);
    expect(starts).toEqual([
      { label: 'first', at: 0 },
      { label: 'second', at: 5000 }
    ]);
    await expect(second).resolves.toBe('second-done');
  });

  test('按 TPM 控制一分钟内启动请求的 token 总量', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);

    const queue = new TTSQueueManager({ rpmLimit: 60, tpmLimit: 10, maxConcurrent: 3 });
    queue.lastStartAt = -queue.minIntervalMs;
    const starts = [];

    const first = queue.enqueue(() => {
      starts.push({ label: 'first', at: Date.now() });
      return 'first-done';
    }, { tokenCost: 6 });
    const second = queue.enqueue(() => {
      starts.push({ label: 'second', at: Date.now() });
      return 'second-done';
    }, { tokenCost: 5 });

    await jest.advanceTimersByTimeAsync(0);
    await expect(first).resolves.toBe('first-done');
    expect(starts).toEqual([{ label: 'first', at: 0 }]);

    await jest.advanceTimersByTimeAsync(59999);
    expect(starts).toHaveLength(1);

    await jest.advanceTimersByTimeAsync(1);
    expect(starts).toEqual([
      { label: 'first', at: 0 },
      { label: 'second', at: 60000 }
    ]);
    await expect(second).resolves.toBe('second-done');
  });

  test('超出 TPM 的单请求按 TPM 上限计入，避免永久阻塞', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);

    const queue = new TTSQueueManager({ rpmLimit: 60, tpmLimit: 10, maxConcurrent: 1 });
    queue.lastStartAt = -queue.minIntervalMs;
    const starts = [];

    const job = queue.enqueue(() => {
      starts.push({ label: 'huge', at: Date.now() });
      return 'done';
    }, { tokenCost: 999 });

    await jest.advanceTimersByTimeAsync(0);
    expect(starts).toEqual([{ label: 'huge', at: 0 }]);
    await expect(job).resolves.toBe('done');
  });
});
