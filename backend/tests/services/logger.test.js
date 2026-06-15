const fs = require('fs');
const os = require('os');
const path = require('path');
const { Writable } = require('stream');

function createMemoryStream() {
  const chunks = [];
  const stream = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  return {
    stream,
    lines: () => chunks.join('').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)),
  };
}

describe('logger 服务', () => {
  const originalEnv = { ...process.env };
  const realLogDir = path.join(__dirname, '../../logs');
  let tempDirs = [];

  function createTempDir(prefix) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  }

  beforeEach(() => {
    jest.resetModules();
    jest.dontMock('pino');
    tempDirs = [];
    process.env = { ...originalEnv, NODE_ENV: 'test' };
  });

  afterEach(() => {
    tempDirs.forEach(dir => {
      fs.rmSync(dir, { recursive: true, force: true });
    });
    process.env = originalEnv;
  });

  test('createScopedLogger 写入 scope、ISO 时间和消息', () => {
    const { createScopedLogger } = require('../../src/services/logger');
    const memory = createMemoryStream();
    const now = () => new Date('2026-06-14T09:52:01.123Z');
    const logger = createScopedLogger('scheduler', { stream: memory.stream, now });

    logger.info({ count: 2 }, '已加载定时任务');

    const [line] = memory.lines();
    expect(line).toMatchObject({
      level: 30,
      time: '2026-06-14T09:52:01.123Z',
      scope: 'scheduler',
      msg: '已加载定时任务',
      count: 2,
    });
  });

  test('error 日志保留 err.message 和 err.stack', () => {
    const { createScopedLogger } = require('../../src/services/logger');
    const memory = createMemoryStream();
    const logger = createScopedLogger('broadcast-route', { stream: memory.stream });
    const error = new Error('生成失败');

    logger.error({ err: error, broadcastId: 12 }, '生成语音失败');

    const [line] = memory.lines();
    expect(line.scope).toBe('broadcast-route');
    expect(line.broadcastId).toBe(12);
    expect(line.err.message).toBe('生成失败');
    expect(line.err.stack).toContain('生成失败');
  });

  test('error 日志脱敏 Axios 请求配置和请求对象', () => {
    const { createScopedLogger } = require('../../src/services/logger');
    const memory = createMemoryStream();
    const logger = createScopedLogger('mimo-service', { stream: memory.stream });
    const error = new Error('API 调用失败');
    const secret = 'secret-api-key';
    const requestBody = '完整用户内容';
    const base64Audio = 'data:audio/wav;base64,AAAASECRETBASE64';
    const responseSecret = 'response-secret-token';
    const responseUserContent = '响应里的完整用户内容';
    const responseBase64Audio = 'data:audio/mp3;base64,RESPONSESECRETBASE64';

    error.config = {
      headers: { 'api-key': secret },
      data: { messages: [{ content: requestBody }], audio: { voice: base64Audio } },
    };
    error.request = { rawHeaders: ['api-key', secret], body: requestBody };
    error.response = {
      status: 500,
      config: {
        headers: { Authorization: `Bearer ${secret}` },
        data: { audio: base64Audio },
      },
      headers: { 'x-api-key': responseSecret },
      data: { content: responseUserContent, audio: responseBase64Audio },
      request: { body: requestBody },
    };
    error.cause = {
      config: {
        headers: { 'api-key': secret },
        data: requestBody,
      },
      response: {
        headers: { Authorization: `Bearer ${responseSecret}` },
        data: { transcript: responseUserContent, audio: responseBase64Audio },
      },
    };

    logger.error({ err: error }, '测试 API Key 失败');

    const rawLog = JSON.stringify(memory.lines()[0]);
    const [line] = memory.lines();
    expect(line.err.message).toContain('API 调用失败');
    expect(line.err.stack).toContain('API 调用失败');
    expect(line.err.config).toBe('[Redacted]');
    expect(line.err.request).toBe('[Redacted]');
    expect(line.err.response.config).toBe('[Redacted]');
    expect(line.err.response.request).toBe('[Redacted]');
    expect(line.err.response.headers).toBe('[Redacted]');
    expect(line.err.response.data).toBe('[Redacted]');
    expect(line.err.cause.response.headers).toBe('[Redacted]');
    expect(line.err.cause.response.data).toBe('[Redacted]');
    expect(rawLog).not.toContain(secret);
    expect(rawLog).not.toContain(requestBody);
    expect(rawLog).not.toContain(base64Audio);
    expect(rawLog).not.toContain(responseSecret);
    expect(rawLog).not.toContain(responseUserContent);
    expect(rawLog).not.toContain(responseBase64Audio);
  });

  test('NODE_ENV=test 默认不创建真实 backend/logs 目录', () => {
    fs.rmSync(realLogDir, { recursive: true, force: true });
    const { createScopedLogger, DEFAULT_LOG_DIR } = require('../../src/services/logger');

    const logger = createScopedLogger('test-scope', { includeConsole: false });
    logger.info('测试日志');

    expect(fs.existsSync(DEFAULT_LOG_DIR)).toBe(false);
  });

  test('getLogFilePath 默认不读取 LOG_DIR 环境变量', () => {
    const envLogDir = createTempDir('tts-env-logs-');
    process.env.LOG_DIR = envLogDir;
    const { DEFAULT_LOG_DIR, getLogFilePath } = require('../../src/services/logger');
    const now = () => new Date('2026-06-14T09:52:01.123Z');

    expect(getLogFilePath({ now })).toBe(path.join(DEFAULT_LOG_DIR, 'app-2026-06-14.log'));
  });

  test('createRootLogger 固定使用 info 级别，不读取 LOG_LEVEL 环境变量', () => {
    process.env.LOG_LEVEL = 'error';
    const { createScopedLogger } = require('../../src/services/logger');
    const memory = createMemoryStream();
    const logger = createScopedLogger('level-test', { stream: memory.stream });

    logger.info('仍然写入 info');

    const [line] = memory.lines();
    expect(line).toMatchObject({
      level: 30,
      scope: 'level-test',
      msg: '仍然写入 info',
    });
  });

  test('includeConsole 和 writeFiles 均关闭时使用本地 no-op stream', () => {
    const destination = jest.fn(() => {
      throw new Error('不应使用文件目标');
    });
    jest.doMock('pino', () => {
      const actualPino = jest.requireActual('pino');
      const mockedPino = (...args) => actualPino(...args);
      return Object.assign(mockedPino, actualPino, { destination });
    });

    const { createScopedLogger } = require('../../src/services/logger');
    const logger = createScopedLogger('noop-scope', {
      includeConsole: false,
      writeFiles: false,
    });

    expect(() => logger.info('静默日志')).not.toThrow();
    expect(destination).not.toHaveBeenCalled();
  });

  test('传入 logDir 和 writeFiles 时写入当天 JSONL 文件', () => {
    const { createScopedLogger, getLogFilePath } = require('../../src/services/logger');
    const logDir = createTempDir('tts-logs-');
    const now = () => new Date('2026-06-14T09:52:01.123Z');

    const logger = createScopedLogger('sse-manager', {
      logDir,
      now,
      writeFiles: true,
      includeConsole: false,
    });

    logger.warn({ taskId: 'task-1' }, 'SSE 推送失败');

    const logFile = getLogFilePath({ logDir, now });
    const [line] = fs.readFileSync(logFile, 'utf8').trim().split('\n').map(item => JSON.parse(item));
    expect(line).toMatchObject({
      level: 40,
      time: '2026-06-14T09:52:01.123Z',
      scope: 'sse-manager',
      msg: 'SSE 推送失败',
      taskId: 'task-1',
    });
  });
});
