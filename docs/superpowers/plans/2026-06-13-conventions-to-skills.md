# 开发规范渐进式披露重构 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把前后端高频开发规则从大文档迁移成 9 个按需加载的项目级 skill，瘦身 CLAUDE.md 与两份 CONVENTIONS.md，实现 agent 开发时的渐进式披露。

**Architecture:** 项目级 skill 放 `.claude/skills/<name>/SKILL.md`，Claude Code 只把 frontmatter `description` 注入系统提示，正文按需 `Skill` 调用。CLAUDE.md 瘦身为"常驻锚点 + 任务→skill 路由表 + 铁律"；CONVENTIONS.md 保留低频背景（技术栈/结构/职责/命名/代码风格/技术债），规则章节移走后留索引行。新增治理元 skill `convention-skills` 管理这些业务 skill。

**Tech Stack:** Markdown 文档；Claude Code 项目级 skill 机制（`.claude/skills/`）；无源码改动、无新依赖、无自动化测试。

**对应 spec:** `docs/superpowers/specs/2026-06-13-conventions-to-skills-design.md`

---

## 通用约定（每个 skill 任务都适用）

**SKILL.md 统一骨架**（所有业务 skill 用同一套标题）：

```markdown
---
name: <skill-name>
description: <触发词丰富的一句话，见各任务>
---

# <中文标题>

## 何时用 / 不用

## 核心铁则
<最关键的 must/禁止 约束置顶，逐条列>

## 模式与模板
<可直接抄的代码块，从 CONVENTIONS 剪切迁移，保持原措辞>

## Checklist
<开发后逐项核对>

## 相关 skill / 文档
<链向其他 skill 与 CONVENTIONS.md>
```

**迁移原则：**
- "模式与模板" + "Checklist" 的内容**从现有规范文档原样剪切**，保持原措辞与代码块，不重写、不增删规则语义。
- "核心铁则"是新写的提炼，内容来自被迁移章节里的强约束句（"必须/禁止/不得"）。
- 按**章节标题名**定位源内容（不用行号，避免编辑过程中行号漂移）。

**通用验证手段**（每个 skill 创建后执行）：
1. `cat .claude/skills/<name>/SKILL.md | head -6` 确认 frontmatter 存在且 `name`/`description` 齐全。
2. 肉眼确认四个标题段都有实质内容，无 `TODO`/空段。

---

## Task 1: 创建 `backend-route` skill

**Files:**
- Create: `.claude/skills/backend-route/SKILL.md`
- Source: `backend/BACKEND_CONVENTIONS.md` 章节「路由规范」「错误处理」「参数校验」「响应格式」，及末尾「新增路由/服务 Checklist」的「路由端点」子清单

- [ ] **Step 1: 创建目录与文件，写入 frontmatter**

```markdown
---
name: backend-route
description: 新增或修改后端 Express 路由端点时使用。涵盖路由定义模式、路由挂载、async/await 规则、validateId 参数校验、必填参数校验、业务规则校验、try-catch 错误处理、HTTP 状态码（200/201/400/404/413/500）、响应格式包裹、通过 *Store DAL 操作数据库。触发场景：加接口、改路由、新端点、加 API、改 broadcast/segments/settings/schedule/voicePresets/transcribe 路由、动作端点、CRUD 接口、状态码、错误响应。
---
```

- [ ] **Step 2: 写「何时用 / 不用」段**

