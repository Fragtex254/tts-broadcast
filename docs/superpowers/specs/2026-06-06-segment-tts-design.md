# 逐句 TTS 生成设计文档

> 日期：2026-06-06
> 状态：Draft
> 方案：方案 A — 独立 segments 表

## 概述

将现有的整段口播稿 TTS 生成流程改造为逐句切分 → 逐句生成 → 手动合并的三阶段流程。用户可以对每个短句独立试听、编辑文本、重新生成，满意后再合并为最终完整音频。

## 目标

- AI 智能切分口播稿为 TTS 友好的短句
- 每句独立生成音频，支持逐句试听、编辑、重新生成
- 用户手动触发合并，生成最终完整音频
- 完全替代现有整段 TTS 生成流程

## 非目标

- 不支持多语言切分（当前仅中文口播稿）
- 不支持逐句版本历史对比
- 不改变现有的音频保存/淘汰策略逻辑（仅扩展其覆盖范围）

---

## 数据模型

### 新增 `segments` 表

```sql
CREATE TABLE IF NOT EXISTS segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  broadcast_id INTEGER NOT NULL,
  index INTEGER NOT NULL,
  text TEXT NOT NULL,
  audio_path TEXT,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (broadcast_id) REFERENCES broadcasts(id) ON DELETE CASCADE
);

CREATE INDEX idx_segments_broadcast_id ON segments(broadcast_id);
```

字段说明：

| 字段 | 类型 | 说明 |
|------|------|------|
| `broadcast_id` | INTEGER FK | 所属广播 ID，级联删除 |
| `index` | INTEGER | 句子在稿件中的顺序（从 0 开始） |
| `text` | TEXT | 该句文本内容 |
| `audio_path` | TEXT | 音频文件路径，如 `/audio/segment_123_0.wav`，未生成时为 NULL |
| `status` | TEXT | `pending` / `generating` / `generated` / `failed` |

### `broadcasts` 表变更

```sql
ALTER TABLE broadcasts ADD COLUMN mode TEXT DEFAULT 'whole';
```

- `'whole'`：旧流程，整段生成（已有数据默认此值）
- `'segmented'`：新流程，逐句生成

当 `mode = 'segmented'` 时：
- `broadcasts.audio_path` 在合并前为 `NULL`
- 合并后存储最终拼接音频路径

### 状态流转

```
AI 切分 → segments 创建（status=pending, audio_path=null）
    ↓
逐句生成 → segment_{broadcastId}_{index}.wav（status=generated）
    ↓
用户编辑文本 → status 回退为 pending，旧音频文件删除
    ↓
重新生成 → 新的 segment_{broadcastId}_{index}.wav（覆盖同名文件）
    ↓
合并 → broadcast_{id}_merged.wav 写入 broadcasts.audio_path
    ↓
广播被删除 → CASCADE 删除所有 segments + 清理所有音频文件
```

---

## Backend API

