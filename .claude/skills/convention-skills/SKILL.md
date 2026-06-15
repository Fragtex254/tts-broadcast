---
name: convention-skills
description: 新建、修改、拆分、退役或周期体检本项目的开发规范 skill 时使用。维护 skill registry、规定何时更新 skill、更新协议、健康度评价标准。触发场景：新建 skill、改规范 skill、skill 太大要拆、skill 过时、skill 体检、skill 健康度、规范 skill 索引、引入新模式后同步规范。
---

# 规范 skill 治理

## 何时用

- 开发中产生**新模式/新路由族/新组件类型/新持久化套路**，需要把约定沉淀进某个业务 skill 时。
- 新建/拆分/退役一个 convention skill 时。
- 周期性给所有 convention skill 做健康体检时。

> 编写 SKILL.md 的通用机制复用 `writing-skills` / `skill-creator`；本 skill 只加项目专属治理规则。

## 维护触发点

开发引入新约定时，**必须**更新对应业务 skill，而非只写在代码里。这取代了旧的"开发后同步规范文档"硬性要求。

## 更新协议

改一个业务 skill 时三处同步：
1. SKILL.md 正文（规则/模板/Checklist）
2. frontmatter 的 `description`（新触发词、新涉及文件名）
3. 下方 registry 与根目录 `AGENTS.md` 路由表（若边界变化）

规则单一归属：一条规则只在一个 skill；跨 skill 用链接引用，不复制。

## Registry（权威清单）

| skill | 负责任务 | 迁移来源 | last_reviewed | 健康 |
|-------|---------|---------|--------------|------|
| backend-route | 路由端点 | BACKEND「路由/错误处理/参数校验/响应格式」 | 2026-06-13 | ⚠️ 213 行，略超体量阈值，后续考虑拆分 |
| backend-service | 服务/外部 API | BACKEND「服务层规范」+ CLAUDE 健壮性2/4 | 2026-06-13 | ✅ |
| backend-database | schema/迁移/DAL | BACKEND「数据库规范」+ CLAUDE 迁移规范 | 2026-06-13 | ✅ |
| backend-testing | 后端测试 | BACKEND「测试规范」+ CLAUDE 健壮性6 | 2026-06-13 | ✅ |
| debug-logging | 前后端调试日志 | Pino debug logging spec | 2026-06-14 | ✅ |
| frontend-component | 组件/页面 | FRONTEND「组件/路由/TS/无障碍/测试/性能」 | 2026-06-13 | ⚠️ 295 行，超体量阈值，优先候选拆分（如分出 frontend-testing） |
| frontend-styling | 样式/设计系统 | FRONTEND「设计系统/动效/响应式」 | 2026-06-13 | ⚠️ 235 行，略超体量阈值 |
| frontend-state-data | 状态/数据流 | FRONTEND「状态管理/API/防抖/Settings」+ CLAUDE 健壮性1/3 | 2026-06-13 | ✅ |
| add-persisted-field | 跨栈加字段 | CLAUDE「持久化 Checklist」+ 健壮性5 | 2026-06-13 | ✅ |

## 健康度 rubric

| 维度 | 健康标准 |
|------|---------|
| 触发健康 | description 触发词充分；与其他 skill 描述无重叠误触发 |
| 体量健康 | SKILL.md ≤ ~200 行（超了拆分）；不过短漏覆盖 |
| 新鲜度 | 规则与当前代码无漂移；last_reviewed 不过期 |
| 无重复 | 同一规则只在一处 |
| 覆盖完整 | Checklist 覆盖成功/失败/边界 |
| 索引一致 | `AGENTS.md` 路由表、registry、`.claude/skills/` 目录三者对得上 |

## 生命周期操作

- **新建**：出现全新任务类型时，建 `.claude/skills/<name>/`，补 registry 与 `AGENTS.md` 路由表。
- **拆分**：skill 超阈值时按子任务拆，迁移规则、更新两索引。
- **退役**：过时 skill 删除并清两索引。
- **周期体检**：按上表逐 skill 打分，输出健康报告，更新 last_reviewed。
