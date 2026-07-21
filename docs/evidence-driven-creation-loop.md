# 证据驱动创作闭环：产品与技术决策

> 状态：本阶段实施契约
> 目标：用最小范围打通「原始材料 → 可核验证据 → 提纲 → 带引用主稿」，同时保留完整人工路径。

## 1. 当前能力审计

审计基线为分支 `codex/content-project-foundation` 的提交 `c39813b`；以下“当前断点”描述的是本阶段实施前状态，合入后以本文件后续契约和 `docs/project-facts.md` 为准。

### 已有且应继续复用

- `content_projects` 已经是创作聚合根，Brief 能保存受众、目标、角度、语气、创作者实践与判断。
- `content_sources` 保存原始文本，项目通过关联表引用来源；来源正文不会被摘要覆盖。
- `content_artifacts` 与不可变 `content_artifact_revisions` 已经能承载提纲、主稿、平台稿和口播稿。
- `broadcasts.artifact_revision_id` 已经能把口播 Revision 与音频 Render 精确关联。
- 播客 Segment 是不可变 ASR 事实，观点摘录和时间由后端事实派生；这一原则可复用于内容证据。
- LLM 已统一经过 `mimo.createLlmMessage()` 和全局 `llmQueue`；SSE、任务 lease 与前端长任务状态已有可复用模式。
- `ModalShell`、统一状态反馈和 Warm Workbench / Soft Editorial 设计系统可以承载来源阅读、引用核验与里程碑反馈。

### 当前断点

- Source 与 Revision 之间没有通用 Evidence 层，成稿无法回答具体用了哪一段原文。
- UI 会把播客整张 AI 观点卡称为“证据”，混淆后端派生的原文摘录和模型推断。
- 没有“候选 → 采用 / 驳回 / 修正”的编辑决策，AI 提取结果可能直接获得事实地位。
- 没有提纲确认点，也没有 Revision 与证据的结构化引用关系。
- Artifact / Revision 创建缺少面向重复请求的业务幂等键；刷新、多标签页和超时重试可能重复生成版本。
- 通用 Source 类型可由客户端任意声明，看似已接入 URL、AI HOT 或 Transcript，实际只是手工文本。
- 观点删除存在引用级联风险：删除已被内容项目引用的 Claim 会静默丢失研究成果。
- 来源编辑草稿未完整进入离开页面保护；长来源正文直接铺在工作区，增加认知负担。

## 2. 第一性原理判断

### 首要用户场景

创作者已经有一批采访、研究笔记或粘贴材料，希望写出一篇有自己判断、且能回到原文核验的主稿。用户需要的是缩短“读材料、挑依据、搭结构”的时间，不是一次生成更多文本。

### 最大瓶颈

瓶颈依次是：

1. **选择**：什么材料真正支持本次表达；
2. **组织**：这些证据和个人判断如何形成结构；
3. **核验**：模型有没有篡改、拼接或越界引用；
4. **写作**：在已确认结构上完成表达。

采集入口不足是次要问题，平台适配更靠后。若先扩充采集或平台按钮，只会把更多未经选择的材料和更多不可解释的稿件带进工作台。

### 最小可用闭环

```text
用户粘贴材料（未自动核验）
  → 后端保存原文快照并切出确定片段
  → AI 只提出片段索引和候选说明
  → 后端从原文派生摘录
  → 用户采用、驳回或基于原文修正证据
  → 用户手写或 AI 辅助生成提纲
  → 用户明确选择某个提纲 Revision
  → 生成带合法引用的主稿
  → 保存新的不可变 Revision
  → 用户继续手工修改或进入既有口播 / TTS 链路
```

任何 AI 步骤失败时，来源、证据选择、提纲草稿和上一版 Revision 都保留；用户可跳过 AI，手工完成整条路径。

实施按三个可独立验收的纵向切片推进：

1. 核心人工闭环：Source → 手工 Evidence → 手工 Outline → 手工带引用 Master；
2. 选择增强：AI 候选 Evidence，但采用仍由用户决定；
3. 组织与写作增强：AI Outline / Master 共用同一 Job、校验与 Revision 基础设施。

本阶段纳入第三片是为了真实验证“选中的 Evidence 能否穿过结构并成为可追溯成稿”，而不是为了增加两个按钮；任一 AI operation 都可失败或停用，第一片仍必须完整可用。

## 3. 候选能力比较

评分为 1（低）到 5（高）；风险列越高越不利。

