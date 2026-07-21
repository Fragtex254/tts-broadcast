# SSE 实时通信系统实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 HCDS Studio 项目构建系统层级的 SSE (Server-Sent Events) 实时通信基础设施，支持所有长时间运行任务的实时状态更新

**Architecture:** 
- 后端：创建通用 SSE 服务模块，管理客户端连接和事件推送
- 前端：创建通用 useSSE hook，支持订阅和取消订阅 SSE 事件
- 所有长时间运行的任务（TTS 生成、AI 切分、音频合并等）都使用 SSE 推送进度

**Tech Stack:** Express SSE, EventSource API, Zustand, React Hooks

---

## 适用场景

以下场景将使用 SSE 实时推送：

1. **整篇 TTS 生成** (`POST /api/broadcast/generate`) - 推送生成进度
2. **AI 口播稿改写** (`POST /api/broadcast/rewrite`) - 推送改写进度
3. **AI 切分口播稿** (`POST /api/broadcast/:id/split`) - 推送切分进度
4. **批量生成 Segment** (`POST /api/broadcast/:id/segments/batch-generate`) - 推送每个 segment 的生成状态
5. **单个 Segment 重新生成** (`POST /api/broadcast/:id/segments/:segId/regenerate`) - 推送生成状态
6. **音频合并** (`POST /api/broadcast/:id/segments/merge`) - 推送合并进度
7. **试听克隆音色** (`POST /api/voice-presets/trial/clone`) - 推送生成状态
8. **试听设计音色** (`POST /api/voice-presets/trial/design`) - 推送生成状态

---

## 文件结构

### 后端新增文件
- **Create:** `backend/src/services/sseManager.js` - SSE 连接管理器
- **Create:** `backend/src/routes/sse.js` - SSE 端点路由

### 后端修改文件
- **Modify:** `backend/src/app.js` - 挂载 SSE 路由
- **Modify:** `backend/src/routes/broadcast.js` - 添加 SSE 事件推送
- **Modify:** `backend/src/routes/segments.js` - 添加 SSE 事件推送
- **Modify:** `backend/src/routes/voicePresets.js` - 添加 SSE 事件推送

### 前端新增文件
- **Create:** `frontend/src/hooks/useSSE.ts` - 通用 SSE hook
- **Create:** `frontend/src/services/sseClient.ts` - SSE 客户端封装

### 前端修改文件
- **Modify:** `frontend/src/store/index.ts` - 使用 SSE 更新长时间任务状态

---

## Task 1: 后端 - SSE 连接管理器

**Files:**
- Create: `backend/src/services/sseManager.js`

- [ ] **Step 1: 创建 SSE 连接管理器**

创建 `backend/src/services/sseManager.js`：

