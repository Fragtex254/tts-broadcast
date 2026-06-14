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

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, NODE_ENV: 'test' };
  });

  afterEach(() => {
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

  test('NODE_ENV=test 默认不创建真实 backend/logs 目录', () => {
    fs.rmSync(realLogDir, { recursive: true, force: true });
    const { createScopedLogger, DEFAULT_LOG_DIR } = require('../../src/services/logger');

    const logger = createScopedLogger('test-scope');
    logger.info('测试日志');

    expect(fs.existsSync(DEFAULT_LOG_DIR)).toBe(false);
  });

  test('getLogFilePath 默认不读取 LOG_DIR 环境变量', () => {
    const envLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-env-logs-'));
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

  test('传入 logDir 和 writeFiles 时写入当天 JSONL 文件', () => {
    const { createScopedLogger, getLogFilePath } = require('../../src/services/logger');
    const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-logs-'));
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
