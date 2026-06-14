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

后端日志写入 `backend/logs/app-YYYY-MM-DD.log`，文件内容是 JSONL，可按 `scope`、`msg`、`level` 和 metadata 字段搜索。

```js
const { createScopedLogger } = require('../services/logger');

const logger = createScopedLogger('scheduler');

logger.info({ count: schedules.length }, '已加载定时任务');
logger.warn({ cronExpression: schedule.cron_expression }, '无效的 cron 表达式');
logger.error({ err: error, scheduleName: schedule.name }, '定时任务执行失败');
```

## 前端用法

前端 import 路径按当前文件位置调整：store 文件通常用 `../services/logger`，dashboard 组件通常用 `../../services/logger`。

```ts
import { createScopedLogger } from './logger';

const logger = createScopedLogger('api-client');

logger.info({ taskId }, 'SSE 连接成功');
logger.warn({ validationError }, 'Schema validation failed');
logger.error({ err: error, status }, 'API 请求失败');
```

## Agent 查询后端日志

```bash
ls -t backend/logs/app-*.log | head -1
tail -n 120 "$(ls -t backend/logs/app-*.log | head -1)"
rg '"scope":"scheduler"|定时任务执行失败' backend/logs
rg '"level":50|"level":40' backend/logs
```

## Agent 排查前端日志

前端不落文件。需要用户复制浏览器控制台输出时，直接说明需要包含报错附近的结构化日志对象，尤其是 `scope`、`msg`、`err` 和相关 metadata。

## Checklist

- [ ] 使用 `createScopedLogger()`，不新增裸 `console.*`
- [ ] `scope` 稳定且可搜索
- [ ] 错误对象放入 `{ err: error }`
- [ ] metadata 不包含 API Key、完整 token 或大体积 base64/audio 内容
- [ ] 后端日志可通过 `backend/logs/app-YYYY-MM-DD.log` 查询
- [ ] 前端日志只在浏览器控制台输出