| 能力 | 用户价值 | 频率 | 认知负担 | 实现成本 | 数据风险 | 幻觉风险 | 架构影响 | 本阶段决定 |
|---|---:|---:|---:|---:|---:|---:|---|---|
| 用户粘贴文本快照 | 5 | 5 | 1 | 1 | 2 | 1 | 扩展 Source 校验、哈希与幂等账本 | 实现；明确未抓取、未核验 |
| 候选证据提取与确认 | 5 | 5 | 3 | 4 | 4 | 5 | 新增 Fragment / Evidence / Job | 核心实现 |
| Brief + 判断 + 证据生成提纲 | 5 | 4 | 2 | 3 | 4 | 3 | 复用 Artifact，增加 provenance | 核心实现，保留手写 |
| 从确认提纲生成带引用主稿 | 5 | 4 | 2 | 4 | 4 | 5 | 新增 Citation 与结构块编译 | 核心实现 |
| AI HOT 加入项目 | 4 | 3 | 2 | 3 | 2 | 2 | 新来源适配器 | 延后到来源适配器 |
| Transcript / Claim 加入项目 | 4 | 3 | 3 | 4 | 4 | 4 | 跨聚合生命周期 | 延后，先修引用删除保护 |
| 自动抓取网页链接 | 4 | 4 | 2 | 5 | 5 | 3 | 抓取沙箱、快照与版权策略 | 延后，避免 SSRF / 版权 / 变更快照问题 |
| 批量平台版本 | 3 | 3 | 4 | 4 | 2 | 4 | 新生成 operation / UI | 延后，先证明主稿可靠 |
| 平台 Revision 管理 | 4 | 3 | 2 | 2 | 1 | 2 | 直接复用 Artifact / Revision | 继续复用现有模型，不新增平台表 |
| 口播 Revision 精确关联 TTS | 4 | 3 | 1 | 1 | 2 | 1 | 既有 Render seam | 保留既有能力，不改链路 |

这些分数是基于当前代码与工作流的产品假设，不是用户研究结论；其中“数据风险”包含把采访、笔记等原文发送给外部模型的风险。上线反馈应优先验证“选择与核验是否真是最大瓶颈”，再调整后续投入。

## 4. 领域关系与责任边界

```text
ContentProject
├── Brief
│   ├── intent：受众 / 目标 / 角度 / 语气
│   └── creator input：个人实践 / 个人判断
├── Source（不可被 AI 覆盖的原始资产）
│   └── deterministic Fragment（由后端切分和定位）
│       └── EvidenceCard（编辑决策 × 技术生命周期）
├── Artifact:outline
│   └── immutable Revision
├── Artifact:master
│   └── immutable Revision
│       └── Citation → EvidenceCard → Source Fragment
└── Artifact:audio_script / platform
    └── immutable Revision → optional Render
```

- **Source** 回答“用户交给系统的原材料是什么”。用户粘贴快照与自填 URL 不等于系统完成事实核查或网页抓取。
- **Fragment** 回答“原文的确定位置是什么”，不承载模型判断。
- **EvidenceCard** 回答“本次创作为什么可能使用这段原文”；AI 说明始终标为 AI 提取，用户说明单独保存。
- Evidence 的编辑决策与技术生命周期是正交的：`decision_state` 记录候选 / 采用 / 驳回，`lifecycle_status` 记录 active / stale / superseded。来源移出或创建修正版只改变生命周期，不抹掉用户曾经的判断。
- **Creator input** 只来自用户填写的 Brief；模型不得替用户编造经验。
- **Outline / Master** 都是 Artifact 的不可变 Revision，而不是临时覆盖字段。
- **Citation** 绑定 Evidence，而 Evidence 最终绑定 Source 快照、片段范围和后端派生原文。正文标记只是可读投影，数据库关系才是事实。

## 5. 自动化边界

### AI 可以自动做

- 只对用户在本次任务中明确勾选、并被告知会发送给外部模型的 Source，在片段白名单内提出值得关注的片段索引及“为什么可能有用”的候选说明。
- 基于 Brief、用户明确填写的实践 / 判断和已采用证据，提出提纲草案。
- 基于用户明确选择的提纲 Revision 与 Evidence ID 生成主稿结构块。
- 生成明确标注的推断段落；推断可在 provenance 中记录 supporting Evidence，但不能把这种支持关系显示成来源原话或直接引用。

### 必须由用户决定

- 哪些候选证据被采用、驳回或修正。
- 哪些个人经验与判断进入上下文；请求显式携带 `creator_input_keys`，后端只从当前 Brief 取这些字段的精确快照。
- 使用哪个提纲 Revision 生成主稿。
- 是否接受、修改或放弃生成结果，以及使用哪个 Revision 继续。AI Job 会把输出保存成可追踪、不可变的 `ai_generated` 草案 Revision，但“已保存”不表示用户接受；用户选择确切 outline Revision 生成主稿即是显式确认输入。
- AI 主稿是否进入输出阶段。`ai_generated` 主稿只能审阅；用户必须显式保存一个人工后继 Revision，复制、下载和准备口播才解锁。
- 是否继续派生平台稿或口播稿。

### 明确禁止

