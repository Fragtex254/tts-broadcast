# 逐句 TTS 生成实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将整段 TTS 生成改造为逐句切分 → 逐句生成 → 手动合并的三阶段流程。

**Architecture:** 新增 `segments` 表存储逐句数据，新增 `audio` 服务处理 WAV 合并，新增 `mimo.splitScript()` 调用 LLM 切分稿件，新增 segment 路由处理逐句 CRUD，前端新增 `SegmentEditor` 组件替代原有整段生成按钮。

**Tech Stack:** Node.js, Express, better-sqlite3, MiMo LLM/TTS API, React, TypeScript, Zustand, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-06-06-segment-tts-design.md`

---

## File Structure

### Backend 新增文件
- `backend/src/services/audio.js` — WAV 合并服务
- `backend/tests/services/audio.test.js` — WAV 合并测试

### Backend 修改文件
- `backend/src/db/schema.sql` — 新增 segments 表定义
- `backend/src/db/index.js` — 新增 mode 列迁移 + segments 表创建
- `backend/src/services/mimo.js` — 新增 `splitScript()` 函数
- `backend/src/routes/broadcast.js` — 修改 generate 路由支持 segmented mode，扩展 save/delete 清理 segment 文件，新增 segment 相关路由
- `backend/tests/routes/broadcast.test.js` — 新增 segment 相关测试
- `backend/tests/services/mimo.test.js` — 新增 splitScript 测试

### Frontend 新增文件
- `frontend/src/components/Dashboard/SegmentEditor.tsx` — 逐句编辑器组件

### Frontend 修改文件
- `frontend/src/services/api.ts` — 新增 segment API 方法
- `frontend/src/store/index.ts` — 新增 Segment 接口和 segment 相关状态/actions
- `frontend/src/components/Dashboard/VoiceGenerator.tsx` — 替换生成按钮为切分流程
- `frontend/src/components/Dashboard/AudioPlayer.tsx` — 支持 segmented mode 提示
- `frontend/src/components/Dashboard/ScriptPreview.tsx` — 移除旧的"使用此稿件生成语音"按钮
- `frontend/src/pages/Dashboard.tsx` — 集成 SegmentEditor

---

## Task 1: Database Schema & Migration

**Files:**
- Modify: `backend/src/db/schema.sql`
- Modify: `backend/src/db/index.js`

### Step 1: 更新 schema.sql，新增 segments 表

将 `backend/src/db/schema.sql` 的完整内容替换为：

```sql
-- backend/src/db/schema.sql
CREATE TABLE IF NOT EXISTS broadcasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  audio_path TEXT,
  duration INTEGER,
  voice_type TEXT,
  voice_config TEXT,
  source_items TEXT,
  status TEXT DEFAULT 'pending',
  saved BOOLEAN DEFAULT 0,
  mode TEXT DEFAULT 'whole',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  content_types TEXT,
  is_active BOOLEAN DEFAULT 1,
  last_run_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  broadcast_id INTEGER NOT NULL,
  "index" INTEGER NOT NULL,
  text TEXT NOT NULL,
  audio_path TEXT,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (broadcast_id) REFERENCES broadcasts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_broadcasts_created_at ON broadcasts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_schedules_is_active ON schedules(is_active);
CREATE INDEX IF NOT EXISTS idx_segments_broadcast_id ON segments(broadcast_id);
```

注意：`index` 是 SQLite 保留字，需要用双引号转义。

### Step 2: 更新 db/index.js，新增 mode 列迁移

在 `backend/src/db/index.js` 中，在 `saved` 列迁移代码之后添加 `mode` 列迁移：

```js
// 迁移：为旧数据库添加 mode 列
try {
  db.prepare('SELECT mode FROM broadcasts LIMIT 1').get();
} catch {
  db.exec("ALTER TABLE broadcasts ADD COLUMN mode TEXT DEFAULT 'whole'");
}
```

### Step 3: 验证迁移

在 `backend/` 目录下运行：

```bash
cd backend && node -e "const db = require('./src/db'); console.log(db.prepare('SELECT * FROM segments LIMIT 0').columns); console.log(db.prepare('SELECT mode FROM broadcasts LIMIT 1').get());"
```

Expected: 输出 segments 表列信息和 `{ mode: 'whole' }` 或 `{ mode: null }`。

### Step 4: Commit

```bash
git add backend/src/db/schema.sql backend/src/db/index.js
git commit -m "feat(db): add segments table and broadcast mode column"
```

---

## Task 2: WAV Merge Service

**Files:**
- Create: `backend/src/services/audio.js`
- Create: `backend/tests/services/audio.test.js`

### Step 1: 编写 WAV 合并测试

创建 `backend/tests/services/audio.test.js`：

```js
const fs = require('fs');
const path = require('path');
const os = require('os');
const { mergeWavFiles } = require('../../src/services/audio');

/**
 * 创建一个最小的有效 WAV 文件（24kHz, 16bit, mono）
 * @param {number} sampleCount - PCM 样本数（每个样本 2 字节）
 * @returns {Buffer}
 */
function createTestWav(sampleCount) {
  const dataSize = sampleCount * 2; // 16bit = 2 bytes per sample
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt subchunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);      // subchunk1 size
  buffer.writeUInt16LE(1, 20);       // PCM format
  buffer.writeUInt16LE(1, 22);       // mono
  buffer.writeUInt32LE(24000, 24);   // 24kHz sample rate
  buffer.writeUInt32LE(48000, 28);   // byte rate (24000 * 1 * 2)
  buffer.writeUInt16LE(2, 32);       // block align (1 * 2)
  buffer.writeUInt16LE(16, 34);      // bits per sample

  // data subchunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // 填充 PCM 数据（递增值用于验证顺序）
  for (let i = 0; i < sampleCount; i++) {
    buffer.writeInt16LE(i % 32000, 44 + i * 2);
  }

  return buffer;
}

