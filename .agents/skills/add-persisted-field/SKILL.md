---
name: add-persisted-field
description: 新增一个贯穿前后端的持久化字段或业务概念时使用。编排 schema→迁移→Store→路由→api.ts→types.ts→schemas.ts→slice→UI 的完整链路，保证前后端契约不漂移、共享类型不用裸 any。触发场景：加字段、加持久化字段、加设置项、新增数据库列并要前端展示、前后端契约、贯穿前后端、加一个属性。
---

# 新增贯穿前后端的持久化字段

## 何时用 / 不用

- **用**：一个数据需要同时落库、经路由暴露、前端消费/展示（典型：给 broadcast 加字段、加一个 Settings 项）。
- **不用**：纯后端字段不上前端（只需 `backend-database`）；纯前端局部 state（只需 `frontend-state-data`）。
- **本 skill 是编排器**：每一步的细则跳到对应 skill。

## 核心铁则

1. 共享业务概念（`Broadcast`/`Segment`/`VoiceConfig`/`Settings`/SSE payload）**必须有稳定类型，不得裸 `any`**。
2. 后端新增字段后**必须**按固定顺序同步全链路，任一环漏掉都会造成契约漂移。
3. 前端默认值/状态枚举/参数名不得与后端不一致；默认值来自 settings 或统一常量。

## 模式与模板

按顺序执行，每步细则见对应 skill：

1. `backend/src/db/schema.sql` — 更新表定义 → 见 `backend-database`
2. `backend/src/db/index.js` — 加 ALTER TABLE 迁移（带 DEFAULT）→ 见 `backend-database`
3. `backend/src/services/*Store.js` — DAL 层 CRUD 读写新字段 → 见 `backend-database`
4. `backend/src/routes/*.js` — 路由响应/入参带上新字段 → 见 `backend-route`
5. `frontend/src/services/api.ts` — API 调用类型/参数 → 见 `frontend-state-data`
6. `frontend/src/store/types.ts` — 共享类型加字段 → 见 `frontend-state-data`
7. `frontend/src/services/schemas.ts` — Zod schema 加字段 → 见 `frontend-state-data`
8. `frontend/src/store/*Slice.ts` — store action/状态 → 见 `frontend-state-data`
9. `frontend/src/pages|components/*.tsx` — UI 展示与交互 → 见 `frontend-component`

> Settings 字段额外同步 `store/defaults.ts` 与 `settingsDraft.test.ts`。

## Checklist

### 新增持久化字段（端到端）

1. `backend/src/db/schema.sql` — 更新表定义
2. `backend/src/db/index.js` — 添加迁移代码（ALTER TABLE）
3. `backend/src/services/*Store.js` — 在 DAL 层添加新的 CRUD 函数（如已有对应 Store）
4. `backend/src/routes/*.js` — CRUD 接口（通过 DAL 操作数据库）
5. `frontend/src/services/api.ts` — 新增 API 调用
6. `frontend/src/store/index.ts` — 更新接口类型 + store action
7. `frontend/src/pages/*.tsx` 或 `components/*.tsx` — UI 展示与交互

### 后端新增字段后必须同步（前后端契约）

1. `schema.sql` 和迁移
2. 对应 `*Store.js`
3. 路由响应
4. `frontend/src/services/api.ts`
5. `frontend/src/store/types.ts` 和相关 `store/*Slice.ts`
6. 相关页面/组件

## 相关 skill / 文档

- 各步细则 → `backend-database` / `backend-route` / `frontend-state-data` / `frontend-component`
- 持久化分层与生命周期背景 → `AGENTS.md` 数据持久化章节
