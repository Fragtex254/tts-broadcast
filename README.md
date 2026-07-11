# TTS Broadcast

把每天的 AI 资讯变成一段可以直接收听的中文播报。

TTS Broadcast 是一个面向个人和小团队的 AI 新闻播报工作台：它从 AI HOT 拉取每日资讯，用 LLM 改写成更适合口播的稿件，再通过 MiMo TTS 生成音频。你可以手动编辑稿件、分段生成长音频、管理音色预设、上传音视频转写，也可以把整条流程交给定时任务自动运行。

![TTS Broadcast AI 新闻播报工作流](frontend/src/assets/tts-broadcast-workflow-hero.png)

## 为什么做这个

每天都有太多 AI 资讯，但真正值得听完、转发、复盘的内容需要被筛选、改写和包装。这个项目把“找资讯 -> 写口播稿 -> 试音色 -> 生成音频 -> 保存归档”的链路放进一个本地全栈应用里，让日报、播客片段、内部分享和语音内容生产变得更轻。

## 核心能力

- **资讯采集**：从 AI HOT 获取每日 AI 新闻，支持分类与数量控制。
- **稿件改写**：使用可配置 LLM 将资讯改写为中文口播稿，支持自定义开场白、结束语和系统提示词。
- **创作模板**：内置短视频、资讯播报、B 站知识讲解、播客和自由创作模板；支持复制、创建和管理自定义模板，按平台、时长、受众、语气与结构约束稿件。
- **整篇/分段 TTS**：短稿可一键生成，长稿可按语义切分为 100-200 字左右的文段分别合成；手工精修单段保留 1024 字兼容上限，段落编辑器支持二级弹窗合并、拆分、补充情绪铺垫、全局倍速和单段倍速。
- **音色工作流**：支持预设音色、音色克隆、音色设计、试听音频和音色预设管理。
- **音视频转写**：上传音频或视频，后端自动转码、切片并通过 ASR 输出文本，适合把素材快速变成稿件来源。支持批量转录：选择文件夹自动遍历子目录，勾选需要转录的文件，串行转录后每篇单独保存，可一键打包下载 ZIP 压缩包。
- **定时播报**：使用 cron 表达式配置自动任务，定期抓取、改写并生成播报。
- **历史与资产管理**：保存播报记录、音频文件、分段状态和生成参数，支持回放与清理策略。
- **发布内容包**：为成品生成标题、简介、平台文案与标签，一键打包 MP3、Markdown/TXT 稿件；分段音频完整时同时导出 SRT/VTT 字幕。
- **实时进度**：长任务通过 SSE 推送开始、进度、完成和失败状态，前端可持续反馈。

## 工作流

```mermaid
flowchart LR
  A["AI HOT 资讯"] --> B["筛选与汇总"]
  B --> C["LLM 改写口播稿"]
  C --> D{"生成方式"}
  D -->|"整篇"| E["MiMo TTS"]
  D -->|"分段"| F["语义块切分与精修"]
  F --> E
  E --> G["音频试听"]
  G --> H["保存播报历史"]
  I["音视频上传"] --> J["ASR 转写"]
  J --> C
  K["Cron 定时任务"] --> A
```

## 技术栈

| 层 | 技术 |
| --- | --- |
| 后端 | Node.js, Express 5, better-sqlite3, Jest, node-cron |
| AI / 音频 | MiMo TTS, MiMo ASR, Anthropic/OpenAI 兼容 LLM 接口, ffmpeg-static, FFmpeg atempo 不变调变速 |
| 前端 | React 19, TypeScript, Vite 8, Tailwind CSS 4, Zustand, React Router 7, Zod |
| 工程化 | GitHub Actions, ESLint, Vitest, supertest |

## 快速开始

### 1. 准备环境

- Node.js 20 推荐；本地启动脚本最低检查 Node.js 18
- npm
- MiMo API Key

### 2. 安装依赖

```bash
git clone https://github.com/Fragtex254/tts-broadcast.git
cd tts-broadcast

cd backend
npm install

cd ../frontend
npm install
```

### 3. 配置服务与 API Key

在 `backend/` 下创建 `.env`，用于服务级配置：

```env
PORT=3001
NODE_ENV=development
```