- 让模型直接返回可信摘录、offset、Source 所属关系或时间码。
- 把 AI 的解释、总结、因果关系或价值判断显示为来源原话。
- 没有已采用证据时生成“有引用的主稿”。
- 根据项目里没有填写的字段补写“我的经历”“我亲自验证过”等第一人称事实。
- 把保存配置、收到 HTTP 202 或播放庆祝动画当成业务已完成。

这里的“来源原文 / 来源陈述”只证明某个 Source 出现过这段文字，不等于客观事实已被核验。产品固定使用四类标签：`来源原文`、`AI 候选说明（待核对）`、`AI 推断（待核对）`、`创作者输入 / 判断`。候选阶段称“候选摘录”，只有用户采用后才进入写作证据集合。

## 6. 引用、校验与 stale 规则

### 引用粒度

引用绑定到“确定 Source 快照中的连续 Fragment 范围”，并冗余后端派生摘录用于历史核验。只绑定整篇来源太粗，允许模型用无关段落支撑结论；直接信任模型字符 offset 又容易越界或篡改。

### 创建时校验

- Source 必须仍属于当前 Project；Evidence、Outline Revision 与 Artifact 必须属于同一 Project。
- 片段 index 必须存在、连续且顺序合法；offset 和 excerpt 只由后端计算。
- AI 输出经过严格 JSON schema 与语义白名单校验；越界、跨项目、伪造 ID、空数组和重复项都失败，不自动放宽。
- 主稿引用只接受请求中明确选择、`decision_state=selected` 且 `lifecycle_status=active` 的 Evidence ID。
- 后端根据结构化内容写入可读引用标记，并在同一事务写 Revision 与 Citation；客户端不能伪造合法关系。
- 创作者输入只按请求中的允许字段 key 由后端从当前 Brief 精确插入，并把 key、值快照或哈希写入 provenance；不接受模型声称的新增个人经历。

### 失效规则

- 已保存 Revision 永不被自动修改或删除，历史 Citation 继续指向创建时的证据快照。
- Source 从项目移除后，原 Source 和历史 Citation 保留；Evidence 的 `decision_state` 保持不变，`lifecycle_status` 变为 stale，不能参与新生成。
- 创建修正版 Evidence 时，旧卡保留原 `decision_state`，只把 `lifecycle_status` 置为 superseded。
- 历史 Citation 的快照完整性只由创建时 excerpt / Source hash 是否仍能核对决定；当前 Source 是否仍关联、Evidence 是否仍采用另以 `source_linked` / `reuse_eligible` 展示，不能把历史引用追溯性改写成“当时无效”。
- Brief、证据选择或提纲变化只让尚未完成或新请求的上下文指纹变化；旧 Revision 不自动失效，但界面可以提示其依据当前是否仍建议复用。
- AI 说明可以放弃和重建；用户修正通过新 Evidence 取代旧卡，不原地改写历史事实。
- 生成过程中上下文发生变化时，旧 worker 即使返回也不能收口为新 Revision。

### 错误发现与修正

- 证据卡同时展示“用户粘贴原文摘录（未核验）”“AI 候选说明”“用户备注 / 修正”，三者视觉和标签分开。Evidence 用户备注本阶段只在本地保存，不进入 AI 上下文；若要用于生成，用户需把判断写入 Brief 并在任务前显式勾选。
- 点击引用打开来源阅读层并定位相关片段；无法定位时明确显示引用失效，不用相似文本静默替换。
- 用户可驳回候选、重新选择连续片段创建人工证据，或创建修正版 Evidence；历史版本仍可解释。

## 7. 用户流程与界面架构

工作区保持一个项目页面，不强制用户完成多步骤向导。四个任务区按当前需要展开：

1. **Brief**：先说明创作意图和个人输入；可随时编辑，未保存时阻止依赖它的 AI 生成。
2. **来源与证据**：粘贴原文、在阅读层查看完整内容、提取候选、人工选择片段、采用 / 驳回 / 修正；URL 固定标注“用户填写，未抓取 / 未核验”。
3. **结构**：手写提纲始终可用；AI 提纲完成时保存为可追踪的 `ai_generated` 草案 Revision，但不代表用户接受。用户明确选择某个 Revision（或先编辑另存新版）后，它才成为主稿输入。
4. **成稿与输出**：明确显示本次使用的提纲版本和 Evidence；AI 生成后先保存为待审阅主稿草案，用户显式人工保存确认版后才开放复制、下载、口播和 TTS 入口。内部引用 marker 在输出投影中转换为人类可读编号与依据列表，不改写 Revision。

页面默认只突出当前最可能的下一动作，同时保留“跳过 AI 手工写”的入口，避免变成长而不可逆的流水线。长 Source 放入 `ModalShell` 阅读，列表只显示摘要、状态和操作。桌面端让证据列表与核验区并排；窄屏改为单列，操作栏不遮挡正文。

