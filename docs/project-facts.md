# Project Facts

本文件保存 TTS Broadcast 的项目事实、架构背景和持久化约定。Agent 入口与开发路由见根目录 `AGENTS.md`；Claude Code 通过 `CLAUDE.md -> AGENTS.md` 读取同一份入口。

## 项目概述

TTS Broadcast 是一个全栈应用，用于自动化 AI 新闻播报。它从 AI HOT 抓取每日 AI 新闻，使用 MiMo LLM 将其改写为播报稿件，并通过 MiMo TTS API 生成语音音频。

## 技术栈

**后端（Node.js）**
- Express 5 Web 框架
- better-sqlite3 嵌入式数据库
- Anthropic SDK + Axios（LLM 稿件改写与文本切分，支持 Anthropic/OpenAI 兼容格式）
- Axios（TTS 语音合成 HTTP 请求 + API Key 测试）
- multer + ffmpeg-static（音视频上传与 ASR 转换）
- node-cron 定时任务
- Jest 测试框架

**前端（React + TypeScript）**
- React 19 + TypeScript
- Vite 8 构建工具
- Tailwind CSS 4 样式
- Zustand 状态管理
- React Router 7 路由
- JSZip（批量转录结果打包下载为 ZIP 压缩包）

## 常用命令

### 后端（在 `backend/` 目录下执行）

```bash
npm run dev          # 启动开发服务器，支持热重载（端口 3001）
npm start            # 启动生产服务器
npm test             # 运行所有测试
npm test -- --watch  # 监听模式运行测试
```

### 前端（在 `frontend/` 目录下执行）

```bash
npm run dev          # 启动开发服务器（端口 5173）
npm run build        # 构建生产版本（tsc + vite build）
npm run lint         # 运行 ESLint
npm run preview      # 预览生产构建
```

## CI/CD 流水线

仓库使用 GitHub Actions 进行 PR 质量门禁，工作流文件位于 `.github/workflows/pr-checks.yml`。

触发条件：

- `pull_request`：所有 PR 必跑
- `push` 到 `main`：合并后回归检查

检查内容：

- 后端：`cd backend && npm ci && NODE_ENV=test npm test -- --runInBand`
- 前端：`cd frontend && npm ci && npm run lint && npm run build`

约束：

- CI 不配置真实 MiMo、AI HOT、TTS、ASR API Key
- 后端测试必须 mock 外部 API，不依赖真实网络或真实业务密钥
- 新增会影响 PR 门禁的脚本、运行环境或检查项时，必须同步更新本节

## 目录结构

```
tts-broadcast/
├── backend/
│   ├── src/
│   │   ├── app.js            # Express 应用入口，中间件配置，路由挂载
│   │   ├── db/               # SQLite 初始化与 schema
│   │   ├── routes/           # Express 路由（broadcast, segments, settings, schedule, voicePresets, transcribe, sse）
│   │   ├── services/         # 业务逻辑 + 外部 API + DAL（aihot, audio*, asr/qwenAsr/wslAsr/mossAsr/asrModels, media, mimo*, tts*, voiceConfig, *Store, scheduler, sseManager）
│   │   └── utils/            # 共享工具函数（validation）
│   ├── tests/                # Jest 测试，镜像 src/ 结构
│   ├── audio/                # 生成的音频文件（已 gitignore）
│   ├── assets/               # 上传的预设立绘等图片资产（已 gitignore）
│   └── data/                 # SQLite 数据库文件（已 gitignore）
├── frontend/
│   ├── src/
│   │   ├── pages/            # 路由页面（工作台、编辑器、音色库、转录、内容库、自动化、设置）与页面私有 helper
│   │   ├── components/       # 可复用 UI 组件、Dashboard 工作台组件、Transcribe 子组件
│   │   ├── services/         # API 客户端、SSE、日志和 schema 校验
│   │   └── store/            # Zustand 状态管理（index 组合入口，按领域拆分 slices）
│   └── vite.config.ts
├── docs/                     # 项目文档
├── start.sh                  # 一键启动脚本
├── README.md
└── .gitignore
```

## 数据库结构

SQLite 数据库包含核心业务表和运行控制表：