启动应用后，在设置页填写 LLM API Key、TTS/ASR API Key、LLM base URL、模型和提示词等运行时设置。它们会持久化到 SQLite，不需要写进 `.env`。

### 4. 启动应用

推荐使用一键启动脚本：

```bash
./start.sh
```

也可以手动启动：

```bash
cd backend
npm run dev
```

```bash
cd frontend
npm run dev
```

启动后访问：

- 前端：http://localhost:5173
- 后端：http://localhost:3001

## 启动与停止服务

### 启动前后端

推荐方式是使用根目录脚本同时启动后端和前端：

```bash
./start.sh
```

脚本会启动：

- 后端：`http://localhost:3001`
- 前端：`http://localhost:5173`

手动启动时，分别开两个终端：

```bash
cd backend
npm run dev
```

```bash
cd frontend
npm run dev
```

### 启动 Mac 本地 Qwen ASR

如果设置页选择了 `Qwen 本地（Mac MLX）`，还需要单独启动本地 ASR 服务。默认配置为：

- Base URL：`http://127.0.0.1:8765/v1`
- 模型：`Qwen/Qwen3-ASR-1.7B`
- API Key：按本地服务启动参数填写

首次准备环境示例：

```bash
brew install ffmpeg
python3 -m venv ~/Library/Caches/tts-broadcast/qwen-asr-venv
~/Library/Caches/tts-broadcast/qwen-asr-venv/bin/python -m pip install -U pip
~/Library/Caches/tts-broadcast/qwen-asr-venv/bin/python -m pip install "mlx-qwen3-asr[serve]" socksio
```

官方服务启动方式：

```bash
~/Library/Caches/tts-broadcast/qwen-asr-venv/bin/mlx-qwen3-asr serve \
  --host 127.0.0.1 \
  --port 8765 \
  --api-key local-qwen-asr \
  --model Qwen/Qwen3-ASR-1.7B
```

实测注意：`mlx-qwen3-asr 0.3.5` 官方 `serve` 在某些 Mac/MLX 环境下可能触发 `There is no Stream(gpu, 1) in current thread.`。当前可用的规避方案是启动一个同步兼容服务，仍暴露 `/v1/audio/transcriptions`，但在主线程调用 `Session.transcribe()`。详细背景见 [docs/asr.md](docs/asr.md)。

### 正常停止服务

如果用 `./start.sh` 启动，回到启动脚本所在终端按：

```bash
Ctrl+C
```

脚本会同时停止后端和前端。

如果手动启动，分别在后端、前端、Qwen ASR 服务所在终端按：

```bash
Ctrl+C
```

### 强制关闭所有项目相关服务

如果终端被关掉、服务残留，推荐使用根目录关闭脚本：

```bash
./shutdown.sh
```

脚本会尝试关闭：

- `3001`：后端 Express / nodemon
- `5173`：前端 Vite
- `8765`：Mac 本地 Qwen ASR

如需手动排查，先查看常用端口：

```bash
lsof -nP -iTCP:3001 -sTCP:LISTEN
lsof -nP -iTCP:5173 -sTCP:LISTEN
lsof -nP -iTCP:8765 -sTCP:LISTEN
```

对应关系：

- `3001`：后端 Express / nodemon
- `5173`：前端 Vite
- `8765`：Mac 本地 Qwen ASR

按 PID 结束：

```bash
kill <PID>
```

如果普通 `kill` 后仍残留，再确认是本项目进程后强制结束：

```bash
kill -9 <PID>
```

也可以一次性查找本项目相关进程：

```bash
ps -axo pid,ppid,command | rg 'tts-broadcast|qwen_asr_sync_server|mlx-qwen3-asr|qwen-asr-venv'
```

确认无服务残留：

```bash
lsof -nP -iTCP:3001 -sTCP:LISTEN || true
lsof -nP -iTCP:5173 -sTCP:LISTEN || true
lsof -nP -iTCP:8765 -sTCP:LISTEN || true
```

## 常用命令

后端：

```bash
cd backend
npm run dev
npm test -- --runInBand
```

前端：

```bash
cd frontend
npm run dev
npm run lint
npm run build
npm run test
```

## 项目结构

