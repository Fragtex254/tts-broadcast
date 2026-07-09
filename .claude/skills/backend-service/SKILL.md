---
name: backend-service
description: 新增或修改后端服务、封装外部 API（MiMo LLM/TTS/ASR、AI HOT）时使用。涵盖服务职责边界、解构参数签名、禁用全局变量传依赖、外部 API 失败隔离（timeout、401/429/超时/网络错误转中文）、LLM/TTS 全局队列限速、TLS 按实例隔离、SQLite 与音频文件一致性补偿清理。触发场景：加服务、改 services、接外部 API、调 MiMo/aihot/tts/asr、音频写入清理、孤儿文件、队列限速。
---

# 后端服务层开发

## 何时用 / 不用

- **用**：在 `backend/src/services/*.js`（非 `*Store.js`）新增/修改业务逻辑或外部 API 封装时。
- **不用**：HTTP 路由处理（→ `backend-route`）；单表 SQL（→ `backend-database`，`*Store.js`）；测试（→ `backend-testing`）。

## 核心铁则

1. 服务层负责业务和外部 API；**不碰 `req`/`res`、不设 HTTP 状态码**。
2. 所有 MiMo/AI HOT 调用**必须**设明确 timeout，并把 401、429、超时、网络错误转换为用户可理解的中文错误。
3. 高并发外部模型任务必须经全局队列限速：TTS 走 `services/ttsQueue.js`（MiMo TTS 默认 90 RPM / 9M TPM，硬上限 100 RPM / 10M TPM，不做瞬时突发，按 RPM 间隔启动；运行时单例持久化限速窗口，voiceclone 按 base64 payload 增加 request/payload/concurrency 成本），LLM 走 `services/llmQueue.js`（MiniMax-M3 默认 150 RPM / 7.5M TPM，硬上限 200 RPM / 10M TPM），禁止绕过队列直接并发打外部模型。
4. **不允许全局关闭 TLS 校验**，不允许 `NODE_TLS_REJECT_UNAUTHORIZED=0`；需补 CA 只能在特定 HTTP client 实例内配置。
5. 用解构参数（`function f({ a, b }) {}`）；**不用全局变量传依赖**，用模块级变量 + `init(callback)`。
6. DB 写入与文件写入跨资源：设计补偿清理——DB 成功但文件失败→回滚记录或置 `failed`；文件成功但 DB 失败→删文件避免孤儿。删除经 `cleanAudioFile()`。

## 模式与模板

### 服务职责边界

| 服务 | 职责 | 依赖 |
|------|------|------|
| `aihot.js` | AI HOT API 数据抓取 | axios |
| `audio.js` | WAV 文件操作、resolveVoiceClone | fs, path |
| `asr.js` | MiMo ASR 转录服务，串行处理切片、回调进度并合并文本/usage | mimo, media, mimoApiClient |
| `media.js` | 上传音视频转 ASR data URL；支持 multer 的 buffer/path 输入；长音频按静音点切片并转 MP3 | fs, os, path, child_process, ffmpeg-static |
| `mimo.js` | LLM 配置读取、Anthropic/OpenAI 兼容调用、API Key 管理、Key 测试、模型发现 | @anthropic-ai/sdk, axios |
| `llmQueue.js` | MiniMax-M3 LLM 全局 RPM/TPM 队列限速，默认使用官方限额 75% 安全预算 | rateLimitedQueue |
| `llmModels.js` | OpenAI-compatible 模型列表候选 URL 生成、顺序探测、响应解析 | axios |
| `mimoApiClient.js` | MiMo 标准 API HTTP client（timeout、429 重试、错误映射） | axios |
| `tts.js` | MiMo TTS 语音合成 | axios, mimo (getApiKey) |
| `ttsQueue.js` | MiMo TTS 全局 RPM/TPM/payload/短突发队列限速；voiceclone 按克隆音频 payload 加权 | rateLimitedQueue, rateLimitStore |
| `rateLimitedQueue.js` | 通用 RPM/TPM/payload/短突发/并发/429 退避队列实现 | 可选 rateLimitStore |
| `rateLimitStore.js` | 外部模型限速账本 DAL，保存最近窗口事件和 backoff | db |
| `broadcastStore.js` | broadcasts 表数据访问层（DAL） | db |
| `segmentStore.js` | segments 表数据访问层（DAL） | db, fs, path |
| `scheduleStore.js` | schedules 表数据访问层（DAL） | db |
| `scheduler.js` | 定时任务 cron 编排、业务校验与任务启停 | node-cron, scheduleStore |