- `broadcasts`：播报记录，含稿件内容、音频路径、状态、模式（整篇/分段）
- `segments`：分段记录，关联 broadcast（外键 `ON DELETE CASCADE`），每段是一个适合 TTS 的语义块并独立生成音频
- `settings`：键值存储，保存 API Key、音色偏好、脚本等配置
- `schedules`：定时任务，基于 cron 表达式自动播报
- `voice_presets`：音色预设，含克隆和设计两种类型，支持保存试听音频和原始参考音频
- `transcription_results`：转录结果记录，保存单文件/批量转录的原文、AI 排版文本、文件名、相对路径、provider、模型、context、usage 与 task_id
- `api_rate_limit_events` / `api_rate_limit_state`：外部模型限速账本，保存最近窗口的请求成本和 429 backoff，用于跨后端进程重启延续 MiMo/MiniMax 账户侧限速记忆
- `generation_jobs`：长生成任务 lease 表，当前用于分段批量 TTS，防止同一播报在刷新、多标签页或 HTTP 重试下重复入队

关键字段说明：

- `broadcasts.title`：播报标题（必填）
- `broadcasts.content`：播报稿件正文（必填）
- `broadcasts.audio_path`：音频文件路径
- `broadcasts.status`：播报状态（如 `pending`、`completed`）
- `broadcasts.mode`：`whole`（整篇生成）或 `segmented`（分段生成）
- `broadcasts.saved`：是否已保存（0/1），决定音频生命周期
- `broadcasts.voice_type`：音色类型（简单值，如音色名称）
- `broadcasts.voice_config`：音色配置 JSON（详细参数）
- `segments.broadcast_id`：外键关联 broadcasts，级联删除
- `segments.index`：段序号
- `segments.text`：该段稿件文本；自动 AI 切分经 `normalizeAutoSegmentTexts` 稳定规整为 100-200 字左右的文段；前端精修和旧数据兼容仍保留单段 1024 字硬上限
- `segments.audio_path`：该段音频路径
- `segments.status`：该段状态
- `segments.style_tag`：兼容旧分段整体风格或短情绪铺垫（如 `平静`、`克制地转入兴奋`；空串=无），生成时前置为 `(提示)`；新 AI 标签优化统一写入 `segments.text` 的方括号内联标签，并清空 `style_tag`，避免旧整体标签与新复杂标签双重控制
- `segments.playback_rate`：该段预览与导出的播放倍速，默认 `1.0`，范围 `0.5` 到 `2.0`；前端单段预览用浏览器原生 `HTMLMediaElement.playbackRate` 并开启保音高，主播放器预览/下载时后端用 FFmpeg `atempo` 做不变调变速，不覆盖原始 TTS 段音频，也不持久保存变速后的合并音频
- `segments.error_message`：分段 TTS 失败原因，空串表示无；用于把 MiMo 限流、风控、网络或参数错误展示到前端对应段落
- `voice_presets.type`：`clone`（克隆）或 `design`（设计）
- `voice_presets.trial_audio_path`：试听音频路径
- `voice_presets.original_audio_path`：克隆原始音频路径（仅 clone 类型）
- `voice_presets.design_prompt`：音色描述（仅 design 类型）
- `voice_presets.character_image_path`：设计音色来源角色立绘路径（仅 design 类型使用，存放于 `/assets`）
- `transcription_results.text`：原始转录文本
- `transcription_results.formatted_text`：AI 一键排版分段后的文本，空串表示尚未排版
- `transcription_results.relative_path`：批量转录中保留的文件夹相对路径；单文件转录时等于文件名
- `api_rate_limit_events.scope`：限速范围（如 `mimo-tts`），同一 scope 共享 RPM/TPM/payload 窗口
- `api_rate_limit_events.request_cost/token_cost/payload_cost`：一次外部模型请求的加权成本；MiMo voiceclone 会按 base64 payload 额外增加 request/payload/concurrency 成本
- `api_rate_limit_state.backoff_until_ms`：429 后持久化退避截止时间
- `generation_jobs.broadcast_id/job_type/status/lease_expires_at_ms`：批量生成任务的幂等 lease；运行中任务通过 heartbeat 续租，完成后释放

关键设置说明：