```text
tts-broadcast/
├── backend/
│   ├── src/
│   │   ├── app.js              # Express 应用入口
│   │   ├── db/                 # SQLite 初始化与 schema
│   │   ├── routes/             # HTTP 路由
│   │   ├── services/           # 业务逻辑、外部 API、DAL 与任务编排
│   │   └── utils/              # 共享工具
│   ├── tests/                  # Jest + supertest 测试
│   ├── audio/                  # 生成音频，已 gitignore
│   └── data/                   # SQLite 数据库，已 gitignore
├── frontend/
│   ├── src/
│   │   ├── pages/              # SourceCollection, ScriptEditor, VoicePresets, Transcribe, History, Settings
│   │   ├── components/         # 可复用 UI、工作台组件和转录子组件
│   │   ├── services/           # API、SSE、错误处理与 schema 校验
│   │   └── store/              # Zustand slices
├── docs/                       # 项目事实、设计文档和外部 API 资料
├── start.sh
├── AGENTS.md                   # Agent 开发入口规范
└── README.md
```

## 主要 API

后端接口统一挂载在 `/api` 下。常用资源包括：

| 资源 | 用途 |
| --- | --- |
| `/api/broadcast/*` | 获取资讯、改写稿件、生成音频、保存历史、获取播报详情 |
| `/api/broadcast/:id/segments/*` | 分段稿件、语义块精修、分段 TTS 和片段状态管理 |
| `/api/transcribe/*` | 音视频上传、ASR 转写、批量转录（文件夹遍历）和任务进度 |
| `/api/settings/*` | API Key、LLM、TTS、提示词和默认偏好设置 |
| `/api/schedules/*` | 定时任务的创建、更新、启停和删除 |
| `/api/voice-presets/*` | 克隆/设计音色预设与试听资产管理 |
| `/api/sse/:taskId` | 长任务实时事件流 |

更完整的接口、数据模型和外部 API 背景见 [docs/project-facts.md](docs/project-facts.md)。

## 数据与文件

项目使用 SQLite 作为本地持久化层，主要保存播报、分段、设置、定时任务和音色预设。生成音频写入 `backend/audio/`，数据库文件写入 `backend/data/`，这两个目录都不会提交到 Git。

音频生命周期由后端统一管理：

- 原始整篇 TTS 音频和原始分段 TTS 音频按正常策略持久化到 `backend/audio/`。
- 分段倍速只保存 `segments.playback_rate` 配置，不改写原始音频文件。
- 单段预览使用浏览器原生 `playbackRate` 并保持音高；主播放器预览和下载由后端按需调用 FFmpeg `atempo` 生成不变调变速音频。
- 变速后的分段合并音频不保存到服务端：`/api/broadcast/:id/audio` 和 `/api/broadcast/:id/download` 只在请求内临时生成并返回，临时文件在响应结束前后清理。
- 未保存音频只保留最近 10 条。
- 已保存音频最多保留 50 条，超出后淘汰最旧记录。
- 删除音频统一走受保护的文件清理逻辑，避免误删任意路径。

## 开发约定

仓库根目录的 `CLAUDE.md` 是 `AGENTS.md` 的 symlink，所有 agent 开发任务都从这里读取规则。关键约束包括：

- 后端路由只做 HTTP 翻译，不直接写 SQL。
- 数据访问通过 `services/*Store.js` 等 DAL 层。
- 外部 API 测试必须 mock，不依赖真实网络或真实业务密钥。
- 长任务必须有 loading/error 状态；已接入 SSE 的任务必须推送开始、进度、完成和失败事件。
- 新增持久化字段要同步 schema、迁移、后端返回、前端类型和 UI。

详细背景见：

- [docs/project-facts.md](docs/project-facts.md)
- [backend/BACKEND_CONVENTIONS.md](backend/BACKEND_CONVENTIONS.md)
- [frontend/FRONTEND_CONVENTIONS.md](frontend/FRONTEND_CONVENTIONS.md)

## CI

GitHub Actions 会在 PR 和 `main` 分支 push 时运行质量检查：

- 后端：`npm ci` + `NODE_ENV=test npm test -- --runInBand`
- 前端：`npm ci` + `npm run lint` + `npm run build`

CI 不配置真实 MiMo、AI HOT、TTS 或 ASR Key。涉及外部服务的测试必须使用 mock。

## 许可证

ISC License
