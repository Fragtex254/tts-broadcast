# AGENTS.md

本文件是所有 agent 的统一入口。`CLAUDE.md` 是指向本文件的 symlink；不要分别维护两份入口说明。

## Read First

- 开始开发前先读本文件，再按任务读取对应 `.claude/skills/<skill-name>/SKILL.md`。
- `.claude/skills/` 是项目级规范来源，不只给 Claude Code 使用；不支持 Skill 工具的 agent 直接读取 `SKILL.md`。
- 项目事实、技术栈、目录、数据库、外部 API 与持久化背景见 `docs/project-facts.md`。
- 后端背景规范见 `backend/BACKEND_CONVENTIONS.md`，前端背景规范见 `frontend/FRONTEND_CONVENTIONS.md`。

## Skill Routing

| 任务 | 先读取或调用 |
|------|-------------|
| 改/加后端路由端点 | `.claude/skills/backend-route/SKILL.md` |
| 改/加后端服务、接外部 API | `.claude/skills/backend-service/SKILL.md` |
| 改 DB schema / 写迁移 / DAL | `.claude/skills/backend-database/SKILL.md` |
| 写后端测试 | `.claude/skills/backend-testing/SKILL.md` |
| 新增/替换/查询/审查调试日志 | `.claude/skills/debug-logging/SKILL.md` |
| 改/加前端组件或页面 | `.claude/skills/frontend-component/SKILL.md` |
| 调样式 / 套设计系统 | `.claude/skills/frontend-styling/SKILL.md` |
| 改前端状态 / 数据流 | `.claude/skills/frontend-state-data/SKILL.md` |
| 加贯穿前后端的字段 | `.claude/skills/add-persisted-field/SKILL.md` |
| 新建/改/审查上述 skill | `.claude/skills/convention-skills/SKILL.md` |

## Hard Rules

- 遵循现有代码模式、命名、错误处理和测试模式。
- 后端路由不得直接写 SQL，必须通过 `services/*Store.js` 等 DAL 层。
- ID 校验使用 `validateId()`，音频文件删除使用 `cleanAudioFile()`。
- 外部 API 测试必须 mock，不依赖真实网络或真实业务密钥。
- 长任务必须有 loading/error 状态；已接入 SSE 的任务要发送开始、进度、完成、失败事件。
- 前后端契约不得使用裸 `any`；新增持久化字段必须端到端同步。
- 前端设计系统当前为 Warm Workbench / Soft Editorial：语义色仍使用 `paper/ink/pink/lemon/blush/sage/lilac`，底层参考色板见 `frontend/src/index.css` 与 `.claude/skills/frontend-styling/SKILL.md`，组件层优先使用语义色。
- 开发引入新约定、新路由族、新组件类型或新持久化套路时，必须同步更新对应 skill 与本文件。

## Commands

后端在 `backend/` 目录执行：

```bash
npm run dev
npm test -- --runInBand
```

前端在 `frontend/` 目录执行：

```bash
npm run dev
npm run build
npm run lint
```
