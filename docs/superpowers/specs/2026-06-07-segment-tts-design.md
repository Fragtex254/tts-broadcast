# 逐句 TTS 生成设计方案

## 背景

当前 TTS 流程将整段口播稿一次性发送给 MiMo TTS API，生成单一音频文件。这存在几个问题：
- 长文本 TTS 质量不如短句自然
- 无法对单句进行精细调整和重新生成
- 用户无法在生成前预览和修改个别语句

本方案实现逐句切分、逐句生成、逐句编辑、最终合并的完整工作流。

---

## 架构概览

```
用户流程：
口播稿 → [LLM 切分] → 短句列表 → [逐句 TTS] → 各句音频
                                              ↓
                              用户试听/编辑/重新生成单句
                                              ↓
                              [确认满意] → 合并所有音频 → 最终 broadcast 记录
```

**技术栈新增：**
- `ffmpeg-static` — 音频合并（无需系统级 ffmpeg 安装）
- `broadcast_segments` 表 — 存储逐句数据

---

## 数据库设计

### 新增表：`broadcast_segments`

```sql
CREATE TABLE IF NOT EXISTS broadcast_segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,           -- 会话 ID，关联一次切分操作
  sentence_index INTEGER NOT NULL,    -- 句子序号（0-based）
  text TEXT NOT NULL,                 -- 原始句子文本
  audio_path TEXT,                    -- 该句音频文件路径
  status TEXT DEFAULT 'pending',      -- pending / generating / ready / error
  voice_config TEXT,                  -- 该句使用的音色配置 JSON
  error_message TEXT,                 -- 生成失败时的错误信息
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_segments_session_id ON broadcast_segments(session_id);
```

**设计说明：**
- `session_id` 用 UUID 标识一次完整的「切分 → 编辑 → 合并」流程
- `sentence_index` 保证顺序，合并时按此排序
- `status` 追踪每句的生成状态，支持前端显示进度
- `voice_config` 存储每句使用的音色，允许后续逐句更换音色（MVP 阶段所有句共享同一配置）

### 生命周期

```
切分完成 → [pending]
   ↓
逐句生成 → [generating] → [ready] 或 [error]
   ↓
用户重新生成 → [generating] → [ready] 或 [error]
   ↓
合并完成 → 音频文件保留，segments 记录可选清理
```

- 未合并的 segments 保留 24 小时，超时自动清理（可选，MVP 不实现）
- 合并后，segments 记录保留但标记为已合并（便于回溯）

---

## 后端设计

### 新增依赖

```json
{
  "ffmpeg-static": "^5.x",
  "uuid": "^9.x"
}
```

### 新增服务：`backend/src/services/segment.js`

**职责：** 口播稿切分、单句 TTS、音频合并

#### 1. 切分口播稿

```js
async function splitScript(script) → Array<{ index, text }>
```

- 调用 MiMo LLM，prompt 要求按语义和语气节奏切分
- 返回句子数组，每项包含序号和文本
- 切分结果写入 `broadcast_segments` 表

**Prompt 设计要点：**
- 要求按自然停顿切分，每句 15-40 字为宜
- 保持原文完整性，不增删内容
- 输出 JSON 格式：`["句子1", "句子2", ...]`

#### 2. 生成单句语音

```js
async function generateSegmentSpeech(segmentId, voiceConfig) → { audioPath }
```

- 更新 segment 状态为 `generating`
- 调用现有 `mimo.generateSpeech()` 生成单句音频
- 保存音频到 `audio/segments/` 目录
- 更新 segment 状态为 `ready`，记录 `audio_path`

#### 3. 合并所有 segments 音频

```js
async function mergeSegments(sessionId) → { audioPath, broadcast }
```

- 查询该 session 所有 segments，按 `sentence_index` 排序
- 验证所有 segments 状态均为 `ready`
- 使用 ffmpeg 合并所有 WAV 文件
- 生成最终音频保存到 `audio/` 目录
- 创建 `broadcasts` 记录，`content` 字段存储原始完整口播稿

**合并实现：**

```js
// 使用 ffmpeg concat 协议
// 生成 filelist.txt：
// file 'segment_0.wav'
// file 'segment_1.wav'
// ...
// ffmpeg -f concat -safe 0 -i filelist.txt -c copy output.wav
```

---

## API 设计

### 1. 切分口播稿

```
POST /api/broadcast/split
```

**Request:**
```json
{
  "script": "完整口播稿文本...",
  "voice": "冰糖",
  "voiceType": "preset",
  "voiceDesign": "...",
  "voiceClone": "...",
  "stylePrompt": "..."
}
```

**Response:**
```json
{
  "sessionId": "uuid-string",
  "segments": [
    { "id": 1, "index": 0, "text": "大家好，欢迎收听今日 AI 简讯。", "status": "pending" },
    { "id": 2, "index": 1, "text": "今天我们带来三条重要资讯。", "status": "pending" }
  ]
}
```

