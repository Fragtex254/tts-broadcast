# 语音生成器增强设计：试听、预设与面板调整

## 概述

对 VoiceGenerator 组件进行三项增强：
1. **克隆/设计试听流程** — 让用户在正式生成播报前，可以反复试听和微调音色
2. **预设管理系统** — 保存满意的音色配置为可复用预设
3. **面板宽度动态调整** — 左侧面板支持在视口 25%-75% 范围内拖拽调整

## 1. 数据模型

### 新增 `voice_presets` 表

```sql
CREATE TABLE IF NOT EXISTS voice_presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('clone', 'design')),
  name TEXT NOT NULL,
  style_prompt TEXT DEFAULT '',
  trial_audio_path TEXT,
  -- 克隆专用
  original_audio_path TEXT,
  -- 设计专用
  design_prompt TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

字段说明：
- `type`：预设类型，`clone` 或 `design`
- `name`：用户自定义预设名称（如"温柔女声"）
- `style_prompt`：风格提示词（两种类型共用）
- `trial_audio_path`：试听生成的音频文件路径（相对路径，如 `/audio/preset_trial_1.wav`）
- `original_audio_path`：克隆模式上传的原始参考音频路径（仅 clone 类型）
- `design_prompt`：音色描述文本（仅 design 类型）

### 音频文件存储

- 试听音频：`backend/audio/preset_trial_{id}.wav`
- 原始参考音频：`backend/audio/preset_original_{id}.{ext}`
- 文件命名使用预设 ID 确保唯一性
- 删除预设时同步删除关联音频文件

## 2. API 设计

### 预设 CRUD

| 方法 | 路径 | 功能 |
|------|------|------|
| `GET` | `/api/voice-presets` | 列出所有预设 |
| `POST` | `/api/voice-presets` | 创建预设（multipart/form-data，含音频文件） |
| `DELETE` | `/api/voice-presets/:id` | 删除预设及其关联音频文件 |

### 试听接口

| 方法 | 路径 | 功能 |
|------|------|------|
| `POST` | `/api/voice-presets/trial/clone` | 克隆试听（上传参考音频 + 试听文本 + 可选风格提示 → 返回音频） |
| `POST` | `/api/voice-presets/trial/design` | 设计试听（音色描述 + 试听文本 + 可选风格提示 → 返回音频） |

试听接口独立于预设 CRUD，因为试听不一定要保存为预设。

#### `POST /api/voice-presets/trial/clone`

请求：`multipart/form-data`
- `reference_audio`：参考音频文件（mp3/wav/ogg/m4a 等，后端转为 mp3/wav 的 base64）
- `trial_text`：试听文本
- `style_prompt`：风格提示词（可选）

响应：
```json
{ "audioUrl": "/audio/preset_trial_xxx.wav" }
```

#### `POST /api/voice-presets/trial/design`

请求：`application/json`
```json
{
  "design_prompt": "音色描述文本",
  "trial_text": "试听文本",
  "style_prompt": "风格提示词（可选）"
}
```

响应：
```json
{ "audioUrl": "/audio/preset_trial_xxx.wav" }
```

#### `POST /api/voice-presets`

请求：`multipart/form-data`
- `type`：`clone` 或 `design`
- `name`：预设名称
- `style_prompt`：风格提示词
- `trial_audio`：试听音频文件（来自试听接口返回的音频）
- `reference_audio`：原始参考音频文件（仅 clone 类型）
- `design_prompt`：音色描述（仅 design 类型）

### 音频格式处理

前端上传时接受多种格式（mp3、wav、ogg、m4a 等），后端在调用 MiMo TTS 克隆 API 前将音频转为 base64 编码。MiMo API 要求 base64 前缀为 `data:{MIME_TYPE};base64,{BASE64_AUDIO}`，支持 `audio/mpeg` 和 `audio/wav`。

对于非 mp3/wav 格式，后端使用 `fluent-ffmpeg`（npm 包）调用系统 ffmpeg 进行格式转换。部署环境需预装 ffmpeg。

## 3. 前端设计

### 3.1 VoiceGenerator 页签结构

从 3 个页签扩展为 4 个。原有"预设"页签重命名为"内置"以避免与新增的"预设"页签混淆：

```
[内置] [克隆] [设计] [预设]
```

页签顺序：内置 → 克隆 → 设计 → 预设

### 3.2 克隆页签 UI

```
┌─────────────────────────┐
│  克隆                    │
├─────────────────────────┤
│  参考音频                │
│  ┌─────────────────────┐│
│  │ 📎 上传音频文件     ││
│  │  支持 MP3/WAV/OGG.. ││
│  └─────────────────────┘│
│                          │
│  风格提示词（可选）       │
│  ┌─────────────────────┐│
│  │ 如：温柔、专业...    ││
│  └─────────────────────┘│
│                          │
│  试听文本                │
│  ┌─────────────────────┐│
│  │ 输入任意文本试听...  ││
│  └─────────────────────┘│
│                          │
│  [▶ 试听] [💾 保存预设]  │
│                          │
│  ┌─ 试听结果 ───────────┐│
│  │ 🔊 音频播放器        ││
│  └─────────────────────┘│
└─────────────────────────┘
```

交互流程：
1. 上传参考音频（拖拽或点击上传，前端校验格式）
2. 可选填写风格提示词
3. 填写试听文本
4. 点击"试听" → 调用 `POST /api/voice-presets/trial/clone` → 播放结果
5. 不满意可修改参数后重新试听
6. 满意后可保存为预设，或直接用于生成播报

"保存预设"按钮点击后弹出输入框填写预设名称，确认后调用创建预设 API。

### 3.3 设计页签 UI

```
┌─────────────────────────┐
│  设计                    │
├─────────────────────────┤
│  音色描述                │
│  ┌─────────────────────┐│
│  │ 描述你想要的音色...  ││
│  │ （支持多行输入）     ││
│  └─────────────────────┘│
│                          │
│  风格提示词（可选）       │
│  ┌─────────────────────┐│
│  │ 如：温柔、专业...    ││
│  └─────────────────────┘│
│                          │
│  试听文本                │
│  ┌─────────────────────┐│
│  │ 输入任意文本试听...  ││
│  └─────────────────────┘│
│                          │
│  [▶ 试听] [💾 保存预设]  │
│                          │
│  ┌─ 试听结果 ───────────┐│
│  │ 🔊 音频播放器        ││
│  └─────────────────────┘│
└─────────────────────────┘
```

交互流程与克隆类似，但无需上传音频。

### 3.4 预设页签 UI

```
┌─────────────────────────┐
│  [内置] [克隆] [设计] [预设] │
├─────────────────────────┤
│                          │
│  ┌─ 预设列表 ───────────┐│
│  │                      ││
│  │  🏷 克隆  温柔女声    ││
│  │  风格：温柔、专业     ││
│  │  [▶ 试听] [🗑 删除]  ││
│  │                      ││
│  │  🏷 设计  磁性男声    ││
│  │  描述：低沉有磁性... ││
│  │  [▶ 试听] [🗑 删除]  ││
│  │                      ││
│  │  🏷 克隆  活泼少女    ││
│  │  风格：活泼、俏皮     ││
│  │  [▶ 试听] [🗑 删除]  ││
│  │                      ││
│  └──────────────────────┘│
│                          │
│  （点击预设项可快速应用   │
│   到当前播报的音色配置）  │
└─────────────────────────┘
```

交互说明：
- 平铺展示所有预设，每项带类型标签（彩色区分 clone/design）
- 显示预设名称 + 关键信息摘要（风格提示词或音色描述）
- 点击"试听"播放该预设的试听音频
- 点击"删除"二次确认后删除预设及其关联音频
- 点击预设项本身 → 快速应用该预设的音色配置到当前播报（切换到对应页签并填充参数）
- 预设数量上限 20 个

### 3.5 面板宽度动态调整

当前实现（`ScriptEditor.tsx`）：
- `MIN_LEFT_WIDTH = 200`（固定像素）
- `MAX_LEFT_WIDTH = 400`（固定像素）
- `DEFAULT_LEFT_WIDTH = 260`

改为：
- `MIN_LEFT_WIDTH = window.innerWidth * 0.25`
- `MAX_LEFT_WIDTH = window.innerWidth * 0.75`
- `DEFAULT_LEFT_WIDTH = 260`（保持不变）
- 监听 `window.resize` 事件，窗口大小变化时更新限制范围
- 拖拽时实时使用当前的百分比限制

## 4. 后端实现要点

### 4.1 新增文件

- `backend/src/routes/voicePresets.js` — 预设路由
- `backend/src/services/audioConvert.js` — 音频格式转换服务（如需要 ffmpeg）

### 4.2 修改文件

- `backend/src/db/schema.sql` — 新增 voice_presets 表
- `backend/src/db/index.js` — 迁移代码
- `backend/src/app.js` — 注册新路由

### 4.3 音频格式转换

对于非 mp3/wav 格式的参考音频，后端需要转换：
- 使用 fluent-ffmpeg 或 child_process 调用 ffmpeg
- 转换为 wav 格式后再编码为 base64
- 如系统未安装 ffmpeg，返回明确的错误提示

## 5. 前端实现要点

### 5.1 新增文件

- `frontend/src/components/Dashboard/VoicePresetTab.tsx` — 预设页签组件
- `frontend/src/components/Dashboard/CloneTrialPanel.tsx` — 克隆试听面板
- `frontend/src/components/Dashboard/DesignTrialPanel.tsx` — 设计试听面板
- `frontend/src/components/Dashboard/AudioUploader.tsx` — 音频上传组件

### 5.2 修改文件

- `frontend/src/components/Dashboard/VoiceGenerator.tsx` — 新增预设页签，改造克隆/设计页签，将原有"预设"tab 重命名为"内置"（VOICE_TYPES 的 value 从 `preset` 改为 `builtin`，保持向后兼容）
- `frontend/src/pages/ScriptEditor.tsx` — 面板宽度动态限制
- `frontend/src/services/api.ts` — 新增预设和试听 API
- `frontend/src/store/index.ts` — 预设相关状态管理

### 5.3 状态管理

Zustand store 新增：
```typescript
interface VoicePreset {
  id: number;
  type: 'clone' | 'design';
  name: string;
  stylePrompt: string;
  trialAudioPath: string;
  originalAudioPath?: string;
  designPrompt?: string;
}

// store actions
fetchPresets: () => Promise<void>;
presets: VoicePreset[];
```

## 6. 错误处理

- 音频上传格式不支持 → 前端校验提示，不发请求
- 音频文件过大（>10MB）→ 前端校验提示
- TTS API 调用失败 → 显示错误信息，允许重试
- 预设数量达到上限（20）→ 禁用保存按钮，提示删除旧预设
- ffmpeg 未安装 → 后端返回明确错误信息

## 7. 测试策略

- 后端：预设 CRUD API 的单元测试（supertest）
- 后端：试听接口的集成测试
- 前端：VoiceGenerator 各页签的交互测试
- 前端：面板拖拽在不同视口宽度下的行为测试
