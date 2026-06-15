// SSE 客户端封装
// 提供类型安全的 SSE 连接管理
import { createScopedLogger, toLogError } from './logger';

const logger = createScopedLogger('sse-client');

export interface SSEProgressEvent {
  segmentId?: number;
  status?: 'generating' | 'generated' | 'failed';
  audioPath?: string;
  error?: string;
  current?: number;
  total?: number;
  text?: string;
  chunkText?: string;
  phase?: 'preparing' | 'transcribing';
  percent?: number;
  timestamp?: number;
}

export interface SSESegment {
  id: number;
  broadcast_id: number;
  index: number;
  text: string;
  audio_path: string | null;
  status: 'pending' | 'generating' | 'generated' | 'failed';
  style_tag: string;
  created_at: string;
  updated_at: string;
}

export interface SSEResult {
  id: number;
  status: 'pending' | 'generating' | 'generated' | 'failed';
  error?: string;
}

export interface SSECompleteEvent {
  segments?: SSESegment[];
  results?: SSEResult[];
  phase?: 'completed';
  percent?: number;
  text?: string;
  usage?: Record<string, unknown> | null;
  timestamp: number;
}

export interface SSEErrorEvent {
  error: string;
}

export type SSEEventHandler<T = unknown> = (data: T) => void;

export class SSEClient {
  private eventSource: EventSource | null = null;
  private taskId: string;
  private handlers: Map<string, Set<SSEEventHandler<unknown>>> = new Map();

  constructor(taskId: string) {
    this.taskId = taskId;
  }

  /**
   * 建立 SSE 连接
   */
  connect(): void {
    if (this.eventSource) {
      this.close();
    }

    this.eventSource = new EventSource(`/api/sse/${this.taskId}`);

    // 连接成功事件
    this.eventSource.addEventListener('connected', () => {
      logger.info(
        { hasTaskId: Boolean(this.taskId), taskIdLength: this.taskId.length },
        'SSE 连接成功'
      );
    });

    // 进度事件
    this.eventSource.addEventListener('progress', (event) => {
      const data = JSON.parse(event.data) as SSEProgressEvent;
      this.emit('progress', data);
    });

    // 完成事件
    this.eventSource.addEventListener('complete', (event) => {
      const data = JSON.parse(event.data) as SSECompleteEvent;
      this.emit('complete', data);
    });

    // 错误事件
    this.eventSource.addEventListener('error', (event) => {
      if (event instanceof MessageEvent) {
        const data = JSON.parse(event.data) as SSEErrorEvent;
        this.emit('error', data);
      } else {
        // EventSource 连接错误
        this.emit('error', { error: 'SSE 连接错误' });
      }
    });

    // 默认错误处理（连接断开）
    this.eventSource.onerror = (error) => {
      logger.error(
        {
          eventType: error.type,
          hasTaskId: Boolean(this.taskId),
          taskIdLength: this.taskId.length,
        },
        'SSE 连接错误'
      );
    };
  }

  /**
   * 注册事件处理器
   */
  on<T = unknown>(eventType: string, handler: SSEEventHandler<T>): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler as SSEEventHandler<unknown>);
  }

  /**
   * 移除事件处理器
   */
  off<T = unknown>(eventType: string, handler: SSEEventHandler<T>): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      handlers.delete(handler as SSEEventHandler<unknown>);
    }
  }

  /**
   * 触发事件
   */
  private emit(eventType: string, data: unknown): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (error) {
          logger.error({ err: toLogError(error), eventType }, 'SSE 事件处理错误');
        }
      }
    }
  }

  /**
   * 关闭 SSE 连接
   */
  close(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.handlers.clear();
  }

  /**
   * 获取任务 ID
   */
  getTaskId(): string {
    return this.taskId;
  }
}

/**
 * 创建 SSE 客户端实例
 */
export function createSSEClient(taskId: string): SSEClient {
  return new SSEClient(taskId);
}