```markdown
## 何时用 / 不用

- **用**：在 `backend/src/routes/*.js` 新增/修改任何路由端点时。
- **不用**：写外部 API 调用或业务逻辑（→ `backend-service`）；写 SQL/迁移（→ `backend-database`）；写测试（→ `backend-testing`）。
```

- [ ] **Step 3: 写「核心铁则」段**（提炼自被迁移章节的强约束）

```markdown
## 核心铁则

1. 路由层只做 HTTP 翻译：解析请求、参数校验、选状态码、返回 JSON。**不写 SQL（走 `*Store.js` DAL）、不调外部 API、不内联复杂文件处理。**
2. 每个接收 `:id` 的路由**必须**用 `validateId()`（来自 `utils/validation.js`）做正整数校验，失败返回 400。禁止内联 parseInt。
3. 有 `await` 的处理器**必须** try-catch 包裹；catch 里 `console.error('xxx失败:', error)` + `res.status(500).json({ error: error.message || '中文消息' })`。
4. 成功响应用名词包裹（`{ broadcast }` / `{ items }`），失败用 `{ error: '中文' }`，操作确认用 `{ message }`。
5. 文件删除统一用 `cleanAudioFile()`，禁止拼接用户输入路径后直接 `unlinkSync`。
```

- [ ] **Step 4: 写「模式与模板」段**

从 `backend/BACKEND_CONVENTIONS.md` 剪切以下章节的正文与代码块，按原样粘贴到本段下，保留小标题：
- 「路由规范」→「路由定义模式」「路由挂载（在 app.js 中）」「async/await 使用规则」
- 「错误处理」→「路由层错误处理（统一模式）」「错误信息暴露规则」「HTTP 状态码使用」「异步错误处理」
- 「参数校验」→「ID 参数校验」「必填参数校验」「业务规则校验」「校验规则」
- 「响应格式」→「成功响应」「失败响应」「响应格式规则」

- [ ] **Step 5: 写「Checklist」段**

从 `backend/BACKEND_CONVENTIONS.md` 末尾「新增路由/服务 Checklist」的「路由端点」子清单原样剪切粘贴。

- [ ] **Step 6: 写「相关 skill / 文档」段**

```markdown
## 相关 skill / 文档

- 数据库/DAL 操作 → `backend-database`
- 外部 API/业务逻辑 → `backend-service`
- 测试 → `backend-testing`
- 命名规范与代码风格 → `backend/BACKEND_CONVENTIONS.md`
```

- [ ] **Step 7: 验证**

按「通用验证手段」核对。

- [ ] **Step 8: Commit**

```bash
git add .claude/skills/backend-route/SKILL.md
git commit -m "feat(skills): 添加 backend-route 开发 skill"
```

---

## Task 2: 创建 `backend-service` skill

**Files:**
- Create: `.claude/skills/backend-service/SKILL.md`
- Source: `backend/BACKEND_CONVENTIONS.md`「服务层规范」「文件职责」表中服务相关行；CLAUDE.md「健壮性」第 2 节（外部 API 隔离）、第 4 节（音频一致性）；末尾 Checklist 的「服务函数」子清单

- [ ] **Step 1: 创建文件，写入 frontmatter**

```markdown
---
name: backend-service
description: 新增或修改后端服务、封装外部 API（MiMo LLM/TTS/ASR、AI HOT）时使用。涵盖服务职责边界、解构参数签名、禁用全局变量传依赖、外部 API 失败隔离（timeout、401/429/超时/网络错误转中文）、批量 TTS 串行限速、TLS 按实例隔离、SQLite 与音频文件一致性补偿清理。触发场景：加服务、改 services、接外部 API、调 MiMo/aihot/tts/asr、音频写入清理、孤儿文件、队列限速。
---
```

- [ ] **Step 2: 写「何时用 / 不用」段**

```markdown
## 何时用 / 不用

- **用**：在 `backend/src/services/*.js`（非 `*Store.js`）新增/修改业务逻辑或外部 API 封装时。
- **不用**：HTTP 路由处理（→ `backend-route`）；单表 SQL（→ `backend-database`，`*Store.js`）；测试（→ `backend-testing`）。
```

- [ ] **Step 3: 写「核心铁则」段**

```markdown
## 核心铁则

1. 服务层负责业务和外部 API；**不碰 `req`/`res`、不设 HTTP 状态码**。
2. 所有 MiMo/AI HOT 调用**必须**设明确 timeout，并把 401、429、超时、网络错误转换为用户可理解的中文错误。
3. 批量 TTS **只能串行或经队列限速**，禁止在服务里 `Promise.all` 并发打 MiMo TTS（RPM≤100、TPM≤10M）。
4. **不允许全局关闭 TLS 校验**，不允许 `NODE_TLS_REJECT_UNAUTHORIZED=0`；需补 CA 只能在特定 HTTP client 实例内配置。
5. 用解构参数（`function f({ a, b }) {}`）；**不用全局变量传依赖**，用模块级变量 + `init(callback)`。
6. DB 写入与文件写入跨资源：设计补偿清理——DB 成功但文件失败→回滚记录或置 `failed`；文件成功但 DB 失败→删文件避免孤儿。删除经 `cleanAudioFile()`。
```

- [ ] **Step 4: 写「模式与模板」段**

从 `backend/BACKEND_CONVENTIONS.md`「服务层规范」剪切「服务职责边界」表、「服务函数签名模式」、「不要使用全局变量传递依赖」三段原样粘贴。再从 CLAUDE.md「健壮性与可维护性开发规范」第 2 节「外部 API 必须隔离失败」与第 4 节「SQLite 与音频文件一致性」原样粘贴要点（这些内容此任务负责承接，CLAUDE.md 中将仅保留铁律句，详见 Task 12）。

- [ ] **Step 5: 写「Checklist」段**

从 `backend/BACKEND_CONVENTIONS.md` 末尾 Checklist 的「服务函数」子清单原样剪切粘贴。

- [ ] **Step 6: 写「相关 skill / 文档」段**

```markdown
## 相关 skill / 文档

- 路由层 → `backend-route`
- 单表 SQL / DAL → `backend-database`
- 测试与 mock → `backend-testing`
- 服务职责表、技术债历史 → `backend/BACKEND_CONVENTIONS.md`
```

- [ ] **Step 7: 验证**

按「通用验证手段」核对。

- [ ] **Step 8: Commit**

```bash
git add .claude/skills/backend-service/SKILL.md
git commit -m "feat(skills): 添加 backend-service 开发 skill"
```

---

## Task 3: 创建 `backend-database` skill

**Files:**
- Create: `.claude/skills/backend-database/SKILL.md`
- Source: `backend/BACKEND_CONVENTIONS.md`「数据库规范」；CLAUDE.md「数据库迁移规范」；末尾 Checklist 的「数据库」子清单

- [ ] **Step 1: 创建文件，写入 frontmatter**

```markdown
---
name: backend-database
description: 修改 SQLite schema、写数据库迁移、新增或修改 DAL（services/*Store.js）时使用。涵盖 better-sqlite3 同步 API、try-catch 探测列迁移模式、schema.sql 同步、参数化 SQL 防注入、事务、IN 子句占位符、segments.index 保留字双引号转义、NODE_ENV=test 内存库隔离。触发场景：加字段、加表、ALTER TABLE、写迁移、改 schema.sql、新建 Store、DAL、SQL 注入、事务。
---
```

- [ ] **Step 2: 写「何时用 / 不用」段**

```markdown
## 何时用 / 不用

- **用**：改 `db/schema.sql`、在 `db/index.js` 写迁移、新增/修改 `services/*Store.js` 单表 CRUD。
- **不用**：仅在路由里读写已有 Store（→ `backend-route`）；含外部 API 的业务逻辑（→ `backend-service`）。
- **注意**：新增贯穿前后端的字段时，本 skill 只覆盖后端部分，完整流程见 `add-persisted-field`。
```

- [ ] **Step 3: 写「核心铁则」段**

```markdown
## 核心铁则

1. SQLite 不支持 `ADD COLUMN IF NOT EXISTS`，迁移用 try-catch 探测列模式，放 `db/index.js` schema 初始化之后。
2. 新增列**必须有 `DEFAULT` 值**，确保旧数据兼容；`schema.sql` 保持最新完整定义，迁移只处理增量。
3. **参数化绑定**（`?` 占位符），绝对禁止字符串拼接 SQL（注入风险）。
4. `segments` 表的 `index` 是 SQL 保留字，**必须用双引号转义** `ORDER BY "index"`。
5. 路由层不直接 `db.prepare()`（settings 表除外），走 `*Store.js` DAL；store 函数收/返纯 JS 对象，不依赖 `req`/`res`。
6. `NODE_ENV=test` 必须用 SQLite 内存库，测试不得读写 `backend/data/broadcast.db`。
```

- [ ] **Step 4: 写「模式与模板」段**

从 `backend/BACKEND_CONVENTIONS.md`「数据库规范」剪切全部子段（连接与初始化、迁移模式、SQL 编写规范、事务使用、SQL 关键字处理）原样粘贴。补充 DAL 说明：`*Store.js` 封装单表全部 SQL（从「已解决技术债」的「DAL 层」段提炼一句指向）。

- [ ] **Step 5: 写「Checklist」段**

从末尾 Checklist 的「数据库」子清单原样剪切粘贴。

- [ ] **Step 6: 写「相关 skill / 文档」段**

```markdown
## 相关 skill / 文档

- 路由读写 Store → `backend-route`
- 跨前后端加字段完整流程 → `add-persisted-field`
- DB 测试（内存库、清表） → `backend-testing`
```

- [ ] **Step 7: 验证**

按「通用验证手段」核对。

- [ ] **Step 8: Commit**

```bash
git add .claude/skills/backend-database/SKILL.md
git commit -m "feat(skills): 添加 backend-database 开发 skill"
```

---

## Task 4: 创建 `backend-testing` skill

**Files:**
- Create: `.claude/skills/backend-testing/SKILL.md`
- Source: `backend/BACKEND_CONVENTIONS.md`「测试规范」；CLAUDE.md「健壮性」第 6 节（测试与进程生命周期）；末尾 Checklist 的「测试」子清单

- [ ] **Step 1: 创建文件，写入 frontmatter**

```markdown
---
name: backend-testing
description: 写后端 Jest/supertest 测试时使用。涵盖测试目录镜像 src/、中文 describe 命名、路由 supertest 测试模板、服务 jest.mock 模板、beforeEach 清表、真实内存库不 mock、NODE_ENV=test 隔离、app.js 只导出不 listen、cron 测试 scheduler.shutdown、open handles 排查。触发场景：写测试、单测、补测试、mock 外部 API、supertest、测试隔离、open handles、test runInBand。
---
```

- [ ] **Step 2: 写「何时用 / 不用」段**

```markdown
## 何时用 / 不用

- **用**：在 `backend/tests/` 新增/修改任何测试。
- **不用**：写被测的业务代码本身（→ `backend-route` / `backend-service` / `backend-database`）。
```

- [ ] **Step 3: 写「核心铁则」段**

```markdown
## 核心铁则

1. 测试目录与 `src/` **严格镜像**；外部 API 调用（aihot、mimo）**必须 `jest.mock()`**，数据库用真实 SQLite 内存库不 mock。
2. 每个测试**独立运行**、不依赖顺序；每个 describe 用 `beforeEach` 清相关表。
3. 测试经 `NODE_ENV=test` 自动隔离数据库，**禁止把测试数据写入开发库**。
4. `app.js` 只导出 Express app，只有直接运行入口才 `listen()` + 初始化调度器；supertest 引入 app 不应留端口/cron 句柄。
5. 创建 cron 任务的测试必须在 `afterEach` 调 `scheduler.shutdown()` 并清表。
6. Jest 提示 open handles 时用 `--detectOpenHandles` 定位并修复，不靠强制退出掩盖。
```

- [ ] **Step 4: 写「模式与模板」段**

从 `backend/BACKEND_CONVENTIONS.md`「测试规范」剪切全部子段（文件组织、测试命名、路由测试模式、数据库清理策略、服务测试模式、测试规则、运行测试）原样粘贴。补充 CLAUDE.md 第 6 节中关于 app.js 导出、内存库、scheduler.shutdown、open handles 的要点。

- [ ] **Step 5: 写「Checklist」段**

从末尾 Checklist 的「测试」子清单原样剪切粘贴。

- [ ] **Step 6: 写「相关 skill / 文档」段**

```markdown
## 相关 skill / 文档

- 被测路由/服务/DB → `backend-route` / `backend-service` / `backend-database`
- CI 门禁约束 → `CLAUDE.md` 的 CI/CD 章节
```

- [ ] **Step 7: 验证**

按「通用验证手段」核对。

- [ ] **Step 8: Commit**

```bash
git add .claude/skills/backend-testing/SKILL.md
git commit -m "feat(skills): 添加 backend-testing 开发 skill"
```

---

## Task 5: 创建 `frontend-component` skill

**Files:**
- Create: `.claude/skills/frontend-component/SKILL.md`
- Source: `frontend/FRONTEND_CONVENTIONS.md`「项目结构」中「组件文件组织」、「组件规范」、「路由」、「TypeScript」、「命名规范」、「错误边界」、「无障碍」、「质量门禁与测试」、「新增页面/组件 Checklist」

- [ ] **Step 1: 创建文件，写入 frontmatter**

```markdown
---
name: frontend-component
description: 新增或修改 React 组件、页面时使用。涵盖组件文件组织顺序、单一职责拆分（超300行）、props 下传 events 上抛、不在组件内直接调 API、具名+默认双导出、interface {Name}Props、入场动画交错延迟、加载骨架屏（不用 spinner）、错误 animate-shake、空状态、路由懒加载、TypeScript 严格规则、命名规范、错误边界、无障碍、lint/build/test。触发场景：加组件、加页面、改组件、新 tsx、卡片、按钮交互、骨架屏、错误状态、加路由、ErrorBoundary。
---
```

- [ ] **Step 2: 写「何时用 / 不用」段**

```markdown
## 何时用 / 不用

- **用**：在 `frontend/src/pages/` 或 `components/` 新增/修改组件、页面、路由。
- **不用**：纯调样式/套设计系统（→ `frontend-styling`）；改 store/数据流/API（→ `frontend-state-data`）。
- **常配合**：组件视觉模板（卡片/按钮/输入框）见 `frontend-styling`；组件读 store 的 selector 规则见 `frontend-state-data`。
```

- [ ] **Step 3: 写「核心铁则」段**

```markdown
## 核心铁则

1. 卡片基类固定：`bg-white/[0.55] backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border`。
2. 加载用骨架屏（`animate-pulse` + `bg-ink/5`），**不用 spinner**；错误用 `animate-shake` + `bg-pink/10`；空状态用斜体衬线。
3. 组件单一职责，超 **300 行**考虑拆分；props 下传、events 上抛；**不在组件内直接调 API**（走 store action）。
4. 同时提供 `export const` 具名导出和 `export default`；props 用 `interface {Component}Props`。
5. 不用 `any`、不用 `as`（除非充分理由 + 注释）；不在组件文件定义全局共享 interface（放 `store/types.ts`）。
6. 非首屏页面用 `React.lazy()` + `Suspense`；新增页面三步：建组件 → `App.tsx` 加 `<Route>` → `Sidebar` 加导航项，并确认 `NotFound` 兜底仍在。
7. 新增/改完跑 `npm run lint && npm run build && npm run test`。
```

- [ ] **Step 4: 写「模式与模板」段**

从 `frontend/FRONTEND_CONVENTIONS.md` 剪切粘贴：
- 「项目结构」→「组件文件组织」（文件内部顺序模板）
- 「组件规范」全部子段（组件类型、组件设计原则、入场动画、加载状态、错误状态、空状态）
- 「路由」全部子段
- 「TypeScript」全部子段
- 「命名规范」表 +「文件命名与组件对应」
- 「错误边界」
- 「无障碍」

- [ ] **Step 5: 写「Checklist」段**

从「新增页面/组件 Checklist」原样剪切粘贴（含新增页面与新增子组件两份）。该清单已含 lint/build/test 与测试要求，即为本 skill 承接的前端测试要求。

- [ ] **Step 6: 写「相关 skill / 文档」段**

```markdown
## 相关 skill / 文档

- 视觉模板（色彩/字体/卡片/按钮/动效） → `frontend-styling`
- store/selector/API/Zod → `frontend-state-data`
- 跨前后端加字段 → `add-persisted-field`
- 技术栈、目录结构 → `frontend/FRONTEND_CONVENTIONS.md`
```

- [ ] **Step 7: 验证**

按「通用验证手段」核对。

- [ ] **Step 8: Commit**

```bash
git add .claude/skills/frontend-component/SKILL.md
git commit -m "feat(skills): 添加 frontend-component 开发 skill"
```

---

## Task 6: 创建 `frontend-styling` skill

**Files:**
- Create: `.claude/skills/frontend-styling/SKILL.md`
- Source: `frontend/FRONTEND_CONVENTIONS.md`「设计系统」、「动效规范」、「响应式」、「性能」中样式相关项

- [ ] **Step 1: 创建文件，写入 frontmatter**

```markdown
---
name: frontend-styling
description: 套用 Soft Editorial 设计系统、调整样式、改配色或动效时使用。涵盖设计哲学、色彩 token（paper/ink/pink/lemon/blush/sage/lilac）与语义色映射、字体（font-display/font-body）与字号、毛玻璃卡片模板、按钮/输入框/Pill 模板、动效 class 与缓动函数、prefers-reduced-motion、响应式断点。触发场景：调样式、改颜色、改按钮、卡片样式、字体、动画、动效、配色、Tailwind class、响应式布局、好看一点。
---
```

- [ ] **Step 2: 写「何时用 / 不用」段**

```markdown
## 何时用 / 不用

- **用**：套用/调整视觉样式——配色、字体、卡片、按钮、输入框、Pill、动效、响应式布局。
- **不用**：组件结构/生命周期/状态（→ `frontend-component`）；数据流（→ `frontend-state-data`）。
```

- [ ] **Step 3: 写「核心铁则」段**

```markdown
## 核心铁则

1. 颜色**只通过 Tailwind class 使用，不硬编码 hex**（`bg-paper`/`text-ink`/`bg-pink`/`bg-lemon`/`bg-blush`/`bg-sage`/`bg-lilac`）。
2. 语义色固定映射：主操作 `lemon`/`sage`、次操作 `lilac`、危险/强调 `pink`；状态 pill 与卡片色点按既定表分配。
3. 标题用 `font-display italic` + 色点；正文/按钮/标签用 `font-body`。
4. 卡片、按钮、输入框、Pill 一律用文档中的统一 class 模板，不自创。
5. 动效只用既有 animate-* class + ease-out-expo 缓动（`cubic-bezier(0.22,1,0.36,1)`）；`prefers-reduced-motion` 已由 `index.css` 全局处理，组件层无需额外处理。
```

- [ ] **Step 4: 写「模式与模板」段**

从 `frontend/FRONTEND_CONVENTIONS.md` 剪切粘贴：
- 「设计系统」全部子段（设计哲学、色彩、字体、卡片、按钮、输入框、状态标签 Pill、内部内容区）
- 「动效规范」全部子段（可用动画、交错入场实现、缓动函数、prefers-reduced-motion）
- 「响应式」全部子段（断点策略、布局模式、Sidebar）

- [ ] **Step 5: 写「Checklist」段**

```markdown
## Checklist

- [ ] 颜色用 Tailwind class，无硬编码 hex
- [ ] 语义色映射正确（主/次/危险操作、状态 pill、卡片色点）
- [ ] 卡片/按钮/输入框/Pill 用统一模板 class
- [ ] 标题 `font-display italic` + 色点，正文 `font-body`
- [ ] 动效用既有 animate-* class 与 ease-out-expo 缓动
- [ ] 响应式按 `lg:` 断点处理单栏→双栏
```

- [ ] **Step 6: 写「相关 skill / 文档」段**

```markdown
## 相关 skill / 文档

- 组件结构与生命周期 → `frontend-component`
- 设计哲学完整背景 → `frontend/FRONTEND_CONVENTIONS.md`
```

- [ ] **Step 7: 验证**

按「通用验证手段」核对。

- [ ] **Step 8: Commit**

```bash
git add .claude/skills/frontend-styling/SKILL.md
git commit -m "feat(skills): 添加 frontend-styling 开发 skill"
```

---

## Task 7: 创建 `frontend-state-data` skill

**Files:**
- Create: `.claude/skills/frontend-state-data/SKILL.md`
- Source: `frontend/FRONTEND_CONVENTIONS.md`「状态管理」、「API 层」、「高频状态防抖」、「Settings 保存模式」；CLAUDE.md「健壮性」第 1 节（前端分层/store 拆分）、第 3 节（SSE 一致性前端侧）

- [ ] **Step 1: 创建文件，写入 frontmatter**

```markdown
---
name: frontend-state-data
description: 修改前端状态管理、数据流、API 调用时使用。涵盖 Zustand store 按领域拆 slice、store/index.ts 只组合、强制 selector 禁无 selector useStore、store/types.ts 共享类型、services/api.ts 只封装 HTTP、Zod schema 运行时校验、safeParseArray 用法、useDebounce 高频防抖、Settings draft+dirtyFields 自动保存、SSE 长任务进度状态。触发场景：改 store、加 slice、selector、Zustand、调 api.ts、Zod、schemas、防抖、debounce、Settings 保存、SSE 进度、loading 状态。
---
```

- [ ] **Step 2: 写「何时用 / 不用」段**

```markdown
## 何时用 / 不用

- **用**：改 `store/`、`services/api.ts`、`services/schemas.ts`、`hooks/useDebounce`，或处理长任务/SSE 进度状态。
- **不用**：组件结构/视觉（→ `frontend-component` / `frontend-styling`）。
- **注意**：跨前后端加字段的完整链路见 `add-persisted-field`。
```

- [ ] **Step 3: 写「核心铁则」段**

```markdown
## 核心铁则

1. **强制使用 selector，禁止无 selector 的 `useStore()`**（订阅整个 store 会全量重渲染）。
2. 接口类型统一在 `store/types.ts`；`store/index.ts` 只创建 `useStore` 并组合 slice；业务 action 放领域 `*Slice.ts`。
3. `services/api.ts` 只封装 HTTP（baseURL `/api`、timeout 300000、全局拦截器），**不做状态管理或数据组合**。
4. Zod schema 命名 `{Domain}Schema`；`safeParseArray()` 只用于列表接口；详情/设置类解析失败应保留旧 state 或显式报错，不静默写半可信数据。
5. 长任务进度放对应领域 slice（如 `transcribeProgress`）；SSE 收到失败事件必须落到可重试状态。
6. 高频状态（slider/resize）用 `useDebounce`；Settings 用 draft + dirtyFields + onBlur/debounce 自动保存 + 顶部批量兜底。
```

- [ ] **Step 4: 写「模式与模板」段**

从 `frontend/FRONTEND_CONVENTIONS.md` 剪切粘贴：「状态管理」全部子段、「API 层」全部子段、「高频状态防抖」、「Settings 保存模式」。补充 CLAUDE.md 第 1 节中前端 store 按领域拆分、第 3 节中前端 SSE 失败可重试的要点。

- [ ] **Step 5: 写「Checklist」段**

```markdown
## Checklist

- [ ] store 读取一律用 selector，无裸 `useStore()`
- [ ] 新增类型加到 `store/types.ts`，action 放对应 `*Slice.ts`
- [ ] 新增 API 调用放 `services/api.ts`，按域导出
- [ ] 新增/改字段同步 `services/schemas.ts` 的 Zod schema
- [ ] 长任务有 loading/error 状态，SSE 失败可重试
- [ ] Settings 新增字段：同步 types/defaults/SettingsSchema/Settings.tsx/settingsDraft.test.ts
```

- [ ] **Step 6: 写「相关 skill / 文档」段**

```markdown
## 相关 skill / 文档

- 组件如何消费 store → `frontend-component`
- 跨前后端加字段完整流程 → `add-persisted-field`
- 后端 SSE 推送侧 → `backend-service`
```

- [ ] **Step 7: 验证**

按「通用验证手段」核对。

- [ ] **Step 8: Commit**

```bash
git add .claude/skills/frontend-state-data/SKILL.md
git commit -m "feat(skills): 添加 frontend-state-data 开发 skill"
```

---

## Task 8: 创建 `add-persisted-field` skill（跨栈编排）

**Files:**
- Create: `.claude/skills/add-persisted-field/SKILL.md`
- Source: CLAUDE.md「数据持久化开发规范」→「新增持久化字段的 Checklist」；「健壮性」第 5 节（前后端契约）

- [ ] **Step 1: 创建文件，写入 frontmatter**

```markdown
---
name: add-persisted-field
description: 新增一个贯穿前后端的持久化字段或业务概念时使用。编排 schema→迁移→Store→路由→api.ts→types.ts→schemas.ts→slice→UI 的完整 7 步链路，保证前后端契约不漂移、共享类型不用裸 any。触发场景：加字段、加持久化字段、加设置项、新增数据库列并要前端展示、前后端契约、贯穿前后端、加一个属性。
---
```

- [ ] **Step 2: 写「何时用 / 不用」段**

```markdown
## 何时用 / 不用

- **用**：一个数据需要同时落库、经路由暴露、前端消费/展示（典型：给 broadcast 加字段、加一个 Settings 项）。
- **不用**：纯后端字段不上前端（只需 `backend-database`）；纯前端局部 state（只需 `frontend-state-data`）。
- **本 skill 是编排器**：每一步的细则跳到对应 skill。
```

- [ ] **Step 3: 写「核心铁则」段**

```markdown
## 核心铁则

1. 共享业务概念（`Broadcast`/`Segment`/`VoiceConfig`/`Settings`/SSE payload）**必须有稳定类型，不得裸 `any`**。
2. 后端新增字段后**必须**按固定顺序同步全链路，任一环漏掉都会造成契约漂移。
3. 前端默认值/状态枚举/参数名不得与后端不一致；默认值来自 settings 或统一常量。
```

- [ ] **Step 4: 写「模式与模板」段（编排步骤）**

```markdown
## 模式与模板

按顺序执行，每步细则见对应 skill：

1. `backend/src/db/schema.sql` — 更新表定义 → 见 `backend-database`
2. `backend/src/db/index.js` — 加 ALTER TABLE 迁移（带 DEFAULT）→ 见 `backend-database`
3. `backend/src/services/*Store.js` — DAL 层 CRUD 读写新字段 → 见 `backend-database`
4. `backend/src/routes/*.js` — 路由响应/入参带上新字段 → 见 `backend-route`
5. `frontend/src/services/api.ts` — API 调用类型/参数 → 见 `frontend-state-data`
6. `frontend/src/store/types.ts` — 共享类型加字段 → 见 `frontend-state-data`
7. `frontend/src/services/schemas.ts` — Zod schema 加字段 → 见 `frontend-state-data`
8. `frontend/src/store/*Slice.ts` — store action/状态 → 见 `frontend-state-data`
9. `frontend/src/pages|components/*.tsx` — UI 展示与交互 → 见 `frontend-component`

> Settings 字段额外同步 `store/defaults.ts` 与 `settingsDraft.test.ts`。
```

- [ ] **Step 5: 写「Checklist」段**

从 CLAUDE.md「新增持久化字段的 Checklist」原样剪切粘贴（7 项），并补充「健壮性」第 5 节后端新增字段需同步的 6 处列表。

- [ ] **Step 6: 写「相关 skill / 文档」段**

```markdown
## 相关 skill / 文档

- 各步细则 → `backend-database` / `backend-route` / `frontend-state-data` / `frontend-component`
- 持久化分层与生命周期背景 → `CLAUDE.md` 数据持久化章节
```

- [ ] **Step 7: 验证**

按「通用验证手段」核对，并确认 9 步链路文件路径与 spec 一致。

- [ ] **Step 8: Commit**

```bash
git add .claude/skills/add-persisted-field/SKILL.md
git commit -m "feat(skills): 添加 add-persisted-field 跨栈编排 skill"
```

---

## Task 9: 创建 `convention-skills` 治理元 skill（含 registry）

**Files:**
- Create: `.claude/skills/convention-skills/SKILL.md`
- Source: 本计划 spec 第 4 节

- [ ] **Step 1: 创建文件，写入 frontmatter**

```markdown
---
name: convention-skills
description: 新建、修改、拆分、退役或周期体检本项目的开发规范 skill（backend-*/frontend-*/add-persisted-field）时使用。维护 skill registry、规定何时更新 skill、更新协议、健康度评价标准。触发场景：新建 skill、改规范 skill、skill 太大要拆、skill 过时、skill 体检、skill 健康度、规范 skill 索引、引入新模式后同步规范。
---
```

- [ ] **Step 2: 写「何时用」段**

```markdown
## 何时用

