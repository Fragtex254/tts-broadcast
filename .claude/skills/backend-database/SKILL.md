---
name: backend-database
description: 修改 SQLite schema、迁移或 DAL 时使用。涵盖 better-sqlite3、增量迁移、参数化 SQL、事务、内容 Source/Fragment/Evidence/Citation/Creation Job 生命周期、不可变 Revision、lease fencing、观点引用删除保护、项目活动时间、NODE_ENV=test 隔离。触发场景：加字段、加表、证据表、引用表、内容生成任务表、观点表、内容项目表、删除转录/观点、刷新 updated_at、ALTER TABLE、迁移、schema.sql、新 Store、DAL、SQL 注入、事务。
---

# 后端数据库与 DAL 开发

## 何时用 / 不用

- **用**：改 `db/schema.sql`、在 `db/index.js` 写迁移、新增/修改 `services/*Store.js` 单表 CRUD。
- **不用**：仅在路由里读写已有 Store（→ `backend-route`）；含外部 API 的业务逻辑（→ `backend-service`）。
- **注意**：新增贯穿前后端的字段时，本 skill 只覆盖后端部分，完整流程见 `add-persisted-field`。

## 核心铁则

1. SQLite 不支持 `ADD COLUMN IF NOT EXISTS`，迁移用 try-catch 探测列模式，放 `db/index.js` schema 初始化之后。
2. 新增列**必须有 `DEFAULT` 值**，确保旧数据兼容；`schema.sql` 保持最新完整定义，迁移只处理增量。
3. **参数化绑定**（`?` 占位符），绝对禁止字符串拼接 SQL（注入风险）。
4. `segments` 表的 `index` 是 SQL 保留字，**必须用双引号转义** `ORDER BY "index"`。
5. 路由层不直接 `db.prepare()`（settings 表除外），走 `*Store.js` DAL；store 函数收/返纯 JS 对象，不依赖 `req`/`res`。
6. `NODE_ENV=test` 必须用 SQLite 内存库，测试不得读写 `backend/data/broadcast.db`。
7. 可重建观点被内容项目引用后不得级联删除：旧观点在重新分析时保留为 `stale` 快照；删除 `transcription_results` 前必须在 DAL 事务内检查其观点是否被 `content_project_claims` 引用，有引用时原子阻止删除。未被项目引用的旧观点可在替换事务中清理。
8. 内容稿件按 `content_artifacts` → `content_artifact_revisions` 分层：Artifact 保存身份与状态，正文保存为递增 Revision；保存新正文只能 INSERT 新 Revision，禁止 UPDATE 覆盖旧版本。项目来源本体与 `content_project_sources` 关联分离，移出项目不得修改来源快照。新增或关联 Source、创建 Artifact、追加 Revision 都必须在同一事务内刷新 `content_projects.updated_at`，使最近项目排序反映真实创作活动。
9. `broadcasts.artifact_revision_id` 是从音频 Render 指向不可变口播稿 Revision 的单向可选“创建时来源”关联：使用 `ON DELETE SET NULL`，删除项目/Revision 时保留 Broadcast，删除 Broadcast 永不影响 Revision。创建 Render 前必须通过深 Store 验证 `audio_script` 类型与正文逐字一致，不得仅依赖 FK 存在性；后续 segment 精修属于 Render 派生层，不清空该来源，也不声称精修正文仍与 Revision 一致。API DTO 用 `source_artifact_revision_id` 别名显式表达该语义。
10. Segment 生成收口必须在 `segmentStore` 用参数化 SQL 完成 CAS：条件同时包含 `id`、`broadcast_id`、`text`、`style_tag`、`"index"`、持久化 `generation_token` 与当前 `generating` 状态，成功和失败不得用无条件 `UPDATE` 覆盖并发编辑。恢复遗留 generating 时写新 token，旧请求即使快照字段相同也不得 ABA 写回；重排或编辑使快照失效时恢复为 `pending` 并清 token。Token 是内部并发控制字段，不进入公共 Segment DTO；音频路径不随 index 重命名。
11. `content_evidence_cards` 必须绑定项目、Source 内容哈希、连续 fragment 范围和后端派生 excerpt；AI 说明与用户备注分列。编辑 `decision_state` 与技术 `lifecycle_status` 分列：修正证据 INSERT 新卡并用 `supersedes_id` 保留历史，只改旧卡 lifecycle，不覆盖原摘录或用户曾经的选择；Source 移出项目只删除关联并使 lifecycle stale，历史 Source/Evidence/Citation 不级联丢失。历史 Citation 的 snapshot integrity 不依赖当前 decision/source link，当前 `reuse_eligible` 单独派生。
12. Revision 与 Evidence 通过 `content_revision_citations` 建立事实关系，并与 Revision 在同一事务创建；正文标记不是 FK 的替代品。`content_generation_jobs` 必须保存 request key、输入/上下文指纹、run token、lease、结果 ID 与错误；公共 DTO 不暴露 token / 输入快照。任务完成、Revision/Citation 或 Evidence 发布与项目 `updated_at` / 首次 milestone 判定需要原子收口。
13. Source 写入幂等键保存到独立 `content_source_requests` 账本，不能依附在会被后续用途/排序编辑覆盖的 `content_project_sources` 单行上。相同 key 重放必须收敛到原 Source；若该 Source 已显式移出项目，旧请求不得复制或静默重关联。Evidence 修正必须在事务内以 `lifecycle_status='active'` 做 CAS；同一旧卡的第二个并发修正返回冲突。Citation 创建、读取与历史列表按唯一 Source/Evidence 批量取值并缓存哈希，禁止为每个 marker 重复搬运和哈希整份大 Source，阻塞 better-sqlite3 事件循环。

