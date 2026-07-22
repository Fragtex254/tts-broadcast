// SSE 客户端封装
// 提供经过 Zod 协议校验、带边界重试的连接管理。
import type { TranscriptionRecord, TranscriptClaim, TranscriptDetail } from '../store/types';
import { createScopedLogger, toLogError } from './logger';
import {
  SSEConnectedEventSchema,
  SSE_PROTOCOL_SCHEMAS,
  type SSEEventSchemaMap,
  type SSEProtocol,
} from './schemas';
import { register, unregister } from './sseRegistry';

const logger = createScopedLogger('sse-client');

export const SSE_RETRY_DELAYS_MS = [1000, 2000, 4000] as const;

/** 兼容旧调用点的进度事件类型；运行时以所选协议的 Zod schema 为准。 */
export interface SSEProgressEvent {
  segmentId?: number;
  status?: 'pending' | 'generating' | 'generated' | 'failed';
  audioPath?: string;
  error?: string;
  discarded?: boolean;
  current?: number;
  total?: number;
  index?: number;
  fileName?: string;
  filePercent?: number;
  text?: string;
  chunkText?: string;
  chunks?: Array<{ index: number; text: string }>;
  phase?:
    | 'preparing'
    | 'transcribing'
    | 'batch-preparing'
    | 'file-start'
    | 'file-progress'
    | 'file-complete'
    | 'file-error'
    | 'summarizing-batches'
    | 'synthesizing'
    | 'analyzing-claims'
    | 'embedding-claims'
    | 'completed';
  percent?: number;
  message?: string;
  usage?: Record<string, unknown> | null;
  resultId?: number;
  transcriptionResult?: TranscriptionRecord;
  transcriptionId?: number;
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
  playback_rate: number;
  error_message: string;
  created_at: string;
  updated_at: string;
}

export interface SSEResult {
  id: number;
  status: 'generated' | 'failed' | 'stale';
  error?: string;
}

export interface SSECompleteEvent {
  segments?: SSESegment[];
  results?: SSEResult[];
  phase?: 'completed' | 'summary-completed' | 'claims-completed';
  percent?: number;
  text?: string;
  usage?: Record<string, unknown> | null;
  transcriptionResult?: TranscriptionRecord;
  transcript?: TranscriptDetail;
  claims?: TranscriptClaim[];
  transcriptionId?: number;
  timestamp: number;
}

export interface SSEErrorEvent {
  error: string;
}

export interface SSETransportStateEvent {
  state: 'connected' | 'reconnecting' | 'connection_lost';
  attempt: number;
}

export interface SSETransportErrorEvent {
  error: string;
  attempts: number;
}

export type SSEEventHandler<T = unknown> = (data: T) => void;

function isMessageEvent(event: Event): event is MessageEvent<string> {
  return 'data' in event && typeof event.data === 'string';
}

export class SSEClient {
  private eventSource: EventSource | null = null;
  private readonly taskId: string;
  private readonly protocol: SSEProtocol;
  private readonly schemas: SSEEventSchemaMap;
  private readonly handlers: Map<string, Set<SSEEventHandler<unknown>>> = new Map();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryAttempt = 0;
  private sourceGeneration = 0;
  private started = false;
  private closed = false;

  constructor(taskId: string, protocol: SSEProtocol = 'generic') {
    this.taskId = taskId;
    this.protocol = protocol;
    this.schemas = SSE_PROTOCOL_SCHEMAS[protocol];
    register(this);
  }

  /** 建立 SSE 连接；同一实例重复调用是幂等的。 */
  connect(): void {
    if (this.closed || this.started) return;
    this.started = true;
    this.retryAttempt = 0;
    this.openConnection();
  }

