---
name: backend-database
description: 修改 SQLite schema、写数据库迁移、新增或修改 DAL（services/*Store.js）时使用。涵盖 better-sqlite3 同步 API、try-catch 探测列迁移模式、schema.sql 同步、参数化 SQL防注入、事务、观点/内容项目引用生命周期、IN 子句占位符、segments.index 保留字双引号转义、NODE_ENV=test 内存库隔离。触发场景：加字段、加表、观点表、内容项目表、ALTER TABLE、写迁移、改 schema.sql、新建 Store、DAL、SQL 注入、事务。
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
7. 可重建观点被内容项目引用后不得在重新分析时级联删除：旧观点保留为 `stale` 快照，当前 Transcript 只展示新一代 `active` 观点；未被项目引用的旧观点可在替换事务中清理。

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
- Transcript 表族按“聚合根 → 不可变 Segment 事实 → 可校对 Turn → 可重建 Summary Artifact”分层。用户校对只写 `transcription_turns.corrected_text` 并把已完成摘要标记 `stale`，不得覆盖 `transcription_segments`；删除 `transcription_results` 时依赖外键级联清理子表。

## Checklist

涉及数据库改动时，逐项检查：

- [ ] **schema.sql**：更新完整表定义
- [ ] **迁移代码**：`db/index.js` 中添加 ALTER TABLE 迁移
- [ ] **参数化 SQL**：使用 `?` 占位符，禁止字符串拼接
- [ ] **DEFAULT 值**：新增列必须有默认值
- [ ] **DAL**：新增表补 `*Store.js`，路由通过 store 操作

## 相关 skill / 文档

- 路由读写 Store → `backend-route`
- 跨前后端加字段完整流程 → `add-persisted-field`
- DB 测试（内存库、清表） → `backend-testing`