### 完整操作与恢复路径

1. 用户填写 Brief；个人实践 / 判断默认不外发，只有在 AI 任务前勾选的字段会进入上下文。
2. 用户粘贴非空原文并可填写线索 URL。保存成功后 Source 卡显示“用户粘贴快照已保存（未自动核验）”；URL 固定显示“用户填写，未抓取 / 未核验”。URL-only 兼容记录显示“待补原文”，不可提取证据或触发首来源里程碑。
3. 用户打开来源阅读层。可以直接选择连续 Fragment 创建人工 Evidence，也可以勾选具体 Source 后启动 AI 提取；提交前明确提示这些原文将发送给当前外部模型。
4. 提取任务排队 / 运行时，用户仍可阅读、手工选证据或编辑 Brief；任务失败保留全部输入并用同一逻辑请求重试。候选只显示来源原文和 AI 候选说明，不自动采用。
5. 用户采用、驳回或创建修正版 Evidence。修正版不改旧卡；来源解除只影响新生成资格。用户可改变 active 卡的编辑决策，但不能复活 stale / superseded 卡。
6. 用户手写并保存 Outline Revision，或启动 AI 提纲任务。AI 输出保存为“待审阅草案 Revision”；用户选择版本时必须能先预览其确切正文与 provenance，可直接选择它，也可编辑后保存一个新 Revision。
7. 主稿生成按钮只有在明确选择一个 outline Revision、至少一条 selected + active Evidence、没有相关未保存草稿，并确认要带入的 creator input keys 后可用。请求提交这些确切 ID；上下文变化导致旧任务无法收口。
8. AI 主稿成功后原子保存 `ai_generated` Revision、Citation 和 provenance；失败不创建空版本，也不能覆盖用户未保存草稿。用户手工审阅正文 / 引用标记并显式保存子 Revision后，输出动作才解锁。
9. 当前或历史主稿 Revision 都能打开自己的 Citation / provenance 核验面板；点击引用通过历史授权打开 Source 上下文并定位 Fragment。发现错误时，用户创建修正版 Evidence，再从旧主稿创建新 Revision；旧 Revision 与旧 Citation 保持不可变。
10. 用户可把确认后的主稿继续派生为既有 `audio_script` Revision，再沿现有 TTS Render 关联生成音频。本阶段不自动发布或批量平台改写。

### 关键界面状态矩阵

| 区域 | Empty / Disabled | Loading / Progress | Error / Retry | Success / Dirty / Confirmation |
|---|---|---|---|---|
| Brief | 未填写时给最小示例；不阻止手工写 | 保存按钮保留宽度与阶段文字 | 保留本地草稿，允许原值重试 | dirty 进入离开保护；保存只做微反馈 |
| Source | 无原文时突出粘贴入口；URL-only 禁用提取 | 保存 / 解除关联有局部状态 | 原文与表单不清空；重试复用 request key | 长原文在 Modal；解除前确认，历史引用不删除 |
| Evidence | 无 Fragment 给手工补原文动作；无 selected 时禁用 AI 主稿 | Job 显示真实 phase / progress | AI 失败仍可人工创建；上下文变化解释原因 | decision 与 lifecycle 双标签；修正创建新卡 |
| Outline | 无大纲时手写编辑器始终可用；dirty 时禁用 AI | AI 草案显示 queued / running，健康进度不被固定短超时切断 | 失败在 operation 清空后仍可见，保留手写内容和旧 Revision | AI 草案标待审阅；选择 exact Revision 时预览正文与 provenance |
| Master / Citation | 缺 outline、active selected Evidence 或存在未保存主稿时说明缺什么 | 生成进度可刷新收敛；运行中保护目标草稿 | 失败不覆盖旧稿；引用冲突定位到具体 ID | AI 草案需人工另存确认；当前和历史引用均可回原文 |
| Milestone | 无事件不占位 | 排队 / 202 不显示 | error 永不庆祝 | 只消费首次提交 event；可关闭，reduced-motion 静态 |

## 8. 正反馈设计

正反馈服务于“一个可验证、可恢复的创作阶段已经真实落盘”，不奖励模型调用次数、排队或按钮点击。AI 草案落盘只表示已有可审阅资产，不表示用户已接受。

| 里程碑 | 反馈隐喻 | 触发条件 |
|---|---|---|
| 第一份非空原文快照加入项目 | 编辑部盖章 | 服务端首次成功提交含正文的 Source |
| 第一条证据被采用 | 证据链连接 | 服务端首次把 Evidence 置为 selected |
| 第一版可审阅提纲保存 | 提纲版本已落盘 | 首个非空 outline Revision 原子提交；不暗示 AI 草案已确认 |
| 第一版带引用初稿保存 | 小型纸屑 / 烟花收束为“证据链已保存”卡 | 首个有实质正文且含合法 Citation 的 master Revision 原子提交；不暗示 AI 草案已完成审核 |

