# 分段语气标签 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让分段（segmented）模式的每个 segment 可设置一个整体风格标签 `(风格)`（手动 + AI 一键建议）并在文本内插入细粒度 `[音频标签]`，生成时注入待合成文本。

**Architecture:** 整体风格标签做成 `segments.style_tag` 结构化列，生成时在路由层用纯函数 `prependStyleTag` 前置 `(风格)`；细粒度标签内联进 `segment.text`（编辑时光标插入），不单独存储。AI 建议通过新端点调用 LLM 为各段选标签。前端走 `add-persisted-field` 链路同步契约。

**Tech Stack:** Node.js + Express 5 + better-sqlite3 + Jest/supertest（后端）；React 19 + TypeScript + Zustand + Vite + vitest（前端）。

**设计依据:** `docs/superpowers/specs/2026-06-15-segment-tone-tags-design.md`

**分支:** `feat/segment-tone-tags`

---

## 文件结构

**后端新增**
- `backend/src/utils/segmentText.js` — 纯函数 `sanitizeStyleTag` / `prependStyleTag`
- `backend/tests/utils/segmentText.test.js` — 上述纯函数测试
- `backend/tests/db/segmentsStyleTag.test.js` — `style_tag` 列默认值测试

**后端修改**
- `backend/src/db/schema.sql` — segments 加 `style_tag`
- `backend/src/db/index.js` — 迁移
- `backend/src/services/segmentStore.js` — `updateStyleTag` / `bulkUpdateStyleTags`
- `backend/src/services/mimo.js` — `suggestStyleTags`
- `backend/src/routes/segments.js` — PUT 支持 styleTag、生成注入、suggest-tags 端点
- `backend/tests/services/segmentStore.test.js`、`backend/tests/services/mimo.test.js`、`backend/tests/routes/segments.test.js` — 对应测试

**前端新增**
- `frontend/src/constants/toneTags.ts` — 标签清单 + sanitize
- `frontend/src/constants/toneTags.test.ts` — sanitize 测试
- `frontend/src/components/Dashboard/TagPicker.tsx` — 风格标签 popover
- `frontend/src/components/Dashboard/AudioTagInserter.tsx` — 编辑模式插入 `[音频标签]`

**前端修改**
- `frontend/src/store/types.ts` — `Segment.style_tag` + AppState 新增项
- `frontend/src/services/schemas.ts` — `SegmentSchema.style_tag`
- `frontend/src/services/api.ts` — `updateSegment` 加 styleTag、`suggestSegmentTags`
- `frontend/src/store/segmentSlice.ts` — `updateSegmentStyleTag` / `suggestTags` / `isSuggestingTags`
- `frontend/src/components/Dashboard/SegmentEditor.tsx` — 布局 B、编辑插入、工具栏按钮

**文档**
- `docs/project-facts.md` — segments 新字段 + 新端点

> 后端命令均在 `backend/` 目录执行，前端命令均在 `frontend/` 目录执行。

---

## Task 1: 数据库加 `style_tag` 列 + 迁移

**Files:**
- Modify: `backend/src/db/schema.sql`
- Modify: `backend/src/db/index.js`
- Test: `backend/tests/db/segmentsStyleTag.test.js`

- [ ] **Step 1: 写失败测试**

创建 `backend/tests/db/segmentsStyleTag.test.js`：

```js
const db = require('../../src/db');
const broadcastStore = require('../../src/services/broadcastStore');

describe('segments.style_tag 列', () => {
  test('新插入的 segment style_tag 默认空串', () => {
    db.prepare('DELETE FROM segments').run();
    db.prepare('DELETE FROM broadcasts').run();
    const b = broadcastStore.create({
      title: 't', content: 'c', voiceType: 'preset',
      voiceConfig: '{}', status: 'pending', mode: 'segmented',
    });
    db.prepare('INSERT INTO segments (broadcast_id, "index", text) VALUES (?, ?, ?)')
      .run(b.id, 0, '句子');
    const seg = db.prepare('SELECT style_tag FROM segments WHERE broadcast_id = ?').get(b.id);
    expect(seg.style_tag).toBe('');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/db/segmentsStyleTag.test.js --runInBand`
Expected: FAIL（`style_tag` 列不存在 / 返回 undefined）

- [ ] **Step 3: 改 schema.sql**

在 `backend/src/db/schema.sql` 的 `segments` 表定义里，`status TEXT DEFAULT 'pending',` 之后加一行：

```sql
  status TEXT DEFAULT 'pending',
  style_tag TEXT DEFAULT '',
```

- [ ] **Step 4: 加迁移**

在 `backend/src/db/index.js` 的「迁移：为旧数据库添加 mode 列」块之后追加：

```js
// 迁移：为旧数据库的 segments 添加 style_tag 列
try {
  db.prepare('SELECT style_tag FROM segments LIMIT 1').get();
} catch {
  db.exec("ALTER TABLE segments ADD COLUMN style_tag TEXT DEFAULT ''");
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test -- tests/db/segmentsStyleTag.test.js --runInBand`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add backend/src/db/schema.sql backend/src/db/index.js backend/tests/db/segmentsStyleTag.test.js
git commit -m "feat(db): add style_tag column to segments"
```

---

## Task 2: 纯函数 `prependStyleTag` / `sanitizeStyleTag`

**Files:**
- Create: `backend/src/utils/segmentText.js`
- Test: `backend/tests/utils/segmentText.test.js`

- [ ] **Step 1: 写失败测试**

创建 `backend/tests/utils/segmentText.test.js`：

```js
const { prependStyleTag, sanitizeStyleTag } = require('../../src/utils/segmentText');

