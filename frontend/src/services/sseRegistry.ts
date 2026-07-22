/**
 * SSE 连接注册表。
 *
 * EventSource、重试计时器与回调等非序列化对象只保存在 service 模块，
 * 不得进入 Zustand。注册表以实例身份保护注销，避免旧连接关闭时误删替代连接。
 */
export interface SSERegistryClient {
  close(): void;
  connect(): void;
  getTaskId(): string;
}

const clients = new Map<string, SSERegistryClient>();

export function register(client: SSERegistryClient): void {
  const taskId = client.getTaskId();
  const previous = clients.get(taskId);
  if (previous === client) return;

  // 先发布新实例；旧实例 close() 的 identity-aware unregister 不会删掉新实例。
  clients.set(taskId, client);
  previous?.close();
}

export function unregister(taskId: string, client: SSERegistryClient): void {
  if (clients.get(taskId) === client) {
    clients.delete(taskId);
  }
}

export function get(taskId: string): SSERegistryClient | undefined {
  return clients.get(taskId);
}

export function size(): number {
  return clients.size;
}

/** 使用原 taskId 恢复已耗尽重试预算的连接，避免重复提交后台任务。 */
export function reconnect(taskId: string): boolean {
  const client = clients.get(taskId);
  if (!client) return false;
  client.connect();
  return true;
}

export function closeAll(): void {
  const activeClients = [...clients.values()];
  clients.clear();
  for (const client of activeClients) {
    client.close();
  }
}

export const sseRegistry = {
  register,
  unregister,
  get,
  size,
  reconnect,
  closeAll,
};