```javascript
// SSE 连接管理器
// 管理所有客户端的 SSE 连接，支持按任务 ID 推送事件

class SSEManager {
  constructor() {
    // Map<taskId, Set<res>>
    this.connections = new Map();
  }

  /**
   * 添加客户端连接
   * @param {string} taskId - 任务 ID（如 broadcast ID）
   * @param {object} res - Express response 对象
   */
  addClient(taskId, res) {
    if (!this.connections.has(taskId)) {
      this.connections.set(taskId, new Set());
    }
    this.connections.get(taskId).add(res);

    // 客户端断开时移除
    res.on('close', () => {
      this.removeClient(taskId, res);
    });
  }

  /**
   * 移除客户端连接
   * @param {string} taskId - 任务 ID
   * @param {object} res - Express response 对象
   */
  removeClient(taskId, res) {
    const clients = this.connections.get(taskId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) {
        this.connections.delete(taskId);
      }
    }
  }

  /**
   * 向指定任务的所有客户端推送事件
   * @param {string} taskId - 任务 ID
   * @param {string} eventType - 事件类型
   * @param {object} data - 事件数据
   */
  send(taskId, eventType, data) {
    const clients = this.connections.get(taskId);
    if (!clients || clients.size === 0) return;

    const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    
    for (const res of clients) {
      try {
        res.write(message);
      } catch (error) {
        console.error('SSE 推送失败:', error);
        this.removeClient(taskId, res);
      }
    }
  }

  /**
   * 向指定任务的所有客户端推送进度事件
   * @param {string} taskId - 任务 ID
   * @param {object} progress - 进度数据
   */
  sendProgress(taskId, progress) {
    this.send(taskId, 'progress', progress);
  }

  /**
   * 向指定任务的所有客户端推送完成事件
   * @param {string} taskId - 任务 ID
   * @param {object} result - 结果数据
   */
  sendComplete(taskId, result) {
    this.send(taskId, 'complete', result);
  }

  /**
   * 向指定任务的所有客户端推送错误事件
   * @param {string} taskId - 任务 ID
   * @param {string} error - 错误信息
   */
  sendError(taskId, error) {
    this.send(taskId, 'error', { error });
  }

  /**
   * 获取当前连接数
   * @returns {number}
   */
  getConnectionCount() {
    let count = 0;
    for (const clients of this.connections.values()) {
      count += clients.size;
    }
    return count;
  }

  /**
   * 获取指定任务的连接数
   * @param {string} taskId - 任务 ID
   * @returns {number}
   */
  getTaskConnectionCount(taskId) {
    const clients = this.connections.get(taskId);
    return clients ? clients.size : 0;
  }
}

// 单例模式
const sseManager = new SSEManager();

module.exports = sseManager;
```

- [ ] **Step 2: 创建 SSE 路由**

创建 `backend/src/routes/sse.js`：

```javascript
// SSE 端点路由
const express = require('express');
const router = express.Router();
const sseManager = require('../services/sseManager');
const { validateId } = require('../utils/validation');

/**
 * GET /api/sse/:taskId
 * 建立 SSE 连接，订阅指定任务的事件
 */
router.get('/:taskId', (req, res) => {
  const { taskId } = req.params;

  // 设置 SSE 响应头
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // 禁用 Nginx 缓冲
  });

  // 发送初始连接成功消息
  res.write(`event: connected\ndata: ${JSON.stringify({ taskId, timestamp: Date.now() })}\n\n`);

  // 添加到连接管理器
  sseManager.addClient(taskId, res);

  // 心跳保活（每 30 秒）
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30000);

  // 客户端断开时清理
  req.on('close', () => {
    clearInterval(heartbeat);
    sseManager.removeClient(taskId, res);
  });
});

module.exports = router;
```

- [ ] **Step 3: 挂载 SSE 路由到 app.js**

修改 `backend/src/app.js`，在第 22 行后添加：

```javascript
// API 路由
app.use('/api/broadcast', require('./routes/broadcast'));
app.use('/api/broadcast', require('./routes/segments'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/schedules', require('./routes/schedule'));
app.use('/api/voice-presets', require('./routes/voicePresets'));
app.use('/api/sse', require('./routes/sse'));  // 新增 SSE 路由
```

- [ ] **Step 4: 验证 SSE 连接**

启动后端服务后，测试 SSE 连接：

```bash
curl -N -H "Accept: text/event-stream" http://localhost:3001/api/sse/test-task
```

预期输出：
```
event: connected
data: {"taskId":"test-task","timestamp":...}

: heartbeat

: heartbeat
```

- [ ] **Step 5: 提交代码**

```bash
git add backend/src/services/sseManager.js backend/src/routes/sse.js backend/src/app.js
git commit -m "feat(backend): 添加 SSE 连接管理器和路由基础设施"
```

---

## Task 2: 后端 - 批量生成 Segment 使用 SSE

**Files:**
- Modify: `backend/src/routes/segments.js:74-123`

- [ ] **Step 1: 修改批量生成路由使用 SSE**

修改 `backend/src/routes/segments.js` 的 `batch-generate` 路由，添加 SSE 事件推送：