### 服务函数签名模式

```js
// ✅ 使用解构参数，便于扩展
async function generateSpeech({ text, voice, voiceType, voiceDesign, voiceClone }) {}

// ❌ 避免位置参数
async function generateSpeech(text, voice, voiceType) {}
```

### 不要使用全局变量传递依赖

```js
// ❌ 避免
global.onScheduleTrigger = callback;

// ✅ 使用模块级变量
let onTriggerCallback = null;
function init(callback) {
  onTriggerCallback = callback;
}
```

### 外部 API 必须隔离失败（来自健壮性规范）

- 所有 MiMo、AI HOT 调用必须设置明确 timeout，并把 401、429、超时、网络错误转换为用户可理解的中文错误。
- 批量 TTS 必须通过 `ttsQueue` 全局限速；批量 LLM 必须通过 `llmQueue` 全局限速；可以对队列 promise 做聚合等待，但禁止在路由或组件里绕过队列直接 `Promise.all` 调 MiMo/MiniMax 外部模型。TTS 走 MiMo 限速，不套 MiniMax 语音接口限额；默认 `MIMO_TTS_RPM_LIMIT=90`、硬上限 100，且 `MIMO_TTS_START_BURST_LIMIT=1`，后续按 `60000 / MIMO_TTS_RPM_LIMIT` 的间隔补启动请求。运行时 TTS 单例必须使用 `rateLimitStore` 持久化最近窗口和 429 backoff；不要把服务重启当成 MiMo 账户窗口重置。`voiceclone` 不能按普通文本请求处理，必须把 `voiceClone` base64 payload 计入 request/payload/concurrency 成本。
- 不允许全局关闭 TLS 校验，不允许使用 `NODE_TLS_REJECT_UNAUTHORIZED=0`。如需补 CA，只能在特定 HTTP client 实例内配置。
- `services/mimoApiClient.js` 统一 MiMo 标准 API 的重试、timeout 与错误映射；新增 MiMo 标准 API 调用优先复用它。

### SQLite 与音频文件一致性（来自健壮性规范）

数据库写入和文件写入跨资源，无法真正事务化；实现时必须设计补偿清理：

- DB 创建成功但文件写入失败：删除或回滚对应记录，或将状态置为 `failed`。
- 文件写入成功但 DB 更新失败：删除刚写入的文件，避免孤儿音频。
- 删除记录前先读取旧路径，删除 DB 后清理文件；失败要记录日志但不能中断级联删除。
- 所有对 `/audio/...` 的删除必须经过 `cleanAudioFile()` 或同等路径安全函数，禁止拼接任意用户输入路径后直接 `unlinkSync`。
- 音频写入、命名和试听清理统一通过 `services/audioAsset.js`；预设、segment、broadcast 的音频命名优先包含业务 ID，避免仅用时间戳。

## Checklist

新增一个服务函数时，逐项检查：

- [ ] **JSDoc 注释**：`@param` 解构参数 + `@returns`
- [ ] **解构参数**：`function doSomething({ arg1, arg2 }) {}`
- [ ] **错误抛出**：`throw new Error('中文错误消息')`
- [ ] **导出**：添加到 `module.exports = { ... }`
- [ ] **外部 API**：设置 timeout，401/429/超时/网络错误转中文
- [ ] **模型限速**：批量 TTS 通过 `ttsQueue`，批量 LLM 通过 `llmQueue`，不绕过队列直接并发
- [ ] **音频一致性**：DB 与文件写入失败有补偿清理，删除走 `cleanAudioFile()`

## 相关 skill / 文档

- 路由层 → `backend-route`
- 单表 SQL / DAL → `backend-database`
- 测试与 mock → `backend-testing`
- 服务职责表、技术债历史 → `backend/BACKEND_CONVENTIONS.md`
