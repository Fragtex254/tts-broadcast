const {
  TTSQueueManager,
  estimateClonePayloadBytes,
  estimateTtsConcurrencyCost,
  estimateTtsRequestCost,
} = require('../../src/services/ttsQueue');
const rateLimitStore = require('../../src/services/rateLimitStore');

describe('TTS 请求队列', () => {
  afterEach(() => {
    jest.useRealTimers();
    rateLimitStore.clearScope('test-mimo-tts');
  });

  test('默认使用 MiMo TTS 100 RPM 的 10% 冗余且不做瞬时突发', () => {
    const queue = new TTSQueueManager();

    expect(queue.getStatus()).toEqual(expect.objectContaining({
      rpmLimit: 90,
      tpmLimit: 9000000,
      maxConcurrent: 6,
      startBurstLimit: 1,
      minIntervalMs: 667,
    }));
  });

  test('配置值不会超过 MiMo TTS 硬上限', () => {
    const queue = new TTSQueueManager({
      rpmLimit: 999,
      tpmLimit: 99999999,
    });

    expect(queue.getStatus()).toEqual(expect.objectContaining({
      rpmLimit: 100,
      tpmLimit: 10000000,
    }));
  });

  test('clone 音频 payload 会提高请求成本与并发成本', () => {
    const voiceClone = `data:audio/wav;base64,${'A'.repeat(5 * 1024 * 1024)}`;
    const params = { voiceType: 'clone', voiceClone };

    expect(estimateClonePayloadBytes(params)).toBe(Buffer.byteLength(voiceClone, 'utf8'));
    expect(estimateTtsRequestCost(params)).toBeGreaterThanOrEqual(5);
    expect(estimateTtsConcurrencyCost(params)).toBeGreaterThan(1);
    expect(estimateTtsRequestCost({ voiceType: 'preset' })).toBe(1);
    expect(estimateTtsConcurrencyCost({ voiceType: 'preset' })).toBe(1);
  });

  test('clone 请求按成本拉开启动间隔并占用更多并发槽', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);

    const queue = new TTSQueueManager({ rpmLimit: 60, maxConcurrent: 4, startBurstLimit: 1 });
    const voiceClone = `data:audio/wav;base64,${'A'.repeat(2 * 1024 * 1024)}`;
    const speechParams = { voiceType: 'clone', voiceClone, text: '测试' };
    const starts = [];
    const deferred = [];

    const makeJob = (label) => () => new Promise((resolve) => {
      starts.push({ label, at: Date.now() });
      deferred.push(resolve);
    });

    const first = queue.enqueueTts(speechParams, makeJob('first'));
    const second = queue.enqueueTts(speechParams, makeJob('second'));
    const third = queue.enqueueTts(speechParams, makeJob('third'));

    await jest.advanceTimersByTimeAsync(0);
    expect(starts).toEqual([{ label: 'first', at: 0 }]);

    await jest.advanceTimersByTimeAsync(2999);
    expect(starts).toHaveLength(1);

    await jest.advanceTimersByTimeAsync(1);
    expect(starts).toEqual([
      { label: 'first', at: 0 },
      { label: 'second', at: 3000 }
    ]);

    await jest.advanceTimersByTimeAsync(3000);
    expect(starts).toHaveLength(2);

    deferred[0]('first-done');
    await first;
    await jest.advanceTimersByTimeAsync(0);
    expect(starts).toEqual([
      { label: 'first', at: 0 },
      { label: 'second', at: 3000 },
      { label: 'third', at: 6000 }
    ]);

    deferred[1]('second-done');
    deferred[2]('third-done');
    await Promise.all([second, third]);
  });

  test('持久化账本让新队列实例继承上一实例的启动节奏', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);

    const firstQueue = new TTSQueueManager({
      rpmLimit: 60,
      maxConcurrent: 1,
      startBurstLimit: 1,
      usageStore: rateLimitStore,
      usageScope: 'test-mimo-tts',
    });
    const starts = [];
    const first = firstQueue.enqueue(() => {
      starts.push({ label: 'first', at: Date.now() });
      return 'first-done';
    });

    await jest.advanceTimersByTimeAsync(0);
    await expect(first).resolves.toBe('first-done');

    const secondQueue = new TTSQueueManager({
      rpmLimit: 60,
      maxConcurrent: 1,
      startBurstLimit: 1,
      usageStore: rateLimitStore,
      usageScope: 'test-mimo-tts',
    });
    const second = secondQueue.enqueue(() => {
      starts.push({ label: 'second', at: Date.now() });
      return 'second-done';
    });

    await jest.advanceTimersByTimeAsync(999);
    expect(starts).toEqual([{ label: 'first', at: 0 }]);

    await jest.advanceTimersByTimeAsync(1);
    expect(starts).toEqual([
      { label: 'first', at: 0 },
      { label: 'second', at: 1000 }
    ]);
    await expect(second).resolves.toBe('second-done');
  });

  test('有 RPM 额度时允许小突发，然后按启动间隔补并发', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);

    const queue = new TTSQueueManager({ rpmLimit: 60, maxConcurrent: 2, startBurstLimit: 2 });
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
    expect(starts).toEqual([
      { label: 'first', at: 0 },
      { label: 'second', at: 0 }
    ]);

    deferred[0]('first-done');
    await first;
    await jest.advanceTimersByTimeAsync(0);
    expect(starts).toEqual([
      { label: 'first', at: 0 },
      { label: 'second', at: 0 }
    ]);

    await jest.advanceTimersByTimeAsync(999);
    expect(starts).toEqual([
      { label: 'first', at: 0 },
      { label: 'second', at: 0 }
    ]);

    await jest.advanceTimersByTimeAsync(1);
    expect(starts).toEqual([
      { label: 'first', at: 0 },
      { label: 'second', at: 0 },
      { label: 'third', at: 1000 }
    ]);

    deferred[1]('second-done');
    deferred[2]('third-done');
    await Promise.all([second, third]);
  });

  test('RPM 窗口耗尽时等待最早请求滑出一分钟窗口', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);

    const queue = new TTSQueueManager({ rpmLimit: 2, maxConcurrent: 3, startBurstLimit: 2 });
    const starts = [];

    const makeJob = (label) => () => {
      starts.push({ label, at: Date.now() });
      return `${label}-done`;
    };

    const first = queue.enqueue(makeJob('first'));
    const second = queue.enqueue(makeJob('second'));
    const third = queue.enqueue(makeJob('third'));

    await jest.advanceTimersByTimeAsync(0);
    await expect(first).resolves.toBe('first-done');
    await expect(second).resolves.toBe('second-done');
    expect(starts).toEqual([
      { label: 'first', at: 0 },
      { label: 'second', at: 0 }
    ]);

    await jest.advanceTimersByTimeAsync(59999);
    expect(starts).toHaveLength(2);

    await jest.advanceTimersByTimeAsync(1);
    expect(starts).toEqual([
      { label: 'first', at: 0 },
      { label: 'second', at: 0 },
      { label: 'third', at: 60000 }
    ]);
    await expect(third).resolves.toBe('third-done');
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
