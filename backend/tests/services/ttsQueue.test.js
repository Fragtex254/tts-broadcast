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
    for (const scope of ['test-mimo-tts', 'test-mimo-tts-adaptive', 'test-mimo-tts-circuit']) {
      rateLimitStore.clearScope(scope);
    }
  });

  test('默认平滑启动并从保守并发逐步探测到上限', () => {
    const queue = new TTSQueueManager();

    expect(queue.getStatus()).toEqual(expect.objectContaining({
      rpmLimit: 90,
      tpmLimit: 9000000,
      payloadPerMinuteLimit: 0,
      maxConcurrent: 12,
      initialConcurrent: 3,
      effectiveMaxConcurrent: 3,
      maxActivePayloadCost: 40 * 1024 * 1024,
      startBurstLimit: 1,
      minIntervalMs: 667,
      rateLimitRetries: 2,
    }));
  });

  test('配置值不会超过 MiMo TTS 硬上限', () => {
    const queue = new TTSQueueManager({
      rpmLimit: 999,
      tpmLimit: 99999999,
      maxConcurrent: 999,
      maxActivePayloadCost: 999 * 1024 * 1024,
    });

    expect(queue.getStatus()).toEqual(expect.objectContaining({
      rpmLimit: 100,
      tpmLimit: 10000000,
      maxConcurrent: 24,
      maxActivePayloadCost: 60 * 1024 * 1024,
    }));
  });

  test('clone 音频 payload 单独计量，不伪装成多次 RPM 请求', () => {
    const voiceClone = `data:audio/wav;base64,${'A'.repeat(5 * 1024 * 1024)}`;
    const params = { voiceType: 'clone', voiceClone };

    expect(estimateClonePayloadBytes(params)).toBe(Buffer.byteLength(voiceClone, 'utf8'));
    expect(estimateTtsRequestCost(params)).toBe(1);
    expect(estimateTtsConcurrencyCost(params)).toBe(1);
    expect(estimateTtsRequestCost({ voiceType: 'preset' })).toBe(1);
    expect(estimateTtsConcurrencyCost({ voiceType: 'preset' })).toBe(1);
  });

  test('clone payload 只受独立在途字节上限约束，且不会阻塞后面的小请求', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);

    const queue = new TTSQueueManager({
      rpmLimit: 60,
      maxConcurrent: 4,
      initialConcurrent: 4,
      startBurstLimit: 4,
      maxActivePayloadCost: 12 * 1024 * 1024,
      adaptiveConcurrency: false,
    });
    const voiceClone = `data:audio/wav;base64,${'A'.repeat(5 * 1024 * 1024)}`;
    const cloneParams = { voiceType: 'clone', voiceClone, text: '测试' };
    const starts = [];
    const deferred = [];

    const makeJob = (label) => () => new Promise((resolve) => {
      starts.push({ label, at: Date.now() });
      deferred.push(resolve);
    });

    const first = queue.enqueueTts(cloneParams, makeJob('clone-1'));
    const second = queue.enqueueTts(cloneParams, makeJob('clone-2'));
    const third = queue.enqueueTts(cloneParams, makeJob('clone-3'));
    const preset = queue.enqueueTts({ voiceType: 'preset', text: '短试听' }, makeJob('preset'));

    await jest.advanceTimersByTimeAsync(0);
    expect(starts).toEqual([
      { label: 'clone-1', at: 0 },
      { label: 'clone-2', at: 0 },
      { label: 'preset', at: 0 },
    ]);
    expect(queue.getStatus()).toEqual(expect.objectContaining({
      active: 3,
      activePayloadCost: Buffer.byteLength(voiceClone, 'utf8') * 2,
    }));

    deferred[0]('first-done');
    await first;
    await jest.advanceTimersByTimeAsync(0);
    expect(starts).toEqual([
      { label: 'clone-1', at: 0 },
      { label: 'clone-2', at: 0 },
      { label: 'preset', at: 0 },
      { label: 'clone-3', at: 0 },
    ]);

    deferred[1]('second-done');
    deferred[2]('preset-done');
    deferred[3]('third-done');
    await Promise.all([second, third, preset]);
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

  test('5 MiB clone 按真实 RPM 节奏填满六个在途槽位', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);

    const queue = new TTSQueueManager({
      maxConcurrent: 6,
      initialConcurrent: 6,
      adaptiveConcurrency: false,
      usageStore: rateLimitStore,
      usageScope: 'test-mimo-tts',
    });
    const voiceClone = `data:audio/wav;base64,${'A'.repeat(5 * 1024 * 1024)}`;
    const starts = [];
    const deferred = [];
    const jobs = Array.from({ length: 6 }, (_, index) => queue.enqueueTts(
      { voiceType: 'clone', voiceClone, text: `第 ${index + 1} 段` },
      () => new Promise((resolve) => {
        starts.push(Date.now());
        deferred.push(resolve);
      })
    ));

    await jest.advanceTimersByTimeAsync(3335);
    expect(starts).toEqual([0, 667, 1334, 2001, 2668, 3335]);
    expect(rateLimitStore.getWindow({
      scope: 'test-mimo-tts',
      sinceMs: -60000,
      untilMs: 4000,
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ request_cost: 1, payload_cost: Buffer.byteLength(voiceClone, 'utf8') }),
    ]));

    deferred.forEach((resolve, index) => resolve(index));
    await Promise.all(jobs);
  });

  test('默认队列在 150 秒内完成 18 段慢 clone，同时保持平滑启动', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);

    const queue = new TTSQueueManager({
      onRateLimit: () => {},
      onConcurrencyChange: () => {},
    });
    const voiceClone = `data:audio/wav;base64,${'A'.repeat(5 * 1024 * 1024)}`;
    const starts = [];
    let active = 0;
    let maxActive = 0;
    let finishedAt = 0;
    const jobs = Array.from({ length: 18 }, (_, index) => queue.enqueueTts(
      { voiceType: 'clone', voiceClone, text: `第 ${index + 1} 段` },
      () => new Promise((resolve) => {
        starts.push(Date.now());
        active += 1;
        maxActive = Math.max(maxActive, active);
        setTimeout(() => {
          active -= 1;
          finishedAt = Date.now();
          resolve(index);
        }, 30000);
      })
    ));

    await jest.runAllTimersAsync();
    await Promise.all(jobs);

    expect(finishedAt).toBeLessThanOrEqual(150000);
    expect(maxActive).toBeGreaterThanOrEqual(4);
    for (let index = 1; index < starts.length; index += 1) {
      expect(starts[index] - starts[index - 1]).toBeGreaterThanOrEqual(667);
    }
  });

  test('429 将安全并发减半、记录失败上界并让新队列实例继承', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);

    const queue = new TTSQueueManager({
      rpmLimit: 60,
      maxConcurrent: 6,
      initialConcurrent: 6,
      startBurstLimit: 6,
      rateLimitRetries: 0,
      usageStore: rateLimitStore,
      usageScope: 'test-mimo-tts-adaptive',
      onRateLimit: () => {},
      onConcurrencyChange: () => {},
    });
    const deferred = [];
    const first = queue.enqueue(() => {
      const error = new Error('rate limited');
      error.isRateLimit = true;
      error.retryAfterMs = 5000;
      error.retryable = true;
      throw error;
    });
    const firstExpectation = expect(first).rejects.toThrow('rate limited');
    const rest = Array.from({ length: 5 }, () => queue.enqueue(() => new Promise((resolve) => {
      deferred.push(resolve);
    })));

    await jest.advanceTimersByTimeAsync(0);
    await firstExpectation;
    expect(queue.getStatus().effectiveMaxConcurrent).toBe(3);
    expect(queue.getStatus().adaptiveConcurrencyCeiling).toBe(5);

    const restarted = new TTSQueueManager({
      rpmLimit: 60,
      maxConcurrent: 6,
      initialConcurrent: 6,
      usageStore: rateLimitStore,
      usageScope: 'test-mimo-tts-adaptive',
    });
    expect(restarted.getStatus().effectiveMaxConcurrent).toBe(3);
    expect(restarted.getStatus().adaptiveConcurrencyCeiling).toBe(5);

    deferred.forEach((resolve) => resolve('done'));
    await Promise.all(rest);
  });

  test('429 延迟到达时仍按该请求在途期间的并发峰值学习上界', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);

    const queue = new TTSQueueManager({
      rpmLimit: 60,
      maxConcurrent: 3,
      initialConcurrent: 3,
      startBurstLimit: 3,
      rateLimitRetries: 0,
      onRateLimit: () => {},
      onConcurrencyChange: () => {},
    });
    const delayedRateLimit = queue.enqueue(() => new Promise((resolve, reject) => {
      setTimeout(() => {
        const error = new Error('delayed rate limit');
        error.isRateLimit = true;
        error.retryAfterMs = 100;
        error.retryable = true;
        reject(error);
      }, 20);
    }));
    const fastSuccesses = [1, 2].map((value) => queue.enqueue(() => new Promise((resolve) => {
      setTimeout(() => resolve(value), 5);
    })));

    const settled = Promise.allSettled([delayedRateLimit, ...fastSuccesses]);
    await jest.runAllTimersAsync();
    await settled;

    expect(queue.getStatus().effectiveMaxConcurrent).toBe(2);
    expect(queue.getStatus().adaptiveConcurrencyCeiling).toBe(2);
  });

  test('较晚的失败写入不会抬高已持久化的安全并发上界', () => {
    rateLimitStore.setAdaptiveConcurrency({
      scope: 'test-mimo-tts-adaptive',
      concurrencyLimit: 3,
      concurrencyCeiling: 3,
      lastRateLimitAtMs: 1000,
    });
    rateLimitStore.setAdaptiveConcurrency({
      scope: 'test-mimo-tts-adaptive',
      concurrencyLimit: 5,
      concurrencyCeiling: 5,
      lastRateLimitAtMs: 2000,
    });

    expect(rateLimitStore.getState('test-mimo-tts-adaptive')).toEqual(expect.objectContaining({
      adaptiveConcurrencyLimit: 3,
      adaptiveConcurrencyCeiling: 3,
      lastRateLimitAtMs: 2000,
    }));
  });

  test('持续成功时自适应并发每次只增加一个槽位', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(1000);
    rateLimitStore.setAdaptiveConcurrency({
      scope: 'test-mimo-tts-adaptive',
      concurrencyLimit: 2,
      lastRateLimitAtMs: 0,
    });

    const queue = new TTSQueueManager({
      rpmLimit: 60,
      maxConcurrent: 6,
      initialConcurrent: 6,
      startBurstLimit: 6,
      adaptiveRecoverySuccesses: 2,
      adaptiveRecoveryCooldownMs: 0,
      usageStore: rateLimitStore,
      usageScope: 'test-mimo-tts-adaptive',
    });
    const jobs = Array.from({ length: 4 }, (_, index) => queue.enqueue(() => index));

    await jest.runAllTimersAsync();
    await Promise.all(jobs);
    expect(queue.getStatus().effectiveMaxConcurrent).toBe(3);
    expect(rateLimitStore.getState('test-mimo-tts-adaptive').adaptiveConcurrencyLimit).toBe(3);
  });

  test('探明远端并发上界后不再周期性撞击同一 429 阈值', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);

    const remoteLimit = 3;
    let remoteActive = 0;
    let rateLimitCount = 0;
    const concurrencyAtStart = [];
    const queue = new TTSQueueManager({
      rpmLimit: 90,
      maxConcurrent: 6,
      initialConcurrent: 3,
      adaptiveRecoverySuccesses: 2,
      adaptiveRecoveryCooldownMs: 0,
      rateLimitRetries: 0,
      rateLimitBackoffMs: 100,
      maxRateLimitBackoffMs: 100,
      onRateLimit: () => {},
      onConcurrencyChange: () => {},
    });
    const jobs = Array.from({ length: 30 }, (_, index) => queue.enqueue(() => {
      remoteActive += 1;
      const activeAtStart = remoteActive;
      concurrencyAtStart.push(activeAtStart);
      const exceedsLimit = activeAtStart > remoteLimit;
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          remoteActive -= 1;
          if (exceedsLimit) {
            rateLimitCount += 1;
            const error = new Error('rate limited');
            error.isRateLimit = true;
            error.retryAfterMs = 100;
            error.retryable = true;
            reject(error);
            return;
          }
          resolve(index);
        }, exceedsLimit ? 1 : 10000);
      });
    }));
    const settled = Promise.allSettled(jobs);

    await jest.runAllTimersAsync();
    await settled;

    expect(rateLimitCount).toBe(1);
    expect(queue.getStatus().adaptiveConcurrencyCeiling).toBe(3);
    const firstProbe = concurrencyAtStart.findIndex((value) => value > remoteLimit);
    expect(firstProbe).toBeGreaterThanOrEqual(0);
    expect(concurrencyAtStart.slice(firstProbe + 1).every((value) => value <= remoteLimit)).toBe(true);
  });

  test('日志 observer 抛错时请求 Promise 仍会按原始 429 settle', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);

    const queue = new TTSQueueManager({
      maxConcurrent: 1,
      rateLimitRetries: 0,
      onRateLimit: () => {
        throw new Error('observer failed');
      },
    });
    const job = queue.enqueue(() => {
      const error = new Error('rate limited');
      error.retryAfterMs = 100;
      throw error;
    });
    const expectation = expect(job).rejects.toThrow('rate limited');

    await jest.advanceTimersByTimeAsync(0);
    await expectation;
    expect(queue.getStatus().active).toBe(0);
  });

  test('持久化记账失败时拒绝任务并归还 active 槽位', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);

    const failingStore = {
      clearScope: jest.fn(),
      getBackoffUntil: jest.fn(() => 0),
      getState: jest.fn(() => ({
        adaptiveConcurrencyLimit: 0,
        adaptiveConcurrencyCeiling: 0,
        lastRateLimitAtMs: 0,
        circuitUntilMs: 0,
        circuitReason: '',
      })),
      getWindow: jest.fn(() => []),
      prune: jest.fn(),
      recordStart: jest.fn(() => {
        throw new Error('ledger unavailable');
      }),
    };
    const queue = new TTSQueueManager({
      maxConcurrent: 1,
      usageStore: failingStore,
      usageScope: 'failing-ledger',
    });
    const requestFn = jest.fn();
    const job = queue.enqueue(requestFn);
    const expectation = expect(job).rejects.toThrow('ledger unavailable');

    await jest.advanceTimersByTimeAsync(0);
    await expectation;
    expect(requestFn).not.toHaveBeenCalled();
    expect(queue.activeCount).toBe(0);
    expect(queue.activeCost).toBe(0);
  });

  test('未成功记账的请求不会污染其他在途任务的并发峰值', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);

    let recordCalls = 0;
    const partiallyFailingStore = {
      getBackoffUntil: jest.fn(() => 0),
      getState: jest.fn(() => ({
        adaptiveConcurrencyLimit: 0,
        adaptiveConcurrencyCeiling: 0,
        lastRateLimitAtMs: 0,
        circuitUntilMs: 0,
        circuitReason: '',
      })),
      getWindow: jest.fn(() => []),
      prune: jest.fn(),
      recordStart: jest.fn(() => {
        recordCalls += 1;
        if (recordCalls === 2) throw new Error('ledger unavailable');
      }),
    };
    const queue = new TTSQueueManager({
      rpmLimit: 60,
      maxConcurrent: 2,
      initialConcurrent: 2,
      startBurstLimit: 2,
      rateLimitRetries: 0,
      usageStore: partiallyFailingStore,
      usageScope: 'partially-failing-ledger',
      onRateLimit: () => {},
      onConcurrencyChange: () => {},
    });
    const delayedRateLimit = queue.enqueue(() => new Promise((resolve, reject) => {
      setTimeout(() => {
        const error = new Error('rate limited');
        error.isRateLimit = true;
        error.retryAfterMs = 100;
        error.retryable = true;
        reject(error);
      }, 20);
    }));
    const rejectedBeforeRequest = queue.enqueue(jest.fn());

    const settled = Promise.allSettled([delayedRateLimit, rejectedBeforeRequest]);
    await jest.runAllTimersAsync();
    await settled;

    expect(queue.getStatus().effectiveMaxConcurrent).toBe(2);
    expect(queue.getStatus().adaptiveConcurrencyCeiling).toBe(0);
  });

  test('超过 MiMo 10 MB 上限的 clone payload 在入队前被拒绝', async () => {
    const voiceClone = `data:audio/wav;base64,${'A'.repeat(10 * 1024 * 1024)}`;
    const requestFn = jest.fn();
    const queue = new TTSQueueManager();

    await expect(queue.enqueueTts({ voiceType: 'clone', voiceClone, text: '测试' }, requestFn))
      .rejects.toThrow('不能超过 10 MB');
    expect(requestFn).not.toHaveBeenCalled();
  });

  test('服务端 Retry-After 大于本地退避上限时仍作为最短等待', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);

    const queue = new TTSQueueManager({
      rpmLimit: 60,
      maxConcurrent: 1,
      rateLimitRetries: 1,
      maxRateLimitBackoffMs: 120000,
    });
    let attempts = 0;
    const job = queue.enqueue(() => {
      attempts += 1;
      if (attempts === 1) {
        const error = new Error('rate limited');
        error.retryAfterMs = 300000;
        throw error;
      }
      return 'done';
    });

    await jest.advanceTimersByTimeAsync(299999);
    expect(attempts).toBe(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(attempts).toBe(2);
    await expect(job).resolves.toBe('done');
  });

  test('套餐额度型 429 打开熔断并拒绝后续任务，不重复请求远端', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);

    const queue = new TTSQueueManager({
      maxConcurrent: 1,
      rateLimitRetries: 2,
      usageStore: rateLimitStore,
      usageScope: 'test-mimo-tts-circuit',
    });
    let calls = 0;
    const first = queue.enqueue(() => {
      calls += 1;
      const error = new Error('quota exhausted');
      error.isRateLimit = true;
      error.retryAfterMs = 15000;
      error.retryable = false;
      error.rateLimitReason = 'quota';
      throw error;
    });
    const firstExpectation = expect(first).rejects.toThrow('quota exhausted');
    const second = queue.enqueue(() => {
      calls += 1;
      return 'unexpected';
    });
    const secondExpectation = expect(second).rejects.toThrow('套餐额度不足');

    await jest.advanceTimersByTimeAsync(0);
    await Promise.all([firstExpectation, secondExpectation]);
    await expect(queue.enqueue(() => {
      calls += 1;
    })).rejects.toThrow('套餐额度不足');
    expect(calls).toBe(1);
  });

  test('清理过期熔断遇到更新熔断时重读状态并不放行请求', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(10000);

    let state = {
      adaptiveConcurrencyLimit: 0,
      adaptiveConcurrencyCeiling: 0,
      lastRateLimitAtMs: 0,
      circuitUntilMs: 5000,
      circuitReason: 'quota',
    };
    const racingStore = {
      getState: jest.fn(() => ({ ...state })),
      setCircuit: jest.fn(({ circuitUntilMs }) => {
        if (circuitUntilMs === 0) {
          state = { ...state, circuitUntilMs: 20000, circuitReason: 'quota' };
          return false;
        }
        return true;
      }),
    };
    const requestFn = jest.fn();
    const queue = new TTSQueueManager({
      usageStore: racingStore,
      usageScope: 'racing-circuit',
    });

    await expect(queue.enqueue(requestFn)).rejects.toThrow('套餐额度不足');
    expect(requestFn).not.toHaveBeenCalled();
    expect(racingStore.getState).toHaveBeenCalledTimes(3);
  });

  test('环境变量可以显式关闭 429 重试', () => {
    const previous = process.env.MIMO_TTS_RATE_LIMIT_RETRIES;
    process.env.MIMO_TTS_RATE_LIMIT_RETRIES = '0';
    try {
      const queue = new TTSQueueManager();
      expect(queue.getStatus().rateLimitRetries).toBe(0);
    } finally {
      if (previous === undefined) delete process.env.MIMO_TTS_RATE_LIMIT_RETRIES;
      else process.env.MIMO_TTS_RATE_LIMIT_RETRIES = previous;
    }
  });

  test('未来时间戳不会污染当前持久化限速窗口', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    rateLimitStore.recordStart({
      scope: 'test-mimo-tts',
      startedAtMs: 60 * 60 * 1000,
      requestCost: 1,
      tokenCost: 1,
    });
    const queue = new TTSQueueManager({
      rpmLimit: 60,
      maxConcurrent: 1,
      usageStore: rateLimitStore,
      usageScope: 'test-mimo-tts',
    });
    const starts = [];
    const job = queue.enqueue(() => {
      starts.push(Date.now());
      return 'done';
    });

    await jest.advanceTimersByTimeAsync(0);
    expect(starts).toEqual([0]);
    await expect(job).resolves.toBe('done');
  });

  test('clear 后在途任务的 429 不会重新污染已清空队列', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);

    const queue = new TTSQueueManager({ maxConcurrent: 1, rateLimitRetries: 1 });
    let rejectRequest;
    const job = queue.enqueue(() => new Promise((resolve, reject) => {
      rejectRequest = reject;
    }));
    const expectation = expect(job).rejects.toThrow('rate limited');

    await jest.advanceTimersByTimeAsync(0);
    queue.clear();
    const error = new Error('rate limited');
    error.retryAfterMs = 5000;
    rejectRequest(error);
    await expectation;
    await jest.advanceTimersByTimeAsync(5000);
    expect(queue.getQueueLength()).toBe(0);
  });
});
