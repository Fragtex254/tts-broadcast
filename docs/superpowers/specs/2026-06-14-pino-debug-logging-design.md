# Pino Debug Logging Design

## Goal

Add a unified Pino-based logging layer for both backend and frontend so agents and developers can debug with precise timestamps, stable scopes, and structured context instead of relying on scattered `console.*` calls.

## Scope

This feature replaces project source `console.log`, `console.warn`, and `console.error` usage with scoped logger calls.

In scope:

- Backend logging through a shared Pino wrapper.
- Backend daily log files under `backend/logs/`.
- Backend console output for local development.
- Frontend logging through a shared Pino browser wrapper.
- Frontend console output only, so users can copy browser console logs when reporting problems.
- A project-level logging skill that tells agents how to add, replace, inspect, and search logs.
- Updates to `AGENTS.md` and the convention skill registry so agents can discover the logging workflow.
- Tests for logger behavior before production code changes.

Out of scope:

- Remote log collection.
- A log viewer UI.
- Frontend file persistence.
- Database persistence for logs.
- Replacing `console.*` calls in tests when those calls are part of test setup, subprocess output, or console mocks.
- Adding lint rules that ban `console.*`; that can be a follow-up after the migration lands cleanly.
- Separate backend and frontend logging skills. One cross-stack `debug-logging` skill is enough for the current size; split only if it grows beyond the project skill health threshold.

## Architecture

### Backend

Create `backend/src/services/logger.js` as the only backend logger entrypoint. It will wrap `pino` and expose:

```js
const logger = require('../services/logger');
const scopedLogger = logger.createScopedLogger('scheduler');
```

The wrapper will provide:

- A root Pino logger.
- `createScopedLogger(scope)` for module-specific loggers.
- ISO millisecond timestamps via Pino timestamp configuration.
- Error serialization using Pino's standard `err` object convention.
- Daily log file output at `backend/logs/app-YYYY-MM-DD.log`.
- Console output in development and production.
- Test-safe behavior that avoids writing real log files in `NODE_ENV=test` unless a test explicitly configures a temporary destination.

Backend log fields:

```json
{
  "level": 30,
  "time": "2026-06-14T09:52:01.123Z",
  "scope": "scheduler",
  "msg": "已加载定时任务",
  "count": 2
}
```

Backend usage pattern:

```js
logger.info({ count: schedules.length }, '已加载定时任务');
logger.warn({ cronExpression: schedule.cron_expression }, '无效的 cron 表达式');
logger.error({ err: error, scheduleName: schedule.name }, '定时任务执行失败');
```

This preserves Pino's normal object-first API and makes metadata searchable in JSONL logs.

### Frontend

Create `frontend/src/services/logger.ts` as the only frontend logger entrypoint. It will use `pino/browser` and expose:

```ts
const logger = createScopedLogger('api');
```

The frontend wrapper will:

- Use Pino browser logging.
- Output only to the browser console.
- Keep fields aligned with backend logs where practical: `time`, `level`, `scope`, `msg`, `err`, and additional metadata.
- Avoid file persistence, localStorage persistence, IndexedDB persistence, or network submission.
- Provide stable, copyable console output for user bug reports.

Frontend usage pattern:

```ts
logger.info({ taskId }, 'SSE 连接成功');
logger.warn({ validationError }, 'Schema validation failed');
logger.error({ err: error, status }, 'API 请求失败');
```

## Agent Exposure Contract

The logging system must be discoverable and usable by future agents without requiring them to infer conventions from implementation details.

Create `.claude/skills/debug-logging/SKILL.md` with these responsibilities:

- When to use the logging skill:
  - Adding new logs.
  - Replacing `console.*`.
  - Debugging backend failures from log files.
  - Debugging frontend failures from copied browser console output.
  - Choosing `scope`, `level`, message, and metadata fields.
- Backend logging rules:
  - Always import `createScopedLogger()` from `backend/src/services/logger.js`.
  - Use stable kebab-case scopes such as `broadcast-route`, `scheduler`, `sse-manager`, and `api-client`.
  - Use object-first Pino calls for metadata.
  - Log thrown errors with `{ err: error }`.
  - Search backend logs under `backend/logs/app-YYYY-MM-DD.log`.
