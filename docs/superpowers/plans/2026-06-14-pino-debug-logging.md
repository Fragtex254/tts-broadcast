# Pino Debug Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Pino-based backend/frontend debug logging system with backend JSONL files, frontend copyable console logs, and a project skill that tells agents how to use the logs.

**Architecture:** Backend code imports a scoped Pino wrapper from `backend/src/services/logger.js`; it writes JSONL logs to console and `backend/logs/app-YYYY-MM-DD.log`, while test mode avoids real log files by default. Frontend code imports a scoped Pino browser wrapper from `frontend/src/services/logger.ts`; it logs only to browser console with matching `scope`, `msg`, `err`, and metadata conventions. Project docs expose `.claude/skills/debug-logging/SKILL.md` so future agents know how to add logs and inspect backend/frontend output.

**Tech Stack:** Node.js CommonJS, Express 5, Jest, React 19, TypeScript, Vite, Vitest, Pino.

---

## File Structure

- Create `backend/src/services/logger.js`: backend Pino wrapper and scoped logger factory.
- Create `backend/tests/services/logger.test.js`: Jest tests for backend logger behavior.
- Modify `backend/package.json` and `backend/package-lock.json`: add `pino`.
- Modify `backend/src/app.js`, `backend/src/routes/*.js`, `backend/src/services/*.js`: replace source `console.*` with scoped logger calls.
- Create `frontend/src/services/logger.ts`: browser Pino wrapper and scoped logger factory.
- Create `frontend/src/services/logger.test.ts`: Vitest tests for frontend logger behavior.
- Modify `frontend/package.json` and `frontend/package-lock.json`: add `pino`.
- Modify `frontend/src/services/api.ts`, `frontend/src/services/sseClient.ts`, `frontend/src/services/schemas.ts`, `frontend/src/store/*Slice.ts`, `frontend/src/components/ErrorBoundary.tsx`, and current page/component `console.*` call sites.
- Modify `.gitignore`: explicitly ignore `backend/logs/`.
- Create `.claude/skills/debug-logging/SKILL.md`: logging workflow for future agents.
- Modify `AGENTS.md`: add logging/debugging skill route.
- Modify `.claude/skills/convention-skills/SKILL.md`: register `debug-logging`.

---

### Task 1: Add Pino Dependencies And Ignore Backend Logs

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Modify: `.gitignore`

- [ ] **Step 1: Install backend dependency**

Run:

```bash
cd backend && npm install pino
```

Expected: `backend/package.json` and `backend/package-lock.json` include `pino`.

- [ ] **Step 2: Install frontend dependency**

Run:

```bash
cd frontend && npm install pino
```

Expected: `frontend/package.json` and `frontend/package-lock.json` include `pino`.

- [ ] **Step 3: Explicitly ignore backend logs**

Edit `.gitignore` under `# Database and Audio`:

```gitignore
# Database and Audio
backend/data/
backend/audio/*.wav
backend/logs/
.superpowers/
.workbuddy/
```

- [ ] **Step 4: Verify dependency metadata changed only as expected**

Run:

```bash
git diff -- backend/package.json frontend/package.json .gitignore
```

Expected: both package manifests add `pino`; `.gitignore` adds `backend/logs/`.

- [ ] **Step 5: Commit**

```bash
git add backend/package.json backend/package-lock.json frontend/package.json frontend/package-lock.json .gitignore
git commit -m "chore: add pino logging dependency"
```

---

### Task 2: Backend Logger TDD

**Files:**
- Create: `backend/tests/services/logger.test.js`
- Create: `backend/src/services/logger.js`

- [ ] **Step 1: Write the failing backend logger test**

Create `backend/tests/services/logger.test.js`:

