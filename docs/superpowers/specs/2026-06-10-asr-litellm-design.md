# ASR 接入 + LiteLLM 集成 + API Key 命名规范化 设计文档

## 概述

本设计涵盖三项关联改造：

1. **ASR 能力接入**：集成 MiMo ASR 模型（`mimo-v2.5-asr`），支持用户上传音视频文件转录为文字
2. **LiteLLM Proxy 集成**：部署 LiteLLM Proxy 作为 LLM 调用的统一网关，代理 MiMo Token Plan 的 LLM 请求
3. **API Key 命名规范化**：区分 MiMo 平台标准服务 Key 和 MiMo Token Plan 订阅 Key

## 架构总览

```
┌─────────────────────────────────────────────────────┐
│                    前端 (React)                       │
│  Settings.tsx  ←→  Transcribe.tsx (新增)            │
└──────────┬───────────────────────┬───────────────────┘
           │                       │
           ▼                       ▼
┌─────────────────────────────────────────────────────┐
│              后端 Express (Node.js)                   │
│                                                      │
│  routes/settings.js   ←→  routes/transcribe.js (新增)│
│           │                       │                  │
│           ▼                       ▼                  │
│  services/mimo.js     services/asr.js (新增)        │
│   (OpenAI SDK →        (Axios →                     │
│    LiteLLM Proxy)       api.xiaomimimo.com)         │
│           │                       │                  │
│  services/tts.js       services/audio.js            │
│   (Axios →              (ffmpeg 视频提取)            │
│    api.xiaomimimo.com)                               │
└───────┬──────────────────────────────┬───────────────┘
        │                              │
        ▼                              ▼
┌─────────────────┐    ┌──────────────────────────────┐
│ LiteLLM Proxy   │    │     MiMo API                 │
│ (Docker)         │    │ api.xiaomimimo.com           │
│  ↓               │    │  ├── TTS (mimo-v2.5-tts)    │
│ MiMo Token Plan  │    │  └── ASR (mimo-v2.5-asr)   │
│ Token Plan API   │    └──────────────────────────────┘
└─────────────────┘
```

**关键设计决策：**

- LLM 调用链路变更：`mimo.js` 从 Anthropic SDK → OpenAI Node.js SDK，baseURL 指向 LiteLLM Proxy（默认 `http://localhost:4000`）
- TTS/ASR 调用不变：继续用 Axios 直连 `api.xiaomimimo.com`，使用 MiMo API Key
- ASR 作为新服务：新增 `services/asr.js` + `routes/transcribe.js`，独立于现有 TTS 流程
- 视频处理：引入 ffmpeg-static（npm 包），在后端自动提取音频

## API Key 命名与迁移

### 命名映射

| 现有名称 | 新名称 | 用途 | 说明 |
|---------|--------|------|------|
| `mimo_tts_api_key` | `mimo_api_key` | TTS + ASR 共用 | MiMo 平台标准服务 Key，调用 `api.xiaomimimo.com` |
| `mimo_api_key` | `mimo_token_plan_api_key` | LLM 调用 | MiMo Token Plan 订阅 Key，通过 LiteLLM Proxy 调用 |

### 迁移策略

数据库 `settings` 表的 key 是 PRIMARY KEY，不能直接重命名。采用"新增 + 迁移 + 清理"三步：

```js
// db/index.js 迁移逻辑

// 1. 新增 mimo_token_plan_api_key（默认空字符串）
db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
  .run('mimo_token_plan_api_key', JSON.stringify(''));

// 2. 将旧 mimo_api_key 的值迁移到 mimo_token_plan_api_key
const oldLlmKey = db.prepare('SELECT value FROM settings WHERE key = ?').get('mimo_api_key');
if (oldLlmKey && JSON.parse(oldLlmKey.value)) {
  db.prepare('UPDATE settings SET value = ? WHERE key = ?')
    .run(oldLlmKey.value, 'mimo_token_plan_api_key');
}

// 3. mimo_tts_api_key 重命名为 mimo_api_key
const oldTtsKey = db.prepare('SELECT value FROM settings WHERE key = ?').get('mimo_tts_api_key');
if (oldTtsKey && JSON.parse(oldTtsKey.value)) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .run('mimo_api_key', oldTtsKey.value);
}

// 4. 清理旧 key
db.prepare('DELETE FROM settings WHERE key = ?').run('mimo_tts_api_key');
```

### 前端 Settings 接口变更