约束：

- 里程碑由服务端事务成功后的唯一事件 ID 驱动；刷新、重复 SSE、幂等重放或纯前端 count 变化不再庆祝。
- 普通保存只用短促勾选、边框或文案反馈；大型粒子只用于稀有里程碑，8–12 个局部元素，不覆盖全页、不阻塞点击。
- 动画可关闭、可打断、无声音、无震动、无积分 / 连续签到 / FOMO。
- `prefers-reduced-motion` 下使用静态 sage 成功卡，不做位移、缩放或持续动画。
- 错误、重试、取消和 HTTP 202 不触发庆祝；成功特效不替代 loading / progress / error 状态。

## 9. 持久化与 API 契约

### 数据

- Source 保存内容哈希，用于证明 Evidence 仍指向创建时的内容快照；独立 Source request ledger 永久保留每个 request key 到 Source 身份的映射，关联编辑不得覆盖旧键。
- Evidence 保存 Project、Source、哈希、连续片段范围、后端派生 excerpt、来源类型、`decision_state`、`lifecycle_status`、AI 说明、用户说明与修正关系。
- Revision 保存可选父 Revision、生成 Job、请求幂等键和 provenance；Citation 连接 Revision 与 Evidence。
- Creation Job 保存 operation、request key、输入指纹、运行 token、lease、状态、进度、错误和结果 Revision；内部 token / 输入快照不进入公共 DTO。

### 关键 API

- 读取 Source 的确定片段；当前项目关联或该项目历史 Citation 都可授权读取，Source 解除后仍能核验旧 Revision，跨项目仍拒绝。
- 从项目解除 Source 关联；不删除 Source 和历史引用。
- 创建人工 Evidence，更新 Evidence 选择状态或创建修正版。
- 启动 `extract_evidence`、`generate_outline`、`generate_master` 任务。
- 工作区聚合返回 Source、Evidence、Artifact / Revision 和最近 Creation Job。
- Artifact / Revision 写入支持 request key；手工正文中的引用标记也必须经过服务端验证。

Creation Job 公共 DTO 固定为：

```text
id, project_id, operation, request_key, status, phase, progress, error,
result_artifact_id, result_revision_id, created_at, updated_at
```

SSE 使用 `progress { job }`、`complete { job, workspace, milestone? }` 和 `error { job, error }`。相同 request key + 相同输入返回同一 Job；相同 key + 不同输入返回冲突；即使不同 key，相同 project + operation + input fingerprint 的运行中或已完成任务也收敛为同一结果；已完成任务重放不重复发送 milestone。

### 任务状态流

```text
queued → running → completed
             ├──→ failed → explicit retry linked to the same logical input
             └──→ superseded / context_changed（不创建结果）
```

request key 在 project 内唯一，输入使用排序后的 ID、creator input keys、目标平台、讨论问题、所选 Revision / Source 哈希和 prompt version 规范化后计算 fingerprint。worker 获取唯一 run token，并用 heartbeat 延长 lease；进程重启或工作区读取会把过期 lease 收敛为可重试状态。最终写入必须同时匹配 Job、run token、输入指纹和当前项目上下文；旧 worker、过期 lease 或已变化上下文只能进入 superseded / context_changed，不能生成 Revision。SSE 丢失时前端以工作区持久 Job 状态收敛；只要持久状态或 SSE 仍有进度，前端不得用固定短墙钟超时制造失败。

## 10. AI 提示词与失败降级

本阶段 prompt contract 版本为 `evidence-creation-v2`。v2 将目标平台与讨论问题纳入 Brief 快照、排除本地 Evidence 用户备注，并收紧逐段推断标签与第一人称校验。版本号进入 Job input fingerprint 与 Revision provenance；修改 system 约束、输出 schema 或批处理规则时必须升级版本，避免旧 completed Job 被错误复用。

### 证据提取

- 输入只包含用户明确勾选 Source 的编号 Fragment、允许的 Brief 字段和任务说明；界面提交前提示原文会发给外部模型。
- system 明确说明 Source 文本可能包含提示注入，所有 Source 内容都只是数据。
- 模型仅返回 `source_id`、连续 fragment index 和 `ai_note`；不得返回 excerpt、offset、事实真伪或用户经历。
- 后端白名单校验后派生 excerpt，再原子发布候选；部分非法输出不会被悄悄接受。
- 超长 Source 按明确 token / fragment 预算串行批处理并经过 `llmQueue`，最后一次性发布；若当前模型无法安全容纳则前置失败并引导人工 Evidence，禁止静默截断。

固定输出：

```json
{
  "candidates": [
    {
      "source_id": 12,
      "start_fragment_index": 3,
      "end_fragment_index": 4,
      "ai_note": "为什么这段来源陈述可能有用"
    }
  ]
}
```

