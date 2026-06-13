# 开发规范渐进式披露重构设计

- 日期：2026-06-13
- 主题：将前后端开发规范从"全量文档"重构为"渐进式披露的 skill"
- 状态：已批准，待编写实现计划

## 背景与问题

随着项目开发推进，规范文档持续膨胀：

- `CLAUDE.md`：372 行（含项目概述、DB schema、外部 API、健壮性规范、持久化规范）
- `backend/BACKEND_CONVENTIONS.md`：684 行
- `frontend/FRONTEND_CONVENTIONS.md`：764 行

现状下 `CLAUDE.md` 强制要求"开发前先读对应规范文档"，导致 agent 每次哪怕只改一个按钮颜色，也要把数百行规范全量读进上下文，浪费严重且稀释注意力。

目标：把高频强约束的开发规则改造成**按需加载的 skill**，实现 agent 开发时的渐进式披露，同时建立一套治理机制保证这些 skill 长期可维护。

## 已确认的关键决策

1. **skill 与 CONVENTIONS.md 的关系 = 按内容分治**：高频强约束规则 → skill；低频背景内容（技术栈、目录结构、文件职责、命名、代码风格、已解决技术债）→ 留 CONVENTIONS.md。
2. **拆分粒度 = 中粒度，按开发任务切分**（后端 add-route / add-service / db / test，前端 component / styling / state）。
3. **范围 = 连 CLAUDE.md 一起瘦身**：CLAUDE.md 的规则性章节（健壮性 1–7、持久化）拆出，CLAUDE.md 留作"常驻锚点 + 调度表 + 铁律"。
4. **registry 放进治理元 skill 正文**，不单设游离文件。
5. **治理元 skill 命名 = `convention-skills`**。

## 渐进式披露机制

项目级 skill 放在 `.claude/skills/<name>/SKILL.md`，Claude Code 自动发现，但**只把 frontmatter 的一行 `description` 注入系统提示**（available-skills 列表）。完整 SKILL.md 正文仅在 agent 主动 `Skill` 调用时进上下文。这就是渐进式披露：平时一行，用到才展开。

### 三类文件的角色

| 文件 | 角色 | 加载时机 | 内容 |
|------|------|---------|------|
| `CLAUDE.md`（瘦身后） | 常驻锚点 + 调度表 | 每次会话必加载 | 项目概述、DB schema 摘要、外部 API 摘要、不可协商的铁律、任务→skill 路由表 |
| `CONVENTIONS.md`（前/后端各一，瘦身后） | 低频背景参考 | 按需 Read | 技术栈、目录结构、文件职责表、命名规范、代码风格、已解决技术债历史；规则章节移走后留指向 skill 的索引行 |
| `.claude/skills/*`（新增） | 高频强约束规则 | 用到才 Skill 调用 | 按开发任务组织的模式、模板、铁则、Checklist |

### 触发可靠性（双保险）

不单纯依赖 description 自动触发：

1. 每个 skill 的 `description` 写得触发词丰富（参考 aihot skill 写法），覆盖"改路由 / 加服务 / 写迁移"等多种中文说法 + 涉及的具体文件名。
2. 瘦身后的 `CLAUDE.md` 顶部放一张**显式路由表**（任务 → 应调 skill）。CLAUDE.md 常驻，给 agent 一个确定性调度入口，不靠运气。

### 保留在 CLAUDE.md 的铁律（不进 skill）

这些是"任何时候都不能碰的线"，必须无条件常驻：

- 双 Agent 协作约定（先读 AGENTS.md + CLAUDE.md，冲突以 CLAUDE.md 为准）
- 服务器是数据唯一真相源
- 不全局关闭 TLS 校验（禁 `NODE_TLS_REJECT_UNAUTHORIZED=0`）
- 批量 TTS 必须串行/限速，禁 `Promise.all` 并发打 MiMo TTS
- `NODE_ENV=test` 必须用 SQLite 内存库
- `app.js` 只导出 app，不在引入时 listen/初始化调度器
- 不引入新依赖作为默认解法

> 区分原则：skill 讲"怎么做某类任务"，铁律讲"任何时候都不能越的线"。

## skill 清单

后端 4 + 前端 3 + 跨栈 1 + 治理 1 = **9 个 skill**。每个业务 skill 自带该任务的 Checklist。

### 后端

