const mockLogger = {
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
};

jest.mock('../../src/services/logger', () => ({
  createScopedLogger: jest.fn(() => mockLogger),
}));

describe('SSE 连接管理器', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('推送失败时不记录原始 taskId', () => {
    const sseManager = require('../../src/services/sseManager');
    const taskId = 'secret-user-controlled-task-id';
    const response = {
      on: jest.fn(),
      write: jest.fn(() => {
        throw new Error('连接已关闭');
      }),
    };

    sseManager.addClient(taskId, response);
    sseManager.send(taskId, 'progress', { percent: 50 });

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        hasTaskId: true,
        eventType: 'progress',
      }),
      'SSE 推送失败'
    );
    expect(mockLogger.error.mock.calls[0][0]).not.toHaveProperty('taskId');
  });

  test('closeAll 结束全部响应并清空连接', () => {
    const sseManager = require('../../src/services/sseManager');
    const first = { on: jest.fn(), end: jest.fn() };
    const second = { on: jest.fn(), end: jest.fn() };

    sseManager.addClient('task-a', first);
    sseManager.addClient('task-b', second);

    expect(sseManager.closeAll()).toBe(2);
    expect(first.end).toHaveBeenCalledTimes(1);
    expect(second.end).toHaveBeenCalledTimes(1);
    expect(sseManager.getConnectionCount()).toBe(0);
  });

  test('断线期间保留 terminal 事件供重连回放，首次订阅可清除旧结果', () => {
    const sseManager = require('../../src/services/sseManager');
    const response = { write: jest.fn() };

    sseManager.sendComplete('task-replay', { phase: 'completed', timestamp: 1 });

    expect(sseManager.replayTerminal('task-replay', response)).toBe(true);
    expect(response.write).toHaveBeenCalledWith(
      expect.stringContaining('event: complete')
    );

    sseManager.clearReplay('task-replay');
    expect(sseManager.replayTerminal('task-replay', response)).toBe(false);
  });
});
