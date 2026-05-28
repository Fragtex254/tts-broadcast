# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TTS Broadcast is a full-stack application for automated AI news broadcasting using Xiaomi MiMo TTS API. It fetches daily AI news from AI HOT, rewrites them into broadcast scripts using MiMo LLM, and generates TTS audio.

## Tech Stack

**Backend (Node.js)**
- Express 5 web framework
- better-sqlite3 for embedded database
- OpenAI SDK (compatible with MiMo API)
- node-cron for scheduled tasks
- Jest for testing

**Frontend (React + TypeScript)**
- React 19 with TypeScript
- Vite 8 build tool
- Tailwind CSS 4 for styling
- Zustand for state management
- React Router 7 for routing

## Common Commands

### Backend (from `tts-broadcast/backend/`)

```bash
npm run dev          # Start dev server with hot reload (port 3001)
npm start            # Start production server
npm test             # Run all tests with Jest
npm test -- --watch  # Run tests in watch mode
```

### Frontend (from `tts-broadcast/frontend/`)

```bash
npm run dev          # Start dev server (port 5173)
npm run build        # Build for production (runs tsc + vite build)
npm run lint         # Run ESLint
npm run preview      # Preview production build
```

## Architecture

```
tts-broadcast/
├── backend/
│   ├── src/
│   │   ├── app.js            # Express app entry, middleware setup, route mounting
│   │   ├── db/               # SQLite initialization and schema
│   │   ├── routes/           # Express routes (broadcast, settings, schedule)
│   │   └── services/         # Business logic (aihot, mimo, scheduler)
│   ├── tests/                # Jest tests mirroring src/ structure
│   ├── audio/                # Generated audio files (gitignored)
│   └── data/                 # SQLite database files (gitignored)
├── frontend/
│   ├── src/
│   │   ├── pages/            # Route components (Dashboard, History, Settings)
│   │   ├── components/       # Reusable UI components
│   │   ├── services/         # API client layer
│   │   └── store/            # Zustand state management
│   └── vite.config.ts
└── .gitignore
```

## Database Schema

SQLite with 3 tables:
- `broadcasts`: Generated broadcasts with audio paths, status tracking
- `settings`: Key-value store for API keys, voice preferences, scripts
- `schedules`: Cron-based scheduled tasks for automated broadcasting

## External APIs

- **MiMo TTS API** (`https://api.xiaomimimo.com/v1`): Text-to-speech synthesis
- **MiMo LLM API**: Text rewriting for broadcast scripts
- **AI HOT API**: Daily AI news data source

## Environment Variables

Backend requires `.env` file in `tts-broadcast/backend/`:
```env
MIMO_API_KEY=your_api_key_here
PORT=3001
NODE_ENV=development
```

## Key Patterns

- Backend uses OpenAI SDK with custom base_url for MiMo API compatibility
- Frontend uses Zustand store pattern for global state
- Tests use supertest for HTTP endpoint testing
- Audio files are served as static files from `/audio` route

## Persistence Development Spec

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