| skill | 覆盖任务 | 吸收的规范章节 |
|-------|---------|--------------|
| `backend-route` | 新增/修改路由端点 | 路由定义模式、async 规则、`validateId`、必填校验、错误处理、状态码、响应格式、路由层 Checklist |
| `backend-service` | 新增/修改服务、接外部 API | 服务职责边界、解构参数、禁全局变量、外部 API 隔离（timeout/401/429→中文错误）、音频资产补偿清理、服务层 Checklist |
| `backend-database` | 改 schema / 写迁移 / DAL | 迁移 try-catch 模式、`schema.sql` 同步、参数化 SQL、事务、`index` 关键字转义、`*Store.js` DAL、数据库 Checklist |
| `backend-testing` | 写后端测试 | 测试目录镜像、命名、route/service 测试模板、mock 策略、DB 清理、内存库隔离、进程生命周期（app.js 导出、`scheduler.shutdown`、open handles） |

### 前端

| skill | 覆盖任务 | 吸收的规范章节 |
|-------|---------|--------------|
| `frontend-component` | 新增/修改组件或页面 | 组件文件结构、单一职责、入场动画、加载（骨架屏）/错误（shake）/空状态、路由、TS 规则、命名、错误边界、无障碍、组件/页面 Checklist（含前端测试要求） |
| `frontend-styling` | 套用设计系统 / 调样式 | Soft Editorial 设计哲学、色彩 token、字体、卡片/按钮/输入框/Pill 模板、动效 class 与缓动、响应式断点 |
| `frontend-state-data` | 改状态 / 数据流 | Zustand slice 模式、强制 selector、`types.ts`、API 层 `api.ts`、Zod schema、防抖、Settings 自动保存模式、SSE 进度状态（含相关测试要求） |

### 跨栈

| skill | 覆盖任务 | 吸收的规范章节 |
|-------|---------|--------------|
| `add-persisted-field` | 新增贯穿前后端的字段 | CLAUDE.md「新增持久化字段 Checklist」+「前后端契约」7 步：schema→迁移→Store→路由→`api.ts`→`types.ts`→`schemas.ts`→slice→UI。本质是编排，正文链向上述各 skill |

### 治理（元 skill）

| skill | 覆盖任务 | 内容 |
|-------|---------|------|
| `convention-skills` | 新建/修改/审查上述业务 skill | registry、维护触发点、更新协议、健康度 rubric、生命周期操作 |

### 已确认的取舍

- **前端测试不单设 skill**：折进 `frontend-component` 与 `frontend-state-data` 各自的 Checklist。
- **命名规范 + 代码风格留在 CONVENTIONS.md 作背景**：task skill 不重复，只在正文开头一句「命名与代码风格见 CONVENTIONS.md」。
- **`frontend-styling` 与 `frontend-component` 保持独立**：component 正文提示"视觉模板调 styling"，但纯调色/改按钮时只需加载 styling。

## SKILL.md 编写规范

每个 skill 一个目录 `.claude/skills/<name>/SKILL.md`：

```markdown
---
name: backend-route
description: 新增或修改后端 Express 路由端点时使用。涵盖路由定义模式、validateId
  参数校验、必填校验、try-catch 错误处理、HTTP 状态码、响应格式包裹、DAL 调用。
  触发场景：加接口、改路由、新端点、改 broadcast/segments/settings/schedule 路由、
  动作端点、CRUD 接口。
---

# 后端路由开发

## 何时用 / 不用
## 核心铁则（最多 5 条，最关键的约束置顶）
## 模式与模板（可直接抄的代码块）
## Checklist（开发后逐项核对）
## 相关 skill / 文档（链向 backend-database、CONVENTIONS.md）
```

要点：

- `description` 是触发命脉，必须触发词丰富，覆盖中文各种说法 + 涉及的具体文件名。
- 正文铁则置顶，agent 展开即见最关键约束。
- 内容从现有规范文档**剪切迁移**，保持原措辞，避免语义漂移；不重写。
- 实现时用现成的 `writing-skills` / `skill-creator` 指导编写。

## CLAUDE.md 瘦身后形态

### 新增：任务 → skill 路由表（常驻）

```markdown
## 开发前必读：任务 → skill 路由

| 你要做的事 | 先调用的 skill |
|-----------|--------------|
| 改/加后端路由端点 | `backend-route` |
| 改/加后端服务、接外部 API | `backend-service` |
| 改 DB schema / 写迁移 / DAL | `backend-database` |
| 写后端测试 | `backend-testing` |
| 改/加前端组件或页面 | `frontend-component` |
| 调样式 / 套设计系统 | `frontend-styling` |
| 改前端状态 / 数据流 | `frontend-state-data` |
| 加贯穿前后端的字段 | `add-persisted-field` |
| 新建/改/审查上述 skill | `convention-skills` |
```

