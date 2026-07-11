---
name: backend-route
description: 新增或修改后端 Express 路由端点时使用。涵盖路由定义模式、路由挂载、async/await 规则、validateId 参数校验、必填参数校验、业务规则校验、try-catch 错误处理、HTTP 状态码（200/201/400/404/413/500）、响应格式包裹、通过 *Store DAL 操作数据库。触发场景：加接口、改路由、新端点、加 API、改 broadcast/segments/settings/schedule/voicePresets/transcribe/contentTemplates/publishPackage 路由、动作端点、CRUD 接口、状态码、错误响应。
---

# 后端路由开发

## 何时用 / 不用

- **用**：在 `backend/src/routes/*.js` 新增/修改任何路由端点时。
- **不用**：写外部 API 调用或业务逻辑（→ `backend-service`）；写 SQL/迁移（→ `backend-database`）；写测试（→ `backend-testing`）。

## 核心铁则

1. 路由层只做 HTTP 翻译：解析请求、参数校验、选状态码、返回 JSON。**不写 SQL（走 `*Store.js` DAL）、不调外部 API、不内联复杂文件处理。**
2. 每个接收 `:id` 的路由**必须**用 `validateId()`（来自 `utils/validation.js`）做正整数校验，失败返回 400。禁止内联 parseInt。
3. 有 `await` 的处理器**必须** try-catch 包裹；catch 里用 scoped logger：`logger.error({ err: error }, 'xxx失败')` + `res.status(500).json({ error: error.message || '中文消息' })`。
4. 成功响应用名词包裹（`{ broadcast }` / `{ items }`），失败用 `{ error: '中文' }`，操作确认用 `{ message }`。
5. 文件删除统一用 `cleanAudioFile()`，禁止拼接用户输入路径后直接 `unlinkSync`。

## 模式与模板

### 路由定义模式

```js
const express = require('express');
const router = express.Router();
const mimo = require('../services/mimo');
const db = require('../db');
const { createScopedLogger } = require('../services/logger');

const logger = createScopedLogger('example-route');

/**
 * GET /api/example/resource
 * 获取资源列表
 */
router.get('/resource', (req, res) => {
  try {
    const items = db.prepare('SELECT * FROM resources').all();
    res.json({ items });
  } catch (error) {
    logger.error({ err: error }, '获取资源列表失败');
    res.status(500).json({ error: '获取资源列表失败' });
  }
});

module.exports = router;
```

### 路由挂载（在 app.js 中）

```js
app.use('/api/broadcast', require('./routes/broadcast'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/schedules', require('./routes/schedule'));
app.use('/api/voice-presets', require('./routes/voicePresets'));
app.use('/api/content-templates', require('./routes/contentTemplates'));
app.use('/api/broadcast', require('./routes/publishPackage'));
```

### async/await 使用规则

| 场景 | 函数签名 | 原因 |
|------|---------|------|
| 涉及外部 API 调用 | `async (req, res) => {}` | 需要 await |
| 仅数据库操作 | `(req, res) => {}` | better-sqlite3 是同步 API |

### 路由层错误处理（统一模式）

日志规则读/用 `debug-logging`。路由 catch 块只负责记录结构化错误并返回 HTTP 错误响应，错误对象统一放入 `err` 字段。

```js
router.post('/action', async (req, res) => {
  try {
    // 业务逻辑
    const result = await service.doSomething();
    res.json({ result });
  } catch (error) {
    logger.error({ err: error }, '操作描述失败');
    res.status(500).json({ error: error.message || '操作描述失败' });
  }
});
```

### 错误信息暴露规则

| 环境 | 策略 |
|------|------|
| 400 参数错误 | 返回具体原因（`'请提供资讯列表'`） |
| 404 资源不存在 | 返回资源类型（`'播报记录不存在'`） |
| 500 服务器错误 | 返回 `error.message \|\| '通用错误消息'` |

### HTTP 状态码使用