describe('segmentText', () => {
  describe('sanitizeStyleTag', () => {
    test('剥离半角/全角括号与方括号并 trim', () => {
      expect(sanitizeStyleTag(' (平静) ')).toBe('平静');
      expect(sanitizeStyleTag('（严肃）')).toBe('严肃');
      expect(sanitizeStyleTag('[活泼]')).toBe('活泼');
    });
    test('空值返回空串', () => {
      expect(sanitizeStyleTag('')).toBe('');
      expect(sanitizeStyleTag(null)).toBe('');
      expect(sanitizeStyleTag(undefined)).toBe('');
    });
    test('限长 20 字', () => {
      expect(sanitizeStyleTag('一'.repeat(30)).length).toBe(20);
    });
  });
  describe('prependStyleTag', () => {
    test('有标签时前置 (标签)', () => {
      expect(prependStyleTag('你好', '平静')).toBe('(平静)你好');
    });
    test('无标签时原样返回', () => {
      expect(prependStyleTag('你好', '')).toBe('你好');
      expect(prependStyleTag('你好', null)).toBe('你好');
    });
    test('标签自带括号会被清洗后再包裹', () => {
      expect(prependStyleTag('你好', '(平静)')).toBe('(平静)你好');
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/utils/segmentText.test.js --runInBand`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

创建 `backend/src/utils/segmentText.js`：

```js
// segment 合成文本组装：整体风格标签清洗与前置
function sanitizeStyleTag(raw) {
  return String(raw || '').replace(/[()（）[\]]/g, '').trim().slice(0, 20);
}

function prependStyleTag(text, styleTag) {
  const tag = sanitizeStyleTag(styleTag);
  return tag ? `(${tag})${text}` : text;
}

module.exports = { sanitizeStyleTag, prependStyleTag };
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- tests/utils/segmentText.test.js --runInBand`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/src/utils/segmentText.js backend/tests/utils/segmentText.test.js
git commit -m "feat(utils): add prependStyleTag/sanitizeStyleTag"
```

---

## Task 3: segmentStore `updateStyleTag` / `bulkUpdateStyleTags`

**Files:**
- Modify: `backend/src/services/segmentStore.js`
- Test: `backend/tests/services/segmentStore.test.js`

- [ ] **Step 1: 写失败测试**

在 `backend/tests/services/segmentStore.test.js` 的最后一个 `describe('countByIds', ...)` 之后、文件末尾 `});` 之前追加：

```js
  describe('updateStyleTag', () => {
    test('写入 style_tag 并重置状态/音频', () => {
      segmentStore.createMany(broadcastId, ['句子']);
      const seg = segmentStore.getByBroadcastId(broadcastId)[0];
      segmentStore.updateStatus(seg.id, 'generated', '/audio/seg.wav');
      segmentStore.updateStyleTag(seg.id, '平静');
      const updated = segmentStore.getByIdAndBroadcastId(seg.id, broadcastId);
      expect(updated.style_tag).toBe('平静');
      expect(updated.status).toBe('pending');
      expect(updated.audio_path).toBeNull();
    });
  });

  describe('updateText 保留 style_tag', () => {
    test('改文本不丢 style_tag', () => {
      segmentStore.createMany(broadcastId, ['旧']);
      const seg = segmentStore.getByBroadcastId(broadcastId)[0];
      segmentStore.updateStyleTag(seg.id, '严肃');
      segmentStore.updateText(seg.id, '新');
      const updated = segmentStore.getByIdAndBroadcastId(seg.id, broadcastId);
      expect(updated.text).toBe('新');
      expect(updated.style_tag).toBe('严肃');
    });
  });

  describe('bulkUpdateStyleTags', () => {
    test('只重置 tag 变化的段', () => {
      segmentStore.createMany(broadcastId, ['A', 'B']);
      const segs = segmentStore.getByBroadcastId(broadcastId);
      segmentStore.updateStyleTag(segs[0].id, '平静');
      segmentStore.updateStatus(segs[0].id, 'generated', '/audio/a.wav');
      segmentStore.updateStatus(segs[1].id, 'generated', '/audio/b.wav');

      segmentStore.bulkUpdateStyleTags(broadcastId, [
        { id: segs[0].id, styleTag: '平静' }, // 不变
        { id: segs[1].id, styleTag: '严肃' }, // 变化
      ]);

      const after = segmentStore.getByBroadcastId(broadcastId);
      const a = after.find((s) => s.id === segs[0].id);
      const b = after.find((s) => s.id === segs[1].id);
      expect(a.style_tag).toBe('平静');
      expect(a.status).toBe('generated'); // 未变 → 不重置
      expect(b.style_tag).toBe('严肃');
      expect(b.status).toBe('pending');   // 变化 → 重置
      expect(b.audio_path).toBeNull();
    });
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/services/segmentStore.test.js --runInBand`
Expected: FAIL（`updateStyleTag` / `bulkUpdateStyleTags` 不是函数）

- [ ] **Step 3: 实现**

在 `backend/src/services/segmentStore.js` 的 `updateText` 函数之后追加两个函数：

```js
/**
 * 更新 segment 的整体风格标签，并重置状态为 pending、清空音频
 * @param {number} segId - segment ID
 * @param {string} styleTag - 已清洗的风格标签（空串=无）
 */
function updateStyleTag(segId, styleTag) {
  db.prepare(
    "UPDATE segments SET style_tag = ?, status = 'pending', audio_path = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(styleTag, segId);
}

/**
 * 批量更新风格标签（仅对 tag 实际变化的段重置状态/音频）
 * @param {number} broadcastId - 播报 ID
 * @param {Array<{id:number, styleTag:string}>} items
 */
function bulkUpdateStyleTags(broadcastId, items) {
  const getStmt = db.prepare('SELECT style_tag FROM segments WHERE id = ? AND broadcast_id = ?');
  const updateStmt = db.prepare(
    "UPDATE segments SET style_tag = ?, status = 'pending', audio_path = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND broadcast_id = ?"
  );
  const run = db.transaction((list) => {
    for (const { id, styleTag } of list) {
      const current = getStmt.get(id, broadcastId);
      if (!current) continue;
      const next = styleTag || '';
      if (current.style_tag !== next) {
        updateStmt.run(next, id, broadcastId);
      }
    }
  });
  run(items);
}
```

在文件底部 `module.exports = { ... }` 中，`updateText,` 之后加入：

```js
  updateStyleTag,
  bulkUpdateStyleTags,
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- tests/services/segmentStore.test.js --runInBand`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/src/services/segmentStore.js backend/tests/services/segmentStore.test.js
git commit -m "feat(store): add updateStyleTag/bulkUpdateStyleTags"
```

---

## Task 4: mimo `suggestStyleTags`

**Files:**
- Modify: `backend/src/services/mimo.js`
- Test: `backend/tests/services/mimo.test.js`

- [ ] **Step 1: 写失败测试**

在 `backend/tests/services/mimo.test.js` 末尾 `});`（关闭顶层 `describe`）之前追加：

```js
  describe('suggestStyleTags', () => {
    test('为每句返回候选标签之一', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: '["平静","严肃","活泼"]' }],
      });
      const tags = await mimo.suggestStyleTags(['第一句', '第二句', '第三句'], ['平静', '严肃', '活泼']);
      expect(tags).toEqual(['平静', '严肃', '活泼']);
    });

    test('非候选标签归为空串', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: '["平静","唱歌"]' }],
      });
      const tags = await mimo.suggestStyleTags(['A', 'B'], ['平静', '严肃']);
      expect(tags).toEqual(['平静', '']);
    });

    test('数量不一致时抛错', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: '["平静"]' }],
      });
      await expect(mimo.suggestStyleTags(['A', 'B'], ['平静'])).rejects.toThrow('数量');
    });

    test('剥离 markdown 代码块', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: '```json\n["平静","严肃"]\n```' }],
      });
      const tags = await mimo.suggestStyleTags(['A', 'B'], ['平静', '严肃']);
      expect(tags).toEqual(['平静', '严肃']);
    });
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/services/mimo.test.js --runInBand`
Expected: FAIL（`suggestStyleTags` 不是函数）

- [ ] **Step 3: 实现**

在 `backend/src/services/mimo.js` 的 `splitScript` 函数之后、`testApiKey` 之前插入：

```js
/**
 * 为各段建议整体风格标签
 * @param {string[]} texts - 各段文本（按 index）
 * @param {string[]} allowedTags - 候选风格标签集
 * @returns {Promise<string[]>} 与 texts 等长的标签数组（候选之一或空串）
 */