### 改写"⚠️ 开发规范强制要求"段

从"开发前先读规范文档"改为"开发前先按路由表调对应 skill"；"开发后同步规范文档"改为"开发后若产生新约定 → 调 `convention-skills` 判断更新哪个 skill 并同步其 description/Checklist/索引"。

## CONVENTIONS.md 瘦身后形态

- **后端保留**：技术栈、项目结构、目录规则、文件职责表、命名规范、代码风格、已解决技术债历史。
- **后端移走**：路由/服务/数据库/错误处理/校验/响应/测试章节 + 两份 Checklist → 进对应 skill；原处留索引行（如 `> 路由开发规则见 skill：backend-route`）。
- **前端同理**：保留技术栈/结构/职责/命名；移走设计系统/组件/状态/API/动效/测试等 → 进对应 skill，留索引行。

## 治理元 skill：`convention-skills`

职责是"管理管理业务的 skill"。

### ① 维护触发点（何时改 skill）

当开发引入新模式 / 新路由族 / 新组件类型 / 新持久化字段套路时，必须更新对应业务 skill，而非只写在代码里。此规则取代 CLAUDE.md 原"开发后同步规范文档"硬性要求。

### ② 更新协议（如何维护）

改一个业务 skill 时三处同步：

1. SKILL.md 正文（规则/模板/Checklist）
2. frontmatter 的 `description`（新触发词、新涉及文件名）
3. registry 与 CLAUDE.md 路由表（若边界变化）

- 规则单一归属：一条规则只在一个 skill；跨 skill 用链接引用，不复制。
- 复用现成 `writing-skills` / `skill-creator`，本元 skill 只加项目专属治理规则。

### ③ 两类索引（在哪）

- **调用索引** = CLAUDE.md 路由表（任务→skill，供触发）。
- **治理索引（registry）** = 一张表，放在 `convention-skills` 正文内，列出每个 skill：负责任务、迁移来源章节、`last_reviewed` 日期、健康状态。`convention-skills` 自身也登记在 CLAUDE.md 路由表。

### ④ 健康度 rubric（如何评价）

| 维度 | 健康标准 |
|------|---------|
| 触发健康 | description 触发词充分；与其他 skill 描述无重叠误触发 |
| 体量健康 | SKILL.md 不超阈值（建议 ≤ ~200 行，超了拆分）；不过短漏覆盖 |
| 新鲜度 | 规则与当前代码无漂移；`last_reviewed` 不过期 |
| 无重复 | 同一规则只在一处 |
| 覆盖完整 | Checklist 覆盖成功/失败/边界 |
| 索引一致 | 路由表、registry、实际 skill 目录三者对得上 |

### ⑤ 生命周期操作

- **新建** convention skill（出现全新任务类型时）
- **拆分** 超阈值的 skill
- **退役** 过时 skill（连带清路由表与 registry）
- **周期体检**：按 rubric 跑一遍，输出健康报告

## 实现执行顺序

1. 建 9 个 `.claude/skills/<name>/SKILL.md`：从规范文档剪切对应章节、补 frontmatter；其中 `convention-skills` 含 registry。
2. 瘦身两份 CONVENTIONS.md，移走章节改为索引行。
3. 瘦身 CLAUDE.md：规则章节（健壮性 1–7、持久化）按去向拆分（进 skill / 留铁律），加路由表。
4. 改写 CLAUDE.md「⚠️ 开发规范强制要求」段，对齐"先调 skill / 用 convention-skills 维护"。
5. 在 CLAUDE.md（及未来的 AGENTS.md）注明：skill 是 Claude Code 专属机制，非 Claude agent 仍读 CONVENTIONS.md 索引。

## 校验

无自动化测试，靠人工核对：

- **零内容丢失**：迁移前后做规则点 diff，确保每条规则都有归宿（在某 skill 或仍在 CONVENTIONS）。
- **触发抽样**：建完后用几个典型 prompt（"帮我加个 broadcast 路由"、"改下按钮颜色"、"加个持久化字段"）确认 agent 能从 available-skills 命中正确 skill。
- 纯文档重构，**不碰 backend/frontend 源码**，无需跑 `npm test` / `npm run build`。

## 非目标（YAGNI）

- 不为 skill 触发建自动化测试框架。
- 不引入任何新依赖或工具链。
- 本次不重写规范内容，只做迁移与瘦身。
- 不改动应用源代码。