- 开发中产生**新模式/新路由族/新组件类型/新持久化套路**，需要把约定沉淀进某个业务 skill 时。
- 新建/拆分/退役一个 convention skill 时。
- 周期性给所有 convention skill 做健康体检时。

> 编写 SKILL.md 的通用机制复用 `writing-skills` / `skill-creator`；本 skill 只加项目专属治理规则。
```

- [ ] **Step 3: 写「维护触发点 + 更新协议」段**

```markdown
## 维护触发点

开发引入新约定时，**必须**更新对应业务 skill，而非只写在代码里。这取代了旧的"开发后同步规范文档"硬性要求。

## 更新协议

改一个业务 skill 时三处同步：
1. SKILL.md 正文（规则/模板/Checklist）
2. frontmatter 的 `description`（新触发词、新涉及文件名）
3. 下方 registry 与 `CLAUDE.md` 路由表（若边界变化）

规则单一归属：一条规则只在一个 skill；跨 skill 用链接引用，不复制。
```

- [ ] **Step 4: 写「registry」段**（治理索引，本表为权威清单）

```markdown
## Registry（权威清单）

| skill | 负责任务 | 迁移来源 | last_reviewed | 健康 |
|-------|---------|---------|--------------|------|
| backend-route | 路由端点 | BACKEND「路由/错误处理/参数校验/响应格式」 | 2026-06-13 | ✅ |
| backend-service | 服务/外部 API | BACKEND「服务层规范」+ CLAUDE 健壮性2/4 | 2026-06-13 | ✅ |
| backend-database | schema/迁移/DAL | BACKEND「数据库规范」+ CLAUDE 迁移规范 | 2026-06-13 | ✅ |
| backend-testing | 后端测试 | BACKEND「测试规范」+ CLAUDE 健壮性6 | 2026-06-13 | ✅ |
| frontend-component | 组件/页面 | FRONTEND「组件/路由/TS/命名/无障碍/测试」 | 2026-06-13 | ✅ |
| frontend-styling | 样式/设计系统 | FRONTEND「设计系统/动效/响应式」 | 2026-06-13 | ✅ |
| frontend-state-data | 状态/数据流 | FRONTEND「状态管理/API/防抖/Settings」+ CLAUDE 健壮性1/3 | 2026-06-13 | ✅ |
| add-persisted-field | 跨栈加字段 | CLAUDE「持久化 Checklist」+ 健壮性5 | 2026-06-13 | ✅ |
```

- [ ] **Step 5: 写「健康度 rubric + 生命周期」段**

```markdown
## 健康度 rubric

