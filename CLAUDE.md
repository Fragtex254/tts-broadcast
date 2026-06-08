# CLAUDE.md

本文件为 Claude Code（claude.ai/code）在本仓库中工作时提供指引。

## 项目概述

TTS Broadcast 是一个全栈应用，用于自动化 AI 新闻播报。它从 AI HOT 抓取每日 AI 新闻，使用 MiMo LLM 将其改写为播报稿件，并通过 MiMo TTS API 生成语音音频。

## 技术栈

**后端（Node.js）**
- Express 5 Web 框架
- better-sqlite3 嵌入式数据库
- Anthropic SDK（LLM 稿件改写与文本切分）
- Axios（TTS 语音合成 HTTP 请求）
- OpenAI SDK（仅用于 TTS Key 有效性测试）
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
│   │   ├── routes/           # Express 路由（broadcast, settings, schedule）
│   │   └── services/         # 业务逻辑（aihot, audio, mimo, scheduler）
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

## 外部 API

- **MiMo TTS API**（`https://api.xiaomimimo.com/v1`）：语音合成
- **MiMo LLM API**（`https://token-plan-cn.xiaomimimo.com/anthropic`）：稿件改写与文本切分
- **AI HOT API**（`https://aihot.virxact.com`）：每日 AI 新闻数据源

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

## 关键开发模式

- 后端通过 Anthropic SDK 的自定义 `baseURL` 调用 MiMo LLM，通过 Axios 直接请求 MiMo TTS API
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
3. `backend/src/routes/*.js` — CRUD 接口
4. `frontend/src/services/api.ts` — 新增 API 调用
5. `frontend/src/store/index.ts` — 更新接口类型 + store action
6. `frontend/src/pages/*.tsx` 或 `components/*.tsx` — UI 展示与交互