### 2. 生成单句语音

```
POST /api/broadcast/segment/:id/generate
```

**Request:** （可选，覆盖该句的音色配置）
```json
{
  "voice": "茉莉",
  "voiceType": "preset",
  "stylePrompt": "语速稍快"
}
```

**Response:**
```json
{
  "segment": {
    "id": 1,
    "index": 0,
    "text": "大家好，欢迎收听今日 AI 简讯。",
    "audioPath": "/audio/segments/session-id/0.wav",
    "status": "ready"
  },
  "audioUrl": "/audio/segments/session-id/0.wav"
}
```

### 3. 批量生成所有 pending 句子

```
POST /api/broadcast/session/:sessionId/generate-all
```

**Response:**
```json
{
  "results": [
    { "id": 1, "status": "ready", "audioUrl": "..." },
    { "id": 2, "status": "ready", "audioUrl": "..." }
  ]
}
```

- 按顺序逐句生成（避免并发 API 压力）
- 返回每句的生成结果

### 4. 编辑单句文本

```
PUT /api/broadcast/segment/:id
```

**Request:**
```json
{
  "text": "修改后的句子文本。"
}
```

**Response:**
```json
{
  "segment": {
    "id": 1,
    "text": "修改后的句子文本。",
    "status": "pending",
    "audioPath": null
  }
}
```

- 修改文本后，自动清除该句的 audio_path，状态重置为 `pending`

### 5. 合并所有音频

```
POST /api/broadcast/session/:sessionId/merge
```

**Response:**
```json
{
  "broadcast": {
    "id": 42,
    "title": "2026-06-07 AI 简讯",
    "content": "完整口播稿...",
    "audioPath": "/audio/broadcast_1234567890.wav",
    "status": "merged"
  },
  "audioUrl": "/audio/broadcast_1234567890.wav"
}
```

- 验证所有 segments 状态为 `ready`
- 调用 `mergeSegments()` 合并音频
- 创建 `broadcasts` 记录

### 6. 获取 session 详情

```
GET /api/broadcast/session/:sessionId
```

**Response:**
```json
{
  "sessionId": "uuid-string",
  "segments": [
    { "id": 1, "index": 0, "text": "...", "audioPath": "...", "status": "ready" },
    { "id": 2, "index": 1, "text": "...", "audioPath": "...", "status": "ready" }
  ],
  "allReady": true
}
```

---

## 前端设计

### 新增 Store 状态

```typescript
interface AppState {
  // 新增
  sessionId: string | null;
  segments: Segment[];
  isSplitting: boolean;
  isMerging: boolean;
  generatingSegmentId: number | null;  // 当前正在生成的 segment ID
}

interface Segment {
  id: number;
  index: number;
  text: string;
  audioPath: string | null;
  status: 'pending' | 'generating' | 'ready' | 'error';
  errorMessage?: string;
}
```

### 新增 Store Actions

```typescript
interface AppState {
  splitScript: (data: SplitRequest) => Promise<Segment[]>;
  generateSegment: (segmentId: number, voiceConfig?: VoiceConfig) => Promise<Segment>;
  generateAllSegments: () => Promise<void>;
  updateSegmentText: (segmentId: number, text: string) => Promise<Segment>;
  mergeSegments: () => Promise<{ broadcast: Broadcast; audioUrl: string }>;
  resetSession: () => void;
}
```

### 新增组件：`SegmentEditor`

**位置：** `frontend/src/components/Dashboard/SegmentEditor.tsx`

**职责：** 展示句子列表，提供逐句编辑、播放、重新生成功能

**UI 结构：**

```
┌─────────────────────────────────────────────────┐
│  逐句编辑器                              [重置] │
├─────────────────────────────────────────────────┤
│  ┌─ 句子 1 ──────────────────────────────────┐  │
│  │  文本内容（可编辑）                         │  │
│  │  [▶ 播放] [🔄 重新生成] [✓ 已就绪]        │  │
│  └───────────────────────────────────────────┘  │
│  ┌─ 句子 2 ──────────────────────────────────┐  │
│  │  文本内容（可编辑）                         │  │
│  │  [▶ 播放] [🔄 重新生成] [⏳ 生成中...]     │  │
│  └───────────────────────────────────────────┘  │
│  ...                                            │
├─────────────────────────────────────────────────┤
│  进度：3/5 句已就绪                             │
│  [全部重新生成]  [合成完整音频 ▶]               │
└─────────────────────────────────────────────────┘
```