| 维度 | 健康标准 |
|------|---------|
| 触发健康 | description 触发词充分；与其他 skill 描述无重叠误触发 |
| 体量健康 | SKILL.md ≤ ~200 行（超了拆分）；不过短漏覆盖 |
| 新鲜度 | 规则与当前代码无漂移；last_reviewed 不过期 |
| 无重复 | 同一规则只在一处 |
| 覆盖完整 | Checklist 覆盖成功/失败/边界 |
| 索引一致 | CLAUDE.md 路由表、registry、`.claude/skills/` 目录三者对得上 |

## 生命周期操作

- **新建**：出现全新任务类型时，建 `.claude/skills/<name>/`，补 registry 与 CLAUDE.md 路由表。
- **拆分**：skill 超阈值时按子任务拆，迁移规则、更新两索引。
- **退役**：过时 skill 删除并清两索引。
- **周期体检**：按上表逐 skill 打分，输出健康报告，更新 last_reviewed。
```

- [ ] **Step 6: 验证**

按「通用验证手段」核对；确认 registry 列出 8 个业务 skill。

- [ ] **Step 7: Commit**

```bash
git add .claude/skills/convention-skills/SKILL.md
git commit -m "feat(skills): 添加 convention-skills 治理元 skill"
```

---

## Task 10: 瘦身 `backend/BACKEND_CONVENTIONS.md`

**Files:**
- Modify: `backend/BACKEND_CONVENTIONS.md`

- [ ] **Step 1: 删除已迁移章节，替换为索引行**

删除以下章节正文，每处替换为一行索引：
- 「路由规范」→ `> 路由开发规则（定义模式/校验/错误处理/状态码/响应格式）见 skill：backend-route`
- 「服务层规范」→ `> 服务层与外部 API 规则见 skill：backend-service`
- 「数据库规范」→ `> 数据库/迁移/DAL 规则见 skill：backend-database`
- 「错误处理」「参数校验」「响应格式」→ 合并一行 `> 错误处理/参数校验/响应格式见 skill：backend-route`
- 「测试规范」→ `> 测试规则见 skill：backend-testing`
- 末尾「新增路由/服务 Checklist」→ `> 各任务 Checklist 已并入对应 skill（backend-route/service/database/testing）`

**保留不动**：技术栈、项目结构、目录结构规则、文件职责、命名规范、代码风格、「已解决技术债」。

- [ ] **Step 2: 更新顶部「目录」**

把目录中已删章节项替换为指向 skill 的说明项，保留仍存在的章节锚点。

- [ ] **Step 3: 验证**

```bash
grep -nE '^## ' backend/BACKEND_CONVENTIONS.md
```
Expected: 只剩「技术栈/项目结构/文件职责/命名规范/代码风格/已解决技术债」等保留章节标题；被迁移章节不再以 `## ` 出现，但有 `>` 索引行。