```js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Writable } = require('stream');

function createMemoryStream() {
  const chunks = [];
  const stream = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  return {
    stream,
    lines: () => chunks.join('').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)),
  };
}

describe('logger 服务', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, NODE_ENV: 'test' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('createScopedLogger 写入 scope、ISO 时间和消息', () => {
    const { createScopedLogger } = require('../../src/services/logger');
    const memory = createMemoryStream();
    const now = () => new Date('2026-06-14T09:52:01.123Z');
    const logger = createScopedLogger('scheduler', { stream: memory.stream, now });

    logger.info({ count: 2 }, '已加载定时任务');

    const [line] = memory.lines();
    expect(line).toMatchObject({
      level: 30,
      time: '2026-06-14T09:52:01.123Z',
      scope: 'scheduler',
      msg: '已加载定时任务',
      count: 2,
    });
  });

  test('error 日志保留 err.message 和 err.stack', () => {
    const { createScopedLogger } = require('../../src/services/logger');
    const memory = createMemoryStream();
    const logger = createScopedLogger('broadcast-route', { stream: memory.stream });
    const error = new Error('生成失败');

    logger.error({ err: error, broadcastId: 12 }, '生成语音失败');

    const [line] = memory.lines();
    expect(line.scope).toBe('broadcast-route');
    expect(line.broadcastId).toBe(12);
    expect(line.err.message).toBe('生成失败');
    expect(line.err.stack).toContain('生成失败');
  });

  test('NODE_ENV=test 默认不创建真实 backend/logs 目录', () => {
    const { createScopedLogger, DEFAULT_LOG_DIR } = require('../../src/services/logger');
    fs.rmSync(DEFAULT_LOG_DIR, { recursive: true, force: true });

    const logger = createScopedLogger('test-scope');
    logger.info('测试日志');

    expect(fs.existsSync(DEFAULT_LOG_DIR)).toBe(false);
  });

  test('传入 logDir 和 writeFiles 时写入当天 JSONL 文件', () => {
    const { createScopedLogger, getLogFilePath } = require('../../src/services/logger');
    const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-logs-'));
    const now = () => new Date('2026-06-14T09:52:01.123Z');

    const logger = createScopedLogger('sse-manager', {
      logDir,
      now,
      writeFiles: true,
      includeConsole: false,
    });

    logger.warn({ hasTaskId: true, taskIdLength: 6 }, 'SSE 推送失败');

    const logFile = getLogFilePath({ logDir, now });
    const [line] = fs.readFileSync(logFile, 'utf8').trim().split('\n').map(item => JSON.parse(item));
    expect(line).toMatchObject({
      level: 40,
      time: '2026-06-14T09:52:01.123Z',
      scope: 'sse-manager',
      msg: 'SSE 推送失败',
      hasTaskId: true,
      taskIdLength: 6,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
cd backend && npm test -- tests/services/logger.test.js --runInBand
```

Expected: FAIL with `Cannot find module '../../src/services/logger'`.

- [ ] **Step 3: Implement the backend logger**

Create `backend/src/services/logger.js`:

```js
const fs = require('fs');
const path = require('path');
const pino = require('pino');

const DEFAULT_LOG_DIR = path.join(__dirname, '../../logs');

function getNow(options) {
  return options && options.now ? options.now : () => new Date();
}

function getLogFilePath({ logDir = process.env.LOG_DIR || DEFAULT_LOG_DIR, now = () => new Date() } = {}) {
  const date = now().toISOString().slice(0, 10);
  return path.join(logDir, `app-${date}.log`);
}

function shouldWriteFiles(options) {
  if (typeof options.writeFiles === 'boolean') {
    return options.writeFiles;
  }
  return process.env.NODE_ENV !== 'test';
}

function createFileDestination({ logDir, now }) {
  fs.mkdirSync(logDir, { recursive: true });
  return pino.destination({ dest: getLogFilePath({ logDir, now }), sync: true });
}

function createDestination(options) {
  const streams = [];
  const includeConsole = options.includeConsole !== false;
  const logDir = options.logDir || process.env.LOG_DIR || DEFAULT_LOG_DIR;
  const now = getNow(options);

  if (options.stream) {
    streams.push({ stream: options.stream });
  } else if (includeConsole) {
    streams.push({ stream: process.stdout });
  }

  if (shouldWriteFiles(options)) {
    streams.push({ stream: createFileDestination({ logDir, now }) });
  }

  if (streams.length === 0) {
    return pino.destination({ dest: '/dev/null', sync: true });
  }

  if (streams.length === 1) {
    return streams[0].stream;
  }

  return pino.multistream(streams);
}

function createRootLogger(options = {}) {
  const now = getNow(options);
  return pino(
    {
      level: options.level || process.env.LOG_LEVEL || 'info',
      base: null,
      timestamp: () => `,"time":"${now().toISOString()}"`,
    },
    createDestination(options)
  );
}

const rootLogger = createRootLogger();

function createScopedLogger(scope, options) {
  const parent = options ? createRootLogger(options) : rootLogger;
  return parent.child({ scope });
}

module.exports = {
  DEFAULT_LOG_DIR,
  createRootLogger,
  createScopedLogger,
  getLogFilePath,
};
```