- `mimo_api_key`：LLM API Key，供改写、切分和模型发现使用
- `mimo_tts_api_key`：TTS/ASR API Key，供语音合成和转录使用
- `asr_provider`：转录服务位置，`mimo`（云端）、`qwen_mlx`（Mac 本地 Qwen/MLX）或 `wsl_asr`（Windows/WSL 局域网 ASR 网关）；旧 `moss_asr` 自动迁移为 `wsl_asr + moss`
- `qwen_asr_base_url`：Mac 本地 Qwen ASR OpenAI-compatible Base URL，默认 `http://localhost:8765/v1`；本机代理环境建议配置为 `http://127.0.0.1:8765/v1`
- `qwen_asr_model`：Mac 本地 Qwen ASR 模型 ID，默认 `Qwen/Qwen3-ASR-1.7B`
- `qwen_asr_api_key`：Mac 本地 Qwen ASR 可选 Bearer Token；本地服务未启用 `--api-key` 时留空
- `wsl_asr_base_url`：Windows/WSL ASR 网关 Base URL，默认 `http://192.168.31.137:18080/v1`
- `wsl_asr_engine`：Windows/WSL ASR 识别引擎，`qwen` 或 `moss`
- `wsl_asr_model`：当前 WSL 引擎的默认模型 ID；Qwen 默认 `qwen3-asr-1.7b`，MOSS 可留空并在转录页动态发现
- `wsl_asr_api_key`：Windows/WSL ASR 可选 Bearer Token；网关未启用鉴权时留空
- `llm_api_format`：LLM 请求格式，`anthropic` 或 `openai`
- `llm_base_url`：LLM baseURL，默认 MiMo Anthropic 地址
- `llm_model`：LLM 模型 ID，默认 `mimo-v2.5`
- `llm_rewrite_system_prompt` / `llm_split_system_prompt`：改写与切分分别使用的 system prompt
- `llm_rewrite_thinking_enabled` / `llm_split_thinking_enabled`：Anthropic 兼容格式下的 thinking 开关
- `ui_font_preset`：界面字体方案，`modern`（现代）、`system`（系统字体）或 `editorial`（标题出版感）
- `ui_font_scale`：界面字号尺度，`compact`、`comfortable`、`large` 或 `extra_large`
- 前端已内置 MiSans 常用字重到 `frontend/public/fonts/misans/`，`modern` 字体方案必须优先加载该静态资产，避免换电脑后退化为系统字体

## 外部 API

- **MiMo TTS API**（`https://api.xiaomimimo.com/v1`）：语音合成
- **MiMo ASR API**（`https://api.xiaomimimo.com/v1`）：语音识别（音频转文本），通过 `services/asr.js` 的 `mimo` provider 调用，复用 `mimo_tts_api_key`；上传文件先落系统临时目录，默认支持 500MB 内音视频；单次请求遵守 Base64 data URL 10MB 上限，后端自动按静音切片长音频；长音频转录通过 SSE 推送分片进度和累计文本；单文件和批量成功结果都会自动写入 `transcription_results`；批量转录（`POST /api/transcribe/batch`）支持一次上传多个文件（默认上限 50，环境变量 `TRANSCRIBE_BATCH_MAX_FILES` 可调），后端串行转录（遵守 MiMo RPM 限流），单文件失败隔离不影响其他文件，采用「提交即返回 202 + SSE 推送全部进度和最终结果」的异步模型避免长任务触发 HTTP 超时
- **Qwen 本地 ASR（Mac MLX）**：通过 `services/qwenAsr.js` 调用本机或局域网内 OpenAI-compatible `/v1/audio/transcriptions`；由 `asr_provider=qwen_mlx` 启用，复用项目现有 ffmpeg 切片与 SSE 进度机制，不依赖 `mimo_tts_api_key`；本地请求禁用代理，默认超时 30 分钟（`QWEN_ASR_TIMEOUT_MS` 可调）。实测 `mlx-qwen3-asr 0.3.5` 官方 `serve` 可能因 `asyncio.to_thread()` 触发 MLX `There is no Stream(gpu, 1) in current thread.`，当前推荐使用同步兼容服务在主线程调用 `Session.transcribe()`
- **WSL ASR 网关（Windows GPU）**：由 `asr_provider=wsl_asr` 表示统一的局域网服务位置，共享 `wsl_asr_base_url` 与 API Key；`asr_engine=qwen` 时通过 `services/wslAsr.js` 调用 `/v1/audio/transcription-jobs` 和 `/v1/jobs/{job_id}`，由网关负责预处理、切片、队列与 chunk 进度；`asr_engine=moss` 时通过 `services/mossAsr.js` 调用同一连接下的 OpenAI-compatible `/v1/audio/transcriptions`，并通过 `/models` 动态发现模型。两种引擎都直接转发上传文件，不走本项目本地切片；协议差异只存在于后端适配层，不在产品层拆成两个服务
- **LLM API**（默认 `https://token-plan-cn.xiaomimimo.com/anthropic`）：稿件改写、文本切分、转录排版、音色/段落标签优化，通过 `settings` 中的 `llm_api_format`、`llm_base_url`、`llm_model` 配置，可选择 Anthropic 兼容或 OpenAI 兼容格式；模型发现通过 `POST /api/settings/llm-models` 探测 OpenAI-compatible `/models` 端点；OpenAI 兼容格式接入 MiniMax/MiMo `minimax` 域名时，请求体会显式禁用 thinking，结构化返回会剥离 `<think>` 和 Markdown code fence 后再解析 JSON，避免切分口播稿时因推理文本污染 JSON 失败；所有 `createLlmMessage()` / 视觉 LLM 请求经 `services/llmQueue.js` 全局 RPM/TPM 队列限速
- **AI HOT API**（`https://aihot.virxact.com`）：每日 AI 新闻数据源

