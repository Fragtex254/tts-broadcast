# ASR 上传转录设计文档

> 2026-06-11 更新：长音视频切片转录已作为后续增强实现。当前后端会在单次 ASR data URL 超过 10MB 时，优先按静音点切片、逐片调用 ASR，并对前端返回拼接后的完整文本。

## 背景

项目已经有 MiMo TTS、MiMo LLM、音频上传和分段 TTS 工作流。`docs/asr.md` 记录了 MiMo-V2.5-ASR 的调用方式，但仓库中尚未实现 ASR 能力。此前曾有一版同时包含 LiteLLM Proxy、API Key 重命名和 ASR 的更大范围方案；本次先实现独立的上传转录能力，不引入 LLM 网关迁移。

目标是支持用户上传音频或视频，使用 MiMo ASR 转写成文本，并可将转写结果导入现有口播稿编辑器，继续使用现有切分和 TTS 流程。

## 范围

本次包含：

- 新增独立「转录」页面。
- 支持上传音频或视频文件。
- 支持语言选择：自动检测、中文、英文。
- 调用 `mimo-v2.5-asr` 返回转录文本。
- 转录结果可编辑、复制、导入到口播稿编辑器。
- 抽出后端媒体处理能力，避免继续把上传转码逻辑散落在路由里。
- 抽出 MiMo 标准 API 客户端小封装，供 ASR 使用，并为后续 TTS 复用留下清晰边界。
- 更新后端、前端和项目规范文档中新增 ASR 能力相关说明。

本次不包含：

- 不接入 LiteLLM Proxy。
- 不重写 LLM 调用链路。
- 不替换 Anthropic SDK。
- 不重命名现有 API Key。
- 不新增转录历史数据库表。
- 不做长任务 SSE。第一版转录请求使用普通 HTTP loading/error 状态。

## 用户体验

侧边栏新增「转录」入口，进入 `/transcribe` 页面。页面第一屏就是可用的转录工作台：

1. 用户选择或拖拽音频/视频文件。
2. 用户选择语言：自动检测、中文、英文，默认自动检测。
3. 点击「开始转录」。
4. 页面显示 loading 状态，按钮禁用，避免重复提交。
5. 成功后展示可编辑 textarea。
6. 用户可以复制文本，或点击「导入稿件」。
7. 「导入稿件」会把文本写入全局 `script`，跳转到 `/editor`，让用户继续切分和生成语音。

错误状态在页面内以中文显示，使用现有 Soft Editorial 风格的错误提示。

## 后端设计

### 路由

新增 `backend/src/routes/transcribe.js`，挂载到：

```js
app.use('/api/transcribe', require('./routes/transcribe'));
```

端点：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/transcribe` | 上传音频或视频并返回转录文本 |

请求格式为 `multipart/form-data`：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `media` | file | 是 | 音频或视频文件 |
| `language` | string | 否 | `auto` / `zh` / `en`，默认 `auto` |

成功响应：

```json
{
  "text": "转录出的文本",
  "usage": {}
}
```

失败响应沿用项目规范：

```json
{ "error": "中文错误消息" }
```

### ASR 服务

新增 `backend/src/services/asr.js`：

```js
async function transcribeMedia({ file, language = 'auto' }) {}
```

职责：

- 校验 `language` 只能是 `auto`、`zh`、`en`。
- 调用媒体服务，把上传文件转换为 MiMo ASR 接受的 data URL。
- 校验 Base64 data URL 大小不超过 10MB。
- 调用 MiMo ASR：`model: 'mimo-v2.5-asr'`。
- 从 `choices[0].message.content` 提取文本。
- 将 MiMo 401、429、超时、网络错误转成中文错误。

ASR 复用现有 `mimo_tts_api_key`，因为 ASR 和 TTS 都直连 `https://api.xiaomimimo.com/v1/chat/completions`。本次不调整 settings 字段名。

### 媒体服务

新增 `backend/src/services/media.js`：

```js
async function fileToAsrDataUrl({ file }) {}
```

职责：

- `wav`、`mp3` 直接编码为 data URL。
- 视频和其他可由 ffmpeg 读取的媒体转为 wav 后编码。
- 使用临时目录保存转换文件，并在 `finally` 清理。
- 对不支持或转换失败的文件抛出中文错误。

为保证视频支持在本机和部署环境稳定，新增后端依赖 `ffmpeg-static`。现有 `fluent-ffmpeg` 可以继续存在，本次媒体服务优先使用 `ffmpeg-static` 的二进制路径执行转换，减少对系统 ffmpeg 的依赖。

### MiMo 标准 API 客户端

新增 `backend/src/services/mimoApiClient.js`：

```js
async function postChatCompletions({ apiKey, payload, serviceName }) {}
```

职责：

