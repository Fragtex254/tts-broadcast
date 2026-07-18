# 内容创作工作台架构契约

## 1. 定位

本项目从「以 TTS 生成记录为中心」迁移为「证据驱动的 AI 内容创作工作台」。

内容项目负责保存创作者长期积累的目标、来源、判断、稿件和修改历史；TTS、平台导出与后续发布能力是内容稿件的输出方式，不再拥有内容正文的唯一真相。

## 2. 主干模型

```text
Source -> Evidence / Insight -> Content Project / Brief
                                      |
                                      v
                             Artifact -> Revision
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

来源是可复用的素材资产。首期支持手写内容，后续通过适配器接入 URL、AI HOT、Transcript 和 Claim。

- 来源本体不因移出某个项目而修改。
- 项目关联保存使用说明与排序。
- 外部来源进入项目时保存必要快照，避免原链接变化后失去上下文。

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

来源表、关联表、Artifact 表和 Revision 表的组合、JSON 解析及“当前版本”计算属于后端实现，不泄漏到页面。

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

## 5. 迁移顺序

1. 建立 Brief、Source、Artifact、Revision 与项目化页面。
2. 将口播稿 Revision 作为现有 TTS 生成的输入来源，并保存 Render 关联。
3. 把 AI HOT、Transcript、Claim 和 URL 通过来源适配器接入项目。
4. 增加证据引用、AI 辅助大纲/成稿与版本比较。
5. 建立真实 Automation Run、发布记录和反馈闭环。
6. 兼容验证后逐项提出旧字段、路由与页面的清理申请。

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