### MiMo API 模型与限速

完整文档见 `docs/mimo-api-models-limits.md`、`docs/ttsSeries.md` 和 `docs/asr.md`。

**限流规则**：RPM（每分钟请求数）与 TPM（每分钟 Token 数）是独立限流维度，按同一账号下调用同一模型的所有 API Key 聚合统计。真实服务还可能有短时间突发/并发保护，所以队列实现统一在 `services/rateLimitedQueue.js` 同时控制 RPM、TPM、启动短突发和在途并发；具体模型入口只配置默认值、硬上限和 token 估算。

- **MiniMax-M3 LLM**：官方付费账号上限按 200 RPM / 10,000,000 TPM 管理；本项目默认使用 75% 安全预算，即 `MINIMAX_M3_LLM_RPM_LIMIT=150`、`MINIMAX_M3_LLM_TPM_LIMIT=7500000`，硬上限分别压到 200 / 10000000，`MINIMAX_M3_LLM_MAX_CONCURRENT=4`。所有 `mimo.js` 的文本/视觉 LLM 请求经 `services/llmQueue.js` 入队；高并发批量任务应批处理输入，然后让每个批次经过队列，禁止在调用处直接 `Promise.all` 打 LLM。
- **MiMo TTS**：TTS 请求走 MiMo `api.xiaomimimo.com` 限速，不套 MiniMax 语音接口限额；模型上限按 100 RPM / 10,000,000 TPM 管理。所有 TTS 入口（整篇生成、分段批量、单段重新生成、音色试听）都必须通过 `services/ttsQueue.js` 做全局队列限速：默认 `MIMO_TTS_RPM_LIMIT=90`（硬上限 100）、`MIMO_TTS_TPM_LIMIT=9000000`（硬上限 10000000）、`MIMO_TTS_MAX_CONCURRENT=6`、`MIMO_TTS_START_BURST_LIMIT=1`；队列不做瞬时突发，按 RPM 间隔补启动请求。TTS 单例使用 `api_rate_limit_events/state` 持久化最近窗口和 backoff，避免 nodemon/进程重启后本地限速记忆清零。`voiceclone` 请求会按 `voiceClone` base64 payload 额外增加 request cost、payload cost 和并发成本，避免把 5MB 级克隆音频当成普通短文本 TTS。`tts.generateSpeech()` 自身不做 429 快速重试，避免绕过队列造成实际 HTTP RPM/TPM 超限。遇到无 `Retry-After` 的 429 时默认退避 15 秒，并由队列做指数退避重试，最大退避默认 120 秒。