- [ ] **Step 4: Commit**

```bash
git add backend/BACKEND_CONVENTIONS.md
git commit -m "docs: 后端规范瘦身，规则章节迁移至 skill"
```

---

## Task 11: 瘦身 `frontend/FRONTEND_CONVENTIONS.md`

**Files:**
- Modify: `frontend/FRONTEND_CONVENTIONS.md`

- [ ] **Step 1: 删除已迁移章节，替换为索引行**

删除以下章节正文，每处替换为一行索引：
- 「设计系统」→ `> 设计系统/色彩/字体/卡片/按钮模板见 skill：frontend-styling`
- 「组件规范」→ `> 组件结构/生命周期/状态见 skill：frontend-component`
- 「状态管理」「API 层」→ `> 状态管理/API/Zod 见 skill：frontend-state-data`
- 「路由」「TypeScript」「错误边界」「无障碍」→ `> 路由/TS/错误边界/无障碍见 skill：frontend-component`
- 「动效规范」「响应式」→ `> 动效/响应式见 skill：frontend-styling`
- 「高频状态防抖」「Settings 保存模式」→ `> 防抖/Settings 保存见 skill：frontend-state-data`
- 「质量门禁与测试」「性能」→ `> 测试与性能要求已并入 frontend-component / frontend-state-data 的 Checklist`
- 末尾「新增页面/组件 Checklist」→ `> 页面/组件 Checklist 见 skill：frontend-component`

