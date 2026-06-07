# Segment TTS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace whole-script TTS with a sentence-by-sentence workflow: LLM splits the script, each sentence gets its own TTS audio, user edits/regenerates per-sentence, then merges into a final broadcast audio.

**Architecture:** New `broadcast_segments` table stores per-sentence data with a `session_id` grouping. A new `segment.js` service handles splitting (LLM), per-sentence TTS (existing `mimo.generateSpeech`), and merging (ffmpeg-static). Frontend adds a `SegmentEditor` component that replaces the `AudioPlayer` when a session is active.

**Tech Stack:** Node.js, Express 5, better-sqlite3, Anthropic SDK (MiMo LLM), ffmpeg-static, uuid, React 19, Zustand, Tailwind CSS 4

---

### Task 1: Database Schema + Dependencies

**Files:**
- Modify: `backend/src/db/schema.sql`
- Modify: `backend/src/db/index.js`
- Modify: `backend/package.json`

- [ ] **Step 1: Add `broadcast_segments` table to schema.sql**

Append the following to `backend/src/db/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS broadcast_segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  sentence_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  audio_path TEXT,
  status TEXT DEFAULT 'pending',
  voice_config TEXT,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_segments_session_id ON broadcast_segments(session_id);
```

- [ ] **Step 2: Add migration code to db/index.js**

In `backend/src/db/index.js`, after the existing `saved` column migration block, add:

```js
// 迁移：确保 broadcast_segments 表存在
try {
  db.prepare('SELECT session_id FROM broadcast_segments LIMIT 1').get();
} catch {
  db.exec(`
    CREATE TABLE IF NOT EXISTS broadcast_segments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      sentence_index INTEGER NOT NULL,
      text TEXT NOT NULL,
      audio_path TEXT,
      status TEXT DEFAULT 'pending',
      voice_config TEXT,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_segments_session_id ON broadcast_segments(session_id);
  `);
}
```

- [ ] **Step 3: Install dependencies**

Run from `backend/`:

```bash
npm install ffmpeg-static uuid
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/db/schema.sql backend/src/db/index.js backend/package.json backend/package-lock.json
git commit -m "feat(db): add broadcast_segments table and install ffmpeg-static, uuid"
```

---

### Task 2: Segment Service — splitScript

**Files:**
- Create: `backend/src/services/segment.js`
- Create: `backend/tests/services/segment.test.js`

- [ ] **Step 1: Write failing test for splitScript**

Create `backend/tests/services/segment.test.js`:

```js
const db = require('../../src/db');

// Mock Anthropic SDK before requiring segment service
jest.mock('@anthropic-ai/sdk', () => {
  return {
    Anthropic: jest.fn().mockImplementation(() => ({
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ text: '["大家好，欢迎收听。","今天我们有三条资讯。","感谢收听。"]' }]
        })
      }
    }))
  };
});

const { splitScript } = require('../../src/services/segment');

describe('segment service — splitScript', () => {
  beforeEach(() => {
    // Insert a mock API key so getApiKey works
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      'mimo_api_key', '"test-key"'
    );
  });

  afterEach(() => {
    // Clean up segments created during tests
    db.prepare('DELETE FROM broadcast_segments').run();
  });

  test('splits script into sentences and inserts into DB', async () => {
    const result = await splitScript({
      script: '大家好，欢迎收听。今天我们有三条资讯。感谢收听。',
      voiceConfig: { voice: '冰糖', voiceType: 'preset' }
    });

    expect(result).toHaveProperty('sessionId');
    expect(result).toHaveProperty('segments');
    expect(result.segments).toHaveLength(3);
    expect(result.segments[0].index).toBe(0);
    expect(result.segments[0].text).toBe('大家好，欢迎收听。');
    expect(result.segments[0].status).toBe('pending');

    // Verify DB records
    const rows = db.prepare('SELECT * FROM broadcast_segments WHERE session_id = ?').all(result.sessionId);
    expect(rows).toHaveLength(3);
  });

  test('throws when script is empty', async () => {
    await expect(splitScript({ script: '' })).rejects.toThrow('请提供口播稿内容');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `backend/`:

```bash
npx jest tests/services/segment.test.js --verbose
```

Expected: FAIL — module `../../src/services/segment` not found.

- [ ] **Step 3: Implement splitScript in segment.js**

Create `backend/src/services/segment.js`:

```js
const { Anthropic } = require('@anthropic-ai/sdk');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

const BASE_URL = 'https://token-plan-cn.xiaomimimo.com/anthropic';

/**
 * 获取 Anthropic API Key
 */
function getApiKey() {
  const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('mimo_api_key');
  if (!setting) throw new Error('请先在设置中配置 mimo_api_key');
  let key;
  try {
    key = JSON.parse(setting.value);
  } catch {
    throw new Error('mimo_api_key 配置格式错误');
  }
  if (!key) throw new Error('请先在设置中配置 mimo_api_key');
  return key;
}

/**
 * 创建 Anthropic 客户端
 */
function createClient() {
  return new Anthropic({
    apiKey: getApiKey(),
    baseURL: BASE_URL
  });
}

/**
 * 将口播稿按语义切分为短句
 * @param {Object} params
 * @param {string} params.script - 完整口播稿
 * @param {Object} params.voiceConfig - 音色配置
 * @returns {Promise<{ sessionId: string, segments: Array }>}
 */
