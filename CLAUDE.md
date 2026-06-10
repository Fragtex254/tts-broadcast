# CLAUDE.md

本文件为 Claude Code（claude.ai/code）在本仓库中工作时提供指引。

## ⚠️ 开发规范强制要求

**每次开发都必须严格遵守前后端开发规范，这不是建议，而是硬性要求。**

### 开发前

1. **先读规范文档** — 开始任何开发前，先阅读对应的规范文档：
   - 后端：`backend/BACKEND_CONVENTIONS.md`
   - 前端：`frontend/FRONTEND_CONVENTIONS.md`
2. **对照 Checklist** — 每个规范文档末尾都有 Checklist，新增代码必须逐项检查

### 开发中

3. **遵循现有模式** — 代码风格、命名、错误处理、测试模式必须与现有代码一致
4. **使用 DAL 层** — 后端路由不直接写 SQL，通过 `*Store.js` 操作数据库
5. **使用共享工具** — ID 校验用 `validateId()`，文件删除用 `cleanAudioFile()`，不要内联重复逻辑

### 开发后

6. **同步规范文档** — **如果有新增功能、新模式、或架构变更，必须第一时间更新对应的规范文档**：
   - 新增路由/服务 → 更新 `BACKEND_CONVENTIONS.md` 的目录结构和服务职责表
   - 新增组件/页面 → 更新 `FRONTEND_CONVENTIONS.md` 的相关章节
   - 新增数据库字段 → 更新 `CLAUDE.md` 的数据库结构和持久化规范
   - 新增外部 API → 更新 `CLAUDE.md` 的外部 API 章节
7. **提交规范更新** — 规范文档的更新应与代码变更一起提交，不要留到以后

---

## 项目概述

TTS Broadcast 是一个全栈应用，用于自动化 AI 新闻播报。它从 AI HOT 抓取每日 AI 新闻，使用 MiMo LLM 将其改写为播报稿件，并通过 MiMo TTS API 生成语音音频。

## 技术栈

**后端（Node.js）**
- Express 5 Web 框架
- better-sqlite3 嵌入式数据库
- Anthropic SDK（LLM 稿件改写与文本切分）
- Axios（TTS 语音合成 HTTP 请求 + API Key 测试）
- node-cron 定时任务
- Jest 测试框架

**前端（React + TypeScript）**
- React 19 + TypeScript
- Vite 8 构建工具
- Tailwind CSS 4 样式
- Zustand 状态管理
- React Router 7 路由

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

## 目录结构

```
tts-broadcast/
├── backend/
│   ├── src/
│   │   ├── app.js            # Express 应用入口，中间件配置，路由挂载
│   │   ├── db/               # SQLite 初始化与 schema
│   │   ├── routes/           # Express 路由（broadcast, segments, settings, schedule, voicePresets）
│   │   ├── services/         # 业务逻辑 + 数据访问层（aihot, audio, mimo, tts, broadcastStore, segmentStore, scheduler）
│   │   └── utils/            # 共享工具函数（validation）
│   ├── tests/                # Jest 测试，镜像 src/ 结构
│   ├── audio/                # 生成的音频文件（已 gitignore）
│   └── data/                 # SQLite 数据库文件（已 gitignore）
├── frontend/
│   ├── src/
│   │   ├── pages/            # 路由页面（SourceCollection, ScriptEditor, History, Settings）
│   │   ├── components/       # 可复用 UI 组件
│   │   ├── services/         # API 客户端层
│   │   └── store/            # Zustand 状态管理
│   └── vite.config.ts
├── docs/                     # 项目文档
├── start.sh                  # 一键启动脚本
├── README.md
└── .gitignore
```

## 数据库结构

SQLite 数据库包含 4 张表：

- `broadcasts`：播报记录，含稿件内容、音频路径、状态、模式（整篇/分段）
- `segments`：分段记录，关联 broadcast（外键 `ON DELETE CASCADE`），每段独立生成音频
- `settings`：键值存储，保存 API Key、音色偏好、脚本等配置
- `schedules`：定时任务，基于 cron 表达式自动播报

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
- `segments.text`：该段稿件文本
- `segments.audio_path`：该段音频路径
- `segments.status`：该段状态
- `voice_presets`：音色预设，含克隆和设计两种类型，支持保存试听音频和原始参考音频
- `voice_presets.type`：`clone`（克隆）或 `design`（设计）
- `voice_presets.trial_audio_path`：试听音频路径
- `voice_presets.original_audio_path`：克隆原始音频路径（仅 clone 类型）
- `voice_presets.design_prompt`：音色描述（仅 design 类型）

## 外部 API

- **MiMo TTS API**（`https://api.xiaomimimo.com/v1`）：语音合成
- **MiMo ASR API**（`https://api.xiaomimimo.com/v1`）：语音识别（音频转文本）
- **MiMo LLM API**（`https://token-plan-cn.xiaomimimo.com/anthropic`）：稿件改写与文本切分
- **AI HOT API**（`https://aihot.virxact.com`）：每日 AI 新闻数据源

### MiMo API 模型与限速

完整文档见 `docs/mimo-api-models-limits.md`、`docs/ttsSeries.md` 和 `docs/asr.md`。

**限流规则**：RPM（每分钟请求数）上限 100，TPM（每分钟 Token 数）上限 10M。超出会返回 `429 Too Many Requests`。批量生成语音时必须注意并发控制，避免触发限流。

**TTS 模型**：