**保留不动**：技术栈、项目结构（含文件职责表）、命名规范。
**特例**：「项目结构」下的「组件文件组织」子段已迁入 frontend-component，此处删除并留索引。

- [ ] **Step 2: 更新顶部「目录」**

同 Task 10 Step 2。

- [ ] **Step 3: 验证**

```bash
grep -nE '^## ' frontend/FRONTEND_CONVENTIONS.md
```
Expected: 只剩「技术栈/项目结构/命名规范」等保留章节；其余为 `>` 索引行。

- [ ] **Step 4: Commit**

```bash
git add frontend/FRONTEND_CONVENTIONS.md
git commit -m "docs: 前端规范瘦身，规则章节迁移至 skill"
```

---

## Task 12: 瘦身 `CLAUDE.md` 并加路由表

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: 在「⚠️ 开发规范强制要求」之后插入路由表**

```markdown
## 开发前必读：任务 → skill 路由

开始任何开发前，先按下表调用对应 skill（`Skill` 工具），不要全量读规范文档：

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

> skill 是 Claude Code 专属机制（`.claude/skills/`）。非 Claude agent 无法发现 skill，仍按 `CONVENTIONS.md` 中的索引行查阅对应规则。
```

- [ ] **Step 2: 改写「⚠️ 开发规范强制要求」段**