async function splitScript({ script, voiceConfig = {} }) {
  if (!script || typeof script !== 'string' || script.trim().length === 0) {
    throw new Error('请提供口播稿内容');
  }

  const client = createClient();

  const prompt = `你是一位专业的播音稿编辑。请将以下口播稿按照语义和语气节奏切分成短句。

要求：
1. 每句 15-40 个字，适合 TTS 自然朗读
2. 在自然停顿处切分（逗号、句号、感叹号、问号等标点处）
3. 保持原文完整性，不增删任何内容
4. 标点符号保留在所属句子末尾

口播稿：
${script}

请直接输出 JSON 数组，格式：["句子1", "句子2", ...]
不要输出任何其他内容，不要用 markdown 代码块包裹。`;

  const message = await client.messages.create({
    model: 'mimo-v2.5',
    max_tokens: 4000,
    system: '你是一位专业的播音稿编辑，擅长将长文切分为适合朗读的短句。只输出 JSON 数组，不要输出其他内容。',
    messages: [{ role: 'user', content: prompt }]
  });

  const responseText = message?.content?.[0]?.text;
  if (!responseText) {
    throw new Error('LLM 切分返回内容为空');
  }

  // 解析 JSON 数组（兼容 markdown 代码块包裹）
  let sentences;
  try {
    const jsonStr = responseText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    sentences = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`LLM 切分结果解析失败: ${e.message}`);
  }

  if (!Array.isArray(sentences) || sentences.length === 0) {
    throw new Error('LLM 切分结果为空或格式错误');
  }

  // 创建 session 并写入数据库
  const sessionId = uuidv4();
  const voiceConfigStr = JSON.stringify(voiceConfig);

  const insertStmt = db.prepare(`
    INSERT INTO broadcast_segments (session_id, sentence_index, text, status, voice_config)
    VALUES (?, ?, ?, 'pending', ?)
  `);

  const insertMany = db.transaction((items) => {
    for (const item of items) {
      insertStmt.run(sessionId, item.index, item.text, voiceConfigStr);
    }
  });

  const segments = sentences.map((text, index) => ({ index, text }));
  insertMany(segments);

  // 返回完整的 segments 记录
  const rows = db.prepare(
    'SELECT * FROM broadcast_segments WHERE session_id = ? ORDER BY sentence_index ASC'
  ).all(sessionId);

  return {
    sessionId,
    segments: rows.map(row => ({
      id: row.id,
      index: row.sentence_index,
      text: row.text,
      audioPath: row.audio_path,
      status: row.status,
      errorMessage: row.error_message
    }))
  };
}

module.exports = { splitScript };
```

- [ ] **Step 4: Run test to verify it passes**

Run from `backend/`:

```bash
npx jest tests/services/segment.test.js --verbose
```

Expected: PASS — both test cases.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/segment.js backend/tests/services/segment.test.js
git commit -m "feat(segment): implement splitScript with LLM-based sentence splitting"
```

---

### Task 3: Segment Service — generateSegmentSpeech

**Files:**
- Modify: `backend/src/services/segment.js`
- Modify: `backend/tests/services/segment.test.js`

- [ ] **Step 1: Write failing test for generateSegmentSpeech**

Append to `backend/tests/services/segment.test.js`:

```js
// Mock mimo.generateSpeech
jest.mock('../../src/services/mimo', () => ({
  generateSpeech: jest.fn().mockResolvedValue(Buffer.from('fake-wav-data'))
}));

const { splitScript, generateSegmentSpeech } = require('../../src/services/segment');
const mimo = require('../../src/services/mimo');
const fs = require('fs');
const path = require('path');

describe('segment service — generateSegmentSpeech', () => {
  let sessionId;
  let segmentId;

  beforeEach(async () => {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      'mimo_api_key', '"test-key"'
    );
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      'mimo_tts_api_key', '"test-tts-key"'
    );

    // Create a session with one segment
    const result = await splitScript({
      script: '大家好，欢迎收听。',
      voiceConfig: { voice: '冰糖', voiceType: 'preset' }
    });
    sessionId = result.sessionId;
    segmentId = result.segments[0].id;
  });

  afterEach(() => {
    db.prepare('DELETE FROM broadcast_segments').run();
    // Clean up generated audio files
    const segDir = path.join(__dirname, '../../audio/segments');
    if (fs.existsSync(segDir)) {
      fs.rmSync(segDir, { recursive: true, force: true });
    }
  });

  test('generates audio for a single segment', async () => {
    const result = await generateSegmentSpeech(segmentId);

    expect(result.segment.status).toBe('ready');
    expect(result.segment.audioPath).toBeTruthy();
    expect(result.audioUrl).toBeTruthy();
    expect(mimo.generateSpeech).toHaveBeenCalled();

    // Verify file exists
    const audioPath = path.join(__dirname, '../..', result.segment.audioPath);
    expect(fs.existsSync(audioPath)).toBe(true);

    // Verify DB updated
    const row = db.prepare('SELECT * FROM broadcast_segments WHERE id = ?').get(segmentId);
    expect(row.status).toBe('ready');
  });

  test('throws when segment not found', async () => {
    await expect(generateSegmentSpeech(99999)).rejects.toThrow('句子记录不存在');
  });

  test('sets status to error on TTS failure', async () => {
    mimo.generateSpeech.mockRejectedValueOnce(new Error('TTS API error'));

    await expect(generateSegmentSpeech(segmentId)).rejects.toThrow();

    const row = db.prepare('SELECT * FROM broadcast_segments WHERE id = ?').get(segmentId);
    expect(row.status).toBe('error');
    expect(row.error_message).toBe('TTS API error');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `backend/`:

```bash
npx jest tests/services/segment.test.js --verbose
```

Expected: FAIL — `generateSegmentSpeech` is not exported.

- [ ] **Step 3: Implement generateSegmentSpeech**

Append to `backend/src/services/segment.js` before the `module.exports`:

```js
const path = require('path');
const fs = require('fs');
const { generateSpeech } = require('./mimo');

/**
 * 为单个句子生成 TTS 语音
 * @param {number} segmentId
 * @param {Object} [voiceOverride] - 可选的音色覆盖配置
 * @returns {Promise<{ segment: Object, audioUrl: string }>}
 */
