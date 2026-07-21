# 内容创作工作台架构契约

## 1. 定位

本项目从「以 TTS 生成记录为中心」迁移为「证据驱动的 AI 内容创作工作台」。

内容项目负责保存创作者长期积累的目标、来源、判断、稿件和修改历史；TTS、平台导出与后续发布能力是内容稿件的输出方式，不再拥有内容正文的唯一真相。

## 2. 主干模型

```text
Source snapshot -> deterministic Fragment -> Evidence Card
                                               |
Content Project / Brief -----------------------+
             |                                 |
             v                                 v
      Artifact:outline -> Revision -> Artifact:master -> Revision + Citation
                                                       |
                                                       v
                                           Render / Export / Publication
```

### Content Project

项目是创作聚合根。它描述创作意图，而不是某次模型调用：

- `title`：项目名称
- `topic`：主题范围
- `audience`：目标读者或听众
- `goal`：希望内容促成的结果
- `angle`：本次表达的切入角度
- `tone`：表达语气
- `content_format`：预期内容形态
- `thesis`：核心主张
- `personal_practice`：创作者亲身实践
- `personal_judgment`：创作者自己的判断
- `discussion_question`：希望留给受众的问题

项目状态初期沿用开放字符串兼容旧数据；新工作流优先使用 `draft`、`researching`、`writing`、`review`、`complete`、`archived`。

### Source

来源是可复用的素材资产。首期支持用户粘贴文本快照，后续通过适配器接入 URL、AI HOT、Transcript 和 Claim。

- 来源本体不因移出某个项目而修改。
- 项目关联保存使用说明与排序。
- 外部来源进入项目时保存必要快照，避免原链接变化后失去上下文。

Source 原文只作为不可信数据进入 LLM 上下文，不执行其中的指令。当前通用入口只允许 `manual` / `user_paste` 的用户粘贴文本快照；“快照”只证明系统保存了用户提交的文字，不代表应用核验了客观事实。URL 字段是用户填写的线索，既未抓取也未核验。AI HOT、Transcript、Claim 和受控 URL 抓取必须通过未来的明确适配器接入，禁止只伪造 `source_type`。

来源写入的 request key 记录在不可被后续关联编辑覆盖的独立账本中。相同 key 重放只能收敛到原 Source 身份；Source 已被用户移出项目后，旧请求重放不得复制或静默重新关联该资产。

### Fragment 与 Evidence

Fragment 是后端按稳定规则从 Source 原文派生的连续片段，包含可回查的 index 与字符 offset。模型只能从当前项目的 fragment 白名单中提出范围，不能提供可信 excerpt 或 offset。

Evidence Card 是一次创作选择，不是来源事实本身：

- `excerpt` 必须由后端根据 Source 快照与连续 fragment 范围派生；
- AI 候选说明、用户备注和原文摘录分别保存、分别展示；用户备注是本地研究资产，本阶段不进入外部模型上下文。需要参与生成的个人判断只能来自用户在任务前显式勾选的 Brief 字段；
- `decision_state` 区分候选、采用、驳回；`lifecycle_status` 独立区分 active、被修正版取代和来源失效，技术变化不得覆盖用户曾经的编辑判断；
- 用户修正创建新卡并保留旧卡，不覆盖历史判断；
- Source 移出项目后不删除 Source、Evidence 或历史 Citation，只把 Evidence 生命周期置为 stale 并禁止新生成；历史 Citation 的快照完整性不因当前关联或选择状态被追溯性改判，当前复用资格另行展示。

### Artifact

Artifact 是项目中的内容形态。首期至少支持：

- `outline`：结构大纲
- `master`：主稿
- `platform`：平台版本
- `audio_script`：口播版本

Artifact 只保存身份、用途与状态；正文由 Revision 保存。

### Revision

Revision 是不可覆盖的稿件版本：

- 每次显式保存生成一个递增版本。
- 当前版本由最高 `revision_number` 派生。
- 旧版本不得被更新或静默删除。
- AI 生成、人工编辑、导入或迁移通过 `change_reason` 留下原因。
- Creation Job 成功会把模型输出保存为 `ai_generated` 草案 Revision，用于追踪与幂等，但不代表用户已接受；用户通过选择确切 outline Revision 继续生成，或编辑后另存新 Revision，完成显式确认。AI 主稿也必须先经一次显式人工保存形成后继 Revision，才可进入复制、下载或口播准备等输出动作。
- 生成 Revision 保存父版本、生成任务、请求幂等键与 provenance；手工旧 Revision 的这些字段允许为空。
- 主稿引用通过独立 Citation 关联到 Evidence，正文中的引用标记只是可读投影，不能替代数据库关系。

### Creation Job

证据提取、AI 提纲和 AI 主稿都是持久化 Creation Job：

- operation 固定为 `extract_evidence`、`generate_outline` 或 `generate_master`；
- 相同 request key 与相同输入返回同一个 Job，相同 key 不同输入返回冲突；
- Job 使用 lease、heartbeat、输入指纹和唯一 run token；最终收口必须做 token + 当前上下文 CAS，旧 worker 不得 ABA 创建 Revision；
- 前端不得用固定的一分钟墙钟超时主动中止仍有 SSE / 持久进度的长任务；进度和 heartbeat 必须延长观察窗口，直到服务端进入 terminal 状态或用户显式离开；
- 只有事务真正提交后才发送完成事件；HTTP 202、排队或模型返回本身都不等于业务完成；
- 失败不创建半成品 Evidence、Artifact 或 Revision，保留用户输入与最后一版有效产物。