```typescript
export interface Settings {
  mimo_api_key: string;              // MiMo 服务 Key（TTS + ASR）
  mimo_token_plan_api_key: string;   // MiMo Token Plan Key（LLM）
  // ... 其他字段不变
}
```

### 前端 Settings 页面显示名变更

| 字段 | 旧标签 | 新标签 |
|------|--------|--------|
| `mimo_api_key` | "LLM API Key" | "MiMo API Key"（TTS/ASR 共用） |
| `mimo_token_plan_api_key` | "TTS API Key" | "MiMo Token Plan API Key"（LLM 调用） |

测试连接按钮更新：
- `testApiKey('tts')` → `testApiKey('mimo')`（测试 MiMo 服务 Key）
- `testApiKey('llm')` → `testApiKey('token_plan')`（测试 Token Plan Key）

## LiteLLM Proxy 部署

### docker-compose.yml（项目根目录）

```yaml
version: '3.8'

services:
  litellm:
    image: ghcr.io/berriai/litellm:main-latest
    ports:
      - "4000:4000"
    volumes:
      - ./litellm_config.yaml:/app/config.yaml
    command: --config /app/config.yaml
    environment:
      - LITELLM_MASTER_KEY=${LITELLM_MASTER_KEY:-sk-litellm-local}
    restart: unless-stopped
```

### litellm_config.yaml（项目根目录）

```yaml
model_list:
  - model_name: mimo-v2.5
    litellm_params:
      model: anthropic/mimo-v2.5
      api_base: https://token-plan-cn.xiaomimimo.com/anthropic/v1
      api_key: os.environ/MIMO_TOKEN_PLAN_API_KEY
      extra_headers:
        api-key: os.environ/MIMO_TOKEN_PLAN_API_KEY

general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY
```

使用 `anthropic/` 前缀，LiteLLM 自动处理协议转换。

### 环境变量

新增 `.env.example` 文件：

```env
# MiMo 平台标准服务 Key（TTS + ASR）
MIMO_API_KEY=

# MiMo Token Plan 订阅 Key（LLM）
MIMO_TOKEN_PLAN_API_KEY=

# LiteLLM Proxy 管理 Key
LITELLM_MASTER_KEY=sk-litellm-local

# LiteLLM Proxy 地址（后端使用）
LITELLM_BASE_URL=http://localhost:4000/v1
```

### mimo.js 改造

从 Anthropic SDK 迁移到 OpenAI Node.js SDK：

```js
const OpenAI = require('openai');

function createClient() {
  const apiKey = getApiKey('token_plan');
  return new OpenAI({
    apiKey,
    baseURL: process.env.LITELLM_BASE_URL || 'http://localhost:4000/v1',
  });
}
```

`rewriteToScript` 和 `splitScript` 的 `client.messages.create()` 调用改为 `client.chat.completions.create()`，适配 OpenAI SDK 格式。

### getApiKey 类型映射更新

```js
function getApiKey(type = 'mimo') {
  const keyNameMap = {
    'mimo': 'mimo_api_key',
    'token_plan': 'mimo_token_plan_api_key',
  };
  const keyName = keyNameMap[type];
  if (!keyName) throw new Error(`未知的 Key 类型: ${type}`);
  // ... 读取逻辑不变
}
```

## ASR 服务

### MiMo ASR API 概要

| 项目 | 详情 |
|------|------|
| 模型 ID | `mimo-v2.5-asr` |
| Endpoint | `https://api.xiaomimimo.com/v1/chat/completions` |
| 认证 | 与 TTS 相同的 `api-key` header |
| 请求格式 | OpenAI Chat Completions + `input_audio` |
| 音频格式 | WAV、MP3 |
| 大小限制 | Base64 编码后 ≤ 10MB |
| 语言 | auto（默认）、zh、en |

### services/asr.js

实现模式严格镜像 `services/tts.js`：

