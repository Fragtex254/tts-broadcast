# Superpowers 工作流文档索引

本目录保存 Superpowers 开发流程产生的设计文档和执行计划。它们是项目协作历史与决策依据，不是当前待办列表。

## 目录约定

- `specs/`：功能或技术改动的设计说明，记录问题、范围、方案和验收口径。
- `plans/`：按任务拆分的执行计划，常包含历史命令、提交建议和 checklist。

## 使用规则

1. 当前开发入口仍是根目录 `AGENTS.md`，不要从本目录绕过 skill 路由。
2. 查历史背景时先读对应 `specs/`，再读同名 `plans/`。
3. 已实现的 plan 不代表仍需执行；以当前代码、测试、`docs/project-facts.md` 和 `.claude/skills/` 为准。
4. 不确定文档是否过期时，默认保留；确认被替代且无引用后可以删除。

## 已清理的历史重叠

- `2026-06-06-segment-tts`：被 `2026-06-07-segment-tts` 覆盖。
- `2026-06-10-asr-litellm`：被 `2026-06-11-asr-transcribe` 的聚焦实现路径取代。
- `2026-06-13-conventions-to-skills`：已落地为 `AGENTS.md`、`CLAUDE.md -> AGENTS.md` 与 `.claude/skills/`。

以上已删除，避免历史计划被误认为当前执行入口。不要删除 Superpowers 核心入口：`AGENTS.md`、`CLAUDE.md` symlink、`.claude/skills/`、`docs/project-facts.md` 与前后端 conventions。