async function suggestStyleTags(texts, allowedTags) {
  if (!Array.isArray(texts) || texts.length === 0) {
    throw new Error('请提供有效的句子列表');
  }
  if (!Array.isArray(allowedTags) || allowedTags.length === 0) {
    throw new Error('请提供候选风格标签');
  }

  const config = getLlmConfig();
  const numbered = texts.map((t, i) => `${i + 1}. ${t}`).join('\n');
  const prompt = `你是一个语音风格标注助手。下面是一篇新闻播报被切分后的若干句子。请为【每一句】从候选风格标签中选出最贴合的一个，用于控制该句的语音语气；如果都不贴合就返回空字符串。

候选风格标签：${allowedTags.join('、')}

要求：
1. 以 JSON 数组格式输出，数组长度必须等于句子数量（${texts.length}）
2. 每个元素是候选标签之一，或空字符串 ""
3. 不要修改句子、不要解释，只输出 JSON 数组

句子列表：
${numbered}`;

  const rawText = await createLlmMessage({
    prompt,
    systemPrompt: '你是一个语音风格标注助手，只输出 JSON 数组格式。',
    maxTokens: Math.min(4000, 200 + texts.length * 20),
    thinkingEnabled: config.splitThinkingEnabled,
  });

  const trimmed = rawText.trim();
  let jsonStr = trimmed;
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  let tags;
  try {
    tags = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`AI 风格建议结果解析失败: ${e.message}`);
  }

  if (!Array.isArray(tags) || tags.length !== texts.length) {
    throw new Error('AI 风格建议结果数量与句子数量不一致');
  }

  const allowed = new Set(allowedTags);
  return tags.map((t) => (typeof t === 'string' && allowed.has(t) ? t : ''));
}
```

在 `module.exports = { ... }` 中 `splitScript,` 之后加入：

```js
  suggestStyleTags,
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- tests/services/mimo.test.js --runInBand`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/src/services/mimo.js backend/tests/services/mimo.test.js
git commit -m "feat(mimo): add suggestStyleTags"
```

---

## Task 5: 路由 PUT 支持 styleTag

**Files:**
- Modify: `backend/src/routes/segments.js`
- Test: `backend/tests/routes/segments.test.js`

- [ ] **Step 1: 写失败测试**

在 `backend/tests/routes/segments.test.js` 中 `describe('PUT /api/broadcast/:id/segments/:segId', ...)` 块内部、最后一个 `test(...)` 之后追加：