```js
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { getApiKey } = require('./mimo');

const ASR_URL = 'https://api.xiaomimimo.com/v1/chat/completions';
const ASR_MODEL = 'mimo-v2.5-asr';
const MAX_BASE64_SIZE = 10 * 1024 * 1024;

/**
 * 转录音频文件为文字
 * @param {Object} params
 * @param {string} params.audioPath - 音频文件路径（WAV/MP3）
 * @param {string} [params.language='auto'] - 语言 (auto/zh/en)
 * @returns {Promise<{text: string, usage: Object}>}
 */
async function transcribeAudio({ audioPath, language = 'auto' }) {
  if (!audioPath) {
    throw new Error('请提供音频文件路径');
  }

  const audioBuffer = fs.readFileSync(audioPath);
  const base64Audio = audioBuffer.toString('base64');

  if (base64Audio.length > MAX_BASE64_SIZE) {
    throw new Error('音频文件过大，Base64 编码后不能超过 10MB');
  }

  const mimeType = getMimeType(audioPath);
  const apiKey = getApiKey('mimo');

  // 带重试的 API 调用（与 tts.js 一致的重试逻辑）
  const MAX_RETRIES = 3;
  let response;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      response = await axios.post(ASR_URL, {
        model: ASR_MODEL,
        messages: [{
          role: 'user',
          content: [{
            type: 'input_audio',
            input_audio: {
              data: `data:${mimeType};base64,${base64Audio}`
            }
          }]
        }],
        asr_options: { language }
      }, {
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json'
        },
        timeout: 120000
      });
      break;
    } catch (err) {
      if (err.response?.status === 429 && attempt < MAX_RETRIES) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      if (err.response?.status === 429) {
        throw new Error('MiMo API 请求过于频繁，请稍后再试');
      }
      if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
        throw new Error('MiMo ASR API 请求超时，请稍后再试');
      }
      if (!err.response) {
        throw new Error(`MiMo ASR API 网络错误: ${err.message}`);
      }
      throw new Error(`MiMo ASR API 调用失败: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  const text = response.data?.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error('MiMo ASR API 未返回转录结果');
  }

  return { text, usage: response.data.usage };
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap = { '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };
  return mimeMap[ext] || 'audio/wav';
}

module.exports = { transcribeAudio };
```

### 视频音频提取（services/audio.js 新增）

```js
const { execFile } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

/**
 * 从视频文件提取音频
 * @param {string} videoPath - 视频文件路径
 * @returns {Promise<string>} 提取的音频文件路径（WAV）
 */
async function extractAudioFromVideo(videoPath) {
  const outputPath = videoPath.replace(/\.[^.]+$/, '.wav');
  await new Promise((resolve, reject) => {
    execFile(ffmpegPath, [
      '-i', videoPath,
      '-vn',
      '-acodec', 'pcm_s16le',
      '-ar', '24000',
      '-ac', '1',
      '-y',
      outputPath
    ], (error) => {
      if (error) reject(new Error(`音频提取失败: ${error.message}`));
      else resolve();
    });
  });
  return outputPath;
}
```

输出格式 24kHz/16bit/mono WAV，与项目现有音频格式一致（参见 `audio.js` 的 `mergeWavFiles` 要求）。

## 转录 API 路由

### routes/transcribe.js

镜像 `routes/broadcast.js` 的结构：

```js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { transcribeAudio } = require('../services/asr');
const { extractAudioFromVideo } = require('../services/audio');
const { cleanAudioFile } = require('../utils/validation');

const upload = multer({
  dest: path.join(__dirname, '../../uploads'),
  limits: { fileSize: 50 * 1024 * 1024 },
});
```

**端点：**

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/transcribe` | 上传音频文件并转录 |
| POST | `/api/transcribe/video` | 上传视频文件，提取音频后转录 |

两个端点都使用 multer 处理文件上传，转录完成后在 finally 块中调用 `cleanAudioFile()` 清理临时文件。

### app.js 路由挂载

```js
app.use('/api/transcribe', require('./routes/transcribe'));
```

## 前端变更

### Transcribe.tsx（新增页面）

独立页面，包含：
- 文件上传区域（拖拽或点击选择，支持 WAV/MP3/MP4/MOV 等格式）
- 语言选择下拉框（自动检测/中文/英文）
- "开始转录"按钮
- 转录结果展示区（可编辑的文本区域）
- "复制文字"和"导入到稿件编辑器"操作按钮

### Settings.tsx 更新

API 配置区标签更新，测试连接按钮参数适配新 Key 名。

### Store 变更（store/index.ts）

Settings 接口更新 Key 字段名。新增转录相关 state 和 action（transcribing、transcriptionResult、transcribeError、transcribeAudio、transcribeVideo、clearTranscription）。

### API 调用（services/api.ts）

新增 `transcribeAudio(file, language?)` 和 `transcribeVideo(file, language?)` 函数，使用 FormData 上传文件。

### 路由（App.tsx）

新增 `/transcribe` 路由指向 `Transcribe` 组件。