  /** 注册事件处理器。 */
  on<T = unknown>(eventType: string, handler: SSEEventHandler<T>): void {
    if (this.closed) return;
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler as SSEEventHandler<unknown>);
  }

  /** 移除事件处理器。 */
  off<T = unknown>(eventType: string, handler: SSEEventHandler<T>): void {
    this.handlers.get(eventType)?.delete(handler as SSEEventHandler<unknown>);
  }

  /** 关闭连接并取消重试；可安全重复调用。 */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.started = false;
    this.sourceGeneration += 1;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.closeNativeSource();
    this.handlers.clear();
    unregister(this.taskId, this);
  }

  getTaskId(): string {
    return this.taskId;
  }

  getProtocol(): SSEProtocol {
    return this.protocol;
  }

  private openConnection(): void {
    if (this.closed) return;
    const generation = ++this.sourceGeneration;
    let source: EventSource;
    try {
      const connectionQuery = this.retryAttempt > 0 ? '?reconnect=1' : '';
      source = new EventSource(`/api/sse/${encodeURIComponent(this.taskId)}${connectionQuery}`);
    } catch (error) {
      logger.error(
        { err: toLogError(error), protocol: this.protocol },
        '创建 SSE 连接失败'
      );
      this.handleTransportDisconnect(generation);
      return;
    }

    if (this.closed || generation !== this.sourceGeneration) {
      source.close();
      return;
    }
    this.eventSource = source;

    for (const eventType of Object.keys(this.schemas)) {
      source.addEventListener(eventType, (event) => {
        if (eventType === 'error' && !isMessageEvent(event)) {
          this.handleTransportDisconnect(generation);
          return;
        }
        this.handleProtocolEvent(generation, eventType, event);
      });
    }
  }

  private handleProtocolEvent(generation: number, eventType: string, event: Event): void {
    if (this.closed || generation !== this.sourceGeneration) return;
    if (!isMessageEvent(event)) {
      logger.warn({ eventType, protocol: this.protocol }, '忽略非消息类型的 SSE 业务事件');
      return;
    }

    let rawData: unknown;
    try {
      rawData = JSON.parse(event.data);
    } catch (error) {
      logger.warn(
        { err: toLogError(error), eventType, protocol: this.protocol },
        '忽略无法解析的 SSE JSON'
      );
      return;
    }

    const schema = this.schemas[eventType];
    const parsed = schema?.safeParse(rawData);
    if (!parsed?.success) {
      logger.warn(
        {
          eventType,
          protocol: this.protocol,
          validationIssues: parsed?.error.issues.map((issue) => ({
            code: issue.code,
            path: issue.path.join('.'),
          })),
        },
        '忽略未通过协议校验的 SSE 事件'
      );
      return;
    }

    if (eventType === 'connected') {
      const connected = SSEConnectedEventSchema.safeParse(parsed.data);
      if (!connected.success || connected.data.taskId !== this.taskId) {
        logger.warn({ protocol: this.protocol }, '忽略 taskId 不匹配的 SSE connected 事件');
        return;
      }
      logger.info(
        { hasTaskId: Boolean(this.taskId), taskIdLength: this.taskId.length, protocol: this.protocol },
        'SSE 连接成功'
      );
      this.emit('connected', connected.data);
      this.emit<SSETransportStateEvent>('transport-state', { state: 'connected', attempt: 0 });
      return;
    }

    // connected 只证明握手成功；收到真实业务事件后才重置连续断线预算。
    this.retryAttempt = 0;
    this.emit(eventType, parsed.data);
  }

  private handleTransportDisconnect(generation: number): void {
    if (this.closed || generation !== this.sourceGeneration) return;
    this.sourceGeneration += 1;
    this.closeNativeSource();

    if (this.retryAttempt >= SSE_RETRY_DELAYS_MS.length) {
      this.started = false;
      const attempts = SSE_RETRY_DELAYS_MS.length;
      logger.error({ attempts, protocol: this.protocol }, 'SSE 连接重试已耗尽');
      this.emit<SSETransportStateEvent>('transport-state', {
        state: 'connection_lost',
        attempt: attempts,
      });
      this.emit<SSETransportErrorEvent>('transport-error', {
        error: 'SSE 连接已断开，重试次数已耗尽',
        attempts,
      });
      return;
    }

    const delay = SSE_RETRY_DELAYS_MS[this.retryAttempt];
    const attempt = this.retryAttempt + 1;
    this.retryAttempt = attempt;
    this.emit<SSETransportStateEvent>('transport-state', { state: 'reconnecting', attempt });
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.closed) this.openConnection();
    }, delay);
  }

  private closeNativeSource(): void {
    const source = this.eventSource;
    this.eventSource = null;
    source?.close();
  }

  private emit<T = unknown>(eventType: string, data: T): void {
    const handlers = this.handlers.get(eventType);
    if (!handlers) return;
    for (const handler of [...handlers]) {
      try {
        handler(data);
      } catch (error) {
        logger.error({ err: toLogError(error), eventType }, 'SSE 事件处理错误');
      }
    }
  }
}

/** 创建并立即注册 SSE 客户端；默认 generic 协议兼容旧调用点。 */
export function createSSEClient(taskId: string, protocol: SSEProtocol = 'generic'): SSEClient {
  return new SSEClient(taskId, protocol);
}

export type { SSEProtocol } from './schemas';