**TTS 模型**：

| 模型 ID | 用途 |
|---------|------|
| `mimo-v2.5-tts` | 预置音色语音合成 |
| `mimo-v2.5-tts-voiceclone` | 音色克隆（需上传音频样本的 base64） |
| `mimo-v2.5-tts-voicedesign` | 音色设计（文本描述生成音色） |

**LLM 模型**：当前生产按 MiniMax-M3 限额预算管理；设置页仍允许通过模型输入框或自动获取模型列表后选择实际模型

**ASR 模型**：

| 模型 ID | 用途 |
|---------|------|
| `mimo-v2.5-asr` | 语音识别（支持中英双语及方言，音频转文本） |
| `Qwen/Qwen3-ASR-1.7B` | Mac 本地 Qwen/MLX 转录（通过本地 HTTP 服务接入，可在设置页改模型 ID） |
| `qwen3-asr-1.7b` | Windows/WSL ASR 网关默认模型（通过局域网 HTTP job API 接入） |
| MOSS `/models` 返回值 | MOSS ASR 模型列表（通过局域网 OpenAI-compatible `/v1/models` 或 `/models` 动态发现） |

## 开发规范与 skill

前后端的高频开发规则已迁移为按需加载的 skill，开发前按根目录 `AGENTS.md` 的任务路由表调用对应 skill。背景文档（技术栈 / 目录 / 文件职责 / 命名规范 / 代码风格 / 已解决技术债）保留在 `backend/BACKEND_CONVENTIONS.md` 与 `frontend/FRONTEND_CONVENTIONS.md`，并在其「开发规则」章节列出各规则现归属的 skill。

## 关键开发模式