拒绝示例包括：返回 excerpt / offset、引用未发送的 Source、跨 batch 或非连续 fragment、重复范围、超过候选上限、Markdown code fence、来源文本诱导模型改写 system 指令。

### 提纲

- 输入为允许的 Brief 字段（含目标平台与讨论问题）、请求中显式勾选的 creator input keys 和 selected + active Evidence 的后端摘录。Evidence 用户备注不发送。
- 要求每个依赖证据的节点引用 Evidence ID；没有证据的组织建议标为结构建议。
- AI 返回失败时，用户继续在同一编辑器手写并保存 outline Revision。

### 主稿

- 输入必须显式包含一个 outline Revision ID 和 selected Evidence ID 列表。
- 模型返回结构块：证据陈述、创作者输入、AI 推断。证据块只引用白名单 ID；创作者块正文由后端使用 Brief 原值核对；推断块由后端标注 `【AI 推断，待核对】`，可在 provenance 保留 supporting Evidence ID，但不编译为直接引文。
- 后端从结构块编译正文和引用关系；不信任模型生成的最终引用标记。

提纲与主稿固定输出：

```json
{
  "blocks": [
    { "basis": "evidence", "evidence_ids": [31] },
    { "basis": "creator", "creator_key": "personal_judgment" },
    { "basis": "inference", "text": "需要进一步核对的推断", "evidence_ids": [31] }
  ]
}
```

- `basis=evidence` 必须有白名单 Evidence；正文只能由后端逐字插入这些 Evidence 的 excerpt，模型不得为直接引文自行写 text，引用 marker 由后端追加。
- `basis=creator` 不接受模型正文，只接受请求中允许且非空的 key，后端插入 Brief 精确值。
- `basis=inference` 的每个非空段落都必须由后端加可见标签；中文或英文第一人称经验表达被拒绝，其中的 Evidence 只记录 supporting context，不编译为直接引文。
- 拒绝未知 basis、重复 / 越权 ID、自行输出 `[证据#…]`、遗漏已选择 creator key、第一人称创作者经历伪造、空 block、超长 block 和额外非 JSON 文本。

### 降级

- 外部模型 401 / 429 / timeout / network / invalid JSON 映射为可操作错误，保留现有输入与最后有效产物。
- Job 失败进入可重试状态，不创建空 Artifact、半成品 Evidence 或 Revision。
- 用户可人工创建 Evidence、保存 Outline 和 Master；手工路径不依赖 API Key。

## 11. 文件影响、迁移、测试与回滚

### 预计修改范围

- 后端：schema / 初始化迁移、Source / Evidence / Artifact / Creation Job Store、内容创作服务与 Runner、内容工作区路由、SSE 与相关 DTO、Claim 删除保护。
- 前端：内容项目 slice / API / schemas / types，ProjectWorkspace 的来源、证据、提纲、引用面板与里程碑反馈组件。
- 文档与规范：本文件、内容工作台架构、项目事实、`AGENTS.md`、对应后端 / 前端项目级 skills 和 `DESIGN.md`。

### 实际实施文件图

核心新增文件：

- 后端路由与领域服务：`backend/src/routes/contentCreation.js`、`backend/src/services/contentCreationContext.js`、`contentCreationService.js`、`contentEvidenceStore.js`、`contentGenerationJobStore.js`、`contentGenerationRunner.js`、`contentMilestoneStore.js`、`backend/src/utils/contentSourceFragments.js`。
- 前端闭环组件：`ProjectCreationFlow.tsx`、`ProjectEvidenceWorkbench.tsx`、`ProjectOutlineEditor.tsx`、`ProjectCitationPanel.tsx`、`ProjectMilestoneFeedback.tsx`、`ProjectAssetSummary.tsx`、`ProjectUnsavedChangesDialog.tsx`。
- 前端纯模型：`projectArtifactModel.ts`、`projectRevisionModel.ts`、`projectPresentationExport.ts`、`projectMilestoneModel.ts`、`frontend/src/store/projectRequestKey.ts`。
- 新增回归：`backend/tests/routes/contentArtifactCitations.test.js`、`contentCreation.test.js`、`contentGenerationJobs.test.js`；`backend/tests/services/contentCreationService.test.js`、`contentGenerationJobStore.test.js`、`contentGenerationRunner.test.js`；前端为上述新组件/纯模型各配同名测试，并新增 `ProjectCreationFlow.test.tsx`、`projectWorkspaceSchemas.test.ts` 与共享 fixture。

主要扩展文件：

