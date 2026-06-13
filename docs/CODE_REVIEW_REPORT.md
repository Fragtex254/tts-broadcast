# TTS Broadcast 全面代码审查报告

> **审查分支**: `code-review/comprehensive-audit`
> **审查日期**: 2026-06-13
> **审查范围**: 后端 (Node.js/Express) + 前端 (React/TypeScript)
> **审查人**: Senior Developer

---

## 目录

- [1. 审查概述](#1-审查概述)
- [2. 总体评价](#2-总体评价)
- [3. 后端审查](#3-后端审查)
  - [3.1 代码结构](#31-代码结构)
  - [3.2 代码质量](#32-代码质量)
  - [3.3 安全性](#33-安全性)
  - [3.4 性能](#34-性能)
  - [3.5 错误处理](#35-错误处理)
  - [3.6 测试覆盖](#36-测试覆盖)
  - [3.7 后端问题清单](#37-后端问题清单)
- [4. 前端审查](#4-前端审查)
  - [4.1 代码结构](#41-代码结构)
  - [4.2 TypeScript 类型安全](#42-typescript-类型安全)
  - [4.3 React 最佳实践](#43-react-最佳实践)
  - [4.4 状态管理](#44-状态管理zustand)
  - [4.5 安全性](#45-安全性)
  - [4.6 性能](#46-性能)
  - [4.7 可访问性](#47-可访问性-a11y)
  - [4.8 前端问题清单](#48-前端问题清单)
- [5. 跨前后端问题](#5-跨前后端问题)
- [6. 优先修复路线图](#6-优先修复路线图)
- [7. 改进建议总结](#7-改进建议总结)

---

## 1. 审查概述

本次审查对 TTS Broadcast 系统进行了全面深入的代码审查，覆盖后端和前端两大模块，从代码结构、代码质量、安全性、性能、错误处理、测试覆盖等多个维度进行了评估。

**审查方法**：
- 逐一读取每个源代码文件
- 对照 `BACKEND_CONVENTIONS.md` 和 `FRONTEND_CONVENTIONS.md` 规范文档
- 检查安全性、性能、可维护性等非功能性需求
- 评估测试覆盖率和测试质量

**统计数据**：

| 指标 | 后端 | 前端 |
|------|------|------|
| 源代码文件数 | ~20 | ~30 |
| Critical 问题 | 1 | 0 |
| High 问题 | 5 | 4 |
| Medium 问题 | 14 | 13 |
| Low 问题 | 10 | 6 |
| 未覆盖测试模块 | 5 | - |

---

## 2. 总体评价

### 后端

该后端项目代码质量整体**良好**，架构清晰，遵循自定的 `BACKEND_CONVENTIONS.md` 规范。已有的技术改进（DAL 层抽取、`validateId` 提取、TTS/LLM 分离等）体现了持续改进的意识。测试覆盖面较广，外部 API 全部 mock，数据库使用内存 SQLite。

**核心优势**：
- 三层架构（路由/服务/DAL）边界清晰
- 所有 SQL 均使用参数化绑定，无注入风险
- TTS 队列串行限速设计合理
- SSE 心跳机制防止连接超时
- 临时文件均有 finally 块清理

**主要风险**：
- SSE 路由无错误处理，可能导致未捕获异常崩溃
- API Key 明文暴露给前端
- 429 重试逻辑重复，维护成本高
- 多处 ID 校验未使用统一的 `validateId()`

### 前端

这是一个**质量较高**的前端项目，规范先行，类型严格，设计一致性好。

**核心优势**：
- `FRONTEND_CONVENTIONS.md` 详细规定了设计系统和组件规范
- TypeScript 全套严格检查（`strict`, `noImplicitAny`, `strictNullChecks`）
- Zod 运行时校验 API 响应数据
- 非首屏页面懒加载代码分割
- 所有组件使用 Zustand selector，避免全量订阅
- 关键工具函数有配套测试

**主要风险**：
- `safeParse` 失败时回退未校验数据，违反自身规范
- `VoiceGenerator` 频繁 store 更新导致性能问题
- `ConfirmDialog` 缺少焦点陷阱和 ARIA 属性
- SSE 客户端 `JSON.parse` 结果未做运行时校验

---

## 3. 后端审查

### 3.1 代码结构

项目遵循 `routes/` → `services/` → `db/` 三层架构，目录组织整体合理。

**分层评估**：

| 层级 | 职责边界 | 遵守程度 |
|------|---------|----------|
| routes/ | HTTP 交互、参数校验、响应格式化 | 良好，个别违规 |
| services/ | 业务逻辑、外部 API 封装 | 良好 |
| services/*Store.js | 数据访问层 | 良好 |
| utils/ | 纯工具函数 | 良好 |

**违规之处**：

1. `routes/settings.js` 直接调用 `db.prepare()` 操作 settings 表，虽规范声明"settings 表除外"，但建议长期统一到 DAL 层
2. `routes/voicePresets.js` 包含 `audioBufferToBase64` 工具函数，不应出现在路由层
3. `routes/transcribe.js` 中 `cleanUploadedFile`、`handleUploadError`、`buildTaskId` 应提取到 utils 或 services
4. `services/segmentStore.js` 与 `utils/validation.js` 重复定义 `audioDir` 常量

**循环依赖**：`mimo.js` 与 `tts.js` 之间存在循环依赖。`mimo.js` 通过先导出 `module.exports` 再 `require('./tts')` 的方式规避，虽然当前有效，但如果未来 `tts.js` 也需要在模块顶层访问 `mimo.js` 的导出，会导致拿到空对象。

### 3.2 代码质量

**命名规范不一致**：

- `voicePresets.js` 路由删除接口和 `schedule.js` 全部 3 处 ID 校验使用内联 `parseInt` 而非 `validateId()`
- `voicePresets.js` 中 `createUpload` 变量名不够描述性

**DRY 违反**：

| 重复内容 | 位置 | 建议 |
|---------|------|------|
| 429 重试逻辑 | `tts.js` L84-117 / `mimoApiClient.js` L28-62 | 提取为 `utils/retry.js` |
| audioDir 常量 | `segmentStore.js` L6 / `validation.js` L5 | 统一从 `validation.js` 导入 |
| JSON 解析 + fallback | `settings.js` / `mimo.js` | 提取为 settings 服务层方法 |

**函数长度和复杂度**：

- `segments.js` 的 `batch-generate` 路由有 113 行，逻辑复杂度高，应拆分
- `mimo.js` 393 行，职责较多（LLM 调用、API Key 管理、模型发现 re-export），后续应监控

### 3.3 安全性

#### SQL 注入 — ✅ 良好

所有 SQL 操作均使用参数化绑定（`?` 占位符），未发现字符串拼接 SQL。`segmentStore.js` 的 `countByIds` 使用 `ids.map(() => '?').join(',')` 生成 IN 子句占位符，这是安全的。

#### 路径遍历 — ⚠️ 存在风险

| 文件 | 行号 | 风险 | 建议 |
|------|------|------|------|
| `broadcast.js` | 322 | `path.join(__dirname, '../..', broadcast.audio_path)` 直接拼接数据库字段 | 增加路径规范化检查 |
| `voicePresets.js` | 35 | 临时文件扩展名来自 `path.extname()` | 对 `ext` 做白名单校验 |
| `validation.js` | 32 | `fp.startsWith(audioDir)` 未考虑符号链接 | 使用 `path.resolve()` 比较 |

#### API Key 暴露 — 🔴 高风险

`settings.js` GET 接口返回所有设置包括 API Key 明文。这是最需优先修复的安全问题。

#### 输入验证遗漏 — ⚠️ 多处

| 路由 | 参数 | 问题 |
|------|------|------|
| `broadcast.js` generate | `text` | 无长度限制 |
| `broadcast.js` batch-delete | `ids` | 数组无长度限制 |
| `settings.js` PUT | `updates` key | 无白名单校验 |
| `schedule.js` POST | `name` | 无长度限制 |
| `voicePresets.js` POST | `name`, `style_prompt`, `design_prompt` | 无长度限制 |

### 3.4 性能

#### 数据库查询优化

1. **`batchDeleteByIds`**：事务内逐条 SELECT + DELETE，大量 ID 时效率低，建议使用 IN 子句批量查询
2. **`batch-delete` 路由**：先循环 `getById` 获取每条记录，对 N 条记录产生 2N+1 次查询
3. **清理旧记录**：逐条 `deleteById` + `cleanAudioFile`，应使用批量操作

#### 内存泄漏风险

1. **`sseManager.js`**：客户端异常断开未触发 `close` 事件时，连接残留在 Map 中。建议增加超时清理机制
2. **`scheduler.js`**：`start()` 函数未注册进程信号处理，进程异常退出时 cron 任务可能不会被正确清理

#### 并发处理

- better-sqlite3 同步 API 在当前规模可接受
- TTS 队列 FIFO 串行 + 700ms 间隔，有效避免 429 限流
- SSE 每 30 秒心跳，防止代理超时

### 3.5 错误处理

#### try-catch 覆盖

- **整体良好**：所有路由处理器都有 try-catch 包裹
- **🔴 SSE 路由**：`routes/sse.js` 整个处理器**没有 try-catch**，`res.writeHead()` 或 `sseManager.addClient()` 可能抛出异常导致未捕获异常崩溃

#### 错误信息泄露

1. `settings.js` POST /test-key：catch 块返回 200 状态码 + `error.message`，暴露内部错误且语义不正确
2. 多处 `res.status(500).json({ error: error.message })` 在生产环境中可能泄露敏感信息

#### 状态一致性

1. `generate` 路由：先写音频文件再创建数据库记录，若 DB 写入失败，音频文件成为孤儿
2. `batch-generate`：segment 设为 `generating` 后若服务崩溃，该 segment 永远停留在 `generating` 状态
3. `save` 路由：先 `toggleSaved` 再检查上限，若删除过程中出错可能导致超过 50 条上限

### 3.6 测试覆盖

| 模块 | 覆盖情况 |
|------|---------|
| routes/broadcast.js | 主要端点已覆盖，缺少 generate whole 模式成功路径 |
| routes/segments.js | 覆盖良好 |
| routes/settings.js | 覆盖良好 |
| routes/schedule.js | 基本 CRUD 覆盖，缺少无效 cron 表达式测试 |
| routes/voicePresets.js | 主要端点已覆盖，缺少 clone 试听和上限 20 测试 |
| routes/transcribe.js | 覆盖良好 |
| **routes/sse.js** | **🔴 未覆盖** |
| **services/voiceConfig.js** | **🔴 未覆盖** |
| **services/audioAsset.js** | **🔴 未覆盖** |
| **services/ttsQueue.js** | **🔴 未覆盖** |
| services/media.js | 核心函数已覆盖，`fileToAsrDataUrls` 和 `convertToChunkedDataUrls` 未测试 |

### 3.7 后端问题清单

#### Critical

| # | 文件 | 行号 | 问题 | 修复建议 |
|---|------|------|------|----------|
| BE-C1 | `routes/sse.js` | 10-37 | SSE 路由无 try-catch，可能未捕获异常崩溃 | 添加 try-catch 包裹整个处理器 |

#### High

| # | 文件 | 行号 | 问题 | 修复建议 |
|---|------|------|------|----------|
| BE-H1 | `routes/settings.js` | 10-22 | GET /api/settings 返回 API Key 明文 | 对 key 类设置脱敏（如 `***abcd`） |
| BE-H2 | `routes/voicePresets.js` | 254-258 | 删除预设使用内联 parseInt 而非 validateId() | 改用 `validateId(req.params.id, '预设 ID')` |
| BE-H3 | `routes/schedule.js` | 50,89,115 | 3 处 ID 校验均使用内联 parseInt | 统一改用 `validateId()` |
| BE-H4 | 测试 | - | `routes/sse.js` 完全没有测试覆盖 | 添加 SSE 连接、心跳、客户端断开等测试 |
| BE-H5 | 测试 | - | `services/voiceConfig.js` 没有测试覆盖 | 添加核心转换函数测试 |

#### Medium

| # | 文件 | 行号 | 问题 | 修复建议 |
|---|------|------|------|----------|
| BE-M1 | `routes/settings.js` | 76-79 | POST /test-key 返回 200 + error.message | 改为 500 状态码，不暴露 error.message |
| BE-M2 | `routes/broadcast.js` | 322 | 直接拼接数据库字段构建文件路径 | 添加路径规范化检查 |
| BE-M3 | `routes/broadcast.js` | 73 | text 参数无长度限制 | 添加长度限制（如 10000） |
| BE-M4 | `routes/broadcast.js` | 174 | ids 数组无长度限制 | 添加限制（如 100） |
| BE-M5 | `routes/settings.js` | 28-48 | PUT /api/settings 对 key 无白名单 | 定义允许的 key 白名单 |
| BE-M6 | `services/tts.js` | 84-117 | 429 重试逻辑与 mimoApiClient.js 重复 | 提取为 `utils/retry.js` |
| BE-M7 | `services/mimo.js` | 392-393 | re-export tts.generateSpeech 引入循环依赖 | 逐步迁移调用方直接引用 tts.js |
| BE-M8 | `routes/voicePresets.js` | 23-60 | audioBufferToBase64 不应在路由层 | 移至 services/ |
| BE-M9 | `routes/segments.js` | 77-190 | batch-generate 113 行，复杂度高 | 拆分为辅助函数 |
| BE-M10 | `routes/segments.js` | 120 | generating 状态的 segment 无法重试 | 在重试时将 generating 重置为 pending |
| BE-M11 | 测试 | - | `services/audioAsset.js` 无测试 | 添加文件写入逻辑测试 |
| BE-M12 | 测试 | - | `services/ttsQueue.js` 无测试 | 添加串行化和间隔测试 |
| BE-M13 | 测试 | - | `services/media.js` 切片逻辑未测试 | 添加切片逻辑测试 |
| BE-M14 | `routes/schedule.js` | 23 | name 参数无长度限制 | 添加长度校验 |

#### Low

| # | 文件 | 行号 | 问题 | 修复建议 |
|---|------|------|------|----------|
| BE-L1 | `services/segmentStore.js` | 6 | audioDir 常量与 validation.js 重复 | 从 validation.js 导入 |
| BE-L2 | `routes/broadcast.js` | 126-133 | 清理旧记录逐条删除效率低 | 使用批量操作 |
| BE-L3 | `app.js` | 52-59 | start() 未注册进程信号处理 | 添加 SIGTERM/SIGINT 处理 |
| BE-L4 | `services/sseManager.js` | 8-10 | SSE 连接无超时清理 | 添加定期扫描机制 |
| BE-L5 | `utils/validation.js` | 32 | startsWith 检查未考虑符号链接 | 使用 path.resolve() |
| BE-L6 | `services/mimo.js` | 348 | TTS API 测试地址硬编码 | 提取为常量或配置 |
| BE-L7 | `services/media.js` | 272 | duration: 24*60*60 语义不明确 | 使用常量并添加注释 |
| BE-L8 | `routes/broadcast.js` | 51-52 | rewrite 路由直接读 db 而非用 mimo.getSettingValue() | 使用服务层方法 |
| BE-L9 | `routes/broadcast.js` | 22-29 | take 参数未验证正数 | 添加正数校验 |
| BE-L10 | `db/schema.sql` | 51-63 | 与迁移代码默认值不一致 | 统一定义 |

---

## 4. 前端审查

### 4.1 代码结构

**目录组织合理**，遵循功能域优先的拆分策略。`services/` 只管 HTTP/SSE，`store/` 只管状态，`pages/` 做编排。

**问题**：
- `store/types.ts` 同时包含 UI 类型（`ConfirmDialogProps`）和领域类型，职责略有混杂
- `CloneTrialPanel` 和 `DesignTrialPanel` 有大量重复的"保存预设"逻辑，可抽取共享 `SavePresetDialog`

### 4.2 TypeScript 类型安全

#### 严重问题

1. **`safeParse` 回退未校验数据**（High）— `broadcastSlice.ts` 和 `settingsSlice.ts` 中，当 Zod 校验失败时回退使用原始 `response.data`，TypeScript 认为类型正确但运行时可能是任意结构。这违反了自身规范中"详情/设置类接口解析失败时应保留旧 state 或显式报错"的要求。

2. **索引签名破坏类型安全**（Medium）— `NewsItem` 和 `TodayItem` 使用 `[key: string]: unknown`，任何键值对都可以赋给这两个类型。

3. **`as` 类型断言滥用**（Medium）— `sseClient.ts` 中 `JSON.parse` 结果使用 `as` 断言，`broadcastSlice.ts` 中 `as string` 断言，均无运行时校验。

4. **重复的错误提取函数**（Medium）— `Transcribe.tsx` 的 `getErrorMessage` 与 `services/apiError.ts` 的 `getApiErrorMessage` 功能重复。

### 4.3 React 最佳实践

#### useEffect 问题

| 问题 | 文件 | 严重级别 |
|------|------|---------|
| 8 个依赖项频繁触发 store 更新 | VoiceGenerator.tsx | High |
| eslint-disable 隐藏依赖问题 | VoiceGenerator.tsx | Medium |
| localScript 不同步外部 script 变化 | ScriptPreview.tsx | Medium |
| setTimeout(fn, 0) hack | History.tsx | Low |

#### 性能问题

| 问题 | 文件 | 严重级别 |
|------|------|---------|
| useEffect 频繁触发导致重渲染 | VoiceGenerator.tsx | High |
| timeupdate 每秒 4 次 setCurrentTime | AudioPlayer.tsx | Medium |
| SSE 进度事件 map 整个数组 | SegmentEditor.tsx | Medium |
| SectionCard 组件内定义导致重建 | Settings.tsx | Low |

### 4.4 状态管理（Zustand）

**设计良好**：
- 单一 store + slice 模式
- 所有 slice 返回类型用 `Pick<AppState, ...>` 约束
- 组件使用 selector 避免全量订阅

**问题**：

| 问题 | 文件 | 级别 |
|------|------|------|
| safeParse 失败回退未校验数据 | broadcastSlice.ts | High |
| fetchPresets 吞掉错误 | presetSlice.ts | Medium |
| fetchSchedules 未做 Zod 校验 | scheduleSlice.ts | Medium |
| `as string` 类型断言 | broadcastSlice.ts | Medium |

### 4.5 安全性

#### XSS 防护 — ✅ 良好

React 默认对 JSX 文本做 HTML 转义，未发现 `dangerouslySetInnerHTML` 使用。

#### 敏感信息

| 问题 | 文件 | 级别 |
|------|------|------|
| `llm_base_url` 硬编码 API 端点地址 | defaults.ts | Medium |
| SSE taskId 未清理拼入 URL | sseClient.ts | Medium |
| API Key 在 store 中明文存储 | Settings.tsx | Low（正常行为） |

### 4.6 性能

| 问题 | 文件 | 级别 | 建议 |
|------|------|------|------|
| VoiceGenerator 频繁 store 更新 | VoiceGenerator.tsx | High | 合并状态，减少更新频率 |
| timeupdate 过于频繁 | AudioPlayer.tsx | Medium | throttling 或 RAF |
| SSE 进度 map 全量 | SegmentEditor.tsx | Medium | 只更新变化的 segment |

**代码分割** — ✅ 已使用 `React.lazy()` 对非首屏页面做代码分割

**大列表** — ✅ 分页限制（20 条/页），无性能问题

### 4.7 可访问性 (a11y)

**优点**：
- 使用语义化标签（`<nav>`, `<main>`, `<header>`, `<aside>`, `<section>`）
- `index.html` 设置 `lang="zh-CN"`
- 全局处理 `prefers-reduced-motion: reduce`

**问题**：

| 问题 | 文件 | 级别 |
|------|------|------|
| 模态框缺少 role="dialog" 和焦点陷阱 | ConfirmDialog.tsx | High |
| 图标按钮缺少 aria-label | SegmentEditor.tsx | Medium |
| 播放按钮缺少 aria-label | AudioPlayer.tsx | Medium |
| checkbox 缺少 aria-label | History.tsx | Medium |
| Unicode 符号对辅助技术不友好 | Sidebar.tsx | Low |
| 文件拖拽区缺少键盘操作 | Transcribe.tsx | Low |

### 4.8 前端问题清单

#### High

| # | 文件 | 行号 | 问题 | 修复建议 |
|---|------|------|------|----------|
| FE-H1 | `store/broadcastSlice.ts` | 62, 97 | safeParse 返回 null 时回退使用未校验数据 | 校验失败时抛错或保留旧 state |
| FE-H2 | `store/settingsSlice.ts` | 20 | 同 FE-H1 | 同 FE-H1 |
| FE-H3 | `components/Dashboard/VoiceGenerator.tsx` | 73-85 | 8 个依赖项 useEffect 频繁触发 store 更新 | 合并状态，减少更新频率 |
| FE-H4 | `components/ConfirmDialog.tsx` | 18 | 模态框缺少 ARIA 属性和焦点陷阱 | 添加 `role="dialog"` `aria-modal="true"`，实现焦点陷阱 |

#### Medium

| # | 文件 | 行号 | 问题 | 修复建议 |
|---|------|------|------|----------|
| FE-M1 | `store/types.ts` | 11, 51 | NewsItem/TodayItem 索引签名破坏类型安全 | 删除索引签名，或改为精确类型 |
| FE-M2 | `services/sseClient.ts` | 77, 83 | JSON.parse 结果使用 as 断言，无运行时校验 | 使用 Zod 校验 |
| FE-M3 | `pages/Transcribe.tsx` | 21-27 | getErrorMessage 与 apiError.ts 重复 | 统一使用 getApiErrorMessage |
| FE-M4 | `components/Dashboard/ScriptPreview.tsx` | 14 | localScript 不同步外部 script 变化 | 添加 useEffect 同步 |
| FE-M5 | `components/Dashboard/AudioPlayer.tsx` | 49 | timeupdate 触发过于频繁 | 使用 throttling |
| FE-M6 | `store/presetSlice.ts` | 13-15 | fetchPresets 吞掉错误 | 应抛出错误让调用方处理 |
| FE-M7 | `store/scheduleSlice.ts` | 15 | fetchSchedules 未做 Zod 校验 | 使用 safeParseArray 校验 |
| FE-M8 | `store/broadcastSlice.ts` | 63 | as string 类型断言 | 使用 Zod 校验或类型守卫 |
| FE-M9 | `services/sseClient.ts` | 68 | taskId 未经清理拼入 URL | 添加格式校验 |
| FE-M10 | `components/Dashboard/SegmentEditor.tsx` | 252-259 | 图标按钮缺少 aria-label | 添加无障碍标签 |
| FE-M11 | `components/Dashboard/AudioPlayer.tsx` | 141-149 | 播放按钮缺少 aria-label | 添加 aria-label |
| FE-M12 | `pages/History.tsx` | 187 | checkbox 缺少 aria-label | 添加 aria-label |
| FE-M13 | `store/defaults.ts` | 8 | 硬编码 API 端点地址 | 从环境变量读取 |

#### Low

| # | 文件 | 行号 | 问题 | 修复建议 |
|---|------|------|------|----------|
| FE-L1 | `components/Dashboard/AudioPlayer.tsx` | 9 | mode 类型应更精确 | 使用联合类型 |
| FE-L2 | `pages/History.tsx` | 133-138 | setTimeout(fn, 0) hack | 使用 useRef 标记 |
| FE-L3 | `components/Layout/Sidebar.tsx` | 39 | Unicode 符号对辅助技术不友好 | 使用 aria-hidden |
| FE-L4 | `pages/Settings.tsx` | 193-209 | SectionCard 在组件内定义 | 提取到外部 |
| FE-L5 | CloneTrialPanel / DesignTrialPanel | 多处 | 保存预设逻辑重复 | 抽取共享 SavePresetDialog |
| FE-L6 | `components/Dashboard/VoiceGenerator.tsx` | 109-123 | eslint-disable 隐藏依赖问题 | 重构依赖关系 |

---

## 5. 跨前后端问题

### 5.1 前后端契约

- 后端 `GET /api/settings` 返回 API Key 明文，前端直接展示在 Settings 页面。应前后端协同修复：后端脱敏 + 前端单独提供 key 更新接口
- `store/types.ts` 中的类型定义应与后端响应结构保持同步。当前 `NewsItem`/`TodayItem` 使用索引签名，说明后端返回了前端未完全定义的字段

### 5.2 SSE 事件契约

- SSE 事件数据（`SSEProgressEvent` 等）在前端使用 `as` 断言，后端没有对应的 schema 定义。建议在 `store/types.ts` 或 `services/schemas.ts` 中补充 Zod schema

### 5.3 错误信息传递

- 后端多处将 `error.message` 直接返回前端，可能包含内部实现细节
- 前端 `getErrorMessage` 与 `getApiErrorMessage` 重复实现，且实现方式不一致

---

## 6. 优先修复路线图

### P0 — 立即修复（安全/崩溃风险）

| 优先级 | 问题 ID | 描述 | 预估工时 |
|--------|---------|------|----------|
| P0-1 | BE-C1 | SSE 路由无 try-catch | 0.5h |
| P0-2 | BE-H1 | API Key 明文暴露 | 2h |
| P0-3 | FE-H1/H2 | safeParse 回退未校验数据 | 1h |

### P1 — 本周修复（规范违反/重要遗漏）

| 优先级 | 问题 ID | 描述 | 预估工时 |
|--------|---------|------|----------|
| P1-1 | BE-H2/H3 | ID 校验统一使用 validateId() | 1h |
| P1-2 | BE-H4 | 添加 SSE 路由测试 | 2h |
| P1-3 | BE-H5 | 添加 voiceConfig 测试 | 2h |
| P1-4 | FE-H3 | VoiceGenerator 性能优化 | 2h |
| P1-5 | FE-H4 | ConfirmDialog 无障碍修复 | 2h |

### P2 — 下周修复（代码质量/可维护性）

| 优先级 | 问题 ID | 描述 | 预估工时 |
|--------|---------|------|----------|
| P2-1 | BE-M6 | 提取 429 重试逻辑为共享模块 | 1h |
| P2-2 | BE-M5 | settings key 白名单校验 | 1h |
| P2-3 | BE-M3/M4 | 输入长度限制 | 1h |
| P2-4 | BE-M8 | audioBufferToBase64 移至 services | 0.5h |
| P2-5 | BE-M9 | batch-generate 路由拆分 | 1h |
| P2-6 | BE-M10 | generating 状态可重试 | 1h |
| P2-7 | FE-M1 | 删除索引签名 | 1h |
| P2-8 | FE-M2/M8 | 消除 as 类型断言 | 2h |
| P2-9 | FE-M4 | ScriptPreview 同步修复 | 0.5h |
| P2-10 | FE-M5 | AudioPlayer throttling | 0.5h |

### P3 — 后续迭代（优化改进）

| 优先级 | 问题 ID | 描述 |
|--------|---------|------|
| P3-1 | BE-L1~L10 | 后端 Low 级别问题 |
| P3-2 | FE-L1~L6 | 前端 Low 级别问题 |
| P3-3 | BE-M11~M14 | 补充缺失测试 |
| P3-4 | BE-M7 | 移除 mimo.js re-export，消除循环依赖 |
| P3-5 | FE-L5 | 抽取 SavePresetDialog 共享组件 |

---

## 7. 改进建议总结

### 架构层面

1. **提取共享重试模块**：429 重试逻辑在 `tts.js` 和 `mimoApiClient.js` 中重复，应提取为 `utils/retry.js`
2. **消除循环依赖**：逐步移除 `mimo.js` 对 `tts.js` 的 re-export，让调用方直接引用
3. **settings 统一服务层**：目前 settings 的读取散布在路由和服务中，建议统一为 `services/settingsStore.js`
4. **SSE 事件 schema**：前后端共享 SSE 事件类型定义，使用 Zod schema 校验

### 安全层面

1. **API Key 脱敏**：GET 接口返回时只显示后 4 位，PUT 接口单独处理 key 更新
2. **路径安全加固**：所有文件操作路径使用 `path.resolve()` + 起始目录检查
3. **输入校验完善**：添加所有文本参数的长度限制，settings key 白名单
4. **生产环境错误信息**：不向客户端暴露 `error.message`，使用通用错误消息

### 性能层面

1. **批量数据库操作**：将逐条删除/查询改为 IN 子句批量操作
2. **前端更新频率控制**：AudioPlayer 使用 throttling，VoiceGenerator 合并状态更新
3. **SSE 进度更新**：只更新变化的 segment 而非 map 全量数组
4. **SSE 连接清理**：添加超时机制防止连接残留

### 测试层面

1. **SSE 路由测试**：覆盖连接建立、心跳、客户端断开
2. **voiceConfig 测试**：覆盖 normalizeVoiceConfig、parseBroadcastVoiceConfig、toSpeechParams
3. **audioAsset 测试**：覆盖文件写入和清理逻辑
4. **ttsQueue 测试**：覆盖串行化、间隔、clear 逻辑
5. **media 切片测试**：覆盖长音频切片逻辑

### 可访问性层面

1. **模态框焦点陷阱**：ConfirmDialog 添加 `role="dialog"` 和 `aria-modal`
2. **按钮标签**：所有图标按钮添加 `aria-label`
3. **表单控件**：checkbox 和自定义控件添加 `aria-label`

---

> **审查结论**：项目整体代码质量良好，架构清晰，规范执行到位。主要风险集中在 SSE 路由错误处理缺失、API Key 暴露、以及部分测试覆盖不足。建议按优先级路线图逐步修复，优先处理 P0 级别的安全和崩溃风险问题。