- 「开发前 1. 先读规范文档」→ 改为「先按上方路由表调用对应 skill；技术栈/目录/命名等背景仍在 `CONVENTIONS.md`」。
- 「开发后 6. 同步规范文档」→ 改为「开发后若产生新约定 → 调 `convention-skills` 判断更新哪个 skill，并同步其 description / Checklist / registry / 路由表」。

- [ ] **Step 3: 瘦身「健壮性与可维护性开发规范」**

该大节内容去向：
- 第 1 节「分层边界」：后端部分→已在 backend-route/service/database；前端部分→frontend-component/state-data。此处压缩为一句铁律 + 指向路由表。
- 第 2 节「外部 API 必须隔离失败」→ 已入 backend-service。保留铁律句：批量 TTS 串行不并发、不全局关 TLS。
- 第 3 节「长时间任务与状态一致性」→ 后端 SSE 推送入 backend-service、前端进度入 frontend-state-data。保留一句概述。
- 第 4 节「SQLite 与音频文件一致性」→ 已入 backend-service/database。保留 `cleanAudioFile` 铁律句。
- 第 5 节「前后端契约」→ 已入 add-persisted-field。保留"共享类型不裸 any"铁律句。
- 第 6 节「测试与进程生命周期」→ 已入 backend-testing。保留 `NODE_ENV=test` 内存库、app.js 只导出两条铁律句。
- 第 7 节「可维护性红线」→ **整段保留**（这是铁律：单文件拆分阈值、不引新依赖、不留临时兼容、文档优先）。