```js
    test('设置 styleTag 并重置为 pending（含清洗括号）', async () => {
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status, audio_path) VALUES (?, ?, ?, ?, ?)`)
        .run(broadcastId, 0, '文本', 'generated', '/audio/x.wav');
      const seg = db.prepare('SELECT id FROM segments WHERE broadcast_id = ?').get(broadcastId);

      const res = await request(app)
        .put(`/api/broadcast/${broadcastId}/segments/${seg.id}`)
        .send({ styleTag: '(平静)' });

      expect(res.status).toBe(200);
      expect(res.body.segment.style_tag).toBe('平静');
      expect(res.body.segment.status).toBe('pending');
    });

    test('text 与 styleTag 都不传返回 400', async () => {
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status) VALUES (?, ?, ?, ?)`)
        .run(broadcastId, 0, '文本', 'pending');
      const seg = db.prepare('SELECT id FROM segments WHERE broadcast_id = ?').get(broadcastId);

      const res = await request(app)
        .put(`/api/broadcast/${broadcastId}/segments/${seg.id}`)
        .send({});
      expect(res.status).toBe(400);
    });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/routes/segments.test.js --runInBand`
Expected: FAIL（styleTag 未写入；空 body 现在返回 400 但因 text 校验，需确认新分支）

- [ ] **Step 3: 实现**

在 `backend/src/routes/segments.js` 顶部 require 区，`const { validateId, cleanAudioFile } = require('../utils/validation');` 之后加：

```js
const { prependStyleTag, sanitizeStyleTag } = require('../utils/segmentText');
```

将整个 `router.put('/:id/segments/:segId', ...)` 处理器替换为：

```js
router.put('/:id/segments/:segId', (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '播报 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });
    const segIdCheck = validateId(req.params.segId, '句子 ID');
    if (!segIdCheck.valid) return res.status(400).json({ error: segIdCheck.error });

    const { text, styleTag } = req.body;
    const hasText = text !== undefined;
    const hasStyleTag = styleTag !== undefined;
    if (!hasText && !hasStyleTag) {
      return res.status(400).json({ error: '请提供 text 或 styleTag' });
    }
    if (hasText && (typeof text !== 'string' || text.trim().length === 0)) {
      return res.status(400).json({ error: '请提供有效的文本内容' });
    }

    const segment = segmentStore.getByIdAndBroadcastId(segIdCheck.id, idCheck.id);
    if (!segment) return res.status(404).json({ error: '句子不存在' });

    // 改文本或改风格都会改变合成结果，统一清旧音频并由 DAL 重置为 pending
    cleanAudioFile(segment.audio_path);
    if (hasText) segmentStore.updateText(segIdCheck.id, text.trim());
    if (hasStyleTag) segmentStore.updateStyleTag(segIdCheck.id, sanitizeStyleTag(styleTag));

    const updated = segmentStore.getByIdAndBroadcastId(segIdCheck.id, idCheck.id);
    res.json({ segment: updated });
  } catch (error) {
    logger.error({
      err: error,
      hasBroadcastId: Boolean(req.params.id),
      broadcastIdParamLength: typeof req.params.id === 'string' ? req.params.id.length : undefined,
      hasSegmentId: Boolean(req.params.segId),
      segmentIdParamLength: typeof req.params.segId === 'string' ? req.params.segId.length : undefined,
    }, '编辑句子失败');
    res.status(500).json({ error: '编辑句子失败' });
  }
});
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- tests/routes/segments.test.js --runInBand`
Expected: PASS（含原有编辑文本用例）

- [ ] **Step 5: 提交**

```bash
git add backend/src/routes/segments.js backend/tests/routes/segments.test.js
git commit -m "feat(route): PUT segment supports styleTag"
```

---

## Task 6: 生成时注入 `(风格)`

**Files:**
- Modify: `backend/src/routes/segments.js`
- Test: `backend/tests/routes/segments.test.js`

- [ ] **Step 1: 写失败测试**

在 `backend/tests/routes/segments.test.js` 顶层 `describe('Segments API', ...)` 内、`describe('DELETE ...')` 之后追加一个独立 describe（使用顶层 `beforeEach` 建好的 preset `broadcastId`）：

```js
  describe('batch-generate 注入风格标签', () => {
    afterEach(() => {
      jest.restoreAllMocks();
      tts.generateSpeech.mockReset();
    });

    test('生成时把 (风格) 前置到合成文本', async () => {
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status, style_tag) VALUES (?, ?, ?, ?, ?)`)
        .run(broadcastId, 0, '第一句', 'pending', '平静');
      tts.generateSpeech.mockResolvedValue(Buffer.from('wav'));
      jest.spyOn(audioAsset, 'writeSegmentAudio').mockReturnValue('/audio/seg_0.wav');

      const res = await request(app)
        .post(`/api/broadcast/${broadcastId}/segments/batch-generate`)
        .send();

      expect(res.status).toBe(200);
      expect(tts.generateSpeech).toHaveBeenCalledWith(
        expect.objectContaining({ text: '(平静)第一句' })
      );
    }, 15000);

    test('无 style_tag 时文本原样传入', async () => {
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status, style_tag) VALUES (?, ?, ?, ?, ?)`)
        .run(broadcastId, 0, '第二句', 'pending', '');
      tts.generateSpeech.mockResolvedValue(Buffer.from('wav'));
      jest.spyOn(audioAsset, 'writeSegmentAudio').mockReturnValue('/audio/seg_0.wav');

      await request(app).post(`/api/broadcast/${broadcastId}/segments/batch-generate`).send();

      expect(tts.generateSpeech).toHaveBeenCalledWith(
        expect.objectContaining({ text: '第二句' })
      );
    }, 15000);
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/routes/segments.test.js --runInBand`
Expected: FAIL（首个用例：实际 text 为 `第一句` 而非 `(平静)第一句`）

- [ ] **Step 3: 实现 — batch-generate**

在 `backend/src/routes/segments.js` 的 batch-generate 处理器内，找到：

```js
        const audioBuffer = await ttsQueue.enqueue(async () => {
          const speechParams = await voiceConfigService.toSpeechParams({
            text: segment.text,
            voiceType,
            voiceConfig: resolvedVoiceConfig,
            resolveClone: false // clone 音色已在批量开始时统一解析
          });
          return tts.generateSpeech(speechParams);
        });
```

将 `text: segment.text,` 改为：

```js
            text: prependStyleTag(segment.text, segment.style_tag),
```

- [ ] **Step 4: 实现 — regenerate**

在 regenerate 处理器内，找到：

```js
      const speechParams = await voiceConfigService.toSpeechParams({
        text: segment.text,
        voiceType,
        voiceConfig,
        resolveClone: true
      });
```

将 `text: segment.text,` 改为：

```js
        text: prependStyleTag(segment.text, segment.style_tag),
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test -- tests/routes/segments.test.js --runInBand`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add backend/src/routes/segments.js backend/tests/routes/segments.test.js
git commit -m "feat(route): inject (style) tag into segment TTS text"
```

---

## Task 7: suggest-tags 端点

**Files:**
- Modify: `backend/src/routes/segments.js`
- Test: `backend/tests/routes/segments.test.js`

- [ ] **Step 1: 写失败测试**

在 `backend/tests/routes/segments.test.js` 顶部，`const audioAsset = require('../../src/services/audioAsset');` 之后加：

```js
const mimo = require('../../src/services/mimo');
```

在顶层 `describe('Segments API', ...)` 内追加：

```js
  describe('POST /api/broadcast/:id/segments/suggest-tags', () => {
    afterEach(() => jest.restoreAllMocks());

    test('写回 AI 建议的风格标签', async () => {
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status) VALUES (?, ?, ?, ?)`)
        .run(broadcastId, 0, 'A', 'pending');
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status) VALUES (?, ?, ?, ?)`)
        .run(broadcastId, 1, 'B', 'pending');
      jest.spyOn(mimo, 'suggestStyleTags').mockResolvedValue(['平静', '严肃']);

      const res = await request(app)
        .post(`/api/broadcast/${broadcastId}/segments/suggest-tags`)
        .send({ allowedTags: ['平静', '严肃'] });

      expect(res.status).toBe(200);
      expect(res.body.segments.map((s) => s.style_tag)).toEqual(['平静', '严肃']);
    });

    test('缺少 allowedTags 返回 400', async () => {
      const res = await request(app)
        .post(`/api/broadcast/${broadcastId}/segments/suggest-tags`)
        .send({});
      expect(res.status).toBe(400);
    });

    test('不存在的 broadcast 返回 404', async () => {
      const res = await request(app)
        .post('/api/broadcast/99999/segments/suggest-tags')
        .send({ allowedTags: ['平静'] });
      expect(res.status).toBe(404);
    });
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/routes/segments.test.js --runInBand`
Expected: FAIL（端点不存在，404/写回失败）

- [ ] **Step 3: 实现**

在 `backend/src/routes/segments.js` 顶部 require 区加（若未存在）：

```js
const mimo = require('../services/mimo');
```

> 注：文件已 `require('../services/mimo')`，复用即可，勿重复声明。

在 `GET /:id/segments` 路由之后插入新路由：

```js
/**
 * POST /api/broadcast/:id/segments/suggest-tags
 * AI 为各段建议整体风格标签
 */
router.post('/:id/segments/suggest-tags', async (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '播报 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });

    const { allowedTags } = req.body;
    if (!Array.isArray(allowedTags) || allowedTags.length === 0
        || !allowedTags.every((t) => typeof t === 'string')) {
      return res.status(400).json({ error: '请提供候选风格标签 allowedTags' });
    }

    const broadcast = broadcastStore.getById(idCheck.id);
    if (!broadcast) return res.status(404).json({ error: '播报记录不存在' });

    const segments = segmentStore.getByBroadcastId(idCheck.id);
    if (segments.length === 0) return res.status(400).json({ error: '没有可建议的句子' });

    const tags = await mimo.suggestStyleTags(segments.map((s) => s.text), allowedTags);
    segmentStore.bulkUpdateStyleTags(
      idCheck.id,
      segments.map((s, i) => ({ id: s.id, styleTag: tags[i] || '' }))
    );

    const updated = segmentStore.getByBroadcastId(idCheck.id);
    res.json({ segments: updated });
  } catch (error) {
    logger.error({
      err: error,
      hasBroadcastId: Boolean(req.params.id),
      broadcastIdParamLength: typeof req.params.id === 'string' ? req.params.id.length : undefined,
    }, 'AI 建议风格失败');
    res.status(500).json({ error: error.message || 'AI 建议风格失败' });
  }
});
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- tests/routes/segments.test.js --runInBand`
Expected: PASS

- [ ] **Step 5: 全量后端回归**

Run: `npm test -- --runInBand`
Expected: 全部 PASS

- [ ] **Step 6: 提交**

```bash
git add backend/src/routes/segments.js backend/tests/routes/segments.test.js
git commit -m "feat(route): add suggest-tags endpoint"
```

---

## Task 8: 前端标签清单常量

**Files:**
- Create: `frontend/src/constants/toneTags.ts`
- Test: `frontend/src/constants/toneTags.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/constants/toneTags.test.ts`：

```ts
import { describe, test, expect } from 'vitest';
import { STYLE_TAGS, AUDIO_TAGS, sanitizeStyleTag, sanitizeAudioTag } from './toneTags';