async function generateSegmentSpeech(segmentId, voiceOverride = null) {
  const segment = db.prepare('SELECT * FROM broadcast_segments WHERE id = ?').get(segmentId);
  if (!segment) {
    throw new Error('句子记录不存在');
  }

  // 更新状态为 generating
  db.prepare('UPDATE broadcast_segments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run('generating', segmentId);

  try {
    // 解析音色配置（优先使用覆盖值）
    let voiceConfig = {};
    try { voiceConfig = JSON.parse(segment.voice_config || '{}'); } catch {}
    const config = { ...voiceConfig, ...voiceOverride };

    // 调用 TTS
    const audioBuffer = await generateSpeech({
      text: segment.text,
      voice: config.voice,
      voiceType: config.voiceType,
      voiceDesign: config.voiceDesign,
      voiceClone: config.voiceClone,
      stylePrompt: config.stylePrompt
    });

    // 确保目录存在
    const segDir = path.join(__dirname, '../../audio/segments', segment.session_id);
    fs.mkdirSync(segDir, { recursive: true });

    // 保存音频文件
    const filename = `${segment.sentence_index}.wav`;
    const filepath = path.join(segDir, filename);
    fs.writeFileSync(filepath, audioBuffer);

    const audioPath = `/audio/segments/${segment.session_id}/${filename}`;

    // 更新数据库
    db.prepare(`
      UPDATE broadcast_segments
      SET audio_path = ?, status = 'ready', error_message = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(audioPath, segmentId);

    const updated = db.prepare('SELECT * FROM broadcast_segments WHERE id = ?').get(segmentId);

    return {
      segment: {
        id: updated.id,
        index: updated.sentence_index,
        text: updated.text,
        audioPath: updated.audio_path,
        status: updated.status,
        errorMessage: updated.error_message
      },
      audioUrl: audioPath
    };
  } catch (error) {
    // 标记为错误状态
    db.prepare(`
      UPDATE broadcast_segments
      SET status = 'error', error_message = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(error.message, segmentId);
    throw error;
  }
}
```

Update the `module.exports` at the bottom:

```js
module.exports = { splitScript, generateSegmentSpeech };
```

- [ ] **Step 4: Run test to verify it passes**

Run from `backend/`:

```bash
npx jest tests/services/segment.test.js --verbose
```

Expected: PASS — all 5 test cases.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/segment.js backend/tests/services/segment.test.js
git commit -m "feat(segment): implement generateSegmentSpeech with TTS and error handling"
```

---

### Task 4: Segment Service — mergeSegments

**Files:**
- Modify: `backend/src/services/segment.js`
- Modify: `backend/tests/services/segment.test.js`

- [ ] **Step 1: Write failing test for mergeSegments**

Append to `backend/tests/services/segment.test.js`:

```js
describe('segment service — mergeSegments', () => {
  let sessionId;
  let segmentIds;

  beforeEach(async () => {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      'mimo_api_key', '"test-key"'
    );
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      'mimo_tts_api_key', '"test-tts-key"'
    );

    const result = await splitScript({
      script: '第一句话。第二句话。第三句话。',
      voiceConfig: { voice: '冰糖', voiceType: 'preset' }
    });
    sessionId = result.sessionId;
    segmentIds = result.segments.map(s => s.id);

    // Generate all segments
    for (const id of segmentIds) {
      await generateSegmentSpeech(id);
    }
  });

  afterEach(() => {
    db.prepare('DELETE FROM broadcast_segments').run();
    db.prepare('DELETE FROM broadcasts WHERE title LIKE ?').merge('%测试%');
    const segDir = path.join(__dirname, '../../audio/segments');
    if (fs.existsSync(segDir)) {
      fs.rmSync(segDir, { recursive: true, force: true });
    }
    // Clean up merged audio files
    const audioDir = path.join(__dirname, '../../audio');
    if (fs.existsSync(audioDir)) {
      const files = fs.readdirSync(audioDir).filter(f => f.startsWith('broadcast_'));
      files.forEach(f => fs.unlinkSync(path.join(audioDir, f)));
    }
  });

  test('merges all segment audio into a final broadcast', async () => {
    const result = await mergeSegments(sessionId);

    expect(result).toHaveProperty('broadcast');
    expect(result).toHaveProperty('audioUrl');
    expect(result.broadcast.content).toBe('第一句话。第二句话。第三句话。');
    expect(result.broadcast.status).toBe('merged');

    // Verify merged audio file exists
    const audioPath = path.join(__dirname, '../..', result.audioUrl);
    expect(fs.existsSync(audioPath)).toBe(true);
  });

  test('throws when not all segments are ready', async () => {
    // Reset one segment to pending
    db.prepare('UPDATE broadcast_segments SET status = ? WHERE id = ?').run('pending', segmentIds[0]);

    await expect(mergeSegments(sessionId)).rejects.toThrow('尚有未就绪的句子');
  });

  test('throws when session not found', async () => {
    await expect(mergeSegments('nonexistent-session')).rejects.toThrow('未找到会话');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `backend/`:

```bash
npx jest tests/services/segment.test.js --verbose
```

Expected: FAIL — `mergeSegments` is not exported.

- [ ] **Step 3: Implement mergeSegments**

Append to `backend/src/services/segment.js` before the `module.exports`:

```js
const { execSync } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

/**
 * 合并所有句子音频为完整播报
 * @param {string} sessionId
 * @returns {Promise<{ broadcast: Object, audioUrl: string }>}
 */
async function mergeSegments(sessionId) {
  const segments = db.prepare(
    'SELECT * FROM broadcast_segments WHERE session_id = ? ORDER BY sentence_index ASC'
  ).all(sessionId);

  if (!segments || segments.length === 0) {
    throw new Error('未找到会话');
  }

  // 检查是否所有句子都已就绪
  const notReady = segments.filter(s => s.status !== 'ready');
  if (notReady.length > 0) {
    const indices = notReady.map(s => s.sentence_index + 1).join('、');
    throw new Error(`尚有未就绪的句子：第 ${indices} 句`);
  }

  // 拼接完整口播稿
  const fullScript = segments.map(s => s.text).join('');

  // 生成 ffmpeg 合并文件列表
  const segDir = path.join(__dirname, '../../audio/segments', sessionId);
  const listFile = path.join(segDir, 'filelist.txt');
  const fileEntries = segments.map(s => {
    const filePath = path.join(__dirname, '../..', s.audio_path);
    return `file '${filePath}'`;
  });
  fs.writeFileSync(listFile, fileEntries.join('\n'));

  // 合并音频
  const timestamp = Date.now();
  const outputFilename = `broadcast_${timestamp}.wav`;
  const outputPath = path.join(__dirname, '../../audio', outputFilename);
  const audioDir = path.join(__dirname, '../../audio');
  fs.mkdirSync(audioDir, { recursive: true });

  try {
    execSync(
      `"${ffmpegPath}" -f concat -safe 0 -i "${listFile}" -acodec pcm_s16le -y "${outputPath}"`,
      { stdio: 'pipe' }
    );
  } catch (error) {
    throw new Error(`音频合并失败: ${error.message}`);
  }

  // 获取音色配置
  let voiceConfig = segments[0].voice_config;

  // 创建 broadcasts 记录
  const title = `${new Date().toISOString().slice(0, 10)} AI 简讯`;
  const audioPath = `/audio/${outputFilename}`;

  const result = db.prepare(`
    INSERT INTO broadcasts (title, content, audio_path, voice_type, voice_config, status, saved)
    VALUES (?, ?, ?, ?, ?, 'merged', 0)
  `).run(
    title,
    fullScript,
    audioPath,
    'preset',
    voiceConfig
  );

  const broadcast = db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(result.lastInsertRowid);

  // 清理旧的未保存记录，保留最近10条
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

  return { broadcast, audioUrl: audioPath };
}
```

Update `module.exports`:

```js
module.exports = { splitScript, generateSegmentSpeech, mergeSegments };
```

- [ ] **Step 4: Run test to verify it passes**

Run from `backend/`:

```bash
npx jest tests/services/segment.test.js --verbose
```

Expected: PASS — all 8 test cases.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/segment.js backend/tests/services/segment.test.js
git commit -m "feat(segment): implement mergeSegments with ffmpeg concatenation"
```

---

### Task 5: Session Routes

**Files:**
- Create: `backend/src/routes/session.js`
- Create: `backend/tests/routes/session.test.js`
- Modify: `backend/src/app.js`

- [ ] **Step 1: Write failing test for session routes**

Create `backend/tests/routes/session.test.js`:

```js
const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/db');

// Mock segment service
jest.mock('../../src/services/segment', () => ({
  splitScript: jest.fn().mockResolvedValue({
    sessionId: 'test-session-id',
    segments: [
      { id: 1, index: 0, text: '大家好。', audioPath: null, status: 'pending', errorMessage: null },
      { id: 2, index: 1, text: '感谢收听。', audioPath: null, status: 'pending', errorMessage: null }
    ]
  }),
  generateSegmentSpeech: jest.fn().mockResolvedValue({
    segment: { id: 1, index: 0, text: '大家好。', audioPath: '/audio/segments/test/0.wav', status: 'ready', errorMessage: null },
    audioUrl: '/audio/segments/test/0.wav'
  }),
  mergeSegments: jest.fn().mockResolvedValue({
    broadcast: { id: 1, title: 'test', content: '大家好。感谢收听。', audio_path: '/audio/test.wav', status: 'merged' },
    audioUrl: '/audio/test.wav'
  })
}));

const segment = require('../../src/services/segment');

describe('Session API', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('POST /api/broadcast/split - splits script', async () => {
    const res = await request(app)
      .post('/api/broadcast/split')
      .send({ script: '大家好。感谢收听。', voice: '冰糖', voiceType: 'preset' });

    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBe('test-session-id');
    expect(res.body.segments).toHaveLength(2);
    expect(segment.splitScript).toHaveBeenCalledWith({
      script: '大家好。感谢收听。',
      voiceConfig: { voice: '冰糖', voiceType: 'preset', voiceDesign: undefined, voiceClone: undefined, stylePrompt: undefined }
    });
  });

  test('POST /api/broadcast/split - missing script returns 400', async () => {
    const res = await request(app)
      .post('/api/broadcast/split')
      .send({});
    expect(res.status).toBe(400);
  });

  test('POST /api/broadcast/segment/:id/generate - generates segment', async () => {
    const res = await request(app)
      .post('/api/broadcast/segment/1/generate')
      .send();

    expect(res.status).toBe(200);
    expect(res.body.segment.status).toBe('ready');
  });

  test('POST /api/broadcast/session/:sessionId/merge - merges session', async () => {
    // Mock segments as all ready
    db.prepare = jest.fn().mockReturnValue({
      all: jest.fn().mockReturnValue([
        { id: 1, sentence_index: 0, text: '大家好。', status: 'ready' },
        { id: 2, sentence_index: 1, text: '感谢收听。', status: 'ready' }
      ])
    });

    const res = await request(app)
      .post('/api/broadcast/session/test-session-id/merge')
      .send();

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('broadcast');
  });

  test('POST /api/broadcast/split - calls splitScript with voice config', async () => {
    const res = await request(app)
      .post('/api/broadcast/split')
      .send({
        script: '测试内容。',
        voice: '茉莉',
        voiceType: 'preset',
        stylePrompt: '语速快'
      });

    expect(res.status).toBe(200);
    expect(segment.splitScript).toHaveBeenCalledWith({
      script: '测试内容。',
      voiceConfig: {
        voice: '茉莉',
        voiceType: 'preset',
        voiceDesign: undefined,
        voiceClone: undefined,
        stylePrompt: '语速快'
      }
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `backend/`:

```bash
npx jest tests/routes/session.test.js --verbose
```

Expected: FAIL — routes not yet implemented.

- [ ] **Step 3: Implement session routes**

Create `backend/src/routes/session.js`:

```js
const express = require('express');
const router = express.Router();
const segment = require('../services/segment');
const db = require('../db');

/**
 * POST /api/broadcast/split
 * 切分口播稿为短句
 */
router.post('/split', async (req, res) => {
  try {
    const { script, voice, voiceType, voiceDesign, voiceClone, stylePrompt } = req.body;

    if (!script || typeof script !== 'string' || script.trim().length === 0) {
      return res.status(400).json({ error: '请提供口播稿内容' });
    }

    const result = await segment.splitScript({
      script: script.trim(),
      voiceConfig: { voice, voiceType, voiceDesign, voiceClone, stylePrompt }
    });

    res.json(result);
  } catch (error) {
    console.error('切分口播稿失败:', error);
    res.status(500).json({ error: error.message || '切分口播稿失败' });
  }
});

/**
 * POST /api/broadcast/segment/:id/generate
 * 为单个句子生成 TTS 语音
 */
router.post('/segment/:id/generate', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: '无效的句子 ID' });
    }

    const { voice, voiceType, voiceDesign, voiceClone, stylePrompt } = req.body;
    const voiceOverride = (voice || voiceType || stylePrompt)
      ? { voice, voiceType, voiceDesign, voiceClone, stylePrompt }
      : null;

    const result = await segment.generateSegmentSpeech(id, voiceOverride);
    res.json(result);
  } catch (error) {
    console.error('生成句子语音失败:', error);
    res.status(500).json({ error: error.message || '生成句子语音失败' });
  }
});

