import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

describe('frontend logger', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('createScopedLogger 输出 scope 和消息到 console', async () => {
    const { createScopedLogger } = await import('./logger');
    const logger = createScopedLogger('api');

    logger.info({ status: 200 }, '请求成功');

    expect(console.info).toHaveBeenCalled();
    const call = vi.mocked(console.info).mock.calls[0];
    expect(JSON.stringify(call)).toContain('api');
    expect(JSON.stringify(call)).toContain('请求成功');
    expect(JSON.stringify(call)).toContain('200');
  });

  test('日志对象包含 ISO 格式 time 字段', async () => {
    const { createScopedLogger } = await import('./logger');
    const logger = createScopedLogger('api');

    logger.info({ status: 200 }, '请求成功');

    expect(console.info).toHaveBeenCalled();
    const call = vi.mocked(console.info).mock.calls[0];
    expect(call[0]).toMatchObject({
      time: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
    });
  });

  test('error 日志可以携带错误对象', async () => {
    const { createScopedLogger } = await import('./logger');
    const logger = createScopedLogger('sse-client');

    logger.error({ err: new Error('连接失败'), taskId: 'task-1' }, 'SSE 连接错误');

    expect(console.error).toHaveBeenCalled();
    const call = vi.mocked(console.error).mock.calls[0];
    expect(JSON.stringify(call)).toContain('sse-client');
    expect(JSON.stringify(call)).toContain('SSE 连接错误');
    expect(JSON.stringify(call)).toContain('task-1');
  });

  test('前端 logger 不写入浏览器存储', async () => {
    const { createScopedLogger } = await import('./logger');
    const logger = createScopedLogger('settings-slice');

    logger.warn({ field: 'llm_model' }, '设置保存失败');

    expect(window.localStorage.setItem).not.toHaveBeenCalled();
  });
});
