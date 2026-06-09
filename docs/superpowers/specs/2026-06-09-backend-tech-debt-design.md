# 后端技术债全面治理 — 设计文档

**日期：** 2026-06-09
**状态：** 已批准
**策略：** 按模块独立交付，混合策略（三波推进）

---

## 1. 问题概述

后端代码共 ~2022 行（10 个 src 文件），存在以下技术债：

| # | 问题 | 严重程度 | 位置 |
|---|------|---------|------|
| 1 | broadcast.js 过大（714行，15个端点） | 高 | routes/broadcast.js |
| 2 | mimo.js 职责过多（LLM + TTS + Key 测试） | 中 | services/mimo.js |
| 3 | ID 校验重复 8+ 次 | 中 | routes/*.js |
| 4 | 路由层直接操作 DB（无数据访问层） | 中 | routes/*.js |
| 5 | 文件清理逻辑重复 3 次 | 低 | routes/broadcast.js |
| 6 | global 变量（global.onScheduleTrigger） | 低 | services/scheduler.js |
| 7 | TLS 全局关闭 | 高 | services/aihot.js |
| 8 | broadcast.js 内联业务逻辑（resolveVoiceClone） | 中 | routes/broadcast.js |
| 9 | mimo.js 函数内 require（axios） | 低 | services/mimo.js |
| 10 | 测试覆盖不足（broadcast 7/15 端点，mimo 无功能测试） | 高 | tests/ |
| 11 | 不必要的依赖（OpenAI SDK 仅用于 testApiKey） | 低 | services/mimo.js |
| 12 | 音频清理逻辑应统一 | 低 | routes/broadcast.js |

## 2. 目标架构

重构完成后 `backend/src/` 目录结构：

```
backend/src/
├── app.js                      # 入口（路由挂载更新）
├── db/
│   ├── index.js                # 连接 + 迁移（不变）
│   └── schema.sql              # 完整 DDL（不变）
├── routes/                     # 路由层：HTTP 交互、参数校验
│   ├── broadcast.js            # 播报主路由（~250行，7个端点）
│   ├── segments.js             # Segment 子路由（~250行，8个端点）
│   ├── schedule.js             # 定时任务（不变）
│   ├── settings.js             # 设置（不变）
│   └── voicePresets.js         # 音色预设（不变）
├── services/
│   ├── aihot.js                # AI HOT API（TLS 修复）
│   ├── audio.js                # WAV 操作 + resolveVoiceClone
│   ├── mimo.js                 # LLM 服务（rewriteToScript, splitScript, testApiKey）
│   ├── tts.js                  # TTS 服务（generateSpeech，从 mimo.js 拆出）
│   ├── broadcastStore.js       # DAL：broadcast 表的 CRUD
│   ├── segmentStore.js         # DAL：segment 表的 CRUD
│   └── scheduler.js            # 定时任务（修复 global 变量）
├── utils/
│   └── validation.js           # 共享工具：validateId(), cleanAudioFile()
└── tests/
    ├── routes/
    │   ├── broadcast.test.js   # 扩充覆盖
    │   ├── segments.test.js    # 新增
    │   ├── schedule.test.js
    │   ├── settings.test.js
    │   └── voicePresets.test.js
    ├── services/
    │   ├── aihot.test.js
    │   ├── audio.test.js
    │   ├── mimo.test.js        # 扩充覆盖
    │   ├── tts.test.js         # 新增
    │   ├── broadcastStore.test.js  # 新增
    │   ├── segmentStore.test.js    # 新增
    │   └── scheduler.test.js
    └── utils/
        └── validation.test.js      # 新增
```

**变更量：** 10 个 src 文件 → 15 个 src 文件，每个文件职责更单一。

**API 契约：** 零变化。URL 路径、请求格式、响应格式全部保持不变，前端无需任何修改。

## 3. 实施方案：三波推进

### 第一波：小问题修复 + 共享工具 + mimo 拆分

这波改动零依赖、互不冲突，每个子模块可独立提交。

#### 3.1 共享工具：`src/utils/validation.js`

提取两个在路由层重复出现的公共函数。

**`validateId(idStr, label)`：**
- 接收原始字符串，返回 `{ valid: true, id }` 或 `{ valid: false, error }`
- 替换 broadcast.js 中 8+ 处 `parseInt + 正整数检查` 样板代码

**`cleanAudioFile(audioPath)`：**
- 接收以 `/audio/` 开头的相对路径，安全删除对应文件
- 文件不存在时静默跳过
- 替换 broadcast.js 中 3+ 处内联的文件删除逻辑

**同时导出 `audioDir`：** 音频目录路径，供路由层创建文件时使用。

#### 3.2 修复 3 个小问题

**TLS 全局关闭（aihot.js:5）：**
- 删除 `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'`
- 已有 `httpsAgent: new https.Agent({ rejectUnauthorized: false })` 配置在 axios 实例上，仅影响 aihot 请求，不影响全局

**global 变量（scheduler.js:14, 15, 51）：**
- `global.onScheduleTrigger` → 模块级 `let onTriggerCallback = null`
- `init(onTrigger)` 内赋值 `onTriggerCallback = onTrigger`
- `startJob()` 内调用 `onTriggerCallback(schedule)` 替代 `global.onScheduleTrigger(schedule)`

**函数内 require（mimo.js:105）：**
- `generateSpeech()` 内的 `const axios = require('axios')` 移到文件顶部
- 注意：该函数将在 3.3 拆到 tts.js，require 最终体现在 tts.js 顶部

#### 3.3 拆分 mimo.js → `mimo.js` + `tts.js`

**`services/mimo.js`（保留，~120 行）** — 纯 LLM 服务：
- `getApiKey(type)` — 获取 API Key（两个服务共用入口）
- `createClient()` — 创建 Anthropic 客户端
- `rewriteToScript({ items, opening, closing })` — 改写口播稿
- `splitScript(text)` — 切分口播稿
- `testApiKey(type)` — 测试 API Key（TTS 测试改用 axios 替代 OpenAI SDK）

**`services/tts.js`（新建，~70 行）** — 纯 TTS 服务：
- `generateSpeech({ text, voice, voiceType, voiceDesign, voiceClone, stylePrompt })`
- 从 mimo.js 原样搬入，axios require 移到文件顶部
- 通过 `const { getApiKey } = require('./mimo')` 复用 Key 管理

---

### 第二波：DAL 层 + broadcast.js 拆分

核心架构变更，改变路由层直接操作数据库的现状。

#### 4.1 DAL 层设计

**设计原则：**
- 每个 store 文件封装一张表的全部 SQL 操作
- 路由层通过 store 函数操作数据库，不再直接写 SQL
- store 函数接收/返回纯 JS 对象
- 遵循函数声明风格（非箭头函数），使用解构参数

**`services/broadcastStore.js`（新建，~120 行）：**

```js
// 查询
getById(id)                        // SELECT * FROM broadcasts WHERE id = ?
getHistory({ limit, offset })      // SELECT ... ORDER BY created_at DESC LIMIT/OFFSET
countAll()                         // SELECT COUNT(*)
countUnsaved()                     // SELECT COUNT(*) WHERE saved = 0
countSaved()                       // SELECT COUNT(*) WHERE saved = 1
getOldestUnsaved(n)                // SELECT ... WHERE saved = 0 ORDER BY created_at ASC LIMIT n
getOldestSaved(n)                  // SELECT ... WHERE saved = 1 ORDER BY created_at ASC LIMIT n

// 写入
create({ title, content, audioPath, voiceType, voiceConfig, sourceItems, status, mode })
updateAudioPath(id, audioPath)
updateVoiceConfig(id, { voiceType, voiceConfig })
toggleSaved(id)                    // 切换 saved 状态，返回 { newSaved, broadcast }

// 删除
deleteById(id)                     // DELETE + 返回旧记录（用于清理音频文件）
```

**`services/segmentStore.js`（新建，~100 行）：**

```js
// 查询
getByBroadcastId(broadcastId)              // ORDER BY "index"
getByIdAndBroadcastId(segId, broadcastId)
getPendingByBroadcastId(broadcastId)       // WHERE status IN ('pending', 'failed')

// 写入
createMany(broadcastId, texts)             // 事务批量插入
updateText(segId, text)                    // 编辑文本，重置 status='pending'
updateStatus(segId, status, audioPath?)    // 更新生成状态和音频路径
reorder(broadcastId, segmentIds)           // 事务重排序

// 删除
deleteById(segId)                          // DELETE 单条
deleteByBroadcastId(broadcastId)           // 清空某 broadcast 的所有 segments
deleteAndReindex(broadcastId, segId)       // 删除 + 后续重索引（含文件重命名）
```

#### 4.2 拆分 broadcast.js → `broadcast.js` + `segments.js`

**`routes/broadcast.js`（保留，~250 行，7 个端点）：**

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/today` | 获取今日资讯 |
| POST | `/rewrite` | 改写口播稿 |
| POST | `/generate` | 生成语音（整篇/分段模式） |
| GET | `/history` | 历史列表 |
| GET | `/:id` | 单条详情 |
| PATCH | `/:id/voice-config` | 更新音色配置 |
| POST | `/:id/save` | 保存/取消保存 |
| GET | `/:id/audio` | 获取音频 |

**`routes/segments.js`（新建，~250 行，8 个端点）：**

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/:id/split` | AI 切分 |
| GET | `/:id/segments` | 获取 segments |
| POST | `/:id/segments/batch-generate` | 批量生成 |
| POST | `/:id/segments/merge` | 合并音频 |
| POST | `/:id/segments/reorder` | 重排序 |
| PUT | `/:id/segments/:segId` | 编辑文本 |
| POST | `/:id/segments/:segId/regenerate` | 重新生成 |
| DELETE | `/:id/segments/:segId` | 删除 |

**app.js 路由挂载变更：**

```js
app.use('/api/broadcast', require('./routes/broadcast'));
app.use('/api/broadcast', require('./routes/segments'));
```

Express 支持同一前缀挂载多个 router，segment 路由路径不变。

#### 4.3 audio.js 扩展

将 `resolveVoiceClone()` 从 broadcast.js 移入 `services/audio.js`（音频领域逻辑）。

`cleanAudioFile()` 已放在 `utils/validation.js`（通用工具），不放入 audio.js。

---

### 第三波：测试补充

重构后每个模块都有清晰边界，补测试变得容易。

#### 5.1 新增测试文件

| 测试文件 | 覆盖目标 | 用例数 |
|---------|---------|-------|
| `tests/utils/validation.test.js` | validateId 边界值；cleanAudioFile 正常/文件不存在/空路径 | ~8 |
| `tests/services/tts.test.js` | generateSpeech 三种模式成功；429 错误；API 返回异常 | ~8 |
| `tests/services/broadcastStore.test.js` | CRUD 全路径：create、getById、getHistory 分页、toggleSaved、上限淘汰 | ~12 |
| `tests/services/segmentStore.test.js` | createMany 事务、updateStatus、deleteAndReindex 重排序、reorder | ~10 |
| `tests/routes/segments.test.js` | 8 个 segment 端点完整覆盖（成功 + 400 + 404） | ~20 |

#### 5.2 扩充已有测试

| 测试文件 | 当前覆盖 | 扩充目标 |
|---------|---------|---------|
| `tests/routes/broadcast.test.js` | 7/15 端点 | 补 POST /rewrite 成功、POST /generate 成功、POST /:id/save、PATCH /:id/voice-config、GET /:id/audio |
| `tests/services/mimo.test.js` | 函数存在性 | 补 rewriteToScript mock 成功、splitScript JSON 解析各情况、testApiKey 失败路径 |

#### 5.3 Mock 策略

- 外部 API（aihot、MiMo LLM、MiMo TTS）全部 jest.mock()
- 数据库使用真实 SQLite
- 路由测试用 supertest
- tts.test.js mock axios.post；mimo.test.js mock Anthropic SDK

## 5. 向后兼容性

- **API 契约零变化** — URL、请求格式、响应格式全部保持
- **数据库无变更** — 不新增表、列、索引
- **前端零改动** — 所有变更在后端内部

## 6. 风险与缓解

| 风险 | 缓解措施 |
|------|---------|
| DAL 返回格式与原来 db.prepare().get() 不一致 | store 函数原样返回 SQLite 行对象，不做转换 |
| broadcast.js 拆分后路由顺序影响匹配 | segments.js 的具体路径（如 `/:id/segments/...`）在 broadcast.js 的 `/:id` 之前注册 |
| 测试覆盖期间发现隐藏 bug | 第三波独立补测试，发现问题即时修复 |
| resolveVoiceClone 从路由移到服务后引用路径变化 | 使用相对路径从 services/audio.js 引用 audio/ 目录 |

## 7. Checklist

重构完成后对照以下清单验证：

- [ ] broadcast.js ≤ 300 行
- [ ] mimo.js ≤ 150 行
- [ ] 路由层不再直接调用 `db.prepare()`
- [ ] ID 校验零重复（全部使用 `validateId()`）
- [ ] 文件删除零重复（全部使用 `cleanAudioFile()`）
- [ ] 无 global 变量
- [ ] 无 `process.env.NODE_TLS_REJECT_UNAUTHORIZED`
- [ ] 无函数内 require
- [ ] 所有现有测试仍然通过
- [ ] 新增测试全部通过
- [ ] broadcast 端点测试覆盖 ≥ 12/15
- [ ] 前端功能无回归
