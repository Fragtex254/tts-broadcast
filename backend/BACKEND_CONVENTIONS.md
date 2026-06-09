# 后端开发规范

## 目录

1. [技术栈](#技术栈)
2. [项目结构](#项目结构)
3. [文件职责](#文件职责)
4. [命名规范](#命名规范)
5. [代码风格](#代码风格)
6. [路由规范](#路由规范)
7. [服务层规范](#服务层规范)
8. [数据库规范](#数据库规范)
9. [错误处理](#错误处理)
10. [参数校验](#参数校验)
11. [响应格式](#响应格式)
12. [测试规范](#测试规范)
13. [已知技术债](#已知技术债)
14. [新增路由/服务 Checklist](#新增路由服务-checklist)

---

## 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 框架 | Express 5 | Web 框架 |
| 数据库 | better-sqlite3 | 嵌入式 SQLite，同步 API |
| LLM | Anthropic SDK | 通过自定义 baseURL 调用 MiMo LLM |
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
│   ├── segments.js         # Segment 子路由（split、batch-generate、merge、reorder）
│   ├── settings.js
│   ├── schedule.js
│   └── voicePresets.js
├── services/               # 服务层：外部 API 调用、业务逻辑、数据访问
│   ├── aihot.js            # AI HOT API 客户端
│   ├── audio.js            # WAV 文件操作 + resolveVoiceClone
│   ├── mimo.js             # MiMo LLM 服务（rewriteToScript, splitScript, testApiKey）
│   ├── tts.js              # MiMo TTS 服务（generateSpeech）
│   ├── broadcastStore.js   # DAL：broadcasts 表的 CRUD
│   ├── segmentStore.js     # DAL：segments 表的 CRUD
│   └── scheduler.js        # 定时任务调度
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

## 路由规范

### 路由定义模式

```js
const express = require('express');
const router = express.Router();
const mimo = require('../services/mimo');
const db = require('../db');

/**
 * GET /api/example/resource
 * 获取资源列表
 */
router.get('/resource', (req, res) => {
  try {
    const items = db.prepare('SELECT * FROM resources').all();
    res.json({ items });
  } catch (error) {
    console.error('获取资源列表失败:', error);
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
```

### async/await 使用规则

| 场景 | 函数签名 | 原因 |
|------|---------|------|
| 涉及外部 API 调用 | `async (req, res) => {}` | 需要 await |
| 仅数据库操作 | `(req, res) => {}` | better-sqlite3 是同步 API |

---

## 服务层规范

### 服务职责边界

| 服务 | 职责 | 依赖 |
|------|------|------|
| `aihot.js` | AI HOT API 数据抓取 | axios |
| `audio.js` | WAV 文件操作、resolveVoiceClone | fs, path |
| `mimo.js` | MiMo LLM 调用、API Key 管理、Key 测试 | @anthropic-ai/sdk, axios |
| `tts.js` | MiMo TTS 语音合成 | axios, mimo (getApiKey) |
| `broadcastStore.js` | broadcasts 表数据访问层（DAL） | db |
| `segmentStore.js` | segments 表数据访问层（DAL） | db, fs, path |
| `scheduler.js` | 定时任务 CRUD + cron 管理 | node-cron, db |

### 服务函数签名模式

```js
// ✅ 使用解构参数，便于扩展
async function generateSpeech({ text, voice, voiceType, voiceDesign, voiceClone }) {}

// ❌ 避免位置参数
async function generateSpeech(text, voice, voiceType) {}
```

### 不要使用全局变量传递依赖

```js
// ❌ 避免
global.onScheduleTrigger = callback;

// ✅ 使用模块级变量
let onTriggerCallback = null;
function init(callback) {
  onTriggerCallback = callback;
}
```

---

## 数据库规范

### 连接与初始化

- 使用 better-sqlite3 同步 API
- 数据库文件位于 `backend/data/broadcast.db`（已 gitignore）
- Schema 定义维护在 `db/schema.sql`，保持**最新完整定义**

### 迁移模式

SQLite 不支持 `ALTER TABLE ADD COLUMN IF NOT EXISTS`，使用 try-catch 模式：

```js
// 放在 db/index.js 中，紧跟 schema 初始化之后
try {
  db.prepare('SELECT new_column FROM table_name LIMIT 1').get();
} catch {
  db.exec('ALTER TABLE table_name ADD COLUMN new_column TYPE DEFAULT value');
}
```

**迁移规则：**
- 新增列必须有 `DEFAULT` 值，确保旧数据兼容
- `schema.sql` 保持最新完整定义，迁移代码仅处理增量
- 迁移代码放在 `db/index.js` 中，紧跟 schema 初始化之后

### SQL 编写规范

```js
// ✅ 参数化绑定，防止 SQL 注入
db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(id);

// ✅ 多行 SQL 使用模板字符串
db.prepare(`
  INSERT INTO broadcasts (title, content, voice_type, voice_config, status, mode)
  VALUES (?, ?, ?, ?, ?, ?)
`).run(title, content, voiceType, voiceConfig, status, mode);

// ✅ IN 子句使用占位符数组
db.prepare(`SELECT * FROM segments WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);

// ❌ 绝对禁止字符串拼接 SQL
db.prepare(`SELECT * FROM broadcasts WHERE id = ${id}`); // SQL 注入风险！
```

### 事务使用

```js
const insertMany = db.transaction((items) => {
  for (const item of items) {
    insertStmt.run(item.value);
  }
});
insertMany(items);
```

### SQL 关键字处理

`segments` 表的 `index` 列是 SQL 保留字，必须用双引号转义：

```sql
SELECT * FROM segments WHERE broadcast_id = ? ORDER BY "index"
```

---

## 错误处理

### 路由层错误处理（统一模式）

```js
router.post('/action', async (req, res) => {
  try {
    // 业务逻辑
    const result = await service.doSomething();
    res.json({ result });
  } catch (error) {
    console.error('操作描述失败:', error);
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
| 500 | 服务器内部错误 | catch 块中 |

### 异步错误处理

```js
// ✅ 涉及外部 API 的路由必须用 try-catch 包裹 await
router.post('/generate', async (req, res) => {
  try {
    const audio = await mimo.generateSpeech({ text, voice });
    res.json({ audio });
  } catch (error) {
    console.error('生成语音失败:', error);
    res.status(500).json({ error: error.message || '生成语音失败' });
  }
});
```

---

## 参数校验

### ID 参数校验（必做）

每个接收 `:id` 参数的路由**必须**做正整数校验：

```js
const id = parseInt(req.params.id, 10);
if (!Number.isInteger(id) || id <= 0) {
  return res.status(400).json({ error: '无效的播报 ID' });
}
```

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

---

## 响应格式

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

---

## 测试规范

### 文件组织

测试目录与 `src/` **严格镜像**：

```
backend/tests/
├── routes/
│   ├── broadcast.test.js      ← src/routes/broadcast.js
│   ├── settings.test.js
│   ├── schedule.test.js
│   └── voicePresets.test.js
└── services/
    ├── aihot.test.js
    ├── audio.test.js
    ├── mimo.test.js
    └── scheduler.test.js
```

### 测试命名

```js
// ✅ 使用中文 describe + 嵌套分组
describe('播报 API', () => {
  describe('GET /api/broadcast/today', () => {
    test('成功返回今日资讯列表', async () => { ... });
    test('无数据时返回空数组', async () => { ... });
  });
  describe('POST /api/broadcast/rewrite', () => {
    test('缺少 items 参数返回 400', async () => { ... });
  });
});
```

### 路由测试模式

```js
const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/db');

describe('示例 API', () => {
  // 测试前清空相关表
  beforeEach(() => {
    db.prepare('DELETE FROM examples').run();
  });

  test('GET /api/examples - 返回空列表', async () => {
    const res = await request(app).get('/api/examples');
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });
});
```

### 数据库清理策略（统一）

```js
// ✅ 统一使用 beforeEach 清空相关表
beforeEach(() => {
  db.prepare('DELETE FROM broadcasts').run();
  db.prepare('DELETE FROM segments').run();
});

// ❌ 避免：test 间顺序依赖
// ❌ 避免：afterEach 恢复原始数据的复杂模式
```

### 服务测试模式

```js
// ✅ 外部 API 使用 jest.mock()
jest.mock('../../src/services/mimo', () => ({
  generateSpeech: jest.fn().mockResolvedValue(Buffer.from('fake-audio-data')),
}));

// ✅ 文件操作使用临时目录
const os = require('os');
const fs = require('fs');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
```

### 测试规则

- 每个测试用例**独立运行**，不依赖其他测试的执行顺序
- 外部 API 调用**必须 mock**（aihot、mimo）
- 数据库操作使用**真实 SQLite**（内存或临时文件），不用 mock
- 每个 describe 块有自己的 `beforeEach` 清理逻辑
- 测试数据通过 SQL INSERT 或 HTTP API 构造，不使用工厂函数

### 运行测试

```bash
cd backend
npm test                 # 运行所有测试
npm test -- --watch      # 监听模式
```

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
- `services/mimo.js` — 纯 LLM（rewriteToScript, splitScript, testApiKey, getApiKey）
- `services/tts.js` — 纯 TTS（generateSpeech），复用 mimo.getApiKey

---

## 新增路由/服务 Checklist

新增一个路由端点或服务函数时，逐项检查：

### 路由端点

- [ ] **JSDoc 注释**：HTTP 方法 + 路径 + 功能描述
- [ ] **ID 校验**：使用 `validateId()`（来自 `utils/validation.js`），不使用内联 parseInt
- [ ] **参数校验**：必填参数检查，失败返回 400
- [ ] **try-catch**：包裹整个处理器（尤其是有 await 的）
- [ ] **错误响应**：`{ error: '中文消息' }` 格式
- [ ] **成功响应**：名词包裹（`{ item }` 或 `{ items }`）
- [ ] **状态码**：200/201/400/404/500 使用正确
- [ ] **数据库操作**：通过 DAL（`*Store.js`）操作，不直接 `db.prepare()`
- [ ] **文件删除**：使用 `cleanAudioFile()`（来自 `utils/validation.js`）

### 服务函数

- [ ] **JSDoc 注释**：`@param` 解构参数 + `@returns`
- [ ] **解构参数**：`function doSomething({ arg1, arg2 }) {}`
- [ ] **错误抛出**：`throw new Error('中文错误消息')`
- [ ] **导出**：添加到 `module.exports = { ... }`

### 数据库

- [ ] **schema.sql**：更新完整表定义
- [ ] **迁移代码**：`db/index.js` 中添加 ALTER TABLE 迁移
- [ ] **参数化 SQL**：使用 `?` 占位符，禁止字符串拼接
- [ ] **DEFAULT 值**：新增列必须有默认值

### 测试

- [ ] **测试文件**：在 `tests/` 对应目录创建测试
- [ ] **独立运行**：`beforeEach` 清理相关表
- [ ] **外部 mock**：外部 API 调用使用 `jest.mock()`
- [ ] **覆盖场景**：成功路径 + 参数缺失 + 资源不存在