```javascript
/**
 * POST /api/broadcast/:id/segments/batch-generate
 * 批量生成 segment 音频（支持 SSE 实时推送）
 */
router.post('/:id/segments/batch-generate', async (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '播报 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });

    const broadcast = broadcastStore.getById(idCheck.id);
    if (!broadcast) return res.status(404).json({ error: '播报记录不存在' });

    const voiceConfig = JSON.parse(broadcast.voice_config || '{}');
    const pendingSegments = segmentStore.getPendingByBroadcastId(idCheck.id);

    // 发送开始事件
    sseManager.send(idCheck.id, 'batch-generate-start', {
      total: pendingSegments.length,
      timestamp: Date.now()
    });

    const results = [];
    for (let i = 0; i < pendingSegments.length; i++) {
      const segment = pendingSegments[i];
      
      // 更新状态为生成中
      segmentStore.updateStatus(segment.id, 'generating');
      
      // 推送进度事件
      sseManager.sendProgress(idCheck.id, {
        segmentId: segment.id,
        status: 'generating',
        current: i + 1,
        total: pendingSegments.length,
        text: segment.text
      });

      try {
        const resolvedVoiceClone = voiceConfig.voiceClone
          ? await audio.resolveVoiceClone(voiceConfig.voiceClone)
          : undefined;

        const audioBuffer = await tts.generateSpeech({
          text: segment.text,
          voice: voiceConfig.voice,
          voiceType: broadcast.voice_type,
          voiceDesign: voiceConfig.voiceDesign,
          voiceClone: resolvedVoiceClone,
          stylePrompt: voiceConfig.stylePrompt,
          speed: voiceConfig.speed,
          emotion: voiceConfig.emotion,
          pitch: voiceConfig.pitch
        });

        const filename = `segment_${idCheck.id}_${segment.index}.wav`;
        const filepath = path.join(audioDir, filename);
        fs.writeFileSync(filepath, audioBuffer);

        segmentStore.updateStatus(segment.id, 'generated', `/audio/${filename}`);
        results.push({ id: segment.id, status: 'generated' });

        // 推送成功事件
        sseManager.sendProgress(idCheck.id, {
          segmentId: segment.id,
          status: 'generated',
          audioPath: `/audio/${filename}`,
          current: i + 1,
          total: pendingSegments.length
        });
      } catch (ttsError) {
        segmentStore.updateStatus(segment.id, 'failed');
        results.push({ id: segment.id, status: 'failed', error: ttsError.message });

        // 推送失败事件
        sseManager.sendProgress(idCheck.id, {
          segmentId: segment.id,
          status: 'failed',
          error: ttsError.message,
          current: i + 1,
          total: pendingSegments.length
        });
      }
    }

    const segments = segmentStore.getByBroadcastId(idCheck.id);

    // 推送完成事件
    sseManager.sendComplete(idCheck.id, {
      segments,
      results,
      timestamp: Date.now()
    });

    // 仍然返回 HTTP 响应（向后兼容）
    res.json({ segments, results });
  } catch (error) {
    console.error('批量生成失败:', error);
    sseManager.sendError(idCheck.id, error.message || '批量生成失败');
    res.status(500).json({ error: error.message || '批量生成失败' });
  }
});
```

- [ ] **Step 2: 在文件顶部添加 sseManager 导入**

在 `backend/src/routes/segments.js` 第 11 行后添加：

```javascript
const sseManager = require('../services/sseManager');
```

- [ ] **Step 3: 测试 SSE 事件推送**

1. 在一个终端订阅 SSE 事件：
```bash
curl -N -H "Accept: text/event-stream" http://localhost:3001/api/sse/1
```

2. 在另一个终端触发批量生成：
```bash
curl -X POST http://localhost:3001/api/broadcast/1/segments/batch-generate
```

3. 观察第一个终端输出的 SSE 事件

- [ ] **Step 4: 提交代码**

```bash
git add backend/src/routes/segments.js
git commit -m "feat(backend): 批量生成 Segment 支持 SSE 实时推送进度"
```