## 错误处理

| 错误场景 | 处理方式 | HTTP 状态码 |
|---------|---------|------------|
| 未上传文件 | 返回错误提示 | 400 |
| 文件格式不支持 | multer fileFilter 拒绝 | 400 |
| 文件过大（>50MB） | multer limits 拒绝 | 413 |
| Base64 超过 10MB | 服务层抛出错误 | 400 |
| API Key 未配置 | getApiKey 抛出错误 | 500 |
| 429 限流 | 指数退避重试 3 次后报错 | 429 |
| 请求超时 | 120s 超时报错 | 500 |
| 网络错误 | 网络错误提示 | 500 |
| ffmpeg 提取失败 | 错误提示 | 500 |

临时文件管理：
- multer 上传到 `backend/uploads/` 临时目录
- 转录完成后调用 `cleanAudioFile()` 清理
- 视频转录额外清理提取的音频文件
- `backend/uploads/` 目录加入 `.gitignore`

## 新增依赖

### 后端（backend/package.json）

| 依赖 | 用途 | 类型 |
|------|------|------|
| `openai` | OpenAI Node.js SDK，替代 @anthropic-ai/sdk | 替换 |
| `multer` | 文件上传中间件 | 新增 |
| `ffmpeg-static` | 跨平台 ffmpeg 二进制，视频音频提取 | 新增 |

移除：`@anthropic-ai/sdk`

### 基础设施

| 组件 | 用途 |
|------|------|
| Docker Compose | 编排 LiteLLM Proxy |
| LiteLLM Proxy | LLM 调用统一网关 |

## 测试策略

| 测试文件 | 测试内容 |
|---------|---------|
| `tests/services/asr.test.js` | ASR 服务单元测试：mock axios，验证请求格式、重试逻辑、错误处理 |
| `tests/routes/transcribe.test.js` | 转录路由集成测试：supertest + mock ASR 服务，验证文件上传、响应格式 |
| `tests/services/mimo.test.js` | 更新现有测试：适配 Key 重命名、OpenAI SDK 迁移 |

Mock 策略与现有测试一致：
- 外部 API 用 `jest.mock('axios')` 或 `jest.mock('openai')` mock
- 文件系统用真实临时文件
- 数据库用内存 SQLite

## 改动文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `docker-compose.yml` | 新增 | LiteLLM Proxy 部署 |
| `litellm_config.yaml` | 新增 | LiteLLM 模型配置 |
| `.env.example` | 新增 | 环境变量模板 |
| `.gitignore` | 更新 | 新增 uploads/ 目录 |
| `backend/package.json` | 更新 | 新增 openai, multer, ffmpeg-static；移除 @anthropic-ai/sdk |
| `backend/src/services/mimo.js` | 重写 | Anthropic SDK → OpenAI SDK；getApiKey 类型映射更新 |
| `backend/src/services/asr.js` | 新增 | ASR 转录服务 |
| `backend/src/services/audio.js` | 更新 | 新增 extractAudioFromVideo |
| `backend/src/services/tts.js` | 更新 | getApiKey 调用参数适配 |
| `backend/src/routes/transcribe.js` | 新增 | 转录 API 路由 |
| `backend/src/routes/settings.js` | 更新 | test-key 端点适配新 Key 名 |
| `backend/src/app.js` | 更新 | 挂载 transcribe 路由 |
| `backend/src/db/index.js` | 更新 | Key 重命名迁移 |
| `backend/src/db/schema.sql` | 更新 | 新增默认 settings |
| `frontend/src/store/index.ts` | 更新 | Settings 接口 + 转录 state/action |
| `frontend/src/services/api.ts` | 更新 | 新增转录 API 调用 |
| `frontend/src/pages/Settings.tsx` | 更新 | Key 标签更新 |
| `frontend/src/pages/Transcribe.tsx` | 新增 | 转录页面 |
| `frontend/src/App.tsx` | 更新 | 新增转录路由 |
| `backend/tests/services/asr.test.js` | 新增 | ASR 服务测试 |
| `backend/tests/routes/transcribe.test.js` | 新增 | 转录路由测试 |
| `backend/tests/services/mimo.test.js` | 更新 | 适配 Key 变更 |
| `CLAUDE.md` | 更新 | 新增 ASR 能力说明、Key 命名更新 |
| `BACKEND_CONVENTIONS.md` | 更新 | 新增 ASR 服务说明、新依赖说明 |