describe('toneTags', () => {
  test('清单非空', () => {
    expect(STYLE_TAGS.length).toBeGreaterThan(0);
    expect(AUDIO_TAGS.length).toBeGreaterThan(0);
  });
  test('sanitizeStyleTag 去括号/trim/限长', () => {
    expect(sanitizeStyleTag(' (平静) ')).toBe('平静');
    expect(sanitizeStyleTag('（严肃）')).toBe('严肃');
    expect(sanitizeStyleTag('一'.repeat(30)).length).toBe(20);
  });
  test('sanitizeAudioTag 去方括号', () => {
    expect(sanitizeAudioTag('[停顿]')).toBe('停顿');
    expect(sanitizeAudioTag('')).toBe('');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- toneTags`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

创建 `frontend/src/constants/toneTags.ts`：

```ts
// 分段语气标签清单（新闻向精选）与清洗
// 整体风格标签：放在该段文本最开头，包成 (风格)
export const STYLE_TAGS = ['平静', '严肃', '活泼', '深沉', '温柔', '干练', '惊讶', '兴奋'];

// 细粒度音频标签：插入文本任意位置，包成 [标签]
export const AUDIO_TAGS = ['停顿', '吸气', '叹气', '轻笑', '深呼吸'];

export function sanitizeStyleTag(raw: string): string {
  return (raw ?? '').replace(/[()（）[\]]/g, '').trim().slice(0, 20);
}

export function sanitizeAudioTag(raw: string): string {
  return (raw ?? '').replace(/[[\]]/g, '').trim().slice(0, 20);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- toneTags`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/constants/toneTags.ts frontend/src/constants/toneTags.test.ts
git commit -m "feat(fe): add toneTags constants"
```

---

## Task 9: 前端契约（types + schemas）

**Files:**
- Modify: `frontend/src/store/types.ts`
- Modify: `frontend/src/services/schemas.ts`

- [ ] **Step 1: types.ts — Segment 加字段**

在 `frontend/src/store/types.ts` 的 `Segment` 接口里，`status: ...;` 之后加：

```ts
  style_tag: string;
```

- [ ] **Step 2: types.ts — AppState 加状态与 action**

在 `AppState` 接口里，`clearSegments: () => void;` 之前加：

```ts
  isSuggestingTags: boolean;
  updateSegmentStyleTag: (broadcastId: number, segId: number, styleTag: string) => Promise<Segment>;
  suggestTags: (broadcastId: number) => Promise<Segment[]>;
```

- [ ] **Step 3: schemas.ts — SegmentSchema 加字段**

在 `frontend/src/services/schemas.ts` 的 `SegmentSchema` 里，`status: z.enum([...]),` 之后加：

```ts
  style_tag: z.string(),
```

- [ ] **Step 4: 类型检查**

Run: `npm run build`
Expected: 此时会因 `segmentSlice` 未实现新 action 而 **报类型错误**（预期，下一 Task 修复）。先确认错误只与 `updateSegmentStyleTag`/`suggestTags`/`isSuggestingTags` 相关。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/store/types.ts frontend/src/services/schemas.ts
git commit -m "feat(fe): add style_tag to Segment contract"
```

---

## Task 10: 前端 API 方法

**Files:**
- Modify: `frontend/src/services/api.ts`

- [ ] **Step 1: 扩展 updateSegment 签名**

在 `frontend/src/services/api.ts` 中把：

```ts
  updateSegment: (broadcastId: number, segId: number, data: { text: string }) =>
    api.put(`/broadcast/${broadcastId}/segments/${segId}`, data),
```

改为：

```ts
  updateSegment: (broadcastId: number, segId: number, data: { text?: string; styleTag?: string }) =>
    api.put(`/broadcast/${broadcastId}/segments/${segId}`, data),
```

- [ ] **Step 2: 新增 suggestSegmentTags**

在同一 `broadcastApi` 对象中 `reorderSegments: ...,` 之后加：

```ts
  suggestSegmentTags: (broadcastId: number, allowedTags: string[]) =>
    api.post(`/broadcast/${broadcastId}/segments/suggest-tags`, { allowedTags }),
```

- [ ] **Step 3: 提交**

```bash
git add frontend/src/services/api.ts
git commit -m "feat(fe): api updateSegment styleTag + suggestSegmentTags"
```

---

## Task 11: 前端 store slice

**Files:**
- Modify: `frontend/src/store/segmentSlice.ts`

- [ ] **Step 1: 引入常量**

在 `frontend/src/store/segmentSlice.ts` 顶部 import 区加：

```ts
import { STYLE_TAGS } from '../constants/toneTags';
```

- [ ] **Step 2: 扩展 Pick 列表**

把 `createSegmentSlice` 返回类型的 `Pick<AppState, ...>` 联合中加入三项（放在 `| 'clearSegments'` 之前）：

```ts
  | 'isSuggestingTags'
  | 'updateSegmentStyleTag'
  | 'suggestTags'
```

- [ ] **Step 3: 初始状态**

在 `return { ... }` 顶部 `isMerging: false,` 之后加：

```ts
    isSuggestingTags: false,
```

- [ ] **Step 4: 实现两个 action**

在 `clearSegments: () => { ... },` 之前加：

```ts
    updateSegmentStyleTag: async (broadcastId, segId, styleTag) => {
      try {
        const response = await broadcastApi.updateSegment(broadcastId, segId, { styleTag });
        const updated = response.data.segment;
        set((state) => ({
          segments: state.segments.map((s) => (s.id === segId ? updated : s)),
        }));
        return updated;
      } catch (error) {
        logger.error({ err: toLogError(error), broadcastId, segmentId: segId }, '设置风格标签失败');
        throw error;
      }
    },

    suggestTags: async (broadcastId) => {
      set({ isSuggestingTags: true });
      try {
        const response = await broadcastApi.suggestSegmentTags(broadcastId, STYLE_TAGS);
        const segments = response.data.segments;
        set({ segments, isSuggestingTags: false });
        return segments;
      } catch (error) {
        set({ isSuggestingTags: false });
        logger.error({ err: toLogError(error), broadcastId }, 'AI 建议风格失败');
        throw error;
      }
    },
```

- [ ] **Step 5: 类型检查通过**

Run: `npm run build`
Expected: PASS（Task 9 引入的类型错误此时消除）

- [ ] **Step 6: 提交**

```bash
git add frontend/src/store/segmentSlice.ts
git commit -m "feat(fe): segment slice updateSegmentStyleTag/suggestTags"
```

---

## Task 12: TagPicker 组件

**Files:**
- Create: `frontend/src/components/Dashboard/TagPicker.tsx`

- [ ] **Step 1: 实现**

创建 `frontend/src/components/Dashboard/TagPicker.tsx`：

```tsx
import React, { useState } from 'react';
import { STYLE_TAGS, sanitizeStyleTag } from '../../constants/toneTags';

interface TagPickerProps {
  value: string;
  onSelect: (tag: string) => void;
  onClose: () => void;
}

export const TagPicker: React.FC<TagPickerProps> = ({ value, onSelect, onClose }) => {
  const [custom, setCustom] = useState('');

  const applyCustom = () => {
    const clean = sanitizeStyleTag(custom);
    if (clean) onSelect(clean);
  };

  return (
    <div className="absolute z-20 mt-1 left-0 w-64 bg-white rounded-xl shadow-card border border-card-border p-3">
      <div className="flex flex-wrap gap-1.5 mb-2">
        {STYLE_TAGS.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => onSelect(tag)}
            className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
              value === tag ? 'bg-lilac/30 border-lilac' : 'bg-paper-2/40 border-card-border hover:bg-lilac/10'
            }`}
          >
            {tag}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5 items-center border-t border-card-border pt-2">
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyCustom(); } }}
          placeholder="自定义风格"
          className="flex-1 text-[11px] border border-card-border rounded-lg px-2 py-1 focus:outline-none focus:border-ink/25"
        />
        <button type="button" onClick={applyCustom} className="text-[11px] px-2.5 py-1 bg-sage text-ink rounded-lg shadow-btn">应用</button>
      </div>
      <div className="flex justify-between mt-2">
        <button type="button" onClick={() => onSelect('')} className="text-[11px] text-pink">清除</button>
        <button type="button" onClick={onClose} className="text-[11px] text-ink-soft">关闭</button>
      </div>
    </div>
  );
};

export default TagPicker;
```

- [ ] **Step 2: 类型检查**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/Dashboard/TagPicker.tsx
git commit -m "feat(fe): add TagPicker component"
```

---

## Task 13: AudioTagInserter 组件

**Files:**
- Create: `frontend/src/components/Dashboard/AudioTagInserter.tsx`

- [ ] **Step 1: 实现**

创建 `frontend/src/components/Dashboard/AudioTagInserter.tsx`：

```tsx
import React, { useState } from 'react';
import { AUDIO_TAGS, sanitizeAudioTag } from '../../constants/toneTags';

interface AudioTagInserterProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
}

export const AudioTagInserter: React.FC<AudioTagInserterProps> = ({ textareaRef, value, onChange }) => {
  const [custom, setCustom] = useState('');

  const insert = (rawTag: string) => {
    const tag = sanitizeAudioTag(rawTag);
    if (!tag) return;
    const token = `[${tag}]`;
    const el = textareaRef.current;
    const pos = el ? el.selectionStart : value.length;
    const next = value.slice(0, pos) + token + value.slice(pos);
    onChange(next);
    requestAnimationFrame(() => {
      if (el) {
        el.focus();
        el.selectionStart = el.selectionEnd = pos + token.length;
      }
    });
  };

  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5 items-center">
      <span className="text-[10px] text-ink-soft/60">插入</span>
      {AUDIO_TAGS.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={() => insert(tag)}
          className="text-[10px] px-2 py-0.5 rounded-full bg-pink/10 border border-pink/30 hover:bg-pink/20 transition-colors"
        >
          {tag}
        </button>
      ))}
      <input
        value={custom}
        onChange={(e) => setCustom(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); insert(custom); setCustom(''); } }}
        placeholder="自定义"
        className="text-[10px] w-20 border border-card-border rounded-lg px-1.5 py-0.5 focus:outline-none"
      />
    </div>
  );
};