---

## Task 3: 前端 - SSE 客户端工具

**Files:**
- Create: `frontend/src/services/sseClient.ts`
- Create: `frontend/src/hooks/useSSE.ts`

- [ ] **Step 1: 创建 SSE 客户端封装**

创建 `frontend/src/services/sseClient.ts`：

```typescript
// SSE 客户端封装
// 提供类型安全的 SSE 连接管理

export interface SSEProgressEvent {
  segmentId?: number;
  status: 'generating' | 'generated' | 'failed';
  audioPath?: string;
  error?: string;
  current?: number;
  total?: number;
  text?: string;
}

export interface SSECompleteEvent {
  segments: any[];
  results: any[];
  timestamp: number;
}

export interface SSEErrorEvent {
  error: string;
}

export type SSEEventHandler<T = any> = (data: T) => void;

export class SSEClient {
  private eventSource: EventSource | null = null;
  private taskId: string;
  private handlers: Map<string, Set<SSEEventHandler>> = new Map();

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
    this.eventSource.addEventListener('connected', (event) => {
      console.log(`SSE 连接成功: ${this.taskId}`);
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
      console.error(`SSE 连接错误: ${this.taskId}`, error);
    };
  }

  /**
   * 注册事件处理器
   */
  on<T = any>(eventType: string, handler: SSEEventHandler<T>): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);
  }

  /**
   * 移除事件处理器
   */
  off<T = any>(eventType: string, handler: SSEEventHandler<T>): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * 触发事件
   */
  private emit(eventType: string, data: any): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (error) {
          console.error(`SSE 事件处理错误: ${eventType}`, error);
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
```

- [ ] **Step 2: 创建 useSSE Hook**

创建 `frontend/src/hooks/useSSE.ts`：

```typescript
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
```

- [ ] **Step 3: 运行 TypeScript 类型检查**

```bash
cd frontend && npx tsc --noEmit
```

预期：无类型错误

- [ ] **Step 4: 提交代码**

```bash
git add frontend/src/services/sseClient.ts frontend/src/hooks/useSSE.ts
git commit -m "feat(frontend): 添加 SSE 客户端封装和通用 useSSE hook"
```

---

## Task 4: 前端 - Store 集成 SSE

**Files:**
- Modify: `frontend/src/store/index.ts:432-458`

- [ ] **Step 1: 修改 batchGenerateSegments 使用 SSE**

修改 `frontend/src/store/index.ts` 中的 `batchGenerateSegments` 方法：

```typescript
batchGenerateSegments: async (broadcastId) => {
  set((state) => ({
    segments: state.segments.map((s) =>
      s.status === 'pending' || s.status === 'failed'
        ? { ...s, status: 'generating' as const }
        : s
    ),
  }));

  // 先同步音色配置
  const { voiceConfig } = useStore.getState();
  await broadcastApi.updateVoiceConfig(broadcastId, {
    voiceType: voiceConfig.voiceType,
    voice: voiceConfig.voiceType === 'preset' ? voiceConfig.voice : undefined,
    voiceDesign: voiceConfig.voiceType === 'design' ? voiceConfig.voiceDesign : undefined,
    voiceClone: voiceConfig.voiceType === 'clone' ? voiceConfig.voiceClone : undefined,
    stylePrompt: voiceConfig.stylePrompt || undefined,
  });

  // 使用 SSE 实时获取状态
  return new Promise((resolve, reject) => {
    const { createSSEClient } = require('../services/sseClient');
    const client = createSSEClient(String(broadcastId));

    // 注册进度事件
    client.on('progress', (event: any) => {
      set((state) => ({
        segments: state.segments.map((s) => {
          if (s.id === event.segmentId) {
            return {
              ...s,
              status: event.status,
              audio_path: event.audioPath || s.audio_path,
            };
          }
          return s;
        }),
      }));
    });

    // 注册完成事件
    client.on('complete', (event: any) => {
      set({ segments: event.segments });
      client.close();
      resolve({ segments: event.segments, results: event.results });
    });

    // 注册错误事件
    client.on('error', (event: any) => {
      client.close();
      reject(new Error(event.error));
    });

    // 建立 SSE 连接
    client.connect();

    // 同时发送 HTTP 请求触发批量生成
    broadcastApi.batchGenerateSegments(broadcastId).catch((error) => {
      client.close();
      reject(error);
    });
  });
},
```

