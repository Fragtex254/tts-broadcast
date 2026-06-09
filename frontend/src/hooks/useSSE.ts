// 通用 SSE Hook
// 支持订阅和取消订阅 SSE 事件

import { useEffect, useRef, useCallback } from 'react';
import { SSEClient, createSSEClient, SSEProgressEvent, SSECompleteEvent, SSEErrorEvent } from '../services/sseClient';

interface UseSSEOptions {
  taskId: string | null;
  onProgress?: (event: SSEProgressEvent) => void;
  onComplete?: (event: SSECompleteEvent) => void;
  onError?: (event: SSEErrorEvent) => void;
  enabled?: boolean;
}

interface UseSEReturn {
  isConnected: boolean;
  close: () => void;
}

/**
 * 通用 SSE Hook
 * @param options - SSE 配置选项
 * @returns SSE 连接状态和控制方法
 */
export function useSSE(options: UseSSEOptions): UseSEReturn {
  const { taskId, onProgress, onComplete, onError, enabled = true } = options;
  const clientRef = useRef<SSEClient | null>(null);
  const isConnectedRef = useRef(false);

  // 清理连接
  const close = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.close();
      clientRef.current = null;
      isConnectedRef.current = false;
    }
  }, []);

  useEffect(() => {
    // 如果没有 taskId 或未启用，不建立连接
    if (!taskId || !enabled) {
      close();
      return;
    }

    // 创建新的 SSE 客户端
    const client = createSSEClient(taskId);
    clientRef.current = client;

    // 注册事件处理器
    if (onProgress) {
      client.on('progress', onProgress);
    }
    if (onComplete) {
      client.on('complete', onComplete);
    }
    if (onError) {
      client.on('error', onError);
    }

    // 建立连接
    client.connect();
    isConnectedRef.current = true;

    // 清理函数
    return () => {
      close();
    };
  }, [taskId, enabled, onProgress, onComplete, onError, close]);

  return {
    isConnected: isConnectedRef.current,
    close,
  };
}

/**
 * 批量生成专用 SSE Hook
 * 简化接口，专门用于批量生成 Segment
 */
export function useBatchGenerateSSE(
  broadcastId: number | null,
  options: {
    onSegmentProgress?: (segmentId: number, status: string, audioPath?: string) => void;
    onSegmentComplete?: (segments: any[]) => void;
    onError?: (error: string) => void;
    enabled?: boolean;
  }
) {
  const { onSegmentProgress, onSegmentComplete, onError, enabled = true } = options;

  const handleProgress = useCallback(
    (event: SSEProgressEvent) => {
      if (onSegmentProgress && event.segmentId) {
        onSegmentProgress(event.segmentId, event.status, event.audioPath);
      }
    },
    [onSegmentProgress]
  );

  const handleComplete = useCallback(
    (event: SSECompleteEvent) => {
      if (onSegmentComplete) {
        onSegmentComplete(event.segments);
      }
    },
    [onSegmentComplete]
  );

  const handleError = useCallback(
    (event: SSEErrorEvent) => {
      if (onError) {
        onError(event.error);
      }
    },
    [onError]
  );

  return useSSE({
    taskId: broadcastId ? String(broadcastId) : null,
    onProgress: handleProgress,
    onComplete: handleComplete,
    onError: handleError,
    enabled,
  });
}