- 后端通过 `services/mimo.js` 统一处理 LLM：Anthropic 兼容格式使用 Anthropic SDK，OpenAI 兼容格式使用 Axios 调 `/chat/completions`；`llm_rewrite_system_prompt` 与 `llm_split_system_prompt` 分别控制改写和切分的 system prompt，`llm_rewrite_thinking_enabled` 与 `llm_split_thinking_enabled` 控制 Anthropic 格式下是否禁用 thinking；OpenAI 兼容 MiniMax/MiMo 调用会强制禁用 thinking 并容错解析 JSON；风格建议按小批量请求，遇到 422、JSON 解析失败或返回数量不一致时使用本地规则兜底，保证结果数量与句子数量一致；通过 Axios 调用 MiMo TTS API（`services/tts.js`）
- ASR 上传转录通过 `routes/transcribe.js` 接收音视频文件，上传先写入系统临时目录并在请求结束后清理；前端上传进度使用 axios `onUploadProgress`，后端按 `taskId` 通过 `/api/sse/:taskId` 推送 `transcribe-start`、`progress`、`complete`、`error`；`services/media.js` 支持 multer 的 `buffer` 或 `path` 输入，并转为一个或多个 ASR data URL（MiMo 长音频优先按静音点切片，目标 15 秒、最大 30 秒，并转为 MP3 降低体积；Qwen 本地 ASR 单片上限 256MB，目标 10 分钟、最大 20 分钟）；`services/asr.js` 先按 `asr_provider` 选择云端、Mac 本地或 WSL 局域网，再按 `asr_engine` 在 WSL 内部分发 Qwen job API 或 MOSS OpenAI-compatible API；成功结果通过 `services/transcriptionResultStore.js` 写入 `transcription_results`，同时保存 provider、engine 与 model；`services/mimoApiClient.js` 统一 MiMo 标准 API 的重试、timeout 与错误映射
- 转录结果列表通过 `GET /api/transcribe/results` 读取 `transcription_results`，转录页历史面板支持查看、下载、导入稿件、刷新和删除；删除通过 `DELETE /api/transcribe/results/:id` 进入 `services/transcriptionResultStore.js`，只删除数据库记录，不删除用户上传源文件；转录结果排版通过 `POST /api/transcribe/results/:id/format` 调用 `mimo.formatTranscriptionText()`，只做标点、换行和自然段排版，结果写回 `transcription_results.formatted_text`；转录页弹窗在单文件、批量结果和历史记录中复用该能力，导入稿件时优先使用排版文本
- 批量转录（`POST /api/transcribe/batch`）采用异步模型：multer `upload.array` 接收多文件后立即返回 202，实际转录在后台 `runBatchTranscription` 串行进行，所有进度和最终结果通过 SSE 推送（`phase` 为 `batch-preparing`/`file-start`/`file-progress`/`file-complete`/`file-error`/`completed`）；后台任务开始前 `waitForSseConnection` 等待 SSE 连接建立避免早期事件丢失；前端通过 `relativePaths`（JSON 字符串）保留子目录结构；每个成功文件独立保存一条 `transcription_results` 并在 SSE 中返回 `resultId`；multer/busboy 默认用 latin1 解码 multipart filename 导致中文乱码，`decodeFileName` 重编码为 utf8 修复
- 分段生成时由 `routes/segments.js` 经 `utils/segmentText.js` 的 `prependStyleTag` 将兼容旧 `segment.style_tag` 前置到合成文本；`mimo.splitScript` 按语义逻辑切块而非逐句硬切，并在模型返回后统一经过 `normalizeAutoSegmentTexts` 做 100-200 字文段规整，模型碎句会合并、超长块会按自然标点或硬边界拆分，短尾段会与前一段重平衡；`POST /api/broadcast/:id/segments/replace` 支持前端二级页面一次性保存合并、拆分、重排与情绪提示，未变化段保留既有音频，文本或提示变化的段重置为 `pending`；`POST /api/broadcast/:id/segments/suggest-audio-tags` 调 `mimo.suggestSegmentAudioTags` 为各段批量插入合法方括号复杂标签，写回 `segments.text` 并清空 `style_tag`，旧 `suggest-tags` 端点仅保留兼容；批量语音生成先通过 `generation_jobs` 获取播报级 lease，同一播报已有运行中批量任务时返回 409，不重复入队；查询待处理片段时包含 `pending`、`failed` 和可能因中断遗留的 `generating`，单段失败会写入 `segments.error_message` 并通过 SSE progress / HTTP result 返回，前端在对应段落下方展示具体原因，避免只显示泛化“失败”
- 分段预览倍速只改变浏览器播放速度，不重生成 TTS；`PUT /api/broadcast/:id/segments/:segId` 可更新单段 `playbackRate`，`PATCH /api/broadcast/:id/segments/playback-rate` 可一次性更新所有段。倍速变化会清空旧的 `broadcasts.audio_path`；`POST /api/broadcast/:id/segments/merge` 只校验所有段已生成并把播报标记为 `generated`，不再保存合并文件；`GET /api/broadcast/:id/audio` 与 `GET /api/broadcast/:id/download` 都按段落 `playback_rate` 通过 FFmpeg `atempo` 临时生成不变调音频，响应结束后只保留原始分段 TTS 音频
- TTS 请求由 `services/speechRequestBuilder.js` 统一编译：音色设计描述与简单风格提示编译到 MiMo `user.content`，实际要合成的正文进入 `assistant.content`；分段 `segments.style_tag` 和正文内联 `[音频标签]` 共同构成文本标签控制。`speed/emotion/pitch` 仍作为预置音色的 provider-specific 精细参数保留，有精细参数时不再额外混入自然语言风格提示，避免控制冲突
- 路由层通过 DAL 层（`services/*Store.js`）操作数据库，不直接写 SQL
- 音色配置统一通过 `services/voiceConfig.js` 规范化和转换 TTS 参数，路由不得重复拼装 `voiceType/voiceConfig`
- voicedesign 模式默认严格使用 assistant 合成文本；只有前端显式开启 `optimizeTextPreview` 时，后端才向 MiMo 传 `optimize_text_preview: true`
- 角色立绘反推音色通过 `POST /api/voice-presets/infer-design-from-image` 上传 PNG/JPG/WebP，调用当前 LLM 配置的原生视觉能力生成 MiMo voicedesign 可用的 `designPrompt` 与自然语言控制用的 `stylePrompt`；`designPrompt` 必须保持极简，只写“性别年龄 + 音色质感 + 角色感”，语气情绪、语速节奏放入 `stylePrompt`。该能力只做基于画面气质的创作性音色描述，不识别真实声纹。保存设计预设时可把立绘持久化到 `backend/assets/` 并通过 `/assets/...` 静态访问
- 设计/克隆试听文本和口播编辑器分段编辑都使用同一个复杂标签编辑面板：所有标签统一写为 `[标签]`，同一位置的复杂情绪或声音控制合并为 `[标签A，标签B]`；可通过 `POST /api/voice-presets/suggest-trial-text-tags` 为试听文本自动插入合法标签，口播编辑器通过 `POST /api/broadcast/:id/segments/suggest-audio-tags` 对所有段落批量优化内联标签。标签只进入合成文本，不写入音色描述
- 音色预设的试听音频可直接下载；设计预设新增 `use_trial_audio_as_clone` 开关，开启后在播报选择预设时将已保存的 `trial_audio_path` 作为 `voiceClone`，实际走 `voiceclone` 链路，而不是继续走 `voicedesign`。该开关只对 design 预设生效，且必须存在已保存试听音频
- 音频写入、命名和试听清理统一通过 `services/audioAsset.js`；删除已有音频使用 `utils/validation.js` 中的 `cleanAudioFile()`
- ID 校验使用 `utils/validation.js` 中的 `validateId()`
- 前端使用 Zustand store 模式管理全局状态；新增状态优先按领域放入 `store/*Slice.ts`，类型放入 `store/types.ts`
- 前端二级界面、确认弹窗和全屏编辑面板统一通过 `components/ModalShell.tsx` 渲染，业务组件只传标题、内容、footer 和关闭事件，不重复维护固定遮罩、dialog aria、Esc/backdrop 关闭逻辑
- 前端所有音频播放条统一通过 `components/Dashboard/AudioPlaybackBar.tsx`，整篇/历史播放器用 `AudioPlayer` 薄外壳，试听小播放器用 `MiniAudioPlayer` 薄外壳；只有 `AudioPlaybackBar` 直接拥有 `<audio>`、播放状态、时长、seek、波形/进度和倍速保音高逻辑
- 测试使用 supertest 进行 HTTP 端点测试
- 原始音频文件通过 `/audio` 路由作为静态文件提供服务；分段主播放器和下载通过 `/api/broadcast/:id/audio`、`/api/broadcast/:id/download` 动态合并返回