## 模式与模板

### 连接与初始化

- 使用 better-sqlite3 同步 API
- 开发/生产数据库文件位于 `backend/data/broadcast.db`（已 gitignore）
- `NODE_ENV=test` 时数据库必须使用 SQLite 内存库，测试不得读写 `backend/data/broadcast.db`
- Schema 定义维护在 `db/schema.sql`，保持**最新完整定义**

### 迁移模式

SQLite 不支持 `ALTER TABLE ADD COLUMN IF NOT EXISTS`，使用 try-catch 模式：

```js
// 放在 db/index.js 中，紧跟 schema 初始化之后
try {
  db.prepare('SELECT new_column FROM table_name LIMIT 1').get();
} catch {
  db.exec('ALTER TABLE table_name ADD COLUMN new_column TYPE DEFAULT value');
}
```

**迁移规则：**
- 新增列必须有 `DEFAULT` 值，确保旧数据兼容
- `schema.sql` 保持最新完整定义，迁移代码仅处理增量
- 迁移代码放在 `db/index.js` 中，紧跟 schema 初始化之后

### SQL 编写规范

```js
// ✅ 参数化绑定，防止 SQL 注入
db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(id);

// ✅ 多行 SQL 使用模板字符串
db.prepare(`
  INSERT INTO broadcasts (title, content, voice_type, voice_config, status, mode)
  VALUES (?, ?, ?, ?, ?, ?)
`).run(title, content, voiceType, voiceConfig, status, mode);

// ✅ IN 子句使用占位符数组
db.prepare(`SELECT * FROM segments WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);

// ❌ 绝对禁止字符串拼接 SQL
db.prepare(`SELECT * FROM broadcasts WHERE id = ${id}`); // SQL 注入风险！
```

### 事务使用

```js
const insertMany = db.transaction((items) => {
  for (const item of items) {
    insertStmt.run(item.value);
  }
});
insertMany(items);
```

### SQL 关键字处理

`segments` 表的 `index` 列是 SQL 保留字，必须用双引号转义：

```sql
SELECT * FROM segments WHERE broadcast_id = ? ORDER BY "index"
```

### DAL 层（数据访问层）

- `services/*Store.js` 封装单张表的所有 SQL 操作
- 路由层不直接调用 `db.prepare()`（settings 表除外）
- store 函数接收/返回纯 JS 对象，不依赖 `req`/`res`
- 新增业务表必须同步补对应 `*Store.js`，而不是在路由里散写 SQL
- Transcript 表族按“聚合根 → 不可变 Segment 事实 → 可校对 Turn → 可重建 Summary Artifact”分层。用户校对只写 `transcription_turns.corrected_text` 并把已完成摘要标记 `stale`，不得覆盖 `transcription_segments`；只有在其观点未被内容项目引用时，删除 `transcription_results` 才可依赖外键级联清理子表。
- 内容项目工作区的聚合读取可由一个深 Store/服务组合来源关联、Artifact 与最新 Revision；路由和前端不得重复计算“当前版本”。跨项目读取或新增 Revision 时必须同时校验 `project_id` 与 `artifact_id`，防止对象越权。
- Source 内容哈希是 Evidence 创建时的快照校验，不允许客户端提供或覆盖；旧 Source 迁移安全回填哈希。Fragment 由纯函数按原文派生，若未来改变切分规则必须版本化或继续保存旧 Evidence 的范围与 excerpt，不能让历史引用静默漂移。
- 内容生成的最终写入用 DAL 事务比较 Job 状态、run token、输入/上下文指纹和当前项目关系；只有全部匹配才创建结果。不能只依赖 `lease_expires_at`，因为过期 worker 仍可能晚到。

## Checklist

涉及数据库改动时，逐项检查：

- [ ] **schema.sql**：更新完整表定义
- [ ] **迁移代码**：`db/index.js` 中添加 ALTER TABLE 迁移
- [ ] **参数化 SQL**：使用 `?` 占位符，禁止字符串拼接
- [ ] **DEFAULT 值**：新增列必须有默认值
- [ ] **DAL**：新增表补 `*Store.js`，路由通过 store 操作
- [ ] **证据历史**：excerpt 后端派生，Source 解除/证据修正不破坏旧 Citation
- [ ] **生成任务**：request key 唯一、run token/fingerprint CAS、结果与 Citation 原子写入、内部字段不进 DTO
- [ ] **并发与规模**：Source request ledger 不可覆盖；Evidence 修正 active CAS；Citation 按唯一 Source/Evidence 去重读取和哈希

## 相关 skill / 文档

- 路由读写 Store → `backend-route`
- 跨前后端加字段完整流程 → `add-persisted-field`
- DB 测试（内存库、清表） → `backend-testing`