### 新增接口

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/broadcast/:id/split` | AI 切分稿件为短句，创建 segments |
| `GET` | `/api/broadcast/:id/segments` | 获取所有短句（含音频状态） |
| `PUT` | `/api/broadcast/:id/segments/:segId` | 编辑单句文本 |
| `POST` | `/api/broadcast/:id/segments/:segId/regenerate` | 重新生成单句音频 |
| `POST` | `/api/broadcast/:id/segments/batch-generate` | 批量生成所有 pending/failed 句子 |
| `POST` | `/api/broadcast/:id/segments/merge` | 合并所有 segment 音频为最终文件 |
| `DELETE` | `/api/broadcast/:id/segments/:segId` | 删除一句（自动重排序） |
| `POST` | `/api/broadcast/:id/segments/reorder` | 重排序（合并/拆分后调用） |

### 接口详情

**切分** `POST /api/broadcast/:id/split`

1. 读取广播稿件文本
2. 调用 `mimo.splitScript(text)` 智能切分
3. 将 `broadcasts.mode` 设为 `'segmented'`
4. 为每个短句创建 `segments` 记录（`status='pending'`）
5. 返回 segments 列表

**编辑单句** `PUT /api/broadcast/:id/segments/:segId`

1. 更新 segment 的 `text`
2. 若该句已有音频，删除旧音频文件
3. 将 `status` 回退为 `'pending'`，`audio_path` 置为 NULL
4. 返回更新后的 segment

**单句重新生成** `POST /api/broadcast/:id/segments/:segId/regenerate`

1. 读取该 segment 的文本和音色配置
2. 调用 `mimo.generateSpeech()` 生成音频
3. 写入 `audio/segment_{broadcastId}_{index}.wav`
4. 更新 segment 的 `audio_path` 和 `status`

**批量生成** `POST /api/broadcast/:id/segments/batch-generate`

- 串行遍历所有 `status='pending'` 或 `'failed'` 的 segments
- 逐句调用 TTS API（避免并发限制）
- 返回更新后的 segments 列表

**合并** `POST /api/broadcast/:id/segments/merge`

1. 校验所有 segments 的 `status` 均为 `'generated'`，否则返回 400
2. 按 `index` 顺序读取所有 segment 音频文件
3. 调用 `audio.mergeWavFiles()` 拼接 WAV 数据
4. 写入 `audio/broadcast_{id}_merged.wav`
5. 更新 `broadcasts.audio_path` 指向合并文件
6. 返回更新后的 broadcast 对象

**删除单句** `DELETE /api/broadcast/:id/segments/:segId`

1. 删除该 segment 的音频文件（如有）
2. 删除数据库记录
3. 将后续 segments 的 `index` 减 1，并重命名其音频文件
4. 返回更新后的 segments 列表

### 现有接口调整

- `POST /api/broadcast/generate`：废弃，路由保留但返回 410 Gone 提示
- `POST /api/broadcast/:id/save`：扩展，保存/取消保存时同时管理所有 segment 音频文件
- 删除广播的逻辑：扩展，删除时同时清理所有关联的 segment 记录和音频文件

---

## AI 切分服务

### `mimo.splitScript(text)`

复用现有 MiMo LLM 客户端（与 `rewriteToScript` 同一 SDK 实例）。

**切分原则**：
- 按语义完整性和自然停顿切分，非简单按标点
- 每句长度 15~80 字（太短影响 TTS 韵律，太长不便独立编辑）
- 开场白和结束语作为独立句子
- 不修改原文内容，只做切分

**输出格式**：JSON 字符串数组

```json
["大家好，欢迎收听今天的AI快报。", "首先来看第一条新闻，OpenAI发布了最新的GPT-5模型。", "..."]
```

**错误处理**：切分失败时返回错误，稿件保持原样，用户可重试。

---

## 音频合并服务

### `audio.mergeWavFiles(filePaths)`

**技术方案**：WAV 字节级拼接

MiMo TTS API 固定输出 24kHz/16bit/mono WAV，所有 segment 音频格式一致，可直接拼接。

**实现步骤**：
1. 读取第一个文件的 44 字节 header 作为模板
2. 提取所有文件的 PCM 数据段（从 byte 44 开始）
3. 拼接所有 PCM 数据
4. 更新 header 中的 `data chunk size`（所有 PCM 数据总长度）和 `RIFF chunk size`（总长度 - 8）
5. 写入合并文件

---

## 前端 UI

### 组件结构变化

```
Dashboard 页面布局（改造后）:
┌─────────────────────────────────────────────────────┐
│  QuickGenerate        │  VoiceGenerator             │
│  (获取新闻 + 改写稿件)  │  (音色选择，不变)             │
├───────────────────────┼─────────────────────────────┤
│  ScriptPreview        │  SegmentEditor ← 新组件     │
│  (稿件预览/编辑)        │  (逐句列表 + 音频控制)        │
│                       │                             │
│                       │  AudioPlayer                │
│                       │  (最终合并音频播放)            │
└───────────────────────┴─────────────────────────────┘
```

### SegmentEditor 组件

核心交互组件，替代原有的"一键生成语音"按钮。

**每句操作**：
- ▶ 播放：内联 mini 播放器，点击播放该句音频
- ✏️ 编辑：文本变为可编辑 textarea，修改后保存并回退状态
- 🔄 重新生成：对该句重新调用 TTS
- 🗑 删除：删除该句，后续句子自动重排序

**底部操作栏**：
- **全部生成**：批量生成所有 pending/failed 句子
- **合并为完整音频**：仅在所有句子均为 `generated` 时可点击

**状态显示**：
- ⏳ 待生成（pending）
- 🔄 生成中（generating）
- ✅ 已生成 + 时长（generated）
- ❌ 失败（failed）

### ScriptPreview 组件调整

- 原"生成语音播报"按钮替换为"切分并生成"
- 点击后调用 `POST /api/broadcast/:id/split`
- 切分完成后 SegmentEditor 自动出现

### AudioPlayer 组件调整

- `mode='segmented'` 且未合并时，显示提示："请先合并所有句子音频"
- 合并后正常播放最终音频

### Zustand Store 新增

```ts
// 状态
segments: Segment[];
isSplitting: boolean;
isMerging: boolean;

// Actions
splitScript(broadcastId: number): Promise<void>;
fetchSegments(broadcastId: number): Promise<void>;
updateSegmentText(segId: number, text: string): Promise<void>;
regenerateSegment(segId: number): Promise<void>;
batchGenerateSegments(): Promise<void>;
deleteSegment(segId: number): Promise<void>;
mergeSegments(): Promise<void>;
```

---

## 文件命名规范

```
backend/audio/
  segment_{broadcastId}_{segmentIndex}.wav   ← 单句音频
  broadcast_{id}_merged.wav                  ← 合并后最终音频
  broadcast_{timestamp}.wav                  ← 旧流程音频（兼容）
```

---

## 音频生命周期与淘汰策略

- 未保存广播的 segment 音频，跟随广播记录一起被 10 条上限淘汰逻辑清理
- 已保存广播的 segment 音频，跟随广播记录一起被 50 条上限淘汰逻辑清理
- 合并后的 `broadcast_*_merged.wav` 作为 `broadcasts.audio_path`，走原有保存/淘汰流程
- 删除广播时，级联删除所有 segments 记录和音频文件

---

## 错误处理

| 场景 | 处理方式 |
|------|---------|
| AI 切分失败 | 返回错误提示，稿件保持原样，用户可重试 |
| 单句 TTS 失败 | 该句 `status='failed'`，其他句子不受影响，可单独重试 |
| 批量生成中某句失败 | 跳过继续，返回结果中标记失败句 |
| 合并时有句子未生成 | 阻止合并，返回 400 提示需先完成所有句子生成 |
| WAV 格式不一致 | 合并前做 header 校验，不一致时报错（理论上不会发生） |

---

## 向后兼容

- 已有的 `mode=null` 或 `mode='whole'` 的广播记录完全不受影响
- 历史页面和 AudioPlayer 对旧数据的展示行为不变
- 仅当用户点击"切分并生成"时才创建 segment 数据
- `POST /api/broadcast/generate` 废弃但路由保留，返回提示信息