- 持久化与聚合：`backend/src/db/schema.sql`、`backend/src/db/index.js`、`contentArtifactStore.js`、`contentSourceStore.js`、`contentProjectStore.js`、`contentWorkspaceService.js`。
- API 与兼容保护：`backend/src/app.js`、`routes/contentWorkspace.js`、`routes/transcriptWorkspace.js`、`services/researchStore.js`、`contentExportService.js`、`mimo.js`。
- 工作区 UI 与状态：`frontend/src/pages/ProjectWorkspace.tsx`、`ProjectDraftEditor.tsx`、`ProjectOutputGuide.tsx`、`ProjectSourcesPanel.tsx`、`frontend/src/store/projectWorkspaceSlice.ts`、`types.ts`、`frontend/src/services/api.ts`、`schemas.ts`、`frontend/src/index.css`。
- 契约文档：`AGENTS.md`、`DESIGN.md`、`docs/project-facts.md`、`docs/content-workbench-architecture.md` 与相关 `.claude/skills/*/SKILL.md`。

### 迁移与兼容

- 迁移只增表 / 增列；旧 Source 计算并安全回填内容哈希，旧 Revision 的 provenance / citation 为空仍可读取。
- 本阶段 Source 正文不可原地编辑；纠错创建新 Source 快照。异常 hash 漂移阻止新 Evidence / 生成，但历史 Citation 继续展示创建时快照完整性。
- 新通用 Source 写入只接受 `manual` / `user_paste`，避免伪装已接入 AI HOT / Transcript / URL 抓取；旧数据库中的其他 `source_type` 继续可读、可用于历史核验。旧客户端若继续以任意类型调用新建接口会收到 400，回滚代码即可恢复旧输入合同，不需要删除数据。
- milestone claim 会先检查已有非空 Source、selected Evidence、非空 Outline 和合法 Cited Master，避免新表为空时把旧项目的下一次操作误报成“第一份”；也可安全回填已达成事实。
- 旧项目、Broadcast、Segment、Transcript、Claim、音频文件与旧 API 继续可用。
- 新功能关闭或模型不可用时，旧手工 Source / Revision 流程仍工作。
- 回滚应用代码时新增表 / 列可以留存；不需要丢弃用户数据。若未来要物理删除，必须另行回填核对并获得用户批准。

### 测试重点

- 单元：Fragment 稳定性、excerpt 派生、严格 JSON / 语义校验、正文编译、reduced-motion 反馈模型。
- Store：Source 哈希回填、Evidence 修正历史、Citation 原子写入、幂等 key、lease fencing、跨项目拒绝。
- Route：人工完整闭环、AI 成功 / 失败 / 重试、SSE、重复请求、Claim 引用删除 409。
- 攻击性用例：来源内提示注入、伪造 Evidence ID / excerpt / offset、跨项目对象、重复 key 不同输入、旧 worker 回写、运行中删除来源或修改 Brief、无证据生成主稿。
- 前端：未保存保护、失败保留草稿、状态刷新收敛、重复 complete 不重播里程碑、来源解除后保留编辑决策并单独展示不可复用状态、引用定位。
- 浏览器：桌面与窄屏完整人工路径、键盘 / 焦点、长文本、loading / error / retry、reduced-motion、控制台与网络错误。
- 兼容：旧项目 milestone 不误触发；Evidence decision 在 unlink / correction 后保留；历史 Citation 仍能读取上下文；含 Evidence/Citation/Job 的项目删除事务不被新 FK 卡死；进程重启和 SSE 丢失后工作区状态可收敛。
- 最终门禁：后端全测；前端全测、lint、生产 build；`git diff --check` 与删除审计。

## 12. 验收、风险与待决策

### 可验收完成标准

- 一个真实粘贴来源能进入指定内容项目，原文与 AI 派生信息在数据和视觉上分离。
- 用户能查看确定片段，创建 / 采用 / 驳回 / 修正 Evidence，并能取消使用。
- AI 只能引用当前项目、当前 Source 快照中已采用的 Evidence；错误引用被后端拒绝。
- 用户能手写或 AI 辅助保存 Outline Revision，再从指定版本生成带 Citation 的 Master Revision。
- 用户个人经验只来自明确填写内容；AI 推断有持久且可见的标签。
- AI 失败、刷新、重试、多标签页和旧 worker 不丢草稿、不重复创建版本。
- 历史 Revision / Citation 可追溯；Source 解除关联不会删除历史资产。
- 四个稀有里程碑提供克制、无障碍、不可重复刷取的正反馈。
- 旧内容、播报、转录、观点、音频和手工写作路径保持可用。

### 主要风险

