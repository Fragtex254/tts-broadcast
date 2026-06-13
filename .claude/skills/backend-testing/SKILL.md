---
name: backend-testing
description: 写后端 Jest/supertest 测试时使用。涵盖测试目录镜像 src/、中文 describe 命名、路由 supertest 测试模板、服务 jest.mock 模板、beforeEach 清表、真实内存库不 mock、NODE_ENV=test 隔离、app.js 只导出不 listen、cron 测试 scheduler.shutdown、open handles 排查。触发场景：写测试、单测、补测试、mock 外部 API、supertest、测试隔离、open handles、test runInBand。
---

# 后端测试开发

## 何时用 / 不用

- **用**：在 `backend/tests/` 新增/修改任何测试。
- **不用**：写被测的业务代码本身（→ `backend-route` / `backend-service` / `backend-database`）。

## 核心铁则

1. 测试目录与 `src/` **严格镜像**；外部 API 调用（aihot、mimo）**必须 `jest.mock()`**，数据库用真实 SQLite 内存库不 mock。
2. 每个测试**独立运行**、不依赖顺序；每个 describe 用 `beforeEach` 清相关表。
3. 测试经 `NODE_ENV=test` 自动隔离数据库，**禁止把测试数据写入开发库**。
4. `app.js` 只导出 Express app，只有直接运行入口才 `listen()` + 初始化调度器；supertest 引入 app 不应留端口/cron 句柄。
5. 创建 cron 任务的测试必须在 `afterEach` 调 `scheduler.shutdown()` 并清表。
6. Jest 提示 open handles 时用 `--detectOpenHandles` 定位并修复，不靠强制退出掩盖。

## 模式与模板

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
- 数据库操作使用**真实 SQLite**（默认内存库），不用 mock
- 测试必须通过 `NODE_ENV=test` 自动隔离数据库，禁止把测试数据写入开发库
- 每个 describe 块有自己的 `beforeEach` 清理逻辑
- 测试数据通过 SQL INSERT 或 HTTP API 构造，不使用工厂函数

### 进程生命周期（来自健壮性规范）

- `backend/src/app.js` 只导出 Express app；只有直接运行入口时才 `listen()` 和初始化调度器，避免 supertest 引入 app 时留下端口和 cron 句柄。
- `backend/src/db/index.js` 在 `NODE_ENV=test` 时必须使用 SQLite 内存库；Jest 不得读写 `backend/data/broadcast.db`。
- 创建 cron 任务的测试必须在 `afterEach` 中调用 `scheduler.shutdown()` 并清理表数据。
- 后端改动至少运行 `npm test -- --runInBand`。
- 如果 Jest 提示 open handles，必须用 `--detectOpenHandles` 定位并修复，不能仅靠强制退出掩盖。

### 运行测试

```bash
cd backend
npm test                 # 运行所有测试
npm test -- --watch      # 监听模式
npm test -- --runInBand  # 串行运行（后端改动的最低要求）
```

## Checklist

新增测试时，逐项检查：

- [ ] **测试文件**：在 `tests/` 对应目录创建测试
- [ ] **独立运行**：`beforeEach` 清理相关表
- [ ] **外部 mock**：外部 API 调用使用 `jest.mock()`
- [ ] **覆盖场景**：成功路径 + 参数缺失 + 资源不存在
- [ ] **cron 清理**：cron 测试 `afterEach` 调 `scheduler.shutdown()`
- [ ] **无 open handles**：`--detectOpenHandles` 确认无残留句柄

## 相关 skill / 文档

- 被测路由/服务/DB → `backend-route` / `backend-service` / `backend-database`
- CI 门禁约束 → `CLAUDE.md` 的 CI/CD 章节