## 健壮性与可维护性开发规范

本项目的主要风险来自外部 API、长时间任务、SQLite 与音频文件的一致性、前后端类型契约漂移。详细规则已分散到对应 skill；以下为**任何时候都不可协商的铁律**（始终生效，不依赖 skill 加载）。

### 不可协商的铁律

1. **分层边界**：路由层只做 HTTP 翻译；服务层负责业务与外部 API；DAL（`*Store.js`）负责单表 SQL；前端 `api.ts` 只封装 HTTP，store 按领域拆 slice。（细则见 `backend-route` / `backend-service` / `backend-database` / `frontend-state-data`）
2. **外部 API 隔离**：所有 MiMo / AI HOT 调用设 timeout 并把 401/429/超时/网络错误转中文；批量 TTS 必须经 `ttsQueue` 全局限速，LLM 高并发/批量任务必须经 `llmQueue` 全局限速，禁止绕过队列直接并发调用外部模型；**不允许全局关闭 TLS 校验**（禁 `NODE_TLS_REJECT_UNAUTHORIZED=0`，补 CA 只在特定 client 实例配）。（细则见 `backend-service`）
3. **长任务一致性**：超过 2 秒的任务必须有前端 loading/error 状态；已接入 SSE 的任务后端发开始/进度/完成/失败事件，前端收到失败落可重试态；重复生成保证幂等，失败不留永久 `generating`。（细则见 `backend-service` / `frontend-state-data`）
4. **DB 与文件一致性**：DB 写与文件写跨资源无法事务化，必须设计补偿清理避免孤儿音频；所有 `/audio/...` 删除经 `cleanAudioFile()`，禁拼接用户输入路径后直接 `unlinkSync`。（细则见 `backend-service` / `backend-database`）
5. **前后端契约**：`Broadcast` / `Segment` / `VoiceConfig` / `Settings` / SSE payload 不得使用裸 `any`；后端新增字段必须端到端同步，前端默认值/枚举/参数名不得与后端不一致。（完整流程见 `add-persisted-field`）
6. **测试与进程生命周期**：`app.js` 只导出不 listen；`NODE_ENV=test` 用 SQLite 内存库，禁写开发库；cron 测试 `afterEach` 调 `scheduler.shutdown()`；后端改动至少 `npm test -- --runInBand`，前端至少 `npm run build`；外部 API 测试必须 mock。（细则见 `backend-testing`）