describe('WAV 合并服务', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wav-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('合并两个 WAV 文件，header 大小正确', () => {
    const wav1 = createTestWav(100);
    const wav2 = createTestWav(200);

    const file1 = path.join(tmpDir, 'a.wav');
    const file2 = path.join(tmpDir, 'b.wav');
    fs.writeFileSync(file1, wav1);
    fs.writeFileSync(file2, wav2);

    const merged = mergeWavFiles([file1, file2]);

    // PCM 数据总大小 = (100 + 200) * 2 = 600
    expect(merged.length).toBe(44 + 600);

    // RIFF chunk size = 总大小 - 8
    expect(merged.readUInt32LE(4)).toBe(44 + 600 - 8);

    // data chunk size = 600
    expect(merged.readUInt32LE(40)).toBe(600);
  });

  test('合并三个 WAV 文件，PCM 数据按顺序拼接', () => {
    const wav1 = createTestWav(50);
    const wav2 = createTestWav(50);
    const wav3 = createTestWav(50);

    const files = [wav1, wav2, wav3].map((buf, i) => {
      const fp = path.join(tmpDir, `${i}.wav`);
      fs.writeFileSync(fp, buf);
      return fp;
    });

    const merged = mergeWavFiles(files);

    // 验证第一个文件的第一个 PCM 样本在正确位置
    const firstSample = merged.readInt16LE(44);
    expect(firstSample).toBe(0); // i % 32000 where i=0

    // 验证第二个文件的第一个 PCM 样本紧跟第一个文件
    const secondFileStart = 44 + 50 * 2;
    const secondFirstSample = merged.readInt16LE(secondFileStart);
    expect(secondFirstSample).toBe(0); // 新文件从 0 开始
  });

  test('单个文件合并返回相同内容', () => {
    const wav = createTestWav(100);
    const fp = path.join(tmpDir, 'single.wav');
    fs.writeFileSync(fp, wav);

    const merged = mergeWavFiles([fp]);
    expect(merged.length).toBe(wav.length);
    expect(merged.readUInt32LE(4)).toBe(wav.readUInt32LE(4));
    expect(merged.readUInt32LE(40)).toBe(wav.readUInt32LE(40));
  });

  test('空文件列表抛出错误', () => {
    expect(() => mergeWavFiles([])).toThrow('至少需要一个 WAV 文件');
  });
});
```

### Step 2: 运行测试验证失败

```bash
cd backend && npm test -- tests/services/audio.test.js
```

Expected: FAIL — `Cannot find module '../../src/services/audio'`

### Step 3: 实现 WAV 合并服务

创建 `backend/src/services/audio.js`：

```js
const fs = require('fs');

const WAV_HEADER_SIZE = 44;

/**
 * 合并多个 WAV 文件为一个
 * 要求所有 WAV 文件格式一致（24kHz/16bit/mono）
 * @param {string[]} filePaths - WAV 文件路径数组（按播放顺序）
 * @returns {Buffer} 合并后的 WAV Buffer
 */
function mergeWavFiles(filePaths) {
  if (!filePaths || filePaths.length === 0) {
    throw new Error('至少需要一个 WAV 文件');
  }

  const buffers = filePaths.map(fp => fs.readFileSync(fp));

  // 用第一个文件的 header 作为模板
  const header = Buffer.from(buffers[0].slice(0, WAV_HEADER_SIZE));

  // 提取所有文件的 PCM 数据（从 byte 44 开始）
  const pcmChunks = buffers.map(buf => buf.slice(WAV_HEADER_SIZE));
  const totalPcmSize = pcmChunks.reduce((sum, chunk) => sum + chunk.length, 0);

  // 拼接所有 PCM 数据
  const mergedPcm = Buffer.concat(pcmChunks);

  // 更新 header 中的大小字段
  header.writeUInt32LE(WAV_HEADER_SIZE + totalPcmSize - 8, 4); // RIFF chunk size
  header.writeUInt32LE(totalPcmSize, 40);                       // data chunk size

  return Buffer.concat([header, mergedPcm]);
}

module.exports = { mergeWavFiles };
```

### Step 4: 运行测试验证通过

```bash
cd backend && npm test -- tests/services/audio.test.js
```

Expected: 全部 4 个测试 PASS。

### Step 5: Commit

```bash
git add backend/src/services/audio.js backend/tests/services/audio.test.js
git commit -m "feat: add WAV merge service for segment audio concatenation"
```

---

## Task 3: AI Script Splitting Service

**Files:**
- Modify: `backend/src/services/mimo.js`
- Modify: `backend/tests/services/mimo.test.js`

### Step 1: 编写 splitScript 测试

在 `backend/tests/services/mimo.test.js` 末尾追加：

```js
test('splitScript 存在且为函数', () => {
  expect(typeof mimo.splitScript).toBe('function');
});

test('splitScript 切分口播稿', async () => {
  const script = `大家好，欢迎收听今日AI简讯。今天我们来聊聊几个重要的AI动态。首先是OpenAI发布了最新的GPT-5模型，这款模型在推理能力上有了显著提升。其次是谷歌推出了新的Gemini版本，在多模态理解方面表现出色。以上就是今天的AI简讯，感谢收听，我们明天再见。`;

  const segments = await mimo.splitScript(script);
  expect(Array.isArray(segments)).toBe(true);
  expect(segments.length).toBeGreaterThan(1);
  segments.forEach(seg => {
    expect(typeof seg).toBe('string');
    expect(seg.length).toBeGreaterThan(0);
  });
});
```

### Step 2: 运行测试验证失败

```bash
cd backend && npm test -- tests/services/mimo.test.js
```

Expected: FAIL — `mimo.splitScript is not a function`

### Step 3: 实现 splitScript 函数

在 `backend/src/services/mimo.js` 的 `testApiKey` 函数之前，添加 `splitScript` 函数：

```js
/**
 * 将口播稿切分为适合 TTS 的短句
 * @param {string} text - 完整口播稿
 * @returns {Promise<string[]>} 切分后的短句数组
 */
async function splitScript(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('请提供有效的口播稿文本');
  }

  const client = createClient();

  const prompt = `你是一个专业的文本切分助手。请将以下口播稿切分为适合 TTS 语音合成的短句。

切分原则：
1. 按语义完整性和自然停顿切分，不要简单按标点符号拆分
2. 每句长度控制在 15~80 个字符（太短影响 TTS 韵律，太长不便独立编辑）
3. 开场白和结束语各自作为独立的一句
4. 不要修改原文内容，只做切分
5. 保持原文顺序

请以 JSON 数组格式输出，每个元素是一个短句。只输出 JSON 数组，不要有其他内容。

示例输出：["大家好，欢迎收听今日AI简讯。", "今天我们来聊聊几个重要的AI动态。", "..."]

口播稿内容：
${text}`;

  const message = await client.messages.create({
    model: 'mimo-v2.5',
    max_tokens: 4000,
    system: '你是一个文本切分助手，只输出 JSON 数组格式。',
    messages: [
      { role: 'user', content: prompt }
    ]
  });

  if (!message?.content?.[0]?.text) {
    throw new Error('MiMo API 返回内容为空');
  }

  const rawText = message.content[0].text.trim();

  // 尝试解析 JSON，处理可能的 markdown 代码块包裹
  let jsonStr = rawText;
  const codeBlockMatch = rawText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  let segments;
  try {
    segments = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`AI 切分结果解析失败: ${e.message}`);
  }

  if (!Array.isArray(segments) || segments.length === 0) {
    throw new Error('AI 切分结果为空或格式不正确');
  }

  // 验证每个 segment 是非空字符串
  for (const seg of segments) {
    if (typeof seg !== 'string' || seg.trim().length === 0) {
      throw new Error('切分结果包含空句子');
    }
  }

  return segments.map(s => s.trim());
}
```

同时在 `module.exports` 中添加 `splitScript`：

```js
module.exports = {
  rewriteToScript,
  generateSpeech,
  splitScript,
  testApiKey
};
```

### Step 4: 运行测试验证通过

```bash
cd backend && npm test -- tests/services/mimo.test.js
```

Expected: 全部测试 PASS（包括新增的 splitScript 测试）。

### Step 5: Commit

```bash
git add backend/src/services/mimo.js backend/tests/services/mimo.test.js
git commit -m "feat: add AI script splitting service (mimo.splitScript)"
```

---

## Task 4: Segment Routes

**Files:**
- Modify: `backend/src/routes/broadcast.js`
- Modify: `backend/tests/routes/broadcast.test.js`

### Step 1: 编写 segment 路由测试

在 `backend/tests/routes/broadcast.test.js` 的 `describe` 块末尾追加以下测试：

```js
// ============ Segment API 测试 ============