**交互细节：**
- 每句显示：文本（可编辑 textarea）、状态徽章、播放按钮、重新生成按钮
- 点击文本进入编辑模式，失焦或按 Enter 保存
- 编辑后自动清除该句音频，状态变为 `pending`
- 底部显示进度条/计数
- 「合成完整音频」按钮仅在所有句子 `ready` 时可点击
- 合成过程中显示 loading 状态

### 修改组件：`VoiceGenerator`

**变化：**
- 移除原有的「生成语音播报」按钮
- 新增「切分并生成」按钮
- 点击后调用 `splitScript` API，成功后显示 `SegmentEditor`
- 音色配置（voice, voiceType 等）传递给 split API，作为所有句子的默认配置

**新的 UI 流程：**

```
[VoiceGenerator]
  ├─ 音色类型选择（preset / clone / design）
  ├─ 音色配置（根据类型显示）
  ├─ 风格提示词
  └─ [切分并生成] 按钮
          ↓
[SegmentEditor]（替换原 AudioPlayer 位置）
  ├─ 句子列表
  ├─ 逐句操作
  └─ [合成完整音频]
          ↓
[AudioPlayer]（最终音频播放）
```

### 修改组件：`Dashboard.tsx`

**变化：**
- 根据 `sessionId` 是否存在，切换显示 `SegmentEditor` 或 `AudioPlayer`
- 传递 voice 配置给 `VoiceGenerator`

### 新增 API 方法：`api.ts`

```typescript
export const broadcastApi = {
  // 新增
  split: (data: {
    script: string;
    voice?: string;
    voiceType?: string;
    voiceDesign?: string;
    voiceClone?: string;
    stylePrompt?: string;
  }) => api.post('/broadcast/split', data),

  generateSegment: (segmentId: number, voiceConfig?: {
    voice?: string;
    voiceType?: string;
    stylePrompt?: string;
  }) => api.post(`/broadcast/segment/${segmentId}/generate`, voiceConfig),

  generateAllSegments: (sessionId: string) =>
    api.post(`/broadcast/session/${sessionId}/generate-all`),

  updateSegment: (segmentId: number, data: { text: string }) =>
    api.put(`/broadcast/segment/${segmentId}`, data),

  mergeSegments: (sessionId: string) =>
    api.post(`/broadcast/session/${sessionId}/merge`),

  getSession: (sessionId: string) =>
    api.get(`/broadcast/session/${sessionId}`),
};
```

---

## 文件变更清单

### 新增文件

| 文件 | 说明 |
|------|------|
| `backend/src/services/segment.js` | 切分、单句生成、合并逻辑 |
| `backend/src/routes/session.js` | session 和 segment 相关路由 |
| `frontend/src/components/Dashboard/SegmentEditor.tsx` | 逐句编辑器组件 |

### 修改文件

| 文件 | 说明 |
|------|------|
| `backend/src/db/schema.sql` | 添加 `broadcast_segments` 表 |
| `backend/src/db/index.js` | 添加迁移代码 |
| `backend/src/app.js` | 挂载 session 路由 |
| `backend/package.json` | 添加 `ffmpeg-static`, `uuid` 依赖 |
| `frontend/src/store/index.ts` | 添加 session/segment 状态和 actions |
| `frontend/src/services/api.ts` | 添加新 API 方法 |
| `frontend/src/components/Dashboard/VoiceGenerator.tsx` | 修改按钮逻辑，调用 split |
| `frontend/src/pages/Dashboard.tsx` | 条件渲染 SegmentEditor |

---

## 边界情况处理

1. **切分失败** — 返回错误，提示用户重试，不创建 session
2. **单句生成失败** — 该句 status 设为 `error`，记录 `error_message`，允许用户重试
3. **合并时有未就绪句子** — 返回 400 错误，提示哪些句子未就绪
4. **用户编辑句子后** — 自动清除该句音频，需重新生成才能合并
5. **网络中断** — 已生成的句子音频保留，用户可继续生成剩余句子
6. **长时间未操作** — MVP 不实现自动清理，后续可添加定时任务清理 24h 前的未合并 session

---

## 测试策略

### 后端测试

- `splitScript()` — mock LLM 响应，验证 JSON 解析和数据库写入
- `generateSegmentSpeech()` — mock TTS API，验证状态流转和文件保存
- `mergeSegments()` — 使用测试音频文件，验证合并逻辑
- API 路由测试 — 使用 supertest 测试各端点

### 前端测试

- `SegmentEditor` 组件 — 测试渲染、编辑、按钮状态
- Store actions — 测试状态更新逻辑

---

## MVP 范围

**包含：**
- LLM 切分口播稿
- 逐句 TTS 生成
- 逐句编辑文本
- 逐句重新生成
- 合并所有句子为完整音频
- 保存到 broadcasts 表

**不包含（后续迭代）：**
- 逐句更换不同音色
- 句子拖拽排序
- 自动清理过期 session
- 并行生成多句
- 合并时添加句间停顿调节