### 7. 可维护性红线

- 单文件超过规范阈值时优先拆分：路由按资源拆，组件按交互单元拆，服务按外部 API 或业务能力拆。
- 不引入新依赖作为默认解法；新增依赖必须说明为什么原生能力或现有依赖不足。
- 不把“临时兼容”留在代码里。若保留旧 API 或旧字段，必须写清迁移/删除条件。
- 文档优先：当 `docs/`、`BACKEND_CONVENTIONS.md`、`FRONTEND_CONVENTIONS.md` 与实现冲突时，先按最新已批准文档校准；如果文档过期，先更新文档再改实现。

## 数据持久化开发规范

### 原则

- **服务器是数据的唯一真实来源**，前端状态仅用于 UI 渲染
- **用户可感知的数据必须持久化到 SQLite**，不依赖前端 localStorage
- **文件类资产（音频）按需保留**，有明确的生命周期管理

### 数据存储分层

| 数据类型 | 存储位置 | 生命周期 |
|---------|---------|---------|
| 播报记录（标题、稿件、状态） | SQLite `broadcasts` 表 | 永久 |
| 原始音频文件（整篇/分段 TTS .wav） | `backend/audio/` 目录 | 按需保留（见音频生命周期） |
| 预设角色立绘图片 | `backend/assets/` 目录 + SQLite `voice_presets.character_image_path` | 随音色预设存在；替换、移除或删除预设时清理文件 |
| 变速合并音频（分段主播放器/下载） | 请求内内存响应 + 系统临时目录 | 不持久化；请求结束后释放，临时文件由后端清理 |
| 转录结果（原文、排版文本、来源文件名、provider/model/task） | SQLite `transcription_results` 表 | 永久，用户可在转录页历史面板删除记录 |
| 应用设置（API Key、音色、开场白等） | SQLite `settings` 表 | 永久 |
| 定时任务 | SQLite `schedules` 表 | 永久 |

### 音频文件生命周期

```
生成 → [未保存, 临时] → 用户试听满意 → 点击保存 → [已保存, 永久]
                                              ↓
                                     超过50条上限 → 自动淘汰最旧的已保存文件
```

- **未保存音频**：保留最近 10 条，超出时自动清理最旧记录及其文件
- **已保存音频**：上限 50 条，超出时自动淘汰最旧的（FIFO）
- **保存操作**：`POST /api/broadcast/:id/save` 切换 saved 状态，后端负责上限清理
- **历史页范围**：`GET /api/broadcast/history` 只返回 `saved = 1` 的播报；未保存播报只作为近期临时试听/编辑记录存在，不静默进入历史页
- **分段倍速**：`segments.playback_rate` 只保存速度配置；原始分段 TTS 音频始终按原速保存；主播放器预览和下载时再通过 FFmpeg `atempo` 临时生成不变调合并音频，不写入 `backend/audio/`
- **分段合并标记**：`POST /api/broadcast/:id/segments/merge` 只校验所有段已生成并把播报标记为 `generated`，不会保存 `broadcast_*_merged.wav`

### 数据库迁移与新增字段（细则见 skill）

- **数据库迁移**（try-catch 探测列模式、新增列必须 DEFAULT、`schema.sql` 同步）细则见 skill：`backend-database`。
- **前端设置持久化流程**（App 启动 `fetchSettings()` → Zustand store → Settings 页读写）与 Settings 自动保存模式细则见 skill：`frontend-state-data`。
- **新增贯穿前后端的持久化字段**：完整链路（schema → 迁移 → `*Store.js` → 路由 → `api.ts` → `types.ts` → `schemas.ts` → slice → UI）见 skill：`add-persisted-field`。