export default AudioTagInserter;
```

- [ ] **Step 2: 类型检查**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/Dashboard/AudioTagInserter.tsx
git commit -m "feat(fe): add AudioTagInserter component"
```

---

## Task 14: SegmentEditor 集成（布局 B + 插入 + 工具栏）

**Files:**
- Modify: `frontend/src/components/Dashboard/SegmentEditor.tsx`

- [ ] **Step 1: 引入依赖与 store action**

顶部 import 区，`import { useBatchGenerateSSE } from '../../hooks/useSSE';` 之后加：

```tsx
import { TagPicker } from './TagPicker';
import { AudioTagInserter } from './AudioTagInserter';
```

在组件内 `const mergeSegments = useStore((s) => s.mergeSegments);` 之后加：

```tsx
  const updateSegmentStyleTag = useStore((s) => s.updateSegmentStyleTag);
  const suggestTags = useStore((s) => s.suggestTags);
  const isSuggestingTags = useStore((s) => s.isSuggestingTags);
```

- [ ] **Step 2: 新增本地状态与 ref**

在 `const [error, setError] = useState<string | null>(null);` 之后加：

```tsx
  const [openTagPickerId, setOpenTagPickerId] = useState<number | null>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
```

- [ ] **Step 3: 新增处理函数**

在 `const handleMerge = ...;` 之后加：