| 模型 ID | 用途 |
|---------|------|
| `mimo-v2.5-tts` | 预置音色语音合成 |
| `mimo-v2.5-tts-voiceclone` | 音色克隆（需上传音频样本的 base64） |
| `mimo-v2.5-tts-voicedesign` | 音色设计（文本描述生成音色） |

**LLM 模型**：`mimo-v2.5`（稿件改写与文本切分）

**ASR 模型**：

| 模型 ID | 用途 |
|---------|------|
| `mimo-v2.5-asr` | 语音识别（支持中英双语及方言，音频转文本） |

## 前端开发规范

**所有前端开发必须严格遵守 `frontend/FRONTEND_CONVENTIONS.md` 中的规范。** 这是一份完整的前端开发规范文档，涵盖：

- **设计系统** — Soft Editorial 风格
- **色彩/字体/卡片/按钮/输入框** — 统一 Tailwind class 模板
- **组件规范** — 文件结构、Props interface 命名、导出方式、入场动画延迟分配
- **加载状态** — 使用骨架屏（`animate-pulse`），不使用 spinner
- **错误状态** — 使用 `animate-shake` + `bg-pink/10`
- **状态管理** — Zustand store 使用模式、接口类型统一定义在 `store/index.ts`
- **命名规范** — 文件/组件/函数/常量/CSS 变量命名规则

新增页面或组件时，务必对照文档末尾的 Checklist 逐项检查。

## 后端开发规范

**所有后端开发必须严格遵守 `backend/BACKEND_CONVENTIONS.md` 中的规范。** 这是一份完整的后端开发规范文档，涵盖：

- **命名规范** — 文件/变量/常量/数据库/API 路径命名规则
- **代码风格** — 缩进、引号、分号、require 顺序、函数风格、注释语言
- **路由规范** — 路由定义模式、JSDoc 注释、async/await 使用规则
- **服务层规范** — 职责边界、解构参数、避免全局变量
- **数据库规范** — 迁移模式、参数化 SQL、事务使用
- **错误处理** — 统一 try-catch 模式、状态码使用、错误信息暴露策略
- **参数校验** — ID 校验、必填参数、业务规则校验
- **响应格式** — 成功/失败响应结构规范
- **测试规范** — 文件组织、命名、mock 策略、数据库清理策略
- **已知技术债** — 已识别的问题清单

新增路由、服务或测试时，务必对照文档末尾的 Checklist 逐项检查。

## 关键开发模式

- 后端通过 Anthropic SDK 的自定义 `baseURL` 调用 MiMo LLM（`services/mimo.js`），通过 Axios 调用 MiMo TTS API（`services/tts.js`）
- 路由层通过 DAL 层（`services/broadcastStore.js`、`services/segmentStore.js`）操作数据库，不直接写 SQL
- ID 校验使用 `utils/validation.js` 中的 `validateId()`，文件删除使用 `cleanAudioFile()`
- 前端使用 Zustand store 模式管理全局状态
- 测试使用 supertest 进行 HTTP 端点测试
- 音频文件通过 `/audio` 路由作为静态文件提供服务

## 数据持久化开发规范

### 原则

- **服务器是数据的唯一真实来源**，前端状态仅用于 UI 渲染
- **用户可感知的数据必须持久化到 SQLite**，不依赖前端 localStorage
- **文件类资产（音频）按需保留**，有明确的生命周期管理

### 数据存储分层

| 数据类型 | 存储位置 | 生命周期 |
|---------|---------|---------|
| 播报记录（标题、稿件、状态） | SQLite `broadcasts` 表 | 永久 |
| 音频文件（.wav） | `backend/audio/` 目录 | 按需保留（见音频生命周期） |
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

### 数据库迁移规范

SQLite 不支持 `ALTER TABLE ADD COLUMN IF NOT EXISTS`，迁移使用 try-catch 模式：

```js
// backend/src/db/index.js
try {
  db.prepare('SELECT new_column FROM table_name LIMIT 1').get();
} catch {
  db.exec('ALTER TABLE table_name ADD COLUMN new_column TYPE DEFAULT value');
}
```

- 迁移代码放在 `db/index.js` 中，紧跟 schema 初始化之后
- 新增列必须有 DEFAULT 值，确保旧数据兼容
- `schema.sql` 保持最新完整定义，迁移代码仅处理增量

### 前端设置持久化流程

```
App 启动 → useEffect → fetchSettings() → 写入 Zustand store
                                              ↓
                          Settings 页面读取 store 展示表单
                                              ↓
                          用户修改 → updateSettings() → PUT /api/settings → 更新 store
```

- `App.tsx` 中 `useEffect` 在挂载时调用 `fetchSettings()`，确保设置全局可用
- Settings 页面的 `fetchSettings()` 可保留，用于刷新最新数据
- store 中维护 `defaultSettings` 作为兜底，防止 API 失败时 UI 空白

### 新增持久化字段的 Checklist

1. `backend/src/db/schema.sql` — 更新表定义
2. `backend/src/db/index.js` — 添加迁移代码（ALTER TABLE）
3. `backend/src/services/*Store.js` — 在 DAL 层添加新的 CRUD 函数（如已有对应 Store）
4. `backend/src/routes/*.js` — CRUD 接口（通过 DAL 操作数据库）
5. `frontend/src/services/api.ts` — 新增 API 调用
6. `frontend/src/store/index.ts` — 更新接口类型 + store action
7. `frontend/src/pages/*.tsx` 或 `components/*.tsx` — UI 展示与交互