/**
 * PUT /api/broadcast/segment/:id
 * 编辑单句文本
 */
router.put('/segment/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: '无效的句子 ID' });
    }

    const { text } = req.body;
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: '请提供句子文本' });
    }

    // 更新文本，清除音频，重置状态
    db.prepare(`
      UPDATE broadcast_segments
      SET text = ?, audio_path = NULL, status = 'pending', error_message = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(text.trim(), id);

    const updated = db.prepare('SELECT * FROM broadcast_segments WHERE id = ?').get(id);
    if (!updated) {
      return res.status(404).json({ error: '句子记录不存在' });
    }

    res.json({
      segment: {
        id: updated.id,
        index: updated.sentence_index,
        text: updated.text,
        audioPath: updated.audio_path,
        status: updated.status,
        errorMessage: updated.error_message
      }
    });
  } catch (error) {
    console.error('编辑句子失败:', error);
    res.status(500).json({ error: '编辑句子失败' });
  }
});

/**
 * POST /api/broadcast/session/:sessionId/generate-all
 * 批量生成所有 pending 句子
 */
router.post('/session/:sessionId/generate-all', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const segments = db.prepare(
      'SELECT * FROM broadcast_segments WHERE session_id = ? AND status = ? ORDER BY sentence_index ASC'
    ).all(sessionId, 'pending');

    if (segments.length === 0) {
      return res.json({ results: [], message: '没有待生成的句子' });
    }

    const results = [];
    for (const seg of segments) {
      try {
        const result = await segment.generateSegmentSpeech(seg.id);
        results.push({ id: seg.id, status: 'ready', audioUrl: result.audioUrl });
      } catch (error) {
        results.push({ id: seg.id, status: 'error', error: error.message });
      }
    }

    res.json({ results });
  } catch (error) {
    console.error('批量生成失败:', error);
    res.status(500).json({ error: '批量生成失败' });
  }
});

/**
 * POST /api/broadcast/session/:sessionId/merge
 * 合并所有句子音频为完整播报
 */
router.post('/session/:sessionId/merge', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const result = await segment.mergeSegments(sessionId);
    res.json(result);
  } catch (error) {
    console.error('合并音频失败:', error);
    res.status(500).json({ error: error.message || '合并音频失败' });
  }
});

/**
 * GET /api/broadcast/session/:sessionId
 * 获取 session 详情
 */
router.get('/session/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;

    const segments = db.prepare(
      'SELECT * FROM broadcast_segments WHERE session_id = ? ORDER BY sentence_index ASC'
    ).all(sessionId);

    if (segments.length === 0) {
      return res.status(404).json({ error: '未找到会话' });
    }

    const allReady = segments.every(s => s.status === 'ready');

    res.json({
      sessionId,
      segments: segments.map(s => ({
        id: s.id,
        index: s.sentence_index,
        text: s.text,
        audioPath: s.audio_path,
        status: s.status,
        errorMessage: s.error_message
      })),
      allReady
    });
  } catch (error) {
    console.error('获取会话详情失败:', error);
    res.status(500).json({ error: '获取会话详情失败' });
  }
});

module.exports = router;
```

- [ ] **Step 4: Mount routes in app.js**

In `backend/src/app.js`, add after the existing route registrations:

```js
app.use('/api/broadcast', require('./routes/session'));
```

- [ ] **Step 5: Run route tests**

Run from `backend/`:

```bash
npx jest tests/routes/session.test.js --verbose
```

Expected: PASS — all 5 test cases.

- [ ] **Step 6: Run all tests to check nothing broke**

Run from `backend/`:

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/session.js backend/tests/routes/session.test.js backend/src/app.js
git commit -m "feat(session): add session routes for split, generate, edit, merge, and detail"
```

---

### Task 6: Frontend API Layer

**Files:**
- Modify: `frontend/src/services/api.ts`

- [ ] **Step 1: Add new API methods**

In `frontend/src/services/api.ts`, update `broadcastApi`:

```ts
export const broadcastApi = {
  getToday: (params?: { category?: string; take?: number }) =>
    api.get('/broadcast/today', { params }),

  rewrite: (data: { items: any[]; opening?: string; closing?: string }) =>
    api.post('/broadcast/rewrite', data),

  generate: (data: {
    text: string;
    voice?: string;
    voiceType?: string;
    voiceDesign?: string;
    voiceClone?: string;
    stylePrompt?: string;
  }) => api.post('/broadcast/generate', data),

  getHistory: (params?: { page?: number; limit?: number }) =>
    api.get('/broadcast/history', { params }),

  getDetail: (id: number) =>
    api.get(`/broadcast/${id}`),

  save: (id: number) =>
    api.post(`/broadcast/${id}/save`),

  // 新增：逐句 TTS 相关
  split: (data: {
    script: string;
    voice?: string;
    voiceType?: string;
    voiceDesign?: string;
    voiceClone?: string;
    stylePrompt?: string;
  }) => api.post('/broadcast/split', data),

  generateSegment: (segmentId: number, voiceConfig?: {
    voice?: string;
    voiceType?: string;
    stylePrompt?: string;
  }) => api.post(`/broadcast/segment/${segmentId}/generate`, voiceConfig),

  generateAllSegments: (sessionId: string) =>
    api.post(`/broadcast/session/${sessionId}/generate-all`),

  updateSegment: (segmentId: number, data: { text: string }) =>
    api.put(`/broadcast/segment/${segmentId}`, data),

  mergeSegments: (sessionId: string) =>
    api.post(`/broadcast/session/${sessionId}/merge`),

  getSession: (sessionId: string) =>
    api.get(`/broadcast/session/${sessionId}`),
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run from `frontend/`:

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/services/api.ts
git commit -m "feat(api): add segment TTS API methods"
```

---

### Task 7: Frontend Store — Session State

**Files:**
- Modify: `frontend/src/store/index.ts`

- [ ] **Step 1: Add Segment type and session state**

In `frontend/src/store/index.ts`, add the `Segment` interface after the `Broadcast` interface:

```ts
/** 逐句切分片段 */
export interface Segment {
  id: number;
  index: number;
  text: string;
  audioPath: string | null;
  status: 'pending' | 'generating' | 'ready' | 'error';
  errorMessage?: string | null;
}
```

Add to `AppState` interface:

```ts
export interface AppState {
  // ... existing fields ...

  // 新增：逐句 TTS 状态
  sessionId: string | null;
  segments: Segment[];
  isSplitting: boolean;
  isMerging: boolean;
  generatingSegmentId: number | null;

  // 新增：逐句 TTS 操作
  splitScript: (data: {
    script: string;
    voice?: string;
    voiceType?: string;
    voiceDesign?: string;
    voiceClone?: string;
    stylePrompt?: string;
  }) => Promise<Segment[]>;
  generateSegment: (segmentId: number, voiceConfig?: {
    voice?: string;
    voiceType?: string;
    stylePrompt?: string;
  }) => Promise<Segment>;
  generateAllSegments: () => Promise<void>;
  updateSegmentText: (segmentId: number, text: string) => Promise<Segment>;
  mergeSegments: () => Promise<{ broadcast: Broadcast; audioUrl: string }>;
  resetSession: () => void;
}
```

- [ ] **Step 2: Add session initial state**

In the `useStore` create call, add to the initial state:

```ts
sessionId: null,
segments: [],
isSplitting: false,
isMerging: false,
generatingSegmentId: null,
```

- [ ] **Step 3: Implement session actions**

Add these actions inside the `useStore` create call:

```ts
/** 切分口播稿为短句 */
splitScript: async (data) => {
  set({ isSplitting: true });
  try {
    const response = await broadcastApi.split(data);
    const { sessionId, segments } = response.data;
    set({ sessionId, segments, isSplitting: false });
    return segments;
  } catch (error) {
    set({ isSplitting: false });
    console.error('切分口播稿失败:', error);
    throw error;
  }
},

/** 生成单句语音 */
generateSegment: async (segmentId, voiceConfig) => {
  set({ generatingSegmentId: segmentId });
  try {
    const response = await broadcastApi.generateSegment(segmentId, voiceConfig);
    const updatedSegment = response.data.segment;
    set((state) => ({
      segments: state.segments.map(s => s.id === segmentId ? updatedSegment : s),
      generatingSegmentId: null,
    }));
    return updatedSegment;
  } catch (error) {
    set({ generatingSegmentId: null });
    console.error('生成句子语音失败:', error);
    throw error;
  }
},

/** 批量生成所有 pending 句子 */
generateAllSegments: async () => {
  const { sessionId, segments } = get();
  if (!sessionId) return;

  // Set all pending segments to generating state
  set({
    segments: segments.map(s =>
      s.status === 'pending' ? { ...s, status: 'generating' as const } : s
    )
  });

  try {
    const response = await broadcastApi.generateAllSegments(sessionId);
    const results = response.data.results;

    // Update segments with results
    set((state) => ({
      segments: state.segments.map(s => {
        const result = results.find((r: any) => r.id === s.id);
        if (result) {
          return { ...s, status: result.status, audioPath: result.audioUrl || s.audioPath };
        }
        return s;
      })
    }));
  } catch (error) {
    // Revert generating segments to pending on failure
    set((state) => ({
      segments: state.segments.map(s =>
        s.status === 'generating' ? { ...s, status: 'pending' as const } : s
      )
    }));
    console.error('批量生成失败:', error);
    throw error;
  }
},

/** 编辑单句文本 */
updateSegmentText: async (segmentId, text) => {
  try {
    const response = await broadcastApi.updateSegment(segmentId, { text });
    const updatedSegment = response.data.segment;
    set((state) => ({
      segments: state.segments.map(s => s.id === segmentId ? updatedSegment : s),
    }));
    return updatedSegment;
  } catch (error) {
    console.error('编辑句子失败:', error);
    throw error;
  }
},

/** 合并所有句子音频 */
mergeSegments: async () => {
  const { sessionId } = get();
  if (!sessionId) throw new Error('无活跃会话');

  set({ isMerging: true });
  try {
    const response = await broadcastApi.mergeSegments(sessionId);
    const { broadcast, audioUrl } = response.data;

    set((state) => ({
      broadcasts: [broadcast, ...state.broadcasts],
      currentBroadcast: broadcast,
      sessionId: null,
      segments: [],
      isMerging: false,
    }));

    return { broadcast, audioUrl };
  } catch (error) {
    set({ isMerging: false });
    console.error('合并音频失败:', error);
    throw error;
  }
},

/** 重置会话 */
resetSession: () => {
  set({ sessionId: null, segments: [], generatingSegmentId: null });
},
```

Note: the `generateAllSegments` action uses `get()` — make sure the `create` callback receives `(set, get)`:

```ts
export const useStore = create<AppState>((set, get) => ({
```

- [ ] **Step 4: Verify TypeScript compiles**

Run from `frontend/`:

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/store/index.ts
git commit -m "feat(store): add session/segment state and actions for sentence TTS"
```

---

### Task 8: SegmentEditor Component

**Files:**
- Create: `frontend/src/components/Dashboard/SegmentEditor.tsx`

- [ ] **Step 1: Create SegmentEditor component**

Create `frontend/src/components/Dashboard/SegmentEditor.tsx`:

```tsx
import React, { useState, useRef } from 'react';
import { useStore } from '../../store';
import type { Segment } from '../../store';

interface SegmentItemProps {
  segment: Segment;
  isGenerating: boolean;
  onRegenerate: (id: number) => void;
  onEditText: (id: number, text: string) => void;
}

const SegmentItem: React.FC<SegmentItemProps> = ({
  segment,
  isGenerating,
  onRegenerate,
  onEditText,
}) => {
  const [editingText, setEditingText] = useState(segment.text);
  const [isEditing, setIsEditing] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const handlePlay = () => {
    if (segment.audioPath && audioRef.current) {
      audioRef.current.src = segment.audioPath;
      audioRef.current.play();
    }
  };

  const handleSave = () => {
    if (editingText.trim() && editingText.trim() !== segment.text) {
      onEditText(segment.id, editingText.trim());
    }
    setIsEditing(false);
  };

  const statusBadge = () => {
    switch (segment.status) {
      case 'ready':
        return (
          <span className="px-2 py-0.5 text-xs rounded-full bg-green-900/50 text-green-400 border border-green-700">
            已就绪
          </span>
        );
      case 'generating':
        return (
          <span className="px-2 py-0.5 text-xs rounded-full bg-yellow-900/50 text-yellow-400 border border-yellow-700 flex items-center gap-1">
            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            生成中
          </span>
        );
      case 'error':
        return (
          <span className="px-2 py-0.5 text-xs rounded-full bg-red-900/50 text-red-400 border border-red-700">
            失败
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 text-xs rounded-full bg-gray-700 text-gray-400 border border-gray-600">
            待生成
          </span>
        );
    }
  };

  return (
    <div className="bg-gray-750 rounded-lg border border-gray-700 p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <span className="text-xs text-gray-500 font-mono shrink-0 mt-1">
          #{segment.index + 1}
        </span>
        {statusBadge()}
      </div>

      {/* 文本区域 */}
      <div className="mb-3">
        {isEditing ? (
          <textarea
            value={editingText}
            onChange={(e) => setEditingText(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSave();
              }
            }}
            className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm border border-blue-500 focus:outline-none resize-none"
            rows={2}
            autoFocus
          />
        ) : (
          <p
            className="text-white text-sm leading-relaxed cursor-pointer hover:bg-gray-700/50 rounded px-3 py-2 transition-colors"
            onClick={() => {
              setEditingText(segment.text);
              setIsEditing(true);
            }}
            title="点击编辑"
          >
            {segment.text}
          </p>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-2">
        <button
          onClick={handlePlay}
          disabled={segment.status !== 'ready' || !segment.audioPath}
          className="px-3 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-300 flex items-center gap-1"
        >
          ▶ 播放
        </button>
        <button
          onClick={() => onRegenerate(segment.id)}
          disabled={isGenerating}
          className="px-3 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-300 flex items-center gap-1"
        >
          🔄 重新生成
        </button>
        {segment.errorMessage && (
          <span className="text-xs text-red-400 truncate max-w-[200px]" title={segment.errorMessage}>
            {segment.errorMessage}
          </span>
        )}
      </div>

      <audio ref={audioRef} className="hidden" />
    </div>
  );
};

export const SegmentEditor: React.FC = () => {
  const {
    sessionId,
    segments,
    isMerging,
    generatingSegmentId,
    generateSegment,
    generateAllSegments,
    updateSegmentText,
    mergeSegments,
    resetSession,
  } = useStore();

  const [error, setError] = useState<string | null>(null);

  if (!sessionId || segments.length === 0) return null;

  const readyCount = segments.filter((s) => s.status === 'ready').length;
  const allReady = segments.every((s) => s.status === 'ready');

  const handleRegenerate = async (segmentId: number) => {
    setError(null);
    try {
      await generateSegment(segmentId);
    } catch {
      setError('句子语音生成失败，请重试');
    }
  };

  const handleEditText = async (segmentId: number, text: string) => {
    setError(null);
    try {
      await updateSegmentText(segmentId, text);
    } catch {
      setError('编辑句子失败，请重试');
    }
  };

  const handleGenerateAll = async () => {
    setError(null);
    try {
      await generateAllSegments();
    } catch {
      setError('批量生成失败，请重试');
    }
  };

  const handleMerge = async () => {
    setError(null);
    try {
      await mergeSegments();
    } catch {
      setError('合并音频失败，请重试');
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">逐句编辑器</h3>
        <button
          onClick={resetSession}
          className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
        >
          重置
        </button>
      </div>

      {/* 句子列表 */}
      <div className="space-y-3 mb-4 max-h-[400px] overflow-y-auto">
        {segments.map((segment) => (
          <SegmentItem
            key={segment.id}
            segment={segment}
            isGenerating={generatingSegmentId === segment.id}
            onRegenerate={handleRegenerate}
            onEditText={handleEditText}
          />
        ))}
      </div>

      {/* 进度和操作栏 */}
      <div className="border-t border-gray-700 pt-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-gray-400">
            进度：{readyCount}/{segments.length} 句已就绪
          </span>
          <div className="w-32 bg-gray-700 rounded-full h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all"
              style={{ width: `${(readyCount / segments.length) * 100}%` }}
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleGenerateAll}
            disabled={generatingSegmentId !== null || readyCount === segments.length}
            className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2.5 transition-colors"
          >
            全部重新生成
          </button>
          <button
            onClick={handleMerge}
            disabled={!allReady || isMerging}
            className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg px-4 py-2.5 transition-colors flex items-center justify-center gap-2"
          >
            {isMerging ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                合成中...
              </>
            ) : (
              '合成完整音频'
            )}
          </button>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mt-3 bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-400 text-sm">
          {error}
        </div>
      )}
    </div>
  );
};

export default SegmentEditor;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run from `frontend/`:

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Dashboard/SegmentEditor.tsx
git commit -m "feat(ui): add SegmentEditor component with per-sentence editing and playback"
```

---

### Task 9: VoiceGenerator + Dashboard Integration

**Files:**
- Modify: `frontend/src/components/Dashboard/VoiceGenerator.tsx`
- Modify: `frontend/src/pages/Dashboard.tsx`

- [ ] **Step 1: Update VoiceGenerator to use split flow**

Replace the contents of `frontend/src/components/Dashboard/VoiceGenerator.tsx`:

```tsx
import React, { useState } from 'react';
import { useStore } from '../../store';

interface VoiceGeneratorProps {
  script: string;
}

const VOICE_OPTIONS = [
  { value: 'mimo_default', label: 'MiMo-默认', description: '默认音色' },
  { value: '冰糖', label: '冰糖', description: '中文女声' },
  { value: '茉莉', label: '茉莉', description: '中文女声' },
  { value: '苏打', label: '苏打', description: '中文男声' },
  { value: '白桦', label: '白桦', description: '中文男声' },
  { value: 'Mia', label: 'Mia', description: '英文女声' },
  { value: 'Chloe', label: 'Chloe', description: '英文女声' },
  { value: 'Milo', label: 'Milo', description: '英文男声' },
  { value: 'Dean', label: 'Dean', description: '英文男声' },
];

const VOICE_TYPES = [
  { value: 'preset', label: '预设音色' },
  { value: 'clone', label: '声音克隆' },
  { value: 'design', label: '音色设计' },
];

export const VoiceGenerator: React.FC<VoiceGeneratorProps> = ({ script }) => {
  const { splitScript, isSplitting, settings } = useStore();
  const [voiceType, setVoiceType] = useState('preset');
  const [selectedVoice, setSelectedVoice] = useState(settings.default_voice || '冰糖');
  const [voiceClone, setVoiceClone] = useState('');
  const [voiceDesign, setVoiceDesign] = useState('');
  const [stylePrompt, setStylePrompt] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSplit = async () => {
    if (!script) {
      setError('请先生成口播稿');
      return;
    }
    setError(null);

    try {
      await splitScript({
        script,
        voice: voiceType === 'preset' ? selectedVoice : undefined,
        voiceType,
        voiceDesign: voiceType === 'design' ? voiceDesign : undefined,
        voiceClone: voiceType === 'clone' ? voiceClone : undefined,
        stylePrompt: stylePrompt || undefined,
      });
    } catch (err) {
      setError('口播稿切分失败，请检查 API Key 或稍后重试');
      console.error(err);
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-white mb-4">语音生成</h3>

      {/* 音色类型选择 */}
      <div className="mb-4">
        <label className="block text-sm text-gray-400 mb-2">音色类型</label>
        <div className="flex gap-2">
          {VOICE_TYPES.map((type) => (
            <button
              key={type.value}
              onClick={() => setVoiceType(type.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                voiceType === type.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {/* 根据类型显示不同配置 */}
      {voiceType === 'preset' && (
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-2">选择音色</label>
          <div className="grid grid-cols-2 gap-2">
            {VOICE_OPTIONS.map((voice) => (
              <button
                key={voice.value}
                onClick={() => setSelectedVoice(voice.value)}
                className={`p-3 rounded-lg text-left transition-colors ${
                  selectedVoice === voice.value
                    ? 'bg-blue-600/30 border border-blue-500'
                    : 'bg-gray-700 border border-gray-600 hover:border-gray-500'
                }`}
              >
                <span className="text-white text-sm font-medium">{voice.label}</span>
                <span className="text-gray-400 text-xs block mt-0.5">{voice.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {voiceType === 'clone' && (
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-2">克隆声音 ID</label>
          <input
            type="text"
            value={voiceClone}
            onChange={(e) => setVoiceClone(e.target.value)}
            placeholder="输入已克隆的声音 ID"
            className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
          />
        </div>
      )}

      {voiceType === 'design' && (
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-2">音色设计描述</label>
          <textarea
            value={voiceDesign}
            onChange={(e) => setVoiceDesign(e.target.value)}
            placeholder="描述你想要的音色，例如：年轻女性，声音甜美，语速适中..."
            className="w-full h-20 bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none resize-none"
          />
        </div>
      )}

      {/* 风格提示词 */}
      <div className="mb-4">
        <label className="block text-sm text-gray-400 mb-2">
          风格提示词 <span className="text-gray-500">(可选)</span>
        </label>
        <input
          type="text"
          value={stylePrompt}
          onChange={(e) => setStylePrompt(e.target.value)}
          placeholder="例如：语速稍快，情绪饱满，专业播报风格"
          className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* 切分并生成按钮 */}
      <button
        onClick={handleSplit}
        disabled={isSplitting || !script}
        className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white font-medium rounded-lg px-4 py-3 transition-colors flex items-center justify-center gap-2"
      >
        {isSplitting ? (
          <>
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            切分中...
          </>
        ) : (
          '切分并生成'
        )}
      </button>

      {/* 错误提示 */}
      {error && (
        <div className="mt-3 bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-400 text-sm">
          {error}
        </div>
      )}
    </div>
  );
};

export default VoiceGenerator;
```

- [ ] **Step 2: Update Dashboard to conditionally render SegmentEditor**

Replace the contents of `frontend/src/pages/Dashboard.tsx`:

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
  const { script, sessionId, currentBroadcast, saveBroadcast } = useStore();

  const audioUrl = currentBroadcast?.audio_path
    ? `/api/broadcast/${currentBroadcast.id}/audio`
    : null;

  const showSegmentEditor = sessionId !== null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header title="控制台" subtitle="生成今日 AI 简讯播报" />

      <main className="flex-1 flex overflow-hidden p-6">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-6 w-full">
          {/* 左侧：快速生成（独立滚动） */}
          <div className="w-full lg:w-1/2 flex flex-col overflow-y-auto">
            <QuickGenerate />
          </div>

          {/* 右侧：语音生成 + 逐句编辑器/稿件预览 + 音频播放 */}
          <div className="w-full lg:w-1/2 space-y-6 overflow-y-auto">
            <VoiceGenerator script={script} />
            {showSegmentEditor ? (
              <SegmentEditor />
            ) : (
              <>
                <ScriptPreview />
                <AudioPlayer
                  audioUrl={audioUrl}
                  title={currentBroadcast?.title}
                  broadcastId={currentBroadcast?.id}
                  isSaved={currentBroadcast?.saved === 1}
                  onSave={saveBroadcast}
                />
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};
```

- [ ] **Step 3: Verify TypeScript compiles**

Run from `frontend/`:

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Verify frontend builds**

Run from `frontend/`:

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Dashboard/VoiceGenerator.tsx frontend/src/pages/Dashboard.tsx
git commit -m "feat(ui): integrate SegmentEditor into Dashboard, replace generate with split flow"
```

---

### Task 10: Final Verification

- [ ] **Step 1: Run all backend tests**

Run from `backend/`:

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 2: Run frontend build**

Run from `frontend/`:

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Start backend and verify routes are mounted**

Run from `backend/`:

```bash
npm run dev &
curl -s http://localhost:3001/api/broadcast/session/nonexistent | head -c 200
```

Expected: `{"error":"未找到会话"}` with status 404.

- [ ] **Step 4: Final commit with all changes**

```bash
git add -A
git status
git commit -m "feat: complete segment TTS workflow — split, per-sentence generation, edit, merge"
```