- Fragment 规则变化会破坏定位；因此规则必须版本化或在 Evidence 中保存创建时范围和 excerpt。
- 只靠正文中的 `[证据#id]` 仍可能产生语义过度外推；本阶段保证来源合法与可核验，不宣称自动完成事实核查。
- SQLite 单进程事务能保证原子性，但后台 worker 仍需 token fencing，不能只依赖 lease 到期时间。
- Source 解除关联与生成并发时必须以最终 CAS 决定是否收口。
- 正反馈若由客户端推导会在刷新和 SSE 重连后重复；必须坚持服务端唯一事件。
- 原始采访 / 笔记可能含敏感信息；AI 按钮必须明确展示要外发的 Source 与 creator input keys，不能默认发送全部项目上下文。
- 当前应用是本地单用户产品，接口只有项目作用域校验，没有认证或 owner 隔离；若未来改为远程多用户部署，认证、授权和 Source 所有权是发布阻断项，不能沿用当前假设。
- 独立 Source request ledger 能阻止今后的 key 覆盖，但迁移只能回填旧关联行最后仍存续的 key，历史上已经被覆盖且未留痕的旧 key 无法凭空恢复；迁移后所有新请求都只追加账本。

### 假设与验证方式

- **假设：选择与组织是最大瓶颈。** 通过用户完成首个 selected Evidence、从 Source 到 Outline 的时间和人工放弃 AI 的原因验证，不以生成字数衡量。
- **假设：确定 Fragment 足以支持当前文本来源。** 用长中文、混合换行、emoji、极短段和来源解除后的定位回归验证；真实用户若频繁跨非连续段选择，再评估多范围 Evidence。
- **假设：一个项目各有一个 canonical outline / master Artifact。** 后端并发测试保证 AI Job 原子复用；若用户反馈需要多条并行叙事，再把目标 Artifact 变成显式选择而不是让 `.find()` 隐式决定。
- **假设：局部里程碑提高完成感而不制造压力。** 观察关闭率、reduced-motion 与用户反馈；不采集积分、连续天数等行为指标。
- **假设：外部 LLM 可在明确预算内处理所选 Source。** 用最大合法输入和模型上下文错误测试；无法安全分批时前置拒绝并验证人工闭环仍完成。

### 产品待决策（不阻塞本阶段）

- 下一来源适配器优先做 AI HOT、Transcript 还是受控 URL 抓取。
- 是否为 Fragment 规则增加显式版本字段，以及未来 Source 内容更新采用新快照还是新 Source。
- 平台稿是否必须继承 Master Citation，还是允许平台压缩后引用子集。
- 是否增加人工“引用支持强度 / 反例”标注；在真实使用反馈前不提前复杂化。

### 实施后验证状态（2026-07-19）

- 前端完整门禁：53 个测试文件、189 个测试全部通过；ESLint 通过；TypeScript + Vite 生产构建通过。唯一提示是既有入口 chunk 为 511.54 kB，超过 Vite 500 kB 建议值，不影响构建成功。
- 后端无需监听端口的 36 个测试套件、327 个测试全部通过；新增 Job 冲突回归 3/3 通过；全部变更 JS 通过 `node --check`，测试数据库能创建 `content_source_requests`，`git diff --check` 通过。
- 后端对抗性结构验证：200 个重复 Citation 在创建/读取中各只哈希唯一 Source 一次；跨项目 ID 在读取大 Source 前拒绝；Source K1/K2 重放、移出后旧 key 冲突、Evidence 第二次并发修正、项目删除保留 Source、prompt v2 隐私边界均通过。
- 修复前最后一次完整后端门禁为 51 suites / 545 tests 通过。修复后 Supertest 仍需绑定临时环回端口，但桌面环境在执行时因授权额度限制拒绝提权，因此不能把旧的 545 结果冒充本次结果；必须在授权恢复后再跑 `cd backend && npm test -- --runInBand`。
- 真实桌面浏览器已验证项目加载、粘贴 Source、人工 Evidence、服务端里程碑事件与局部正反馈；控制台只有 React DevTools 开发提示。继续操作和真实窄屏巡检同样被浏览器命令授权额度中止；窄屏目前由组件测试、响应式 CSS 审查和对抗审查覆盖，仍需在授权恢复后补真实 390px 巡检。
- 浏览器验收只使用 `NODE_ENV=test` 的隔离数据库与测试项目；未触碰真实内容、音频或生产数据库。临时截图/快照未加入仓库，已移到 `/private/tmp/tts-broadcast-browser-evidence-20260719`。

### 本阶段明确不做

- 不抓取任意 URL，不承担 SSRF、登录态、动态页面与版权快照问题。
- 不接入 AI HOT / Transcript / Claim 来源适配器，不用通用 `source_type` 假装已接入。
- 不批量生成公众号、小红书、短帖等平台稿，不增加平台专属数据表。
- 不做自动事实核查、引用支持强度评分或发布系统。
- 不改变现有 TTS Render 生命周期，不修改或清理真实音频。
- 不做积分、等级、签到、连续创作天数或带压力的游戏化。

### 删除声明

本阶段不删除页面、功能、字段、路由、数据库结构、用户内容或音频文件。Source 的“移出项目”只删除项目关联并保留 Source 与历史引用；任何未来物理删除仍需单独列出影响、迁移和恢复方案并取得明确许可。