- Frontend logging rules:
  - Always import `createScopedLogger()` from `frontend/src/services/logger.ts`.
  - Use the same stable scope naming style as the backend.
  - Do not persist frontend logs to files, localStorage, IndexedDB, or remote endpoints.
  - Ask users to copy browser console output when frontend-only failures need investigation.
- Agent search commands:

```bash
ls -t backend/logs/app-*.log | head -1
tail -n 120 backend/logs/app-$(date +%F).log
rg '"scope":"scheduler"|定时任务执行失败' backend/logs
rg '"level":50|"level":40' backend/logs
```

The implementation must also update:

- `AGENTS.md`: add a routing row for logging/debugging tasks.
- `.claude/skills/convention-skills/SKILL.md`: add `debug-logging` to the registry.

This gives future agents an explicit entrypoint instead of depending on memory or scattered docs.

## Replacement Plan

Backend source replacements:

- `backend/src/app.js`
- `backend/src/routes/*.js`
- `backend/src/services/*.js`

Frontend source replacements:

- `frontend/src/services/api.ts`
- `frontend/src/services/sseClient.ts`
- `frontend/src/services/schemas.ts`
- `frontend/src/store/*Slice.ts`
- `frontend/src/components/ErrorBoundary.tsx`
- Existing page or component files that currently call `console.*`

Tests that intentionally mock or restore `console.*` may remain unchanged unless the implementation makes a targeted update necessary.

## Dependency Changes

Add `pino` to both package manifests:

```bash
cd backend && npm install pino
cd frontend && npm install pino
```

No additional logger transport package is planned. The backend can use Node.js streams and Pino's core APIs for file output.

## Environment Behavior

Backend:

- Default log level: `info`.
- Optional override: `LOG_LEVEL`.
- Daily log file directory: `backend/logs/`.
- Optional override for tests or local experiments: `LOG_DIR`.
- `NODE_ENV=test` defaults to no real file writes unless explicitly configured by the test.

Frontend:

- Default log level: `info`.
- Optional Vite override: `VITE_LOG_LEVEL`.
- Output destination: browser console only.

## Error Handling

All thrown errors should be logged using the Pino `err` property:

```js
logger.error({ err: error }, '保存播报失败');
```

The wrapper should preserve useful properties:

- `message`
- `name`
- `stack`
- Axios-like `code`, `status`, or response status when already present in the logged object

Call sites should continue returning the same user-facing errors and HTTP responses as before. Logging is observability, not behavior change.

## Testing

Follow TDD for the implementation.

Backend tests:

- Add `backend/tests/services/logger.test.js`.
- Verify scoped logger adds `scope`.
- Verify timestamps are ISO strings with millisecond precision.
- Verify log lines are JSON parseable.
- Verify `err` logging preserves error message and stack.
- Verify `NODE_ENV=test` does not create real `backend/logs/` files by default.
- Verify a test-provided temporary log directory receives JSONL output.

Frontend tests:

- Add `frontend/src/services/logger.test.ts`.
- Mock console methods.
- Verify scoped logger sends output through Pino browser.
- Verify `scope` and message are present.
- Verify error metadata can be logged.
- Verify no browser storage APIs are used.

Regression commands:

```bash
cd backend && npm test -- --runInBand
cd frontend && npm run lint && npm run build && npm run test
```

## Migration Safety

The migration should not change runtime behavior beyond log output.

Safety rules:

- Keep route responses unchanged.
- Keep store error handling unchanged.
- Do not swallow errors in logger calls.
- Do not add async log writes to request-critical paths.
- Do not make frontend logging depend on browser storage or network availability.
- Keep backend `logs/` ignored by Git.

## Success Criteria

- Project source no longer uses bare `console.log`, `console.warn`, or `console.error` except where there is a documented reason.
- Backend logs are searchable JSONL files with precise ISO timestamps and scopes.
- Frontend logs are structured and easy for users to copy from the browser console.
- Existing backend and frontend quality gates pass.
- New logger tests cover the shared logging behavior.