- [ ] **Step 2: 添加 SSE 客户端导入**

在 `frontend/src/store/index.ts` 文件顶部添加导入：

```typescript
import { createSSEClient } from '../services/sseClient';
```

或者使用动态导入（如上面代码所示）。

- [ ] **Step 3: 运行 TypeScript 类型检查**

```bash
cd frontend && npx tsc --noEmit
```

预期：无类型错误

- [ ] **Step 4: 提交代码**

```bash
git add frontend/src/store/index.ts
git commit -m "feat(frontend): batchGenerateSegments 使用 SSE 实时更新状态"
```

---

## Task 5: 前端 - SegmentEditor 组件适配

**Files:**
- Modify: `frontend/src/components/Dashboard/SegmentEditor.tsx`

- [ ] **Step 1: 添加实时状态更新的视觉反馈**

修改 SegmentEditor 组件，添加生成进度的视觉反馈：

在第 146 行 `{segments.map((seg, index) => (` 之前添加进度条：

```typescript
{/* 生成进度指示器 */}
{segments.some(s => s.status === 'generating') && (
  <div className="mb-3 bg-lilac/10 rounded-xl p-3 border border-lilac/20">
    <div className="flex items-center justify-between mb-2">
      <span className="font-body text-[11px] text-ink-soft">正在生成语音...</span>
      <span className="font-body text-[11px] text-lilac">
        {segments.filter(s => s.status === 'generated').length} / {segments.length}
      </span>
    </div>
    <div className="w-full h-1.5 bg-ink/10 rounded-full overflow-hidden">
      <div 
        className="h-full bg-lilac rounded-full transition-all duration-300"
        style={{ 
          width: `${(segments.filter(s => s.status === 'generated').length / segments.length) * 100}%` 
        }}
      />
    </div>
  </div>
)}
```

- [ ] **Step 2: 为每个 segment 添加生成中的动画**

修改第 149 行的 segment 卡片样式，为正在生成的 segment 添加特殊样式：

```typescript
<div
  key={seg.id}
  className={`bg-white/45 rounded-2xl p-3 border flex items-center gap-3 transition-all duration-300 ${
    seg.status === 'generating' 
      ? 'border-lilac/40 bg-lilac/5 animate-pulse' 
      : seg.status === 'generated'
      ? 'border-sage/30'
      : seg.status === 'failed'
      ? 'border-pink/30 bg-pink/5'
      : 'border-card-border'
  }`}
  style={{ animation: `fade-in-up 0.3s cubic-bezier(0.22, 1, 0.36, 1) ${index * 0.05}s both` }}
>
```

- [ ] **Step 3: 运行 TypeScript 类型检查**

```bash
cd frontend && npx tsc --noEmit
```

预期：无类型错误

- [ ] **Step 4: 提交代码**

```bash
git add frontend/src/components/Dashboard/SegmentEditor.tsx
git commit -m "feat(frontend): SegmentEditor 添加生成进度指示器和状态动画"
```

---

## Task 6: 后端 - 其他长时间任务添加 SSE 支持

**Files:**
- Modify: `backend/src/routes/broadcast.js`
- Modify: `backend/src/routes/voicePresets.js`

- [ ] **Step 1: 整篇 TTS 生成添加 SSE 推送**

修改 `backend/src/routes/broadcast.js` 的 `POST /generate` 路由：

在文件顶部添加 sseManager 导入：
```javascript
const sseManager = require('../services/sseManager');
```

