import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSSEClient,
  type SSETransportErrorEvent,
  type SSETransportStateEvent,
} from './sseClient';
import { closeAll } from './sseRegistry';

type FakeListener = (event: Event) => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];

  readonly url: string;
  closed = false;
  private readonly listeners = new Map<string, Set<FakeListener>>();

  constructor(url: string | URL) {
    this.url = String(url);
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
    if (!listener) return;
    const callback: FakeListener = typeof listener === 'function'
      ? listener
      : (event) => listener.handleEvent(event);
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(callback);
  }

  close(): void {
    this.closed = true;
  }

  emitJson(type: string, payload: unknown): void {
    this.emitRaw(type, JSON.stringify(payload));
  }

  emitRaw(type: string, data: string): void {
    this.dispatch(type, new MessageEvent(type, { data }));
  }

  emitTransportError(): void {
    this.dispatch('error', new Event('error'));
  }

  private dispatch(type: string, event: Event): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }
}

function latestSource(): FakeEventSource {
  const source = FakeEventSource.instances.at(-1);
  if (!source) throw new Error('Expected an EventSource instance');
  return source;
}

describe('SSEClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
  });

  afterEach(() => {
    closeAll();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('编码 taskId，并只派发通过所选协议校验的事件', () => {
    const progress = vi.fn<(event: Record<string, unknown>) => void>();
    const states = vi.fn<(event: SSETransportStateEvent) => void>();
    const client = createSSEClient('task/with spaces?', 'transcribe');
    client.on('progress', progress);
    client.on('transport-state', states);
    client.connect();

    const source = latestSource();
    expect(source.url).toBe('/api/sse/task%2Fwith%20spaces%3F');

    source.emitJson('connected', {
      taskId: 'task/with spaces?',
      timestamp: 1,
      futureField: 'compatible',
    });
    source.emitJson('progress', {
      phase: 'transcribing',
      percent: 50,
      current: 1,
      total: 2,
      text: '稳定文本',
      timestamp: 2,
      futureField: 'preserved',
    });

    expect(states).toHaveBeenCalledWith({ state: 'connected', attempt: 0 });
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'transcribing',
      futureField: 'preserved',
    }));
  });

  it('丢弃坏 JSON、schema 不匹配与 taskId 不匹配的 connected', () => {
    const progress = vi.fn();
    const connected = vi.fn();
    const states = vi.fn();
    const client = createSSEClient('task-valid', 'transcribe');
    client.on('progress', progress);
    client.on('connected', connected);
    client.on('transport-state', states);
    client.connect();

    const source = latestSource();
    source.emitRaw('progress', '{broken-json');
    source.emitJson('progress', {
      phase: 'transcribing',
      percent: '50',
      timestamp: 2,
    });
    source.emitJson('connected', { taskId: 'another-task', timestamp: 3 });

    expect(progress).not.toHaveBeenCalled();
    expect(connected).not.toHaveBeenCalled();
    expect(states).not.toHaveBeenCalled();
  });

  it('服务端业务 error 只派发业务错误，不触发传输重连', () => {
    const businessError = vi.fn();
    const transportError = vi.fn();
    const client = createSSEClient('segment-1', 'segment');
    client.on('error', businessError);
    client.on('transport-error', transportError);
    client.connect();

    const source = latestSource();
    source.emitJson('error', { error: '生成失败' });
    vi.advanceTimersByTime(10_000);

    expect(businessError).toHaveBeenCalledWith({ error: '生成失败' });
    expect(transportError).not.toHaveBeenCalled();
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(source.closed).toBe(false);
  });

  it('传输断开按 1/2/4 秒重建，三次失败后停止且旧代际不能回写', () => {
    const progress = vi.fn();
    const states = vi.fn<(event: SSETransportStateEvent) => void>();
    const transportError = vi.fn<(event: SSETransportErrorEvent) => void>();
    const client = createSSEClient('segment-2', 'segment');
    client.on('progress', progress);
    client.on('transport-state', states);
    client.on('transport-error', transportError);
    client.connect();

    const first = latestSource();
    expect(first.url).toBe('/api/sse/segment-2');
    first.emitTransportError();
    expect(first.closed).toBe(true);
    expect(states).toHaveBeenLastCalledWith({ state: 'reconnecting', attempt: 1 });
    vi.advanceTimersByTime(999);
    expect(FakeEventSource.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(latestSource().url).toBe('/api/sse/segment-2?reconnect=1');

    first.emitJson('progress', {
      segmentId: 1,
      status: 'generated',
      current: 1,
      total: 1,
      audioPath: '/stale.wav',
    });
    expect(progress).not.toHaveBeenCalled();

    const second = latestSource();
    second.emitTransportError();
    expect(states).toHaveBeenLastCalledWith({ state: 'reconnecting', attempt: 2 });
    vi.advanceTimersByTime(1999);
    expect(FakeEventSource.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeEventSource.instances).toHaveLength(3);

    const third = latestSource();
    third.emitTransportError();
    expect(states).toHaveBeenLastCalledWith({ state: 'reconnecting', attempt: 3 });
    vi.advanceTimersByTime(3999);
    expect(FakeEventSource.instances).toHaveLength(3);
    vi.advanceTimersByTime(1);
    expect(FakeEventSource.instances).toHaveLength(4);

    latestSource().emitTransportError();
    expect(states).toHaveBeenLastCalledWith({ state: 'connection_lost', attempt: 3 });
    expect(transportError).toHaveBeenCalledWith({
      error: 'SSE 连接已断开，重试次数已耗尽',
      attempts: 3,
    });
    vi.advanceTimersByTime(20_000);
    expect(FakeEventSource.instances).toHaveLength(4);
  });

  it('仅 connected 握手不会清零连续断线预算', () => {
    const states = vi.fn<(event: SSETransportStateEvent) => void>();
    const client = createSSEClient('flapping-task', 'segment');
    client.on('transport-state', states);
    client.connect();

    for (const delay of [1000, 2000, 4000]) {
      const source = latestSource();
      source.emitJson('connected', { taskId: 'flapping-task', timestamp: 1 });
      source.emitTransportError();
      vi.advanceTimersByTime(delay);
    }

    const fourth = latestSource();
    fourth.emitJson('connected', { taskId: 'flapping-task', timestamp: 2 });
    fourth.emitTransportError();

    expect(states).toHaveBeenLastCalledWith({ state: 'connection_lost', attempt: 3 });
    expect(FakeEventSource.instances).toHaveLength(4);
  });

  it('close 幂等关闭原生连接、取消待执行重试并清空 handlers', () => {
    const progress = vi.fn();
    const client = createSSEClient('close-task', 'segment');
    client.on('progress', progress);
    client.connect();

    const source = latestSource();
    source.emitTransportError();
    client.close();
    client.close();
    vi.advanceTimersByTime(10_000);
    source.emitJson('progress', {
      segmentId: 1,
      status: 'generated',
      current: 1,
      total: 1,
    });

    expect(source.closed).toBe(true);
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(progress).not.toHaveBeenCalled();
  });
});
