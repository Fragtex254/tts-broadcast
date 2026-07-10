# 后端开发规范

## 目录

1. [技术栈](#技术栈)
2. [项目结构](#项目结构)
3. [文件职责](#文件职责)
4. [命名规范](#命名规范)
5. [代码风格](#代码风格)
6. [开发规则（已迁移至 skill）](#开发规则已迁移至-skill)
7. [已解决技术债](#已解决技术债)

> **本文档只保留低频背景（技术栈/结构/职责/命名/代码风格/技术债）。**
> 高频开发规则（路由/服务/数据库/错误处理/参数校验/响应格式/测试）已迁移为按需加载的 skill，见下方「开发规则」索引。开发前请按根目录 `AGENTS.md` 的「任务 → skill 路由表」调用对应 skill。

---

## 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 框架 | Express 5 | Web 框架 |
| 数据库 | better-sqlite3 | 嵌入式 SQLite，同步 API |
| LLM | Anthropic SDK + Axios | Anthropic 兼容格式用 SDK，OpenAI 兼容格式用 Axios |
| TTS | Axios | 直接请求 MiMo TTS API |
| 定时任务 | node-cron | Cron 表达式调度 |
| 测试 | Jest + supertest | 单元测试 + HTTP 端点测试 |

**原则：不引入新依赖。** 如需新功能，优先用原生 Node.js API 实现。确需三方库时评估必要性。

---

## 项目结构

```
backend/src/
├── app.js                  # 入口：中间件 + 路由挂载 + 全局错误处理
├── db/
│   ├── index.js            # 连接初始化 + 增量迁移 + 默认数据
│   └── schema.sql          # 完整建表 DDL（保持最新）
├── routes/                 # 路由层：HTTP 交互、参数校验、响应格式化
│   ├── broadcast.js        # 播报主路由（CRUD、generate、rewrite）
│   ├── segments.js         # Segment 子路由（split、replace、batch-generate、merge、reorder）
│   ├── settings.js
│   ├── schedule.js
│   ├── transcribe.js       # ASR 上传转录（单文件 + 批量）
│   └── voicePresets.js
├── services/               # 服务层：外部 API 调用、业务逻辑、数据访问
│   ├── aihot.js            # AI HOT API 客户端
│   ├── audio.js            # WAV 文件操作 + resolveVoiceClone
│   ├── asr.js              # ASR provider 分发服务
│   ├── asrModels.js        # OpenAI-compatible ASR 模型列表候选 URL 生成与探测
│   ├── mossAsr.js          # MOSS OpenAI-compatible ASR 转录服务
│   ├── media.js            # 上传媒体转 ASR data URL
│   ├── mimo.js             # LLM 服务（双协议调用、rewriteToScript、splitScript、复杂标签优化、testApiKey、模型发现）
│   ├── llmQueue.js         # MiniMax-M3 LLM 全局 RPM/TPM 队列限速
│   ├── llmModels.js        # OpenAI-compatible 模型列表候选 URL 生成与探测
│   ├── mimoApiClient.js    # MiMo 标准 API HTTP client
│   ├── tts.js              # MiMo TTS 服务（generateSpeech）
│   ├── ttsQueue.js         # MiMo TTS 全局 RPM/TPM/payload/短突发队列限速
│   ├── rateLimitedQueue.js # 通用 RPM/TPM/payload/短突发队列实现
│   ├── rateLimitStore.js   # DAL：外部模型限速窗口与 backoff 账本
│   ├── generationJobStore.js # DAL：长生成任务 lease，避免重复入队
│   ├── broadcastStore.js   # DAL：broadcasts 表的 CRUD
│   ├── segmentStore.js     # DAL：segments 表的 CRUD，待生成查询包含 stale generating 恢复
│   ├── transcriptionResultStore.js # DAL：transcription_results 表的 CRUD 与删除
│   ├── scheduleStore.js    # DAL：schedules 表的 CRUD 与运行时间更新
│   └── scheduler.js        # 定时任务 cron 编排、业务校验与任务启停
└── utils/                  # 共享工具函数
    └── validation.js       # validateId, cleanAudioFile, audioDir
```

### 目录结构规则

- 顶层目录限于 `routes/`、`services/`、`db/`、`utils/`
- 单个路由文件超过 **300 行**时，按子资源拆分（参考 broadcast.js → segments.js 的拆分方式）
- 单个服务文件超过 **400 行**时，考虑按职责拆分（参考 mimo.js → mimo.js + tts.js）
- `utils/` 存放跨模块复用的纯工具函数（无外部依赖、无状态）
- `services/*Store.js` 为数据访问层（DAL），封装单张表的所有 SQL 操作

---

## 文件职责

| 文件类型 | 职责 | 不应包含 |
|---------|------|---------|
| `routes/*.js` | HTTP 请求/响应处理、参数校验、状态码 | 外部 API 调用、复杂业务逻辑、直接 SQL |
| `services/*.js` | 外部 API 封装、业务逻辑、数据处理 | 直接操作 `req`/`res`、HTTP 状态码 |
| `services/*Store.js` | 数据访问层（DAL），封装单张表的 CRUD | 业务逻辑、外部 API 调用 |
| `utils/*.js` | 跨模块复用的纯工具函数 | 外部依赖、状态、数据库操作 |
| `db/index.js` | 数据库连接、Schema 初始化、迁移 | 业务逻辑 |
| `app.js` | 中间件配置、路由挂载、全局错误处理 | 具体业务逻辑 |

**关键原则：路由层负责"翻译" HTTP ↔ 业务，服务层负责"干活"，DAL 层负责"存取数据"。**

---

## 命名规范

### 文件命名

| 类型 | 规则 | 示例 |
|------|------|------|
| 单词文件名 | 全小写 | `broadcast.js`, `settings.js` |
| 多词文件名 | camelCase | `voicePresets.js` |
| 数据库文件 | 全小写 | `index.js`, `schema.sql` |

### JS 变量/函数命名

| 类型 | 规则 | 示例 |
|------|------|------|
| 变量 | camelCase | `audioDir`, `unsavedCount`, `voiceConfig` |
| 函数 | camelCase | `rewriteToScript()`, `generateSpeech()`, `mergeWavFiles()` |
| 常量 | UPPER_SNAKE_CASE | `PORT`, `BASE_URL`, `WAV_HEADER_SIZE`, `DB_PATH` |

### 数据库命名

| 类型 | 规则 | 示例 |
|------|------|------|
| 表名 | snake_case | `broadcasts`, `voice_presets` |
| 列名 | snake_case | `audio_path`, `voice_type`, `created_at` |
| 索引 | `idx_表名_列名` | `idx_broadcasts_created_at` |

### API 路径命名

| 类型 | 规则 | 示例 |
|------|------|------|
| 资源路径 | kebab-case | `/api/voice-presets`, `/api/broadcast` |
| 动作端点 | POST + 动词 | `/api/broadcast/rewrite`, `/:id/save` |
| 子资源 | 嵌套路径 | `/:id/segments`, `/:id/segments/:segId` |

### 命名冲突处理

数据库返回 snake_case 属性（如 `voice_config`），JS 业务逻辑用 camelCase（如 `voiceConfig`）。**在数据库查询结果的使用处做转换**，不强制全局统一，但同一个函数内应保持一致。

---

## 代码风格

### 格式化

| 项目 | 规则 |
|------|------|
| 缩进 | **2 空格** |
| 引号 | **单引号** `'`（SQL 模板字符串用反引号） |
| 分号 | **必须使用**分号结尾 |
| 行宽 | 无硬性限制，建议 120 字符内换行 |

### 模块系统

- 使用 **CommonJS**（`require` / `module.exports`），不使用 ESM `import`
- 所有 `require` 放在**文件顶部**，按以下顺序排列：
  1. Node.js 标准库（`path`, `fs`, `https`）
  2. 第三方库（`express`, `axios`, `multer`）
  3. 本地服务（`../services/mimo`）
  4. 本地数据（`../db`）

```js
// ✅ 正确
const express = require('express');
const path = require('path');
const axios = require('axios');
const mimo = require('../services/mimo');
const db = require('../db');

// ❌ 避免：函数内部 require（除非有明确的延迟加载需求）
async function generateSpeech() {
  const axios = require('axios'); // 不推荐
}
```

### 模块导出

| 文件类型 | 导出方式 | 示例 |
|---------|---------|------|
| 路由文件 | 单一实例 | `module.exports = router;` |
| 服务文件 | 函数集合 | `module.exports = { fn1, fn2 };` |
| 数据库文件 | 单一实例 | `module.exports = db;` |

### 函数风格

| 场景 | 风格 | 示例 |
|------|------|------|
| 服务层导出函数 | `function` 声明 | `async function generateSpeech({ ... }) {}` |
| 模块内部工具函数 | `function` 声明 | `function cleanFile(filepath) {}` |
| 路由回调 | 箭头函数 | `router.get('/today', async (req, res) => {})` |

### 注释语言

- **所有注释使用中文**（行内注释、JSDoc、错误消息）
- 服务层导出函数使用 **JSDoc**（含 `@param`、`@returns`）
- 路由层使用**端点注释**（HTTP 方法 + 路径 + 功能描述）

```js
// ✅ 服务层 — JSDoc
/**
 * 将资讯改写成口播稿
 * @param {Object} params
 * @param {Array} params.items - 资讯列表
 * @param {string} params.opening - 开场白
 * @returns {Promise<string>} 口播稿
 */
async function rewriteToScript({ items, opening }) {}

// ✅ 路由层 — 端点注释
/**
 * POST /api/broadcast/rewrite
 * 将资讯列表改写成口播稿
 */
router.post('/rewrite', async (req, res) => {});
```

---

## 开发规则（已迁移至 skill）

以下高频开发规则已从本文档迁移为按需加载的 skill。开发前请按根目录 `AGENTS.md` 的「任务 → skill 路由表」调用对应 skill（`Skill` 工具），不要全量读规范文档。

| 原章节 | 现归属 skill |
|--------|------------|
| 路由规范（定义模式 / async 规则 / 挂载） | `backend-route` |
| 错误处理（统一模式 / 暴露规则 / 状态码 / 异步） | `backend-route` |
| 参数校验（ID / 必填 / 业务规则） | `backend-route` |
| 响应格式（成功 / 失败 / 规则） | `backend-route` |
| 服务层规范（职责边界 / 解构参数 / 禁全局变量 / 外部 API 隔离 / 音频一致性） | `backend-service` |
| 数据库规范（迁移 / 参数化 SQL / 事务 / 关键字转义 / DAL） | `backend-database` |
| 测试规范（目录镜像 / mock / 清表 / 进程生命周期） | `backend-testing` |
| 新增路由/服务/数据库/测试 Checklist | 各对应 skill 内 |

> skill 是 Claude Code 专属机制（`.claude/skills/`）。非 Claude agent 无法发现 skill，可直接查阅对应 skill 目录下的 `SKILL.md` 获取完整规则。

---

## 已解决技术债（2026-06-09）

以下技术债已全部修复，新代码应沿用修复后的模式：

| 原问题 | 解决方案 | 新模式 |
|--------|---------|--------|
| broadcast.js 714 行 | 拆分为 broadcast.js（267 行）+ segments.js（268 行） | segment 相关路由独立文件 |
| mimo.js LLM+TTS 混合 | 拆分为 mimo.js（LLM）+ tts.js（TTS） | TTS 独立服务，通过 `tts.generateSpeech()` 调用 |
| ID 校验重复 8+ 次 | 提取 `validateId()` 到 `utils/validation.js` | `const idCheck = validateId(req.params.id, '播报 ID')` |
| 路由层直接操作 DB | 引入 `broadcastStore.js` + `segmentStore.js` DAL 层 | 路由层通过 store 函数操作数据库 |
| 文件清理逻辑重复 | 提取 `cleanAudioFile()` 到 `utils/validation.js` | `cleanAudioFile(audioPath)` 安全删除 |
| global 变量 | 改为模块级 `let onTriggerCallback = null` | 模块级变量传递回调 |
| TLS 全局关闭 | 仅在 aihot axios 实例上设置 `rejectUnauthorized: false` | 按服务隔离 TLS 配置 |
| OpenAI SDK 依赖 | testApiKey 改用 axios 调用 TTS API | 统一使用 axios |
| 函数内 require | axios 移到 tts.js 顶部 | 所有 require 在文件顶部 |

### 新增架构模式

**DAL 层（数据访问层）：**
- `services/*Store.js` 封装单张表的所有 SQL 操作
- 路由层不直接调用 `db.prepare()`（settings 表除外）
- store 函数接收/返回纯 JS 对象，不依赖 `req`/`res`

**共享工具（utils/）：**
- `validateId(idStr, label)` — 返回 `{ valid, id }` 或 `{ valid, error }`
- `cleanAudioFile(audioPath)` — 安全删除，仅允许删除 audioDir 下的文件
- `audioDir` — 音频目录常量

**TTS 与 LLM 分离：**
- `services/mimo.js` — 纯 LLM（rewriteToScript, splitScript, testApiKey, getApiKey, fetchModelsForConfig）；Anthropic 兼容格式使用 SDK，OpenAI 兼容格式使用 Axios 调 `/chat/completions`
- `services/tts.js` — 纯 TTS（generateSpeech），复用 mimo.getApiKey

**LLM 设置与模型发现：**
- LLM 配置持久化在 `settings` 表：`llm_api_format`、`llm_base_url`、`llm_model`、`llm_rewrite_system_prompt`、`llm_split_system_prompt`、`llm_rewrite_thinking_enabled`、`llm_split_thinking_enabled`
- `POST /api/settings/llm-models` 只做 HTTP 翻译，实际候选 URL 生成和 OpenAI-compatible `/models` 探测放在 `services/llmModels.js`，并由 `services/mimo.js` re-export
- 模型发现测试必须 mock `axios.get`，不得依赖真实 provider 或真实 API Key
