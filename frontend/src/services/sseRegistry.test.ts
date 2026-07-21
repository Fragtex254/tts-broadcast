import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSSEClient } from './sseClient';
import { closeAll, get, reconnect, size } from './sseRegistry';

describe('sseRegistry', () => {
  afterEach(() => {
    closeAll();
  });

  it('客户端创建即注册，close 时按实例身份注销', () => {
    const client = createSSEClient('registered-task');

    expect(get('registered-task')).toBe(client);
    expect(size()).toBe(1);

    client.close();
    expect(get('registered-task')).toBeUndefined();
    expect(size()).toBe(0);
  });

  it('同 taskId 新实例安全替换并关闭旧实例', () => {
    const first = createSSEClient('same-task');
    const closeFirst = vi.spyOn(first, 'close');
    const second = createSSEClient('same-task', 'summary');

    expect(closeFirst).toHaveBeenCalledOnce();
    expect(get('same-task')).toBe(second);
    expect(size()).toBe(1);

    first.close();
    expect(get('same-task')).toBe(second);
  });

  it('closeAll 关闭所有实例并清空注册表', () => {
    const first = createSSEClient('task-1');
    const second = createSSEClient('task-2');
    const closeFirst = vi.spyOn(first, 'close');
    const closeSecond = vi.spyOn(second, 'close');

    closeAll();

    expect(closeFirst).toHaveBeenCalledOnce();
    expect(closeSecond).toHaveBeenCalledOnce();
    expect(size()).toBe(0);
    expect(get('task-1')).toBeUndefined();
    expect(get('task-2')).toBeUndefined();
  });

  it('按原 taskId 恢复连接，不存在时不创建新任务', () => {
    const client = createSSEClient('retry-task');
    const connect = vi.spyOn(client, 'connect').mockImplementation(() => undefined);

    expect(reconnect('retry-task')).toBe(true);
    expect(connect).toHaveBeenCalledOnce();
    expect(reconnect('missing-task')).toBe(false);
    expect(size()).toBe(1);
  });
});