- 固定 base URL：`https://api.xiaomimimo.com/v1/chat/completions`。
- 统一设置 `api-key` 和 `Content-Type`。
- 统一 timeout：120 秒。
- 统一 429 指数退避，最多 3 次。
- 统一错误映射，返回中文错误。

本次只让 ASR 使用该 client，不迁移现有 TTS 调用链路。TTS 后续可以单独做低风险复用重构，不阻塞 ASR。

### 上传限制

MiMo ASR 要求 Base64 编码后的字符串不超过 10MB。由于不同格式转码后的体积不同，后端采用双层限制：

- multer 原始上传上限：50MB。
- 转换后的 Base64 data URL 上限：10MB。

支持的第一版文件类型：

- 音频：`wav`、`mp3`、`mpeg`、`m4a`。
- 视频：`mp4`、`mov`、`webm`。

## 前端设计

### API 层

`frontend/src/services/api.ts` 新增：

```ts
export const transcribeApi = {
  transcribe: (formData: FormData) => api.post('/transcribe', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
};
```

API 层不处理错误。

### Store

新增 `frontend/src/store/transcribeSlice.ts`，并在 `store/index.ts` 组合。类型写入 `store/types.ts`：

```ts
interface TranscriptionResult {
  text: string;
  usage?: Record<string, unknown>;
}
```

新增状态和 action：

- `transcriptionText`
- `isTranscribing`
- `transcribeMedia(file, language)`
- `clearTranscription()`
- `setTranscriptionText(text)`

导入稿件时复用现有 `updateScript(text)`，不新增广播记录。

### 页面

新增 `frontend/src/pages/Transcribe.tsx`，并在 `App.tsx` 和 `Sidebar.tsx` 增加 `/transcribe` 路由入口。

页面组件负责选择文件、显示错误和触发 store action。UI 遵守 `frontend/FRONTEND_CONVENTIONS.md`：

- 毛玻璃卡片。
- 语言选择使用 select。
- loading 用按钮内进度条或 `animate-pulse`，不使用 spinner。
- 错误状态使用 `bg-pink/10` + `animate-shake`。
- 文本结果使用可编辑 textarea。

## 错误处理

| 场景 | 用户提示 |
| --- | --- |
| 未上传文件 | 请上传需要转录的音频或视频文件 |
| 语言参数无效 | 语言参数无效，请选择自动、中文或英文 |
| 文件类型不支持 | 暂不支持该文件类型，请上传 wav、mp3、m4a、mp4、mov 或 webm |
| 上传文件过大 | 文件过大，请压缩后重试 |
| 转换后超过 ASR 限制 | 音频内容过大，转换后超过 ASR 10MB 限制 |
| API Key 缺失 | 请先在设置中配置 mimo_tts_api_key |
| MiMo 401 | MiMo API Key 无效，请检查设置 |
| MiMo 429 | MiMo API 请求过于频繁，请稍后再试 |
| 超时 | MiMo ASR API 请求超时，请稍后再试 |
| 网络错误 | MiMo ASR API 网络错误，请检查网络后重试 |

## 测试策略

后端：

- `backend/tests/services/asr.test.js`
  - mock `mimoApiClient`，验证 ASR payload、语言参数和文本提取。
  - 验证空文件、无文本响应、语言无效错误。
- `backend/tests/services/media.test.js`
  - 验证 wav/mp3 直接编码。
  - mock ffmpeg 执行路径或用小样本验证转换函数错误处理。
- `backend/tests/routes/transcribe.test.js`
  - mock ASR service。
  - 验证未上传文件、成功响应、错误响应。

前端：

- 至少运行 `npm run build`，验证类型和页面编译。

全量验证：

- 后端运行 `npm test -- --runInBand`。
- 前端运行 `npm run build`。

## 文档更新

实现完成后同步更新：

- `CLAUDE.md`
  - 目录结构加入 `routes/transcribe.js`、`services/asr.js`、`services/media.js`、`services/mimoApiClient.js`。
  - 外部 API 说明补充 ASR 已实现且复用 `mimo_tts_api_key`。
- `backend/BACKEND_CONVENTIONS.md`
  - 服务职责表加入 ASR、媒体处理、MiMo 标准 API client。
  - 新增路由列表加入 transcribe。
- `frontend/FRONTEND_CONVENTIONS.md`
  - 当前路由表加入 `/transcribe`。
  - 页面/组件职责说明加入转录页。

## 开放问题

- 长音视频是否要做切片转录：已在后续增强中实现。当前 MiMo 单次 Base64 上限仍为 10MB，但后端会自动切片并拼接转录结果。
- 是否保存转录历史：本次不做，后续如果用户需要再新增表和历史页面。
- 是否迁移 TTS 到 `mimoApiClient`：本次不迁移。后续如果要统一 TTS/ASR HTTP 调用，再单独做小重构。