```tsx
  const handleSetStyleTag = async (segId: number, styleTag: string) => {
    setError(null);
    setOpenTagPickerId(null);
    try { await updateSegmentStyleTag(broadcastId, segId, styleTag); }
    catch { setError('设置风格标签失败'); }
  };
  const handleSuggestTags = async () => {
    setError(null);
    try { await suggestTags(broadcastId); }
    catch (err) { setError(getApiErrorMessage(err, 'AI 建议风格失败')); }
  };
```

- [ ] **Step 4: 替换 segment 行 JSX（布局 B）**

将 `segments.map((seg, index) => ( ... ))` 中整个 `<div key={seg.id} ...> ... </div>` 行替换为：

```tsx
          <div
            key={seg.id}
            className={`bg-white/45 rounded-2xl p-3 border transition-all duration-300 ${
              seg.status === 'generating'
                ? 'border-lilac/40 bg-lilac/5 animate-pulse'
                : seg.status === 'generated'
                ? 'border-sage/30'
                : seg.status === 'failed'
                ? 'border-pink/30 bg-pink/5'
                : 'border-card-border'
            }`}
            style={{ animation: `fade-in-up 0.3s cubic-bezier(0.22, 1, 0.36, 1) ${index * 0.05}s both` }}
          >
            {/* 第一行：序号 + 文本 + 状态 + 音频 + 操作 */}
            <div className="flex items-center gap-3">
              <span className="font-display italic text-[18px] font-medium text-lilac min-w-[22px]">
                {String(seg.index + 1).padStart(2, '0')}
              </span>

              <div className="flex-1 min-w-0">
                {editingId === seg.id ? (
                  <div className="animate-fade-in">
                    <textarea
                      ref={editTextareaRef}
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="w-full h-16 bg-white/60 text-ink rounded-xl px-3 py-2 border border-ink/15 focus:border-ink/25 focus:outline-none resize-none font-body text-[12px]"
                      autoFocus
                    />
                    <AudioTagInserter textareaRef={editTextareaRef} value={editText} onChange={setEditText} />
                    <div className="flex gap-2 mt-1.5">
                      <button onClick={() => handleSaveEdit(seg.id)} className="px-3 py-1 bg-sage text-ink text-[11px] font-body rounded-lg shadow-btn">保存</button>
                      <button onClick={handleCancelEdit} className="px-3 py-1 text-ink-soft text-[11px] font-body">取消</button>
                    </div>
                  </div>
                ) : (
                  <p className="font-body text-[12px] text-ink leading-relaxed truncate">{seg.text}</p>
                )}
              </div>

              <StatusBadge status={seg.status} />

              {seg.status === 'generated' && seg.audio_path && (
                <SegmentAudio audioUrl={`${seg.audio_path}?t=${seg.updated_at}`} />
              )}

              <div className="flex items-center gap-0.5">
                <button onClick={() => handleStartEdit(seg)} disabled={seg.status === 'generating' || editingId === seg.id} className="p-1.5 rounded-lg text-ink-soft/40 hover:text-ink hover:bg-white/50 transition-colors disabled:opacity-30" title="编辑">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </button>
                <button onClick={() => handleRegenerate(seg.id)} disabled={seg.status === 'generating'} className="p-1.5 rounded-lg text-ink-soft/40 hover:text-ink hover:bg-white/50 transition-colors disabled:opacity-30" title="重新生成">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
                <button onClick={() => handleDelete(seg.id)} disabled={seg.status === 'generating'} className="p-1.5 rounded-lg text-ink-soft/40 hover:text-pink hover:bg-white/50 transition-colors disabled:opacity-30" title="删除">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            </div>

            {/* 第二行：风格标签 meta（编辑态隐藏） */}
            {editingId !== seg.id && (
              <div className="relative flex items-center gap-2 mt-2 pl-[34px]">
                <span className="text-[10px] text-ink-soft/60">风格</span>
                <button
                  type="button"
                  onClick={() => setOpenTagPickerId(openTagPickerId === seg.id ? null : seg.id)}
                  className={`text-[11px] px-2.5 py-0.5 rounded-full border transition-colors ${
                    seg.style_tag ? 'bg-lilac/20 border-lilac/40 text-ink' : 'bg-paper-2/40 border-dashed border-card-border text-ink-soft/70'
                  }`}
                >
                  {seg.style_tag ? `(${seg.style_tag})` : '+ 风格'}
                </button>
                {openTagPickerId === seg.id && (
                  <TagPicker
                    value={seg.style_tag}
                    onSelect={(tag) => handleSetStyleTag(seg.id, tag)}
                    onClose={() => setOpenTagPickerId(null)}
                  />
                )}
              </div>
            )}
          </div>
```