- [ ] **Step 4: Run the backend logger test to verify GREEN**

Run:

```bash
cd backend && npm test -- tests/services/logger.test.js --runInBand
```

Expected: PASS for `logger 服务`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/logger.js backend/tests/services/logger.test.js
git commit -m "feat: add backend pino logger"
```

---

### Task 3: Frontend Logger TDD

**Files:**
- Create: `frontend/src/services/logger.test.ts`
- Create: `frontend/src/services/logger.ts`

- [ ] **Step 1: Write the failing frontend logger test**

Create `frontend/src/services/logger.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

describe('frontend logger', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('createScopedLogger 输出 scope 和消息到 console', async () => {
    const { createScopedLogger } = await import('./logger');
    const logger = createScopedLogger('api');

    logger.info({ status: 200 }, '请求成功');

    expect(console.info).toHaveBeenCalled();
    const call = vi.mocked(console.info).mock.calls[0];
    expect(JSON.stringify(call)).toContain('api');
    expect(JSON.stringify(call)).toContain('请求成功');
    expect(JSON.stringify(call)).toContain('200');
  });

  test('error 日志可以携带错误对象', async () => {
    const { createScopedLogger } = await import('./logger');
    const logger = createScopedLogger('sse-client');

    logger.error({ err: new Error('连接失败'), hasTaskId: true, taskIdLength: 6 }, 'SSE 连接错误');

    expect(console.error).toHaveBeenCalled();
    const call = vi.mocked(console.error).mock.calls[0];
    expect(JSON.stringify(call)).toContain('sse-client');
    expect(JSON.stringify(call)).toContain('SSE 连接错误');
    expect(JSON.stringify(call)).toContain('taskIdLength');
  });

  test('前端 logger 不写入浏览器存储', async () => {
    const { createScopedLogger } = await import('./logger');
    const logger = createScopedLogger('settings-slice');

    logger.warn({ field: 'llm_model' }, '设置保存失败');

    expect(window.localStorage.setItem).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
cd frontend && npm run test -- src/services/logger.test.ts
```

Expected: FAIL with `Failed to resolve import "./logger"`.

- [ ] **Step 3: Implement the frontend logger**

Create `frontend/src/services/logger.ts`:

```ts
import pino, { type Logger } from 'pino/browser';

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';

const DEFAULT_LOG_LEVEL: LogLevel = (import.meta.env.VITE_LOG_LEVEL as LogLevel | undefined) ?? 'info';

const rootLogger = pino({
  level: DEFAULT_LOG_LEVEL,
  browser: {
    asObject: true,
    serialize: true,
  },
  base: undefined,
  timestamp: () => `,"time":"${new Date().toISOString()}"`,
});

export function createScopedLogger(scope: string): Logger {
  return rootLogger.child({ scope });
}
```

- [ ] **Step 4: Run the frontend logger test to verify GREEN**

Run:

```bash
cd frontend && npm run test -- src/services/logger.test.ts
```

Expected: PASS for `frontend logger`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/logger.ts frontend/src/services/logger.test.ts
git commit -m "feat: add frontend pino logger"
```

---

### Task 4: Expose Logging Workflow To Agents

**Files:**
- Create: `.claude/skills/debug-logging/SKILL.md`
- Modify: `AGENTS.md`
- Modify: `.claude/skills/convention-skills/SKILL.md`

- [ ] **Step 1: Create the logging skill**

Create `.claude/skills/debug-logging/SKILL.md`:

```md
---
name: debug-logging
description: 新增、替换、查询或审查项目日志时使用。涵盖后端 Pino JSONL 文件日志、前端 Pino browser 控制台日志、scope/level/message/meta/err 约定、替换 console.*、agent 如何 tail/rg 后端日志，以及如何要求用户复制前端控制台输出。触发场景：log、logger、日志、调试日志、console.log、console.error、查看后端日志、前端控制台输出、排查失败。
---

# 调试日志规范

## 何时用

- 新增日志。
- 替换 `console.log`、`console.warn`、`console.error`。
- 排查后端失败并需要查 `backend/logs/`。
- 排查前端失败并需要用户提供浏览器控制台输出。
- 决定日志的 `scope`、`level`、消息和 metadata。

## 核心规则

1. 日志是给开发者和 agent 的调试抓手，不改变业务行为。
2. 后端日志使用 `backend/src/services/logger.js`，前端日志使用 `frontend/src/services/logger.ts`。
3. `scope` 使用稳定 kebab-case，例如 `broadcast-route`、`scheduler`、`sse-manager`、`api-client`、`settings-slice`。
4. 使用 Pino object-first 风格记录 metadata。
5. 捕获到的错误统一放在 `err` 字段：`logger.error({ err: error }, '操作失败')`。
6. 日志消息使用当前文件既有语言；本项目后端注释和用户可见错误多为中文，日志也优先中文。
7. 前端日志只输出到浏览器控制台，不写文件、不写 localStorage/IndexedDB、不上传远端。

## 后端用法

```js
const { createScopedLogger } = require('../services/logger');

const logger = createScopedLogger('scheduler');

logger.info({ count: schedules.length }, '已加载定时任务');
logger.warn({ cronExpression: schedule.cron_expression }, '无效的 cron 表达式');
logger.error({ err: error, scheduleName: schedule.name }, '定时任务执行失败');
```

## 前端用法

```ts
import { createScopedLogger } from './logger';

const logger = createScopedLogger('api-client');

logger.info({ hasTaskId: Boolean(taskId), taskIdLength: taskId?.length ?? 0 }, 'SSE 连接成功');
logger.warn({ validationError }, 'Schema validation failed');
logger.error({ err: error, status }, 'API 请求失败');
```

## Agent 查询后端日志

```bash
ls -t backend/logs/app-*.log | head -1
tail -n 120 backend/logs/app-$(date +%F).log
rg '"scope":"scheduler"|定时任务执行失败' backend/logs
rg '"level":50|"level":40' backend/logs
```

## Agent 排查前端日志

前端不落文件。需要用户复制浏览器控制台输出时，直接说明需要包含报错附近的结构化日志对象，尤其是 `scope`、`msg`、`err` 和相关 metadata。

## Checklist

- [ ] 使用 `createScopedLogger()`，不新增裸 `console.*`
- [ ] `scope` 稳定且可搜索
- [ ] 错误对象放入 `{ err: error }`
- [ ] metadata 不包含 API Key、完整 token、完整 taskId 或大体积 base64/audio 内容
- [ ] 后端日志可通过 `backend/logs/app-YYYY-MM-DD.log` 查询
- [ ] 前端日志只在浏览器控制台输出
```

- [ ] **Step 2: Update AGENTS routing**

In `AGENTS.md`, add this row to the Skill Routing table after `写后端测试`:

```md
| 新增/替换/查询调试日志 | `.claude/skills/debug-logging/SKILL.md` |
```

- [ ] **Step 3: Update convention skill registry**

In `.claude/skills/convention-skills/SKILL.md`, add this registry row after `backend-testing`:

```md
| debug-logging | 前后端调试日志 | Pino debug logging spec | 2026-06-14 | ✅ |
```

- [ ] **Step 4: Verify docs mention the new skill**

Run:

```bash
rg -n "debug-logging|调试日志" AGENTS.md .claude/skills
```

Expected: matches in `AGENTS.md`, `.claude/skills/debug-logging/SKILL.md`, and `.claude/skills/convention-skills/SKILL.md`.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md .claude/skills/convention-skills/SKILL.md .claude/skills/debug-logging/SKILL.md
git commit -m "docs: add debug logging skill"
```

---

### Task 5: Replace Backend Console Calls

**Files:**
- Modify: `backend/src/app.js`
- Modify: `backend/src/services/scheduler.js`
- Modify: `backend/src/services/sseManager.js`
- Modify: `backend/src/services/mimo.js`
- Modify: `backend/src/routes/broadcast.js`
- Modify: `backend/src/routes/segments.js`
- Modify: `backend/src/routes/settings.js`
- Modify: `backend/src/routes/schedule.js`
- Modify: `backend/src/routes/transcribe.js`
- Modify: `backend/src/routes/voicePresets.js`

- [ ] **Step 1: Replace app logger**

At the top of `backend/src/app.js`, add:

```js
const { createScopedLogger } = require('./services/logger');
```

After constants, add:

```js
const logger = createScopedLogger('app');
```

Replace current console calls:

```js
logger.warn({ method: req.method, url: req.originalUrl }, '请求体过大');
logger.error({ err }, '服务器内部错误');
logger.info({ port: PORT }, `服务器运行在 http://localhost:${PORT}`);
```

- [ ] **Step 2: Replace scheduler logger**

At the top of `backend/src/services/scheduler.js`, add:

```js
const { createScopedLogger } = require('./logger');
```

After module state, add:

```js
const logger = createScopedLogger('scheduler');
```

Replace current console calls:

```js
logger.info({ count: schedules.length }, '已加载定时任务');
logger.info('调度器已关闭');
logger.warn({ cronExpression: schedule.cron_expression }, '无效的 cron 表达式');
logger.info({ scheduleId: schedule.id, scheduleName: schedule.name }, '执行定时任务');
logger.error({ err: error, scheduleId: schedule.id, scheduleName: schedule.name }, '定时任务执行失败');
```

- [ ] **Step 3: Replace remaining service loggers**

Use these scope/import mappings:

```js
// backend/src/services/sseManager.js
const { createScopedLogger } = require('./logger');
const logger = createScopedLogger('sse-manager');
logger.error({ err: error }, 'SSE 推送失败');

// backend/src/services/mimo.js
const { createScopedLogger } = require('./logger');
const logger = createScopedLogger('mimo-service');
logger.error({ err: error }, '测试 API Key 失败');
```

- [ ] **Step 4: Replace route loggers**

Use these scope/import mappings:

```js
// In backend/src/routes/broadcast.js
const { createScopedLogger } = require('../services/logger');
const logger = createScopedLogger('broadcast-route');

// In backend/src/routes/segments.js
const { createScopedLogger } = require('../services/logger');
const logger = createScopedLogger('segments-route');

// In backend/src/routes/settings.js
const { createScopedLogger } = require('../services/logger');
const logger = createScopedLogger('settings-route');

// In backend/src/routes/schedule.js
const { createScopedLogger } = require('../services/logger');
const logger = createScopedLogger('schedule-route');

// In backend/src/routes/transcribe.js
const { createScopedLogger } = require('../services/logger');
const logger = createScopedLogger('transcribe-route');

// In backend/src/routes/voicePresets.js
const { createScopedLogger } = require('../services/logger');
const logger = createScopedLogger('voice-presets-route');
```

For each `catch (error)` block, replace:

```js
console.error('操作失败:', error);
```

with:

```js
logger.error({ err: error }, '操作失败');
```

When useful IDs are in scope, include them:

```js
logger.error({ err: error, broadcastId: id }, '保存播报失败');
logger.error({ err: error, broadcastId: id, segmentId: segId }, '重新生成失败');
```

- [ ] **Step 5: Verify no backend source console calls remain**

Run:

```bash
rg -n "console\\.(log|warn|error)" backend/src
```

Expected: no matches.

- [ ] **Step 6: Run backend tests**

Run:

```bash
cd backend && npm test -- --runInBand
```

Expected: all backend tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src backend/tests
git commit -m "refactor: replace backend console logging"
```

---

### Task 6: Replace Frontend Console Calls

**Files:**
- Modify: `frontend/src/services/api.ts`
- Modify: `frontend/src/services/sseClient.ts`
- Modify: `frontend/src/services/schemas.ts`
- Modify: `frontend/src/store/broadcastSlice.ts`
- Modify: `frontend/src/store/segmentSlice.ts`
- Modify: `frontend/src/store/settingsSlice.ts`
- Modify: `frontend/src/store/scheduleSlice.ts`
- Modify: `frontend/src/store/presetSlice.ts`
- Modify: `frontend/src/store/transcribeSlice.ts`
- Modify: `frontend/src/components/ErrorBoundary.tsx`
- Modify: `frontend/src/components/Dashboard/QuickGenerate.tsx`
- Modify: `frontend/src/components/Dashboard/AudioPlayer.tsx`
- Modify: `frontend/src/pages/History.tsx`
- Modify: `frontend/src/pages/Settings.tsx`

- [ ] **Step 1: Replace API client logger**

At the top of `frontend/src/services/api.ts`, add:

```ts
import { createScopedLogger } from './logger';
```

After the Axios instance, add:

```ts
const logger = createScopedLogger('api-client');
```

Replace current console calls:

```ts
logger.info('Request cancelled');
logger.error({ err: error, message: error.message }, 'Network error');
logger.error('Unauthorized — 请检查 API Key 配置');
logger.error('Forbidden — 无权访问该资源');
logger.error('Rate limited — 请求过于频繁，请稍后重试');
logger.error({ status }, 'Server error — 服务端异常');
logger.error({ status, responseError: data?.error || error.message }, 'API error');
```

- [ ] **Step 2: Replace SSE client logger**

At the top of `frontend/src/services/sseClient.ts`, add:

```ts
import { createScopedLogger } from './logger';
```

Inside the class fields, add:

```ts
private logger = createScopedLogger('sse-client');
```

Replace current console calls:

```ts
this.logger.info({ hasTaskId: Boolean(this.taskId), taskIdLength: this.taskId?.length ?? 0 }, 'SSE 连接成功');
this.logger.error({ err: error, hasTaskId: Boolean(this.taskId), taskIdLength: this.taskId?.length ?? 0 }, 'SSE 连接错误');
this.logger.error({ err: error, eventType }, 'SSE 事件处理错误');
```

- [ ] **Step 3: Replace schema logger**

At the top of `frontend/src/services/schemas.ts`, add:

```ts
import { createScopedLogger } from './logger';
```

Near helper functions, add:

```ts
const logger = createScopedLogger('schema-validation');
```

Replace:

```ts
console.warn('Schema validation failed:', result.error.format());
```

with:

```ts
logger.warn({ validationError: result.error.format() }, 'Schema validation failed');
```

- [ ] **Step 4: Replace store slice loggers**

Use one logger per file:

```ts
import { createScopedLogger } from '../services/logger';

const logger = createScopedLogger('broadcast-slice');
```

Scopes:

```txt
broadcastSlice.ts -> broadcast-slice
segmentSlice.ts -> segment-slice
settingsSlice.ts -> settings-slice
scheduleSlice.ts -> schedule-slice
presetSlice.ts -> preset-slice
transcribeSlice.ts -> transcribe-slice
```

Replace each `console.error('中文失败消息:', error)` with:

```ts
logger.error({ err: error }, '中文失败消息');
```

- [ ] **Step 5: Replace component and page loggers**

Use these scopes:

```txt
ErrorBoundary.tsx -> error-boundary
QuickGenerate.tsx -> quick-generate
AudioPlayer.tsx -> audio-player
History.tsx -> history-page
Settings.tsx -> settings-page
```

Import paths:

```ts
import { createScopedLogger } from '../services/logger';
```

For dashboard components under `components/Dashboard`, use:

```ts
import { createScopedLogger } from '../../services/logger';
```

Replace generic catches:

```ts
logger.error({ err }, '快速生成失败');
logger.error({ err }, '保存播报失败');
logger.error({ err: e }, '保存设置失败');
```

- [ ] **Step 6: Verify no frontend source console calls remain**

Run:

```bash
rg -n "console\\.(log|warn|error)" frontend/src
```

Expected: no matches outside `frontend/src/services/logger.test.ts` console mocks.

- [ ] **Step 7: Run frontend quality gates**

Run:

```bash
cd frontend && npm run lint && npm run build && npm run test
```

Expected: lint, build, and tests pass.

- [ ] **Step 8: Commit**

```bash
git add frontend/src
git commit -m "refactor: replace frontend console logging"
```

---

### Task 7: Final Verification

**Files:**
- Verify all changed files.

- [ ] **Step 1: Verify working tree status**

Run:

```bash
git status --short --branch
```

Expected: on `codex/debug-logging`, clean except intentional uncommitted changes if a previous task found issues.

- [ ] **Step 2: Verify source console usage**

Run:

```bash
rg -n "console\\.(log|warn|error)" backend/src frontend/src
```

Expected: no matches except test mocks if test files are included.

- [ ] **Step 3: Run full backend test suite**

Run:

```bash
cd backend && npm test -- --runInBand
```

Expected: all backend tests pass.

- [ ] **Step 4: Run full frontend gates**

Run:

```bash
cd frontend && npm run lint && npm run build && npm run test
```

Expected: lint, build, and tests pass.

- [ ] **Step 5: Smoke-check backend log file behavior**

Run:

```bash
cd backend && NODE_ENV=development node -e "const { createScopedLogger } = require('./src/services/logger'); createScopedLogger('smoke-test').info({ ok: true }, '日志 smoke test');"
tail -n 1 logs/app-$(date +%F).log
```

Expected: the last log line is JSON and includes `"scope":"smoke-test"` and `"ok":true`.

- [ ] **Step 6: Remove smoke log file if it was created only for verification**

Run:

```bash
rm -rf backend/logs
git status --short
```

Expected: no tracked log files appear.

- [ ] **Step 7: Commit any final fixes**

If final verification required fixes, stage the concrete files changed by those fixes:

```bash
git add backend/src/services/logger.js frontend/src/services/logger.ts
git commit -m "fix: stabilize pino debug logging"
```

Expected: no uncommitted changes remain.
