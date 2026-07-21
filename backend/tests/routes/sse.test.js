const mockSseManager = {
  addClient: jest.fn(),
  clearReplay: jest.fn(),
  replayTerminal: jest.fn(),
  removeClient: jest.fn(),
};

jest.mock('../../src/services/sseManager', () => mockSseManager);

const router = require('../../src/routes/sse');

function getRouteHandler() {
  const layer = router.stack.find((item) => item.route?.path === '/:taskId');
  return layer.route.stack[0].handle;
}

function invokeRoute(query = {}) {
  const req = {
    params: { taskId: 'task-1' },
    query,
    on: jest.fn(),
  };
  const res = {
    writeHead: jest.fn(),
    write: jest.fn(),
    on: jest.fn(),
  };
  getRouteHandler()(req, res);
  return { req, res };
}

describe('SSE route terminal replay', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('唯一 taskId 首连也尝试回放，覆盖任务先于连接完成的竞态', () => {
    const { res } = invokeRoute();

    expect(mockSseManager.clearReplay).not.toHaveBeenCalled();
    expect(mockSseManager.addClient).toHaveBeenCalledWith('task-1', res);
    expect(mockSseManager.replayTerminal).toHaveBeenCalledWith('task-1', res);
  });

  test('重连订阅同样尝试回放 terminal', () => {
    const { res } = invokeRoute({ reconnect: '1' });

    expect(mockSseManager.addClient).toHaveBeenCalledWith('task-1', res);
    expect(mockSseManager.replayTerminal).toHaveBeenCalledWith('task-1', res);
  });
});
