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

    logger.error({ err: new Error('连接失败'), hasTaskId: true, taskIdLength: 6 }, 'SSE 连接错误');

    expect(console.error).toHaveBeenCalled();
    const call = vi.mocked(console.error).mock.calls[0];
    expect(JSON.stringify(call)).toContain('sse-client');
    expect(JSON.stringify(call)).toContain('SSE 连接错误');
    expect(JSON.stringify(call)).toContain('taskIdLength');
    const errorDetails = call[0]?.err;
    expect(call[0]).toMatchObject({
      err: {
        type: 'Error',
        stack: expect.stringContaining('连接失败'),
      },
    });
    expect(JSON.stringify(errorDetails)).toMatch(/"(message|msg)":"连接失败"/);
  });

  test('toLogError strips enumerable request metadata before logging', async () => {
    const { createScopedLogger, toLogError } = await import('./logger');
    const logger = createScopedLogger('api-client');
    const error = new Error('上传失败') as Error & Record<string, unknown>;
    error.config = {
      headers: { 'api-key': 'secret-key' },
      data: 'data:audio/wav;base64,SECRET_AUDIO',
    };
    error.request = { body: 'secret body' };
    error.response = {
      headers: { authorization: 'Bearer secret' },
      data: 'user content secret',
    };

    logger.error({ err: toLogError(error) }, 'Sanitized frontend error');

    expect(console.error).toHaveBeenCalled();
    const call = vi.mocked(console.error).mock.calls[0];
    const serialized = JSON.stringify(call);
    expect(serialized).toContain('上传失败');
    expect(call[0]).toMatchObject({
      err: {
        stack: expect.stringContaining('上传失败'),
      },
    });
    expect(serialized).not.toContain('config');
    expect(serialized).not.toContain('request');
    expect(serialized).not.toContain('response');
    expect(serialized).not.toContain('api-key');
    expect(serialized).not.toContain('secret-key');
    expect(serialized).not.toContain('authorization');
    expect(serialized).not.toContain('Bearer secret');
    expect(serialized).not.toContain('data:audio/wav;base64,SECRET_AUDIO');
    expect(serialized).not.toContain('SECRET_AUDIO');
    expect(serialized).not.toContain('secret body');
    expect(serialized).not.toContain('user content secret');
  });

  test('前端 logger 不写入浏览器存储', async () => {
    const { createScopedLogger } = await import('./logger');
    const logger = createScopedLogger('settings-slice');

    logger.warn({ field: 'llm_model' }, '设置保存失败');

    expect(window.localStorage.setItem).not.toHaveBeenCalled();
  });
});