在生成开始时推送事件：
```javascript
// 在生成开始前
sseManager.send('broadcast-generate', 'start', { 
  broadcastId: broadcast.id,
  textLength: text.length 
});

// 生成完成后
sseManager.sendComplete('broadcast-generate', {
  broadcastId: broadcast.id,
  audioUrl: `/audio/${filename}`
});
```

- [ ] **Step 2: AI 切分添加 SSE 推送**

修改 `backend/src/routes/segments.js` 的 `POST /:id/split` 路由：

```javascript
// 在切分开始前
sseManager.send(idCheck.id, 'split-start', { 
  contentLength: broadcast.content.length 
});

// 切分完成后
sseManager.sendComplete(idCheck.id, {
  type: 'split',
  segments
});
```

- [ ] **Step 3: 音频合并添加 SSE 推送**

修改 `backend/src/routes/segments.js` 的 `POST /:id/segments/merge` 路由：

```javascript
// 在合并开始前
sseManager.send(idCheck.id, 'merge-start', { 
  segmentCount: segments.length 
});

// 合并完成后
sseManager.sendComplete(idCheck.id, {
  type: 'merge',
  broadcast: updated
});
```

- [ ] **Step 4: 提交代码**

```bash
git add backend/src/routes/broadcast.js backend/src/routes/segments.js
git commit -m "feat(backend): 整篇生成、切分、合并添加 SSE 事件推送"
```

---

## Task 7: 测试和文档

**Files:**
- None (manual testing + documentation)

- [ ] **Step 1: 测试批量生成 SSE 实时更新**

1. 启动后端和前端服务
2. 进入编辑器页面，切分口播稿
3. 点击"全部生成"按钮
4. 观察每个 segment 的状态是否实时更新

预期：
- 每个 segment 开始生成时，状态变为"生成中"并显示动画
- 每个 segment 生成完成后，状态立即更新为"就绪"并显示音频播放器
- 进度条实时更新

- [ ] **Step 2: 测试网络断开恢复**

1. 在批量生成过程中，断开网络连接
2. 恢复网络连接
3. 观察是否能继续接收事件

预期：
- SSE 连接会自动重试
- 重连后能继续接收后续事件

- [ ] **Step 3: 更新 CLAUDE.md 文档**

在 CLAUDE.md 中添加 SSE 实时通信的说明：

```markdown
## 实时通信 (SSE)

项目使用 Server-Sent Events (SSE) 实现长时间运行任务的实时状态更新。

### 后端

- **SSE 管理器**: `backend/src/services/sseManager.js` - 管理客户端连接和事件推送
- **SSE 路由**: `backend/src/routes/sse.js` - SSE 端点 `GET /api/sse/:taskId`

### 前端

- **SSE 客户端**: `frontend/src/services/sseClient.ts` - SSE 连接封装
- **useSSE Hook**: `frontend/src/hooks/useSSE.ts` - 通用 SSE hook

### 使用场景

1. 批量生成 Segment - 每个 segment 独立推送状态
2. 整篇 TTS 生成 - 推送生成进度
3. AI 切分 - 推送切分进度
4. 音频合并 - 推送合并进度
```

- [ ] **Step 4: 最终提交**

```bash
git add -A
git commit -m "docs: 添加 SSE 实时通信系统文档"
```

---

## 检查清单

实现完成后，对照以下检查清单验证：

### 后端
- [ ] SSE 连接管理器正常工作
- [ ] SSE 路由正确返回事件流
- [ ] 心跳保活机制正常
- [ ] 批量生成正确推送每个 segment 的状态
- [ ] 客户端断开时正确清理资源

### 前端
- [ ] SSE 客户端正确连接和接收事件
- [ ] useSSE hook 正确管理生命周期
- [ ] Store 中 batchGenerateSegments 正确使用 SSE
- [ ] SegmentEditor 实时更新每个 segment 的状态
- [ ] 进度条正确显示

### 代码质量
- [ ] TypeScript 类型检查通过
- [ ] 代码风格与现有代码一致
- [ ] 提交信息清晰明了