let segmentedBroadcastId;

test('POST /api/broadcast/generate (segmented) - 创建 segmented 广播', async () => {
  // 先插入一条记录模拟 segmented 广播
  const result = db.prepare(`
    INSERT INTO broadcasts (title, content, voice_type, voice_config, status, mode)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    '测试切分稿件',
    '大家好，欢迎收听今日AI简讯。今天我们聊聊AI最新动态。以上就是今天的内容，感谢收听。',
    'preset',
    '{"voice":"冰糖"}',
    'pending',
    'segmented'
  );
  segmentedBroadcastId = result.lastInsertRowid;
  expect(segmentedBroadcastId).toBeGreaterThan(0);
});

test('GET /api/broadcast/:id/segments - 获取空 segments 列表', async () => {
  const res = await request(app).get(`/api/broadcast/${segmentedBroadcastId}/segments`);
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('segments');
  expect(Array.isArray(res.body.segments)).toBe(true);
});

test('POST /api/broadcast/:id/segments/reorder - 重排序 segments', async () => {
  // 先手动插入两个 segment
  db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status) VALUES (?, ?, ?, ?)`)
    .run(segmentedBroadcastId, 0, '第一句', 'pending');
  db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status) VALUES (?, ?, ?, ?)`)
    .run(segmentedBroadcastId, 1, '第二句', 'pending');

  const segments = db.prepare('SELECT id FROM segments WHERE broadcast_id = ? ORDER BY "index"')
    .all(segmentedBroadcastId);

  const res = await request(app)
    .post(`/api/broadcast/${segmentedBroadcastId}/segments/reorder`)
    .send({ segmentIds: [segments[1].id, segments[0].id] });

  expect(res.status).toBe(200);
  expect(res.body.segments[0].text).toBe('第二句');
  expect(res.body.segments[1].text).toBe('第一句');

  // 清理
  db.prepare('DELETE FROM segments WHERE broadcast_id = ?').run(segmentedBroadcastId);
});

test('POST /api/broadcast/:id/segments/merge - 无 segments 返回 400', async () => {
  const res = await request(app)
    .post(`/api/broadcast/${segmentedBroadcastId}/segments/merge`)
    .send();
  expect(res.status).toBe(400);
});

test('GET /api/broadcast/:id/segments - 不存在的广播返回 404', async () => {
  const res = await request(app).get('/api/broadcast/99999/segments');
  expect(res.status).toBe(404);
});
```

### Step 2: 运行测试验证失败

```bash
cd backend && npm test -- tests/routes/broadcast.test.js
```

Expected: FAIL — 新增的 segment 路由测试返回 404（路由不存在）。

### Step 3: 实现 segment 路由

在 `backend/src/routes/broadcast.js` 中，需要做以下修改：

**3a.** 在文件顶部引入 audio 服务和 mimo 服务（mimo 已有，新增 audio）：

```js
const audio = require('../services/audio');
```

**3b.** 在 `GET /api/broadcast/:id/audio` 路由之前，添加以下 segment 路由：

```js
// ============ Segment API ============

/**
 * POST /api/broadcast/generate (segmented mode)
 * 创建一个 segmented 模式的广播记录（无音频，等待切分）
 */
// 注意：这个逻辑合并在现有的 /generate 路由中，通过 mode 参数区分

/**
 * POST /api/broadcast/:id/split
 * AI 切分稿件为短句，创建 segments
 */
router.post('/:id/split', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: '无效的播报 ID' });
    }

    const broadcast = db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(id);
    if (!broadcast) {
      return res.status(404).json({ error: '播报记录不存在' });
    }

    // 若已有 segments，先删除旧的及其音频文件
    const oldSegments = db.prepare('SELECT * FROM segments WHERE broadcast_id = ?').all(id);
    for (const seg of oldSegments) {
      if (seg.audio_path) {
        const fp = path.join(__dirname, '../..', seg.audio_path);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      }
    }
    db.prepare('DELETE FROM segments WHERE broadcast_id = ?').run(id);

    // 调用 AI 切分
    const sentences = await mimo.splitScript(broadcast.content);

    // 创建 segment 记录
    const insertStmt = db.prepare(
      'INSERT INTO segments (broadcast_id, "index", text, status) VALUES (?, ?, ?, ?)'
    );
    const insertMany = db.transaction((items) => {
      for (const item of items) {
        insertStmt.run(item.broadcastId, item.index, item.text, 'pending');
      }
    });

    insertMany(sentences.map((text, index) => ({
      broadcastId: id,
      index,
      text
    })));

    // 更新广播 mode
    db.prepare("UPDATE broadcasts SET mode = 'segmented', audio_path = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);

    const segments = db.prepare('SELECT * FROM segments WHERE broadcast_id = ? ORDER BY "index"').all(id);
    res.json({ segments });
  } catch (error) {
    console.error('切分失败:', error);
    res.status(500).json({ error: error.message || '切分失败' });
  }
});

/**
 * GET /api/broadcast/:id/segments
 * 获取某个广播的所有短句
 */
router.get('/:id/segments', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: '无效的播报 ID' });
    }

    const broadcast = db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(id);
    if (!broadcast) {
      return res.status(404).json({ error: '播报记录不存在' });
    }

    const segments = db.prepare('SELECT * FROM segments WHERE broadcast_id = ? ORDER BY "index"').all(id);
    res.json({ segments });
  } catch (error) {
    console.error('获取 segments 失败:', error);
    res.status(500).json({ error: '获取 segments 失败' });
  }
});

/**
 * PUT /api/broadcast/:id/segments/:segId
 * 编辑单句文本
 */
router.put('/:id/segments/:segId', (req, res) => {
  try {
    const segId = parseInt(req.params.segId, 10);
    const { text } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: '请提供有效的文本内容' });
    }

    const segment = db.prepare('SELECT * FROM segments WHERE id = ?').get(segId);
    if (!segment) {
      return res.status(404).json({ error: '句子不存在' });
    }

    // 删除旧音频文件
    if (segment.audio_path) {
      const fp = path.join(__dirname, '../..', segment.audio_path);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }

    db.prepare(
      "UPDATE segments SET text = ?, status = 'pending', audio_path = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(text.trim(), segId);

    const updated = db.prepare('SELECT * FROM segments WHERE id = ?').get(segId);
    res.json({ segment: updated });
  } catch (error) {
    console.error('编辑句子失败:', error);
    res.status(500).json({ error: '编辑句子失败' });
  }
});

/**
 * POST /api/broadcast/:id/segments/:segId/regenerate
 * 重新生成单句音频
 */
router.post('/:id/segments/:segId/regenerate', async (req, res) => {
  try {
    const broadcastId = parseInt(req.params.id, 10);
    const segId = parseInt(req.params.segId, 10);

    const segment = db.prepare('SELECT * FROM segments WHERE id = ? AND broadcast_id = ?').get(segId, broadcastId);
    if (!segment) {
      return res.status(404).json({ error: '句子不存在' });
    }

    const broadcast = db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(broadcastId);
    const voiceConfig = JSON.parse(broadcast.voice_config || '{}');

    // 更新状态为 generating
    db.prepare("UPDATE segments SET status = 'generating', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(segId);

    try {
      const audioBuffer = await mimo.generateSpeech({
        text: segment.text,
        voice: voiceConfig.voice,
        voiceType: broadcast.voice_type,
        voiceDesign: voiceConfig.voiceDesign,
        voiceClone: voiceConfig.voiceClone,
        stylePrompt: voiceConfig.stylePrompt
      });

      const filename = `segment_${broadcastId}_${segment.index}.wav`;
      const filepath = path.join(audioDir, filename);
      fs.writeFileSync(filepath, audioBuffer);

      db.prepare(
        "UPDATE segments SET audio_path = ?, status = 'generated', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).run(`/audio/${filename}`, segId);
    } catch (ttsError) {
      db.prepare("UPDATE segments SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(segId);
      return res.status(500).json({ error: '语音生成失败: ' + ttsError.message });
    }

    const updated = db.prepare('SELECT * FROM segments WHERE id = ?').get(segId);
    res.json({ segment: updated });
  } catch (error) {
    console.error('重新生成失败:', error);
    res.status(500).json({ error: '重新生成失败' });
  }
});

/**
 * POST /api/broadcast/:id/segments/batch-generate
 * 批量生成所有 pending/failed 句子的音频
 */
router.post('/:id/segments/batch-generate', async (req, res) => {
  try {
    const broadcastId = parseInt(req.params.id, 10);
    const broadcast = db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(broadcastId);
    if (!broadcast) {
      return res.status(404).json({ error: '播报记录不存在' });
    }

    const voiceConfig = JSON.parse(broadcast.voice_config || '{}');
    const pendingSegments = db.prepare(
      "SELECT * FROM segments WHERE broadcast_id = ? AND status IN ('pending', 'failed') ORDER BY \"index\""
    ).all(broadcastId);

    const results = [];
    for (const segment of pendingSegments) {
      db.prepare("UPDATE segments SET status = 'generating', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(segment.id);

      try {
        const audioBuffer = await mimo.generateSpeech({
          text: segment.text,
          voice: voiceConfig.voice,
          voiceType: broadcast.voice_type,
          voiceDesign: voiceConfig.voiceDesign,
          voiceClone: voiceConfig.voiceClone,
          stylePrompt: voiceConfig.stylePrompt
        });

        const filename = `segment_${broadcastId}_${segment.index}.wav`;
        const filepath = path.join(audioDir, filename);
        fs.writeFileSync(filepath, audioBuffer);

        db.prepare(
          "UPDATE segments SET audio_path = ?, status = 'generated', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).run(`/audio/${filename}`, segment.id);

        results.push({ id: segment.id, status: 'generated' });
      } catch (ttsError) {
        db.prepare("UPDATE segments SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(segment.id);
        results.push({ id: segment.id, status: 'failed', error: ttsError.message });
      }
    }

    const segments = db.prepare('SELECT * FROM segments WHERE broadcast_id = ? ORDER BY "index"').all(broadcastId);
    res.json({ segments, results });
  } catch (error) {
    console.error('批量生成失败:', error);
    res.status(500).json({ error: '批量生成失败' });
  }
});

/**
 * POST /api/broadcast/:id/segments/merge
 * 合并所有 segment 音频为最终文件
 */
router.post('/:id/segments/merge', (req, res) => {
  try {
    const broadcastId = parseInt(req.params.id, 10);
    const broadcast = db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(broadcastId);
    if (!broadcast) {
      return res.status(404).json({ error: '播报记录不存在' });
    }

    const segments = db.prepare('SELECT * FROM segments WHERE broadcast_id = ? ORDER BY "index"').all(broadcastId);

    if (segments.length === 0) {
      return res.status(400).json({ error: '没有可合并的句子' });
    }

    // 校验所有 segment 都已生成
    const notGenerated = segments.filter(s => s.status !== 'generated');
    if (notGenerated.length > 0) {
      return res.status(400).json({
        error: `还有 ${notGenerated.length} 个句子未生成音频，请先完成所有句子的生成`
      });
    }

    // 按 index 排序，读取音频文件路径
    const audioPaths = segments.map(s => path.join(__dirname, '../..', s.audio_path));

    // 合并 WAV
    const mergedBuffer = audio.mergeWavFiles(audioPaths);

    // 删除旧的广播音频文件（如有）
    if (broadcast.audio_path) {
      const oldPath = path.join(__dirname, '../..', broadcast.audio_path);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    // 写入合并文件
    const filename = `broadcast_${broadcastId}_merged.wav`;
    const filepath = path.join(audioDir, filename);
    fs.writeFileSync(filepath, mergedBuffer);

    // 更新广播记录
    db.prepare(
      "UPDATE broadcasts SET audio_path = ?, status = 'generated', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(`/audio/${filename}`, broadcastId);

    const updated = db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(broadcastId);
    res.json({ broadcast: updated });
  } catch (error) {
    console.error('合并失败:', error);
    res.status(500).json({ error: error.message || '合并失败' });
  }
});

/**
 * DELETE /api/broadcast/:id/segments/:segId
 * 删除一句（自动重排序）
 */
router.delete('/:id/segments/:segId', (req, res) => {
  try {
    const broadcastId = parseInt(req.params.id, 10);
    const segId = parseInt(req.params.segId, 10);

    const segment = db.prepare('SELECT * FROM segments WHERE id = ? AND broadcast_id = ?').get(segId, broadcastId);
    if (!segment) {
      return res.status(404).json({ error: '句子不存在' });
    }

    // 删除音频文件
    if (segment.audio_path) {
      const fp = path.join(__dirname, '../..', segment.audio_path);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }

    const deletedIndex = segment.index;

    // 删除记录
    db.prepare('DELETE FROM segments WHERE id = ?').run(segId);

    // 重排序后续 segments：index 减 1，重命名音频文件
    const laterSegments = db.prepare(
      'SELECT * FROM segments WHERE broadcast_id = ? AND "index" > ? ORDER BY "index"'
    ).all(broadcastId, deletedIndex);

    for (const seg of laterSegments) {
      const newIndex = seg.index - 1;

      // 重命名音频文件
      if (seg.audio_path) {
        const oldPath = path.join(__dirname, '../..', seg.audio_path);
        const newFilename = `segment_${broadcastId}_${newIndex}.wav`;
        const newPath = path.join(audioDir, newFilename);
        if (fs.existsSync(oldPath)) {
          fs.renameSync(oldPath, newPath);
        }
        db.prepare(
          'UPDATE segments SET "index" = ?, audio_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).run(newIndex, `/audio/${newFilename}`, seg.id);
      } else {
        db.prepare(
          'UPDATE segments SET "index" = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).run(newIndex, seg.id);
      }
    }

    const segments = db.prepare('SELECT * FROM segments WHERE broadcast_id = ? ORDER BY "index"').all(broadcastId);
    res.json({ segments });
  } catch (error) {
    console.error('删除句子失败:', error);
    res.status(500).json({ error: '删除句子失败' });
  }
});

/**
 * POST /api/broadcast/:id/segments/reorder
 * 重排序 segments
 */
router.post('/:id/segments/reorder', (req, res) => {
  try {
    const broadcastId = parseInt(req.params.id, 10);
    const { segmentIds } = req.body;

    if (!Array.isArray(segmentIds)) {
      return res.status(400).json({ error: '请提供 segmentIds 数组' });
    }

    const updateStmt = db.prepare(
      'UPDATE segments SET "index" = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND broadcast_id = ?'
    );

    const reorder = db.transaction((ids) => {
      for (let i = 0; i < ids.length; i++) {
        updateStmt.run(i, ids[i], broadcastId);
      }
    });

    reorder(segmentIds);

    const segments = db.prepare('SELECT * FROM segments WHERE broadcast_id = ? ORDER BY "index"').all(broadcastId);
    res.json({ segments });
  } catch (error) {
    console.error('重排序失败:', error);
    res.status(500).json({ error: '重排序失败' });
  }
});
```

**3c.** 修改现有的 `POST /api/broadcast/generate` 路由，支持 `mode` 参数：

将现有的 generate 路由替换为：

```js
/**
 * POST /api/broadcast/generate
 * 创建广播记录。mode='segmented' 时仅创建记录（不生成音频），否则走原流程。
 */
router.post('/generate', async (req, res) => {
  try {
    const { text, voice, voiceType, voiceDesign, voiceClone, stylePrompt, sourceItems, mode } = req.body;

    if (!text) {
      return res.status(400).json({ error: '请提供口播稿内容' });
    }

    if (mode === 'segmented') {
      // 仅创建广播记录，不生成音频
      const result = db.prepare(`
        INSERT INTO broadcasts (title, content, voice_type, voice_config, source_items, status, mode)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        text.substring(0, 50) + '...',
        text,
        voiceType || 'preset',
        JSON.stringify({ voice, voiceDesign, voiceClone, stylePrompt }),
        sourceItems ? JSON.stringify(sourceItems) : null,
        'pending',
        'segmented'
      );

      const broadcast = db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(result.lastInsertRowid);
      return res.json({ broadcast });
    }

    // 原有整段生成流程
    const audioBuffer = await mimo.generateSpeech({
      text,
      voice,
      voiceType,
      voiceDesign,
      voiceClone,
      stylePrompt
    });

    const filename = `broadcast_${Date.now()}.wav`;
    const filepath = path.join(audioDir, filename);
    fs.writeFileSync(filepath, audioBuffer);

    const result = db.prepare(`
      INSERT INTO broadcasts (title, content, audio_path, voice_type, voice_config, source_items, status, mode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      text.substring(0, 50) + '...',
      text,
      `/audio/${filename}`,
      voiceType || 'preset',
      JSON.stringify({ voice, voiceDesign, voiceClone, stylePrompt }),
      sourceItems ? JSON.stringify(sourceItems) : null,
      'generated',
      'whole'
    );

    const broadcast = db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(result.lastInsertRowid);

    // 清理旧的未保存记录
    const unsavedCount = db.prepare('SELECT COUNT(*) as count FROM broadcasts WHERE saved = 0').get().count;
    if (unsavedCount > 10) {
      const toDelete = db.prepare(
        'SELECT id, audio_path FROM broadcasts WHERE saved = 0 ORDER BY created_at ASC LIMIT ?'
      ).all(unsavedCount - 10);

      const deleteStmt = db.prepare('DELETE FROM broadcasts WHERE id = ?');
      for (const item of toDelete) {
        deleteStmt.run(item.id);
        if (item.audio_path) {
          const fp = path.join(__dirname, '../..', item.audio_path);
          if (fs.existsSync(fp)) fs.unlinkSync(fp);
        }
      }
    }

    res.json({
      broadcast,
      audioUrl: `/audio/${filename}`
    });
  } catch (error) {
    console.error('生成语音失败:', error);
    res.status(500).json({ error: error.message || '生成语音失败' });
  }
});
```

**3d.** 扩展 `POST /api/broadcast/:id/save` 路由，在删除广播时同时清理 segment 文件：

在 save 路由的删除循环中，添加 segment 音频清理：

```js
// 在 deleteStmt.run(item.id) 之后添加：
// 清理关联的 segment 音频文件
const segments = db.prepare('SELECT audio_path FROM segments WHERE broadcast_id = ?').all(item.id);
for (const seg of segments) {
  if (seg.audio_path) {
    const segFilepath = path.join(__dirname, '../..', seg.audio_path);
    if (fs.existsSync(segFilepath)) fs.unlinkSync(segFilepath);
  }
}
```

### Step 4: 运行测试验证通过

```bash
cd backend && npm test -- tests/routes/broadcast.test.js
```

Expected: 所有测试 PASS。

### Step 5: Commit

```bash
git add backend/src/routes/broadcast.js backend/tests/routes/broadcast.test.js
git commit -m "feat: add segment CRUD routes (split, regenerate, batch-generate, merge, delete, reorder)"
```

---

## Task 5: Frontend API Layer

**Files:**
- Modify: `frontend/src/services/api.ts`

### Step 1: 添加 segment API 方法

在 `frontend/src/services/api.ts` 中，在 `broadcastApi` 对象内追加以下方法：

```ts
  // Segment API
  split: (id: number) =>
    api.post(`/broadcast/${id}/split`),

  getSegments: (id: number) =>
    api.get(`/broadcast/${id}/segments`),

  updateSegment: (broadcastId: number, segId: number, data: { text: string }) =>
    api.put(`/broadcast/${broadcastId}/segments/${segId}`, data),

  regenerateSegment: (broadcastId: number, segId: number) =>
    api.post(`/broadcast/${broadcastId}/segments/${segId}/regenerate`),

  batchGenerateSegments: (broadcastId: number) =>
    api.post(`/broadcast/${broadcastId}/segments/batch-generate`),

  mergeSegments: (broadcastId: number) =>
    api.post(`/broadcast/${broadcastId}/segments/merge`),

  deleteSegment: (broadcastId: number, segId: number) =>
    api.delete(`/broadcast/${broadcastId}/segments/${segId}`),

  reorderSegments: (broadcastId: number, segmentIds: number[]) =>
    api.post(`/broadcast/${broadcastId}/segments/reorder`, { segmentIds }),
```

### Step 2: 验证编译通过

```bash
cd frontend && npx tsc --noEmit
```

Expected: 无类型错误。

### Step 3: Commit

```bash
git add frontend/src/services/api.ts
git commit -m "feat: add segment API methods to frontend client"
```

---

## Task 6: Frontend Store

**Files:**
- Modify: `frontend/src/store/index.ts`

### Step 1: 添加 Segment 接口和 store 状态

**6a.** 在 `Broadcast` 接口之后添加 `Segment` 接口：

```ts
/** 逐句 segment */
export interface Segment {
  id: number;
  broadcast_id: number;
  index: number;
  text: string;
  audio_path: string | null;
  status: 'pending' | 'generating' | 'generated' | 'failed';
  created_at: string;
  updated_at: string;
}
```

**6b.** 在 `AppState` 接口中添加 segment 相关状态和 actions：

在 `// 播报状态` 区域追加：

```ts
  // Segment 状态
  segments: Segment[];
  isSplitting: boolean;
  isMerging: boolean;
```

在播报操作区域追加：

```ts
  // Segment 操作
  splitScript: (broadcastId: number) => Promise<Segment[]>;
  fetchSegments: (broadcastId: number) => Promise<Segment[]>;
  updateSegmentText: (broadcastId: number, segId: number, text: string) => Promise<Segment>;
  regenerateSegment: (broadcastId: number, segId: number) => Promise<Segment>;
  batchGenerateSegments: (broadcastId: number) => Promise<{ segments: Segment[]; results: any[] }>;
  deleteSegment: (broadcastId: number, segId: number) => Promise<Segment[]>;
  mergeSegments: (broadcastId: number) => Promise<Broadcast>;
  clearSegments: () => void;
```

**6c.** 在 store 初始状态中添加：

```ts
  // Segment 状态
  segments: [],
  isSplitting: false,
  isMerging: false,
```

**6d.** 在 store actions 中添加 segment 操作实现：

```ts
  // ============ Segment 操作 ============

  /** AI 切分稿件为短句 */
  splitScript: async (broadcastId) => {
    set({ isSplitting: true });
    try {
      const response = await broadcastApi.split(broadcastId);
      const segments = response.data.segments;
      set({ segments, isSplitting: false });
      return segments;
    } catch (error) {
      set({ isSplitting: false });
      console.error('切分失败:', error);
      throw error;
    }
  },

  /** 获取某个广播的所有短句 */
  fetchSegments: async (broadcastId) => {
    try {
      const response = await broadcastApi.getSegments(broadcastId);
      const segments = response.data.segments;
      set({ segments });
      return segments;
    } catch (error) {
      console.error('获取 segments 失败:', error);
      throw error;
    }
  },

  /** 编辑单句文本 */
  updateSegmentText: async (broadcastId, segId, text) => {
    try {
      const response = await broadcastApi.updateSegment(broadcastId, segId, { text });
      const updated = response.data.segment;
      set((state) => ({
        segments: state.segments.map((s) => (s.id === segId ? updated : s)),
      }));
      return updated;
    } catch (error) {
      console.error('编辑句子失败:', error);
      throw error;
    }
  },

  /** 重新生成单句音频 */
  regenerateSegment: async (broadcastId, segId) => {
    // 先设置 generating 状态
    set((state) => ({
      segments: state.segments.map((s) =>
        s.id === segId ? { ...s, status: 'generating' as const } : s
      ),
    }));
    try {
      const response = await broadcastApi.regenerateSegment(broadcastId, segId);
      const updated = response.data.segment;
      set((state) => ({
        segments: state.segments.map((s) => (s.id === segId ? updated : s)),
      }));
      return updated;
    } catch (error) {
      // 回退为 failed
      set((state) => ({
        segments: state.segments.map((s) =>
          s.id === segId ? { ...s, status: 'failed' as const } : s
        ),
      }));
      console.error('重新生成失败:', error);
      throw error;
    }
  },

  /** 批量生成所有 pending/failed 句子 */
  batchGenerateSegments: async (broadcastId) => {
    // 先将所有 pending/failed 设为 generating
    set((state) => ({
      segments: state.segments.map((s) =>
        s.status === 'pending' || s.status === 'failed'
          ? { ...s, status: 'generating' as const }
          : s
      ),
    }));
    try {
      const response = await broadcastApi.batchGenerateSegments(broadcastId);
      const { segments, results } = response.data;
      set({ segments });
      return { segments, results };
    } catch (error) {
      console.error('批量生成失败:', error);
      throw error;
    }
  },

  /** 删除一句 */
  deleteSegment: async (broadcastId, segId) => {
    try {
      const response = await broadcastApi.deleteSegment(broadcastId, segId);
      const segments = response.data.segments;
      set({ segments });
      return segments;
    } catch (error) {
      console.error('删除句子失败:', error);
      throw error;
    }
  },

  /** 合并所有 segment 音频 */
  mergeSegments: async (broadcastId) => {
    set({ isMerging: true });
    try {
      const response = await broadcastApi.mergeSegments(broadcastId);
      const broadcast = response.data.broadcast;
      set((state) => ({
        currentBroadcast: broadcast,
        broadcasts: state.broadcasts.map((b) => (b.id === broadcastId ? broadcast : b)),
        isMerging: false,
      }));
      return broadcast;
    } catch (error) {
      set({ isMerging: false });
      console.error('合并失败:', error);
      throw error;
    }
  },

  /** 清空 segments 状态 */
  clearSegments: () => {
    set({ segments: [] });
  },
```

### Step 2: 验证编译通过

```bash
cd frontend && npx tsc --noEmit
```

Expected: 无类型错误。

### Step 3: Commit

```bash
git add frontend/src/store/index.ts
git commit -m "feat: add Segment interface and segment actions to Zustand store"
```

---

## Task 7: SegmentEditor Component

**Files:**
- Create: `frontend/src/components/Dashboard/SegmentEditor.tsx`

### Step 1: 创建 SegmentEditor 组件

创建 `frontend/src/components/Dashboard/SegmentEditor.tsx`：

```tsx
import React, { useState, useRef, useEffect } from 'react';
import { useStore, Segment } from '../../store';

interface SegmentEditorProps {
  broadcastId: number;
  onMerged?: () => void;
}

/** 单句内联 mini 播放器 */
const SegmentAudio: React.FC<{ audioUrl: string }> = ({ audioUrl }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handleLoaded = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);
    audio.addEventListener('loadedmetadata', handleLoaded);
    audio.addEventListener('ended', handleEnded);
    return () => {
      audio.removeEventListener('loadedmetadata', handleLoaded);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [audioUrl]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const formatTime = (s: number) => {
    if (isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <audio ref={audioRef} src={audioUrl} preload="metadata" />
      <button onClick={toggle} className="text-blue-400 hover:text-blue-300">
        {isPlaying ? '⏸' : '▶'}
      </button>
      {duration > 0 && (
        <span className="text-xs text-gray-500">{formatTime(duration)}</span>
      )}
    </span>
  );
};

/** 状态标签 */
const StatusBadge: React.FC<{ status: Segment['status'] }> = ({ status }) => {
  const config = {
    pending: { icon: '⏳', text: '待生成', color: 'text-gray-400' },
    generating: { icon: '🔄', text: '生成中', color: 'text-blue-400' },
    generated: { icon: '✅', text: '已生成', color: 'text-green-400' },
    failed: { icon: '❌', text: '失败', color: 'text-red-400' },
  };
  const c = config[status];
  return (
    <span className={`text-xs ${c.color} flex items-center gap-1`}>
      {status === 'generating' ? (
        <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : (
        c.icon
      )}
      {c.text}
    </span>
  );
};

export const SegmentEditor: React.FC<SegmentEditorProps> = ({ broadcastId, onMerged }) => {
  const {
    segments,
    isSplitting,
    isMerging,
    fetchSegments,
    updateSegmentText,
    regenerateSegment,
    batchGenerateSegments,
    deleteSegment,
    mergeSegments,
  } = useStore();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [error, setError] = useState<string | null>(null);

  // 加载 segments
  useEffect(() => {
    if (broadcastId) {
      fetchSegments(broadcastId).catch(() => {});
    }
  }, [broadcastId, fetchSegments]);

  const allGenerated = segments.length > 0 && segments.every((s) => s.status === 'generated');
  const hasPending = segments.some((s) => s.status === 'pending' || s.status === 'failed');

  const handleEdit = (seg: Segment) => {
    setEditingId(seg.id);
    setEditText(seg.text);
  };

  const handleSaveEdit = async (segId: number) => {
    try {
      setError(null);
      await updateSegmentText(broadcastId, segId, editText);
      setEditingId(null);
    } catch {
      setError('保存失败，请重试');
    }
  };

  const handleRegenerate = async (segId: number) => {
    try {
      setError(null);
      await regenerateSegment(broadcastId, segId);
    } catch {
      setError('重新生成失败，请重试');
    }
  };

  const handleDelete = async (segId: number) => {
    try {
      setError(null);
      await deleteSegment(broadcastId, segId);
    } catch {
      setError('删除失败，请重试');
    }
  };

  const handleBatchGenerate = async () => {
    try {
      setError(null);
      await batchGenerateSegments(broadcastId);
    } catch {
      setError('批量生成失败，请重试');
    }
  };

  const handleMerge = async () => {
    try {
      setError(null);
      await mergeSegments(broadcastId);
      onMerged?.();
    } catch {
      setError('合并失败，请重试');
    }
  };

  if (segments.length === 0 && !isSplitting) {
    return null;
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">
          逐句编辑
          <span className="text-sm font-normal text-gray-400 ml-2">
            ({segments.length} 句)
          </span>
        </h3>
      </div>

      {isSplitting && (
        <div className="flex items-center justify-center py-8 text-blue-400">
          <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          AI 正在切分稿件...
        </div>
      )}

      {/* 句子列表 */}
      <div className="space-y-3 max-h-96 overflow-y-auto mb-4">
        {segments.map((seg) => (
          <div
            key={seg.id}
            className="bg-gray-700 rounded-lg p-4 border border-gray-600"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                {editingId === seg.id ? (
                  <div>
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="w-full bg-gray-600 text-white rounded p-2 text-sm border border-gray-500 focus:border-blue-500 focus:outline-none resize-none"
                      rows={2}
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => handleSaveEdit(seg.id)}
                        className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded"
                      >
                        保存
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-xs px-3 py-1 text-gray-400 hover:text-white"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-200 text-sm leading-relaxed">{seg.text}</p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {seg.status === 'generated' && seg.audio_path && (
                  <SegmentAudio audioUrl={`/api/broadcast/${broadcastId}/audio?segment=${seg.id}`} />
                )}
                <StatusBadge status={seg.status} />
              </div>
            </div>

            {/* 操作按钮 */}
            {editingId !== seg.id && (
              <div className="flex gap-1 mt-2 pt-2 border-t border-gray-600">
                <button
                  onClick={() => handleEdit(seg)}
                  className="text-xs px-2 py-1 text-gray-400 hover:text-blue-400 transition-colors"
                  title="编辑"
                >
                  ✏️ 编辑
                </button>
                <button
                  onClick={() => handleRegenerate(seg.id)}
                  disabled={seg.status === 'generating'}
                  className="text-xs px-2 py-1 text-gray-400 hover:text-green-400 disabled:opacity-50 transition-colors"
                  title="重新生成"
                >
                  🔄 重新生成
                </button>
                <button
                  onClick={() => handleDelete(seg.id)}
                  className="text-xs px-2 py-1 text-gray-400 hover:text-red-400 transition-colors"
                  title="删除"
                >
                  🗑 删除
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mb-3 bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* 底部操作栏 */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-700">
        <button
          onClick={handleBatchGenerate}
          disabled={!hasPending || isSplitting}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
        >
          全部生成
        </button>
        <button
          onClick={handleMerge}
          disabled={!allGenerated || isMerging}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
        >
          {isMerging ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              合并中...
            </>
          ) : (
            '合并为完整音频'
          )}
        </button>
      </div>
    </div>
  );
};

export default SegmentEditor;
```

注意：segment 音频播放 URL 使用 `GET /api/broadcast/:id/audio?segment=:segId` 格式。需要在 Task 4 的 `GET /api/broadcast/:id/audio` 路由中添加 segment 查询参数支持。如果选择不修改该路由，可以直接使用 `seg.audio_path`（即 `/audio/segment_xxx_x.wav`）作为 `audioUrl`，因为 static file serving 已经挂在 `/audio` 路径下。使用 `seg.audio_path` 更简单直接。

将 `SegmentAudio` 组件的 `audioUrl` 使用改为：

```tsx
{seg.status === 'generated' && seg.audio_path && (
  <SegmentAudio audioUrl={seg.audio_path} />
)}
```

### Step 2: 验证编译通过

```bash
cd frontend && npx tsc --noEmit
```

Expected: 无类型错误。

### Step 3: Commit

```bash
git add frontend/src/components/Dashboard/SegmentEditor.tsx
git commit -m "feat: add SegmentEditor component for sentence-level TTS editing"
```

---

## Task 8: Integrate Segment Flow into Dashboard

**Files:**
- Modify: `frontend/src/components/Dashboard/VoiceGenerator.tsx`
- Modify: `frontend/src/components/Dashboard/ScriptPreview.tsx`
- Modify: `frontend/src/components/Dashboard/AudioPlayer.tsx`
- Modify: `frontend/src/pages/Dashboard.tsx`

### Step 1: 修改 VoiceGenerator — 替换生成按钮

将 `VoiceGenerator.tsx` 中的 `handleGenerate` 函数和生成按钮替换为支持 segmented mode：

**1a.** 修改 `handleGenerate` 函数为 `handleSplitAndGenerate`：

```tsx
  const { generateBroadcast, isGenerating, splitScript, segments, isSplitting, settings } = useStore();
```

替换 `handleGenerate` 函数：

```tsx
  const handleSplitAndGenerate = async () => {
    if (!script) {
      setError('请先生成口播稿');
      return;
    }
    setError(null);

    try {
      // Step 1: 创建 segmented 广播记录
      const result = await generateBroadcast({
        text: script,
        voice: voiceType === 'preset' ? selectedVoice : undefined,
        voiceType,
        voiceDesign: voiceType === 'design' ? voiceDesign : undefined,
        voiceClone: voiceType === 'clone' ? voiceClone : undefined,
        stylePrompt: stylePrompt || undefined,
        mode: 'segmented',
      });

      // Step 2: AI 切分
      await splitScript(result.broadcast.id);
    } catch (err) {
      setError('操作失败，请检查 API Key 或稍后重试');
      console.error(err);
    }
  };
```

**1b.** 修改生成按钮区域，将原来的单个按钮替换为：

```tsx
      {/* 生成按钮 */}
      <button
        onClick={handleSplitAndGenerate}
        disabled={isGenerating || isSplitting || !script}
        className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white font-medium rounded-lg px-4 py-3 transition-colors flex items-center justify-center gap-2"
      >
        {isGenerating || isSplitting ? (
          <>
            <svg
              className="animate-spin h-5 w-5"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            {isSplitting ? 'AI 切分中...' : '创建中...'}
          </>
        ) : (
          '切分并生成语音'
        )}
      </button>
```

### Step 2: 修改 ScriptPreview — 移除旧的"使用此稿件生成语音"按钮

在 `ScriptPreview.tsx` 中，移除操作栏中的 `handleUseScript` 相关代码：

**2a.** 移除 `onScriptReady` prop 和 `handleUseScript` 函数：

```tsx
// 移除 interface 中的 onScriptReady
// 移除 const handleUseScript = () => { onScriptReady?.(script); };
```

**2b.** 在操作栏中移除"使用此稿件生成语音"按钮，只保留开场白/结束语按钮：

```tsx
      {/* 操作栏 */}
      {script && !isEditing && (
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-700">
          <button
            onClick={handleAddOpening}
            className="text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
          >
            + 添加开场白
          </button>
          <button
            onClick={handleAddClosing}
            className="text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
          >
            + 添加结束语
          </button>
        </div>
      )}
```

### Step 3: 修改 AudioPlayer — 支持 segmented mode 提示

在 `AudioPlayer.tsx` 中，修改空状态提示。在 `AudioPlayerProps` 接口中添加 `mode` prop：

```tsx
interface AudioPlayerProps {
  audioUrl: string | null;
  title?: string;
  broadcastId?: number;
  isSaved?: boolean;
  mode?: string | null;
  onSave?: (id: number) => void;
}
```

在组件参数解构中添加 `mode`：

```tsx
  mode,
```

修改无音频时的提示：

```tsx
  if (!audioUrl) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">播放器</h3>
        <div className="bg-gray-700 rounded-lg p-8 flex items-center justify-center">
          <p className="text-gray-500 text-sm">
            {mode === 'segmented'
              ? '请先合并所有句子音频'
              : '生成语音后在此播放'}
          </p>
        </div>
      </div>
    );
  }
```

### Step 4: 修改 Dashboard — 集成 SegmentEditor

更新 `Dashboard.tsx`：

```tsx
import React from 'react';
import { Header } from '../components/Layout/Header';
import { QuickGenerate } from '../components/Dashboard/QuickGenerate';
import { ScriptPreview } from '../components/Dashboard/ScriptPreview';
import { VoiceGenerator } from '../components/Dashboard/VoiceGenerator';
import { AudioPlayer } from '../components/Dashboard/AudioPlayer';
import { SegmentEditor } from '../components/Dashboard/SegmentEditor';
import useStore from '../store';

export const Dashboard: React.FC = () => {
  const { script, currentBroadcast, segments, saveBroadcast } = useStore();

  const audioUrl = currentBroadcast?.audio_path
    ? `/api/broadcast/${currentBroadcast.id}/audio`
    : null;

  const isSegmented = currentBroadcast?.mode === 'segmented';

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header title="控制台" subtitle="生成今日 AI 简讯播报" />

      <main className="flex-1 flex overflow-hidden p-6">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-6 w-full">
          {/* 左侧：快速生成（独立滚动） */}
          <div className="w-full lg:w-1/2 flex flex-col overflow-y-auto">
            <QuickGenerate />
          </div>

          {/* 右侧：语音生成 + 稿件预览 + 逐句编辑 + 音频播放 */}
          <div className="w-full lg:w-1/2 space-y-6 overflow-y-auto">
            <VoiceGenerator script={script} />
            <ScriptPreview />
            {isSegmented && segments.length > 0 && currentBroadcast && (
              <SegmentEditor
                broadcastId={currentBroadcast.id}
                onMerged={() => {}}
              />
            )}
            <AudioPlayer
              audioUrl={audioUrl}
              title={currentBroadcast?.title}
              broadcastId={currentBroadcast?.id}
              isSaved={currentBroadcast?.saved === 1}
              mode={currentBroadcast?.mode}
              onSave={saveBroadcast}
            />
          </div>
        </div>
      </main>
    </div>
  );
};
```

### Step 5: 验证编译通过

```bash
cd frontend && npx tsc --noEmit
```

Expected: 无类型错误。

### Step 6: Commit

```bash
git add frontend/src/components/Dashboard/VoiceGenerator.tsx frontend/src/components/Dashboard/ScriptPreview.tsx frontend/src/components/Dashboard/AudioPlayer.tsx frontend/src/pages/Dashboard.tsx
git commit -m "feat: integrate segment flow - replace whole-script TTS with split-and-generate workflow"
```

---

## Task 9: 端到端验证

### Step 1: 运行所有后端测试

```bash
cd backend && npm test
```

Expected: 所有测试 PASS（包括新增的 audio、mimo splitScript、broadcast segment 路由测试）。

### Step 2: 运行前端编译检查

```bash
cd frontend && npx tsc --noEmit && npm run build
```

Expected: 无类型错误，构建成功。

### Step 3: 手动验证

启动前后端：

```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd frontend && npm run dev
```

在浏览器中验证以下流程：

1. 获取今日资讯 → 改写口播稿
2. 配置音色 → 点击"切分并生成语音"
3. 查看 SegmentEditor 中的逐句列表
4. 编辑某句文本 → 确认状态回退为 pending
5. 点击"全部生成" → 等待所有句子生成完成
6. 逐句试听音频
7. 点击"合并为完整音频"
8. 在 AudioPlayer 中播放最终合并音频

### Step 4: Commit (如有修复)

```bash
git add -A && git commit -m "fix: e2e testing fixes for segment TTS flow"
```