- [ ] **Step 5: 工具栏加「AI 建议风格」按钮**

将底部按钮区（`<div className="flex items-center gap-2">` 包裹「全部生成 / 合并音频」）中，在「全部生成」按钮之前插入：

```tsx
        <button
          onClick={handleSuggestTags}
          disabled={isSuggestingTags || segments.length === 0}
          className="flex-1 bg-sky/20 hover:bg-sky/30 disabled:opacity-40 text-ink font-body font-medium text-[12px] rounded-xl px-4 py-2.5 shadow-btn transition-all duration-150 uppercase tracking-wider"
        >
          {isSuggestingTags ? '建议中...' : '✨ AI 建议风格'}
        </button>
```

> 若设计系统无 `sky` 色，则用 `bg-lemon/30 hover:bg-lemon/40`（与现有调色板一致）。

- [ ] **Step 6: 类型检查与 lint**

Run: `npm run build`
Expected: PASS

Run: `npm run lint`
Expected: PASS（无新增告警）

- [ ] **Step 7: 提交**

```bash
git add frontend/src/components/Dashboard/SegmentEditor.tsx
git commit -m "feat(fe): segment tone tags UI (layout B + insert + suggest)"
```

---

## Task 15: 全量校验

**Files:** 无（仅运行）

- [ ] **Step 1: 后端全量测试**

Run: `npm test -- --runInBand`（在 `backend/`）
Expected: 全部 PASS

- [ ] **Step 2: 前端测试 + 构建 + lint**

Run: `npm test`（在 `frontend/`）
Expected: PASS

Run: `npm run build`（在 `frontend/`）
Expected: PASS

Run: `npm run lint`（在 `frontend/`）
Expected: PASS

---

## Task 16: 文档同步

**Files:**
- Modify: `docs/project-facts.md`

- [ ] **Step 1: 更新 segments 字段说明**

在 `docs/project-facts.md`「关键字段说明」中 `segments.status：该段状态` 之后加：

```markdown
- `segments.style_tag`：该段整体风格标签（如 `平静`；空串=无），生成时前置为 `(风格)`，细粒度 `[音频标签]` 内联在 `segments.text`
```

- [ ] **Step 2: 更新外部行为/端点说明**

在「关键开发模式」列表中补一条：

```markdown
- 分段生成时由 `routes/segments.js` 经 `utils/segmentText.js` 的 `prependStyleTag` 将 `segment.style_tag` 前置到合成文本；`POST /api/broadcast/:id/segments/suggest-tags` 调 `mimo.suggestStyleTags` 为各段建议风格标签
```

- [ ] **Step 3: 提交**

```bash
git add docs/project-facts.md
git commit -m "docs: document segment style_tag and suggest-tags"
```

---

## Self-Review 记录

- **Spec 覆盖：** style_tag 列(T1)、注入(T2/T6)、DAL(T3)、AI 建议(T4/T7)、PUT(T5)、清单常量(T8)、契约(T9)、api(T10)、slice(T11)、TagPicker(T12)、AudioTagInserter(T13)、SegmentEditor 布局B/插入/工具栏(T14)、校验(T15)、文档(T16)。模式边界（emotion/design 优先级）为"仅 UI 提示、不硬限制"，在 T14 的风格 meta 行可按需加一句静态提示，非阻断逻辑，故未单列编码任务。
- **占位符扫描：** 无 TBD/TODO；每个改码步骤均含完整代码与命令。
- **类型/命名一致：** DB/记录用 `style_tag`（snake），JS/wire 参数用 `styleTag`（camel），贯穿 schema→DAL→route→api→slice→组件一致；`prependStyleTag`/`sanitizeStyleTag`/`updateStyleTag`/`bulkUpdateStyleTags`/`suggestStyleTags`/`suggestSegmentTags`/`updateSegmentStyleTag`/`suggestTags` 各处引用名一致。
