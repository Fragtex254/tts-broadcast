const mockLogger = {
  error: jest.fn(),
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
});
