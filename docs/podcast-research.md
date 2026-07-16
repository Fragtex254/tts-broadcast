# 播客观点研究与内容创作工作台

## 使用流程

1. 在转录页批量转录多人播客，并进入内容详情。
2. 在「播客资料」补充节目名、单集标题、嘉宾、来源链接、发布日期和主题标签。
3. 执行一键总结或「自动提取观点」。两条链路都会永久保存经后端证据校验的观点卡。
4. 在内容库切换到「观点研究」，输入问题搜索跨播客观点。设置页可配置 OpenAI-compatible Embedding；未配置或连接失败时自动使用关键词搜索。
5. 选择 2–10 条候选分析支持、反对、补充、条件不同、相似案例或无关关系。
6. 创建内容项目，加入观点、调整顺序、填写使用备注、个人实践、阶段性判断和读者问题。
7. 导出小红书讨论帖或微信公众号文章 Markdown 结构。每条引用包含播客名、单集标题、Speaker、时间范围和原始链接。

## 数据与安全约束

- `transcription_segments` 始终是不可变 ASR 事实；Turn 校对不反写 Segment。
- 模型只返回 Segment index，证据摘录与时间范围由后端派生。
- 一条观点的完整连续证据范围必须属于同一合法 Speaker。
- Turn 校对后当前观点与摘要标记 `stale`；重新分析原子创建新一代 active 观点。
- 内容项目已经引用的旧观点不会因重新分析被级联删除，而是保留为 stale 研究快照。
- 观点分析使用 `transcription_claim_jobs` lease 和 SSE，防止刷新、多标签页或重试造成重复入队。
- Embedding 与 LLM 请求均经过全局 `llmQueue`；Embedding 失败只影响语义排序，不影响关键词搜索。
- 关系分析只处理用户选择的 Top N 候选，并把结果缓存到 `claim_relations`。

## 主要接口

- `PATCH /api/transcribe/results/:id/metadata`
- `POST /api/transcribe/results/:id/analyze-claims`
- `GET /api/transcribe/results/:id/claims`
- `PATCH|DELETE /api/transcribe/claims/:claimId`
- `GET /api/research/claims/search`
- `POST /api/research/claims/relations`
- `GET|POST /api/content-projects`
- `GET|PATCH|DELETE /api/content-projects/:id`
- `POST|PATCH|DELETE /api/content-projects/:id/claims...`
- `POST /api/content-projects/:id/export`
