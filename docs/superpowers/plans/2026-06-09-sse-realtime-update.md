# SSE 实时状态更新实现计划

## 概述

为 SegmentEditor 添加 SSE (Server-Sent Events) 支持，实现批量生成语音时每完成一个 segment 就实时更新 UI 状态。

## 设计方案

### 后端实现

**新增 SSE 端点**：`GET /api/broadcast/:id/segments/batch-generate-stream`

```javascript
// backend/src/routes/segments.js

router.get('/:id/segments/batch-generate-stream', async (req, res) => {
  // 设置 SSE 响应头
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const idCheck = validateId(req.params.id, '播报 ID');
  if (!idCheck.valid) {
    res.write(`data: ${JSON.stringify({ error: idCheck.error })}\n\n`);
    res.end();
    return;
  }

  const broadcast = broadcastStore.getById(idCheck.id);
  if (!broadcast) {
    res.write(`data: ${JSON.stringify({ error: '播报记录不存在' })}\n\n`);
    res.end();
    return;
  }

  // 获取待生成的 segments
  const pendingSegments = segmentStore.getPendingByBroadcastId(idCheck.id);
  
  // 发送开始事件
  res.write(`data: ${JSON.stringify({ type: 'start', total: pendingSegments.length })}\n\n`);

  const voiceConfig = JSON.parse(broadcast.voice_config || '{}');
  
  for (let i = 0; i < pendingSegments.length; i++) {
    const segment = pendingSegments[i];
    
    // 更新状态为生成中
    segmentStore.updateStatus(segment.id, 'generating');
    res.write(`data: ${JSON.stringify({ 
      type: 'progress', 
      segmentId: segment.id, 
      status: 'generating',
      current: i + 1,
      total: pendingSegments.length 
    })}\n\n`);

    try {
      const audioBuffer = await tts.generateSpeech({
        text: segment.text,
        voice: voiceConfig.voice,
        voiceType: broadcast.voice_type,
        voiceDesign: voiceConfig.voiceDesign,
        voiceClone: voiceConfig.voiceClone,
        stylePrompt: voiceConfig.stylePrompt,
        speed: voiceConfig.speed,
        emotion: voiceConfig.emotion,
        pitch: voiceConfig.pitch
      });

      const filename = `segment_${idCheck.id}_${segment.index}.wav`;
      const filepath = path.join(audioDir, filename);
      fs.writeFileSync(filepath, audioBuffer);

      segmentStore.updateStatus(segment.id, 'generated', `/audio/${filename}`);
      
      // 发送成功事件
      res.write(`data: ${JSON.stringify({ 
        type: 'progress', 
        segmentId: segment.id, 
        status: 'generated',
        audioPath: `/audio/${filename}`,
        current: i + 1,
        total: pendingSegments.length 
      })}\n\n`);
    } catch (error) {
      segmentStore.updateStatus(segment.id, 'failed');
      
      // 发送失败事件
      res.write(`data: ${JSON.stringify({ 
        type: 'progress', 
        segmentId: segment.id, 
        status: 'failed',
        error: error.message,
        current: i + 1,
        total: pendingSegments.length 
      })}\n\n`);
    }
  }

  // 发送完成事件
  const segments = segmentStore.getByBroadcastId(idCheck.id);
  res.write(`data: ${JSON.stringify({ type: 'complete', segments })}\n\n`);
  res.end();
});
```

### 前端实现

**修改 store 中的 batchGenerateSegments 方法**：

```typescript
// frontend/src/store/index.ts

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
    const eventSource = new EventSource(
      `/api/broadcast/${broadcastId}/segments/batch-generate-stream`
    );

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'progress') {
        // 实时更新单个 segment 状态
        set((state) => ({
          segments: state.segments.map((s) => {
            if (s.id === data.segmentId) {
              return {
                ...s,
                status: data.status,
                audio_path: data.audioPath || s.audio_path,
              };
            }
            return s;
          }),
        }));
      } else if (data.type === 'complete') {
        // 所有 segment 生成完成
        set({ segments: data.segments });
        eventSource.close();
        resolve({ segments: data.segments, results: [] });
      } else if (data.error) {
        eventSource.close();
        reject(new Error(data.error));
      }
    };

    eventSource.onerror = (error) => {
      eventSource.close();
      reject(error);
    };
  });
},
```

## 文件修改清单

1. **backend/src/routes/segments.js**
   - 新增 `GET /api/broadcast/:id/segments/batch-generate-stream` 路由
   - 保留原有 `POST /api/broadcast/:id/segments/batch-generate` 路由（向后兼容）

2. **frontend/src/store/index.ts**
   - 修改 `batchGenerateSegments` 方法，使用 SSE 代替 POST
   - 添加 `updateSegmentStatus` 辅助方法用于实时更新

3. **frontend/src/services/api.ts**
   - 无需修改，SSE 直接使用 EventSource API

## 优势

1. **实时反馈**：每个 segment 生成完成立即更新 UI
2. **用户体验**：用户可以实时看到进度
3. **简单实现**：SSE 是浏览器原生 API，无需额外依赖
4. **向后兼容**：保留原有 POST 端点

## 测试要点

1. 正常批量生成流程
2. 单个 segment 生成失败的处理
3. 网络断开时的错误处理
4. 取消生成的处理（可选）