### Render

Render 是某个 Revision 的生产结果。现有 `broadcasts`、`segments` 和音频文件在迁移期继续工作，并通过可选的 `broadcasts.artifact_revision_id` 接入口播稿版本，不直接改名或破坏旧数据。

- 只有 `audio_script` Revision 可以成为 TTS Render 的来源。
- 创建 Render 时，请求正文必须与 Revision 正文逐字一致，包括首尾空白。
- 项目上下文中的未保存修改不得绕过 Revision 直接生成音频。
- 旧 TTS 入口继续允许不带 Revision 的兼容调用。
- 删除项目导致 Revision 消失时，历史 Broadcast 与音频保留，来源关联置空。

## 3. 模块与 seam

内容工作区对调用方提供小而完整的 interface：

- 读取项目工作区聚合
- 给项目增加来源
- 创建 Artifact
- 为 Artifact 保存新 Revision
- 查看 Revision 历史
- 读取 Source 的确定 Fragment
- 创建、采用、驳回和修正 Evidence
- 解除 Source 的项目关联但保留历史资产
- 启动、恢复和读取证据提取 / 提纲 / 主稿 Creation Job
- 读取 Revision Citation 与 provenance

来源表、关联表、Artifact 表和 Revision 表的组合、JSON 解析及“当前版本”计算属于后端实现，不泄漏到页面。

前端以工作区聚合响应作为唯一真实来源。SSE 只提供即时进度；刷新后必须用持久化 Job 状态收敛。异步失败在 `activeOperation` 清空后仍必须可见；相关 Brief、Evidence 备注或目标稿存在未保存修改时禁止提交生成，并解释需要先保存。任务完成不得静默覆盖本地草稿。里程碑反馈只消费服务端事务提交后的唯一 event ID，重连和幂等重放不得重复庆祝。

## 4. 数据生命周期不变量

1. 项目、文本来源、Artifact 与 Revision 默认永久保存。
2. 保存新稿件不得覆盖旧 Revision。
3. 内容正文不得因音频缓存配额被删除。
4. 原始上传媒体继续遵循容量约束；文本转录仅在用户显式删除且不存在项目引用时清理，项目引用永久保存。
5. 旧 Broadcast、Segment、Transcript、Claim 与 Content Project 在兼容阶段不删除、不改名。
6. Schema 迁移先增后减；所有破坏性清理必须在数据回填、数量核对和用户明确批准之后执行。
7. 自动化只有在存在真实业务执行器和可追踪 Run 时才可显示为“运行中”或更新成功时间；仅保存 cron 配置不等于执行内容生产。
8. 含内容项目观点引用的 Transcript 不得级联删除；删除聚合根前必须在 DAL 事务内检查并阻止。
9. Source 关联、Artifact 创建与 Revision 保存都是项目活动，必须刷新项目 `updated_at`。
10. Source 原文、Evidence、AI 说明和创作者输入属于不同事实层；任何 DTO、提示词或界面不得把 AI 推断伪装成来源原话。
11. 历史 Revision 与 Citation 永不因 Brief、Evidence 选择或 Source 项目关联变化而原地改写；变化只影响新生成任务的上下文指纹。
12. 证据提取和成稿必须后端派生摘录并校验项目归属；模型输出的 ID、范围、引用、第一人称经验与最终正文都按不可信输入处理。
13. AI 上下文只包含本次 operation 明确允许的字段：目标平台与讨论问题属于 Brief 快照；Evidence 用户备注不属于生成上下文；个人实践和判断必须由请求显式勾选。
14. 内部 `[证据#ID]` 只用于保存态定位，复制和下载不得宣称它是可直接发布文本；输出投影必须转换为人类可读引用与依据列表，且不得修改不可变 Revision。

## 5. 迁移顺序

1. 建立 Brief、Source、Artifact、Revision 与项目化页面。
2. 将口播稿 Revision 作为现有 TTS 生成的输入来源，并保存 Render 关联。
3. 增加确定 Fragment、可确认 Evidence、AI 辅助大纲 / 主稿、引用与持久化生成任务。
4. 在闭环可靠后，把 AI HOT、Transcript、Claim 和受控 URL 通过明确来源适配器接入项目。
5. 复用 Artifact / Revision 派生平台版本，并验证引用继承或引用子集规则。
6. 建立真实 Automation Run、发布记录和反馈闭环。
7. 兼容验证后逐项提出旧字段、路由与页面的清理申请。

## 6. 删除审批协议

任何删除动作执行前必须提交并等待确认：

- 精确目标（文件、字段、路由、表或用户资产）
- 删除原因
- 用户与数据影响
- 替代实现
- 迁移与回滚方案
- 验证方法

未获得明确批准时，只允许新增、兼容、隐藏或标记弃用，不执行删除。

## 7. 当前自动化边界

旧 `schedules` 暂时只作为兼容配置保存。应用没有注入内容采集、写作或 TTS 执行器时：

- 后端不启动 cron，也不更新 `last_run_at`；
- 新配置以停用状态保存，API 公开全局 `execution` 与单任务 `runtime_state`；
- 启用动作返回冲突，不把持久化意图伪装成运行成功；
- 前端明确标注“规划中”，暂停新建和启用；
- 旧配置与旧运行时间保留，不做删除或伪造迁移；
- 后续以 `automations` + `automation_runs` 建立可恢复、可审计的真实执行闭环后再开放。
