const { EventEmitter } = require('events');
const { createProcessLifecycle } = require('../../src/services/processLifecycle');

function createFakeProcess() {
  const processRef = new EventEmitter();
  processRef.exit = jest.fn();
  processRef.exitCode = undefined;
  return processRef;
}

function createDependencies(overrides = {}) {
  const order = [];
  return {
    order,
    scheduler: {
      shutdown: jest.fn(() => { order.push('scheduler'); }),
    },
    sseManager: {
      closeAll: jest.fn(() => { order.push('sse'); }),
    },
    server: {
      close: jest.fn((callback) => {
        order.push('http');
        callback();
      }),
    },
    db: {
      open: true,
      close: jest.fn(() => { order.push('database'); }),
    },
    logger: {
      info: jest.fn(),
      error: jest.fn(),
    },
    ...overrides,
  };
}

describe('进程生命周期管理器', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test.each(['SIGTERM', 'SIGINT'])('%s 按顺序关闭调度器、SSE、HTTP 与数据库', async (signal) => {
    const processRef = createFakeProcess();
    const dependencies = createDependencies();
    const lifecycle = createProcessLifecycle({ processRef, ...dependencies });
    lifecycle.register();

    processRef.emit(signal);
    await lifecycle.shutdown(signal);

    expect(dependencies.order).toEqual(['scheduler', 'sse', 'http', 'database']);
    expect(processRef.exitCode).toBe(0);
    expect(processRef.exit).not.toHaveBeenCalled();
    lifecycle.unregister();
  });

  test('unhandledRejection 记录结构化错误但不退出', () => {
    const processRef = createFakeProcess();
    const dependencies = createDependencies();
    const lifecycle = createProcessLifecycle({ processRef, ...dependencies });
    lifecycle.register();

    processRef.emit('unhandledRejection', '异步失败');

    expect(dependencies.logger.error).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      '未处理的 Promise 拒绝'
    );
    expect(processRef.exit).not.toHaveBeenCalled();
    lifecycle.unregister();
  });

  test('uncaughtException 记录后以非零码退出', () => {
    const processRef = createFakeProcess();
    const dependencies = createDependencies();
    const lifecycle = createProcessLifecycle({ processRef, ...dependencies });
    lifecycle.register();
    const error = new Error('同步崩溃');

    processRef.emit('uncaughtException', error);

    expect(dependencies.logger.error).toHaveBeenCalledWith(
      { err: error },
      '未捕获的进程异常'
    );
    expect(processRef.exit).toHaveBeenCalledWith(1);
    lifecycle.unregister();
  });

  test('HTTP server 未在五秒内关闭时强制退出', async () => {
    jest.useFakeTimers();
    const processRef = createFakeProcess();
    const dependencies = createDependencies({
      server: { close: jest.fn() },
    });
    const lifecycle = createProcessLifecycle({ processRef, ...dependencies });
    lifecycle.register();

    processRef.emit('SIGTERM');
    await Promise.resolve();
    jest.advanceTimersByTime(5000);

    expect(processRef.exit).toHaveBeenCalledWith(1);
    lifecycle.unregister();
  });

  test('单个关闭步骤失败时继续后续步骤并设置非零退出码', async () => {
    const processRef = createFakeProcess();
    const dependencies = createDependencies();
    dependencies.scheduler.shutdown.mockImplementation(() => {
      dependencies.order.push('scheduler');
      throw new Error('scheduler failed');
    });
    const lifecycle = createProcessLifecycle({ processRef, ...dependencies });

    await lifecycle.shutdown('SIGTERM');

    expect(dependencies.order).toEqual(['scheduler', 'sse', 'http', 'database']);
    expect(processRef.exitCode).toBe(1);
  });
});