将第 1–6 节压缩为一个简短「不可协商的铁律」清单（每条一句），第 7 节保留。

- [ ] **Step 4: 瘦身「数据持久化开发规范」**

- 「原则」「数据存储分层」「音频文件生命周期」→ **保留**（背景 + 生命周期是常驻知识）。
- 「数据库迁移规范」→ 已入 backend-database，压缩为一句指向。
- 「前端设置持久化流程」→ 已入 frontend-state-data，压缩为一句指向。
- 「新增持久化字段的 Checklist」→ 已入 add-persisted-field，替换为 `> 完整流程见 skill：add-persisted-field`。

- [ ] **Step 5: 验证**

```bash
wc -l CLAUDE.md
grep -n "skill：" CLAUDE.md; grep -n "backend-route\|frontend-component\|convention-skills" CLAUDE.md
```
Expected: 行数明显下降；路由表存在；保留了铁律清单与第 7 节红线、持久化原则与生命周期。

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md 瘦身，加任务→skill 路由表与铁律清单"
```

---

## Task 13: 全局校验（零内容丢失 + 触发抽样）

**Files:**
- 只读核对，无修改（如发现遗漏则回到对应任务补）

- [ ] **Step 1: 零内容丢失核对**

对照 git 历史，逐条确认旧规范中的每个规则点都有归宿（在某 skill 或仍在 CONVENTIONS/CLAUDE）。瘦身前的版本是各文件**最近一次瘦身提交**的父提交，用 git log 定位后导出：

```bash
# 取每个文件“瘦身提交”的父提交内容（即瘦身前的完整版）
git show "$(git log -1 --format=%H -- backend/BACKEND_CONVENTIONS.md)^:backend/BACKEND_CONVENTIONS.md" > /tmp/old_backend.md
git show "$(git log -1 --format=%H -- frontend/FRONTEND_CONVENTIONS.md)^:frontend/FRONTEND_CONVENTIONS.md" > /tmp/old_frontend.md
git show "$(git log -1 --format=%H -- CLAUDE.md)^:CLAUDE.md" > /tmp/old_claude.md
```
逐章节比对：旧文档每个 `###` 子段，要么仍在保留文档，要么能在某 SKILL.md 找到对应内容。列出任何无归宿项并补回。

- [ ] **Step 2: skill 自检**

```bash
for f in .claude/skills/*/SKILL.md; do echo "== $f =="; head -4 "$f"; wc -l "$f"; done
```
Expected: 9 个 skill 都有合法 frontmatter；每个行数在合理范围（提醒：超 ~200 行的考虑后续拆分，记入 convention-skills 体检）。

- [ ] **Step 3: 触发抽样（人工）**

新开会话或在当前会话用以下 prompt 验证 agent 能命中正确 skill（确认 available-skills 列表已含这些项）：
- "帮我给 broadcast 加一个路由端点" → 期望命中 `backend-route`
- "把保存按钮改成绿色" → 期望命中 `frontend-styling`
- "给 settings 加一个持久化字段并在前端展示" → 期望命中 `add-persisted-field`
- "这些规范 skill 怎么维护" → 期望命中 `convention-skills`

如未命中，回到对应 skill 强化 `description` 触发词。

- [ ] **Step 4: 最终确认提交**

若有补漏修改，逐个 commit；无修改则本任务无需提交。确认 `git status` 干净。

---

## 完成标准

- `.claude/skills/` 下有 9 个 SKILL.md，frontmatter 合法、四段齐全。
- `CLAUDE.md` 含任务→skill 路由表与铁律清单，行数明显下降，第 7 节红线与持久化原则/生命周期保留。
- 两份 CONVENTIONS.md 仅保留背景章节 + 指向 skill 的索引行。
- 零规则丢失（Step 1 核对通过）。
- 触发抽样命中正确 skill。
- 全程未改动 `backend/`、`frontend/` 源码，无新依赖。