| 状态码 | 场景 | 示例 |
|--------|------|------|
| 200 | 成功（默认） | `res.json({ ... })` |
| 201 | 创建成功 | 新增资源后 |
| 400 | 参数无效 / 业务校验失败 | 缺少必填参数、格式错误、超出上限 |
| 404 | 资源不存在 | ID 对应的记录不存在 |
| 413 | 上传或请求体过大 | 转录音视频超过上传上限 |
| 500 | 服务器内部错误 | catch 块中 |

### 异步错误处理

```js
// ✅ 涉及外部 API 的路由必须用 try-catch 包裹 await
router.post('/generate', async (req, res) => {
  try {
    const audio = await mimo.generateSpeech({ text, voice });
    res.json({ audio });
  } catch (error) {
    logger.error({ err: error, voice }, '生成语音失败');
    res.status(500).json({ error: error.message || '生成语音失败' });
  }
});
```

### ID 参数校验（必做）

每个接收 `:id` 参数的路由**必须**做正整数校验：

```js
const idCheck = validateId(req.params.id, '播报 ID');
if (!idCheck.valid) {
  return res.status(400).json({ error: idCheck.error });
}
const { id } = idCheck;
```

> 实际开发使用 `utils/validation.js` 的 `validateId(idStr, label)`，返回 `{ valid, id }` 或 `{ valid, error }`，不要内联 parseInt。

### 必填参数校验

```js
// 字符串必填
if (!text) {
  return res.status(400).json({ error: '请提供口播稿内容' });
}

// 数组必填
if (!items || !Array.isArray(items) || items.length === 0) {
  return res.status(400).json({ error: '请提供资讯列表' });
}

// 多字段必填
if (!name || !cron_expression) {
  return res.status(400).json({ error: '请提供任务名称和 cron 表达式' });
}
```

### 业务规则校验

```js
// 数量上限检查
const count = db.prepare('SELECT COUNT(*) as count FROM voice_presets').get().count;
if (count >= 20) {
  return res.status(400).json({ error: '预设数量已达上限（20个）' });
}
```

### 校验规则

- 手动 if 判断，不引入校验库
- 校验放在路由处理器的**最前面**，失败立即 `return`
- 错误消息使用**中文**，说明缺什么、怎么改

### 成功响应

```js
// 单资源 — 名词单数包裹
res.json({ broadcast });
res.json({ schedule });
res.json({ preset });

// 集合资源 — 名词复数包裹
res.json({ broadcasts, pagination: { page, limit, total } });
res.json({ schedules });
res.json({ presets });

// 操作确认
res.json({ message: '任务已删除' });
```

### 失败响应

```js
// 统一格式
res.status(400).json({ error: '错误消息' });
res.status(404).json({ error: '资源不存在' });
res.status(500).json({ error: '服务器内部错误' });
```

### 响应格式规则

- 成功数据用**名词**包裹（`{ broadcast }`, `{ items }`）
- 失败信息用 **`error`** 字段（不用 `message`）
- 操作确认用 **`message`** 字段
- 分页数据附带 `pagination: { page, limit, total }`

## Checklist

新增一个路由端点时，逐项检查：

- [ ] **JSDoc 注释**：HTTP 方法 + 路径 + 功能描述
- [ ] **ID 校验**：使用 `validateId()`（来自 `utils/validation.js`），不使用内联 parseInt
- [ ] **参数校验**：必填参数检查，失败返回 400
- [ ] **try-catch**：包裹整个处理器（尤其是有 await 的）
- [ ] **错误响应**：`{ error: '中文消息' }` 格式
- [ ] **成功响应**：名词包裹（`{ item }` 或 `{ items }`）
- [ ] **状态码**：200/201/400/404/500 使用正确
- [ ] **数据库操作**：通过 DAL（`*Store.js`）操作，不直接 `db.prepare()`
- [ ] **文件删除**：使用 `cleanAudioFile()`（来自 `utils/validation.js`）

## 相关 skill / 文档

- 数据库/DAL 操作 → `backend-database`
- 外部 API/业务逻辑 → `backend-service`
- 测试 → `backend-testing`
- 调试日志 / 替换 console.* → `debug-logging`
- 命名规范与代码风格 → `backend/BACKEND_CONVENTIONS.md`
