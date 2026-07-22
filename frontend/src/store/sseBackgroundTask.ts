import type { SSEClient } from '../services/sseClient';
import type { StoreGet } from './storeTypes';

interface SSETransportState {
  state: 'connected' | 'reconnecting' | 'connection_lost';
  attempt: number;
}

/** 将 SSE 传输状态投影到可序列化的后台任务快照。 */
export function bindBackgroundTaskTransport(
  client: SSEClient,
  taskId: string,
  get: StoreGet,
  onConnectionLost?: () => void,
): void {
  client.on<SSETransportState>('transport-state', (event) => {
    if (event.state === 'connected') {
      get().updateBackgroundTask(taskId, { status: 'running', retryAttempt: 0 });
      return;
    }

    if (event.state === 'reconnecting') {
      get().updateBackgroundTask(taskId, {
        status: 'reconnecting',
        retryAttempt: event.attempt,
        message: `连接中断，正在第 ${event.attempt} 次重连`,
      });
      return;
    }

    get().markBackgroundTaskConnectionLost(taskId, '连接中断，可返回任务页重试');
    onConnectionLost?.();
  });
}
