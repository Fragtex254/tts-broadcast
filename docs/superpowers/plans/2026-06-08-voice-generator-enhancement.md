# 语音生成器增强实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 VoiceGenerator 增加克隆/设计试听流程、预设管理系统，并将左侧面板宽度改为动态百分比限制。

**Architecture:** 后端新增 `voice_presets` 表和 `/api/voice-presets` 路由（含试听和 CRUD），使用 `multer` 处理文件上传，`fluent-ffmpeg` 做格式转换。前端新增 AudioUploader、CloneTrialPanel、DesignTrialPanel、VoicePresetTab 四个子组件，重构 VoiceGenerator 的 tab 结构。

**Tech Stack:** Express 5, better-sqlite3, multer, fluent-ffmpeg, React 19, TypeScript, Zustand, Axios

---

## 文件结构

### 新增文件

| 文件 | 职责 |
|------|------|
| `backend/src/routes/voicePresets.js` | 预设 CRUD + 试听 API 路由 |
| `backend/tests/routes/voicePresets.test.js` | 预设 API 测试 |
| `frontend/src/components/Dashboard/AudioUploader.tsx` | 音频文件上传组件（拖拽+点击，格式校验） |
| `frontend/src/components/Dashboard/CloneTrialPanel.tsx` | 克隆试听面板（上传+风格+试听文本+播放） |
| `frontend/src/components/Dashboard/DesignTrialPanel.tsx` | 设计试听面板（描述+风格+试听文本+播放） |
| `frontend/src/components/Dashboard/VoicePresetTab.tsx` | 预设列表页签（展示+试听+删除+应用） |

### 修改文件

| 文件 | 改动 |
|------|------|
| `backend/src/db/schema.sql` | 新增 `voice_presets` 表定义 |
| `backend/src/db/index.js` | 迁移代码确保表存在 |
| `backend/src/app.js` | 注册 `/api/voice-presets` 路由，添加 multer 静态文件 |
| `backend/package.json` | 新增 `multer`、`fluent-ffmpeg` 依赖 |
| `frontend/src/services/api.ts` | 新增 `voicePresetApi` 对象 |
| `frontend/src/store/index.ts` | 新增 `VoicePreset` 接口、`presets` 状态、`fetchPresets`/`deletePreset` actions |
| `frontend/src/components/Dashboard/VoiceGenerator.tsx` | tab 重命名（preset→builtin）、新增"预设" tab、替换 clone/design 区域为子组件 |
| `frontend/src/pages/ScriptEditor.tsx` | 面板宽度改为动态百分比限制 |

---

### Task 1: 数据库 — voice_presets 表

**Files:**
- Modify: `backend/src/db/schema.sql`
- Modify: `backend/src/db/index.js`

- [ ] **Step 1: 在 schema.sql 末尾添加 voice_presets 表**

在 `backend/src/db/schema.sql` 的最后一行（`idx_segments_broadcast_id` 索引之后）追加：

```sql
CREATE TABLE IF NOT EXISTS voice_presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('clone', 'design')),
  name TEXT NOT NULL,
  style_prompt TEXT DEFAULT '',
  trial_audio_path TEXT,
  original_audio_path TEXT,
  design_prompt TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_voice_presets_type ON voice_presets(type);
```

- [ ] **Step 2: 在 db/index.js 添加迁移代码**

在 `backend/src/db/index.js` 中，紧跟现有迁移代码（第 40 行 `mode` 列迁移的 `}` 之后）添加：

```js
// 迁移：确保 voice_presets 表存在（schema.sql 已包含 CREATE TABLE IF NOT EXISTS，
// 但旧数据库可能在 schema 执行前就存在，这里再保险一次）
try {
  db.prepare('SELECT id FROM voice_presets LIMIT 1').get();
} catch {
  db.exec(`
    CREATE TABLE IF NOT EXISTS voice_presets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('clone', 'design')),
      name TEXT NOT NULL,
      style_prompt TEXT DEFAULT '',
      trial_audio_path TEXT,
      original_audio_path TEXT,
      design_prompt TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_voice_presets_type ON voice_presets(type);
  `);
}
```

- [ ] **Step 3: 验证数据库启动正常**

```bash
cd backend && node -e "require('./src/db'); console.log('DB OK')"
```

Expected: 输出 `DB OK`，无报错。

- [ ] **Step 4: Commit**

```bash
git add backend/src/db/schema.sql backend/src/db/index.js
git commit -m "feat: add voice_presets table schema and migration"
```

---

### Task 2: 后端依赖 — multer + fluent-ffmpeg

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: 安装依赖**

```bash
cd backend && npm install multer fluent-ffmpeg
```

- [ ] **Step 2: 验证安装**

```bash
cd backend && node -e "require('multer'); require('fluent-ffmpeg'); console.log('Deps OK')"
```

Expected: 输出 `Deps OK`（如果系统未安装 ffmpeg，fluent-ffmpeg 本身不会报错，只在实际调用时才失败）。

- [ ] **Step 3: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "feat: add multer and fluent-ffmpeg dependencies"
```

---

### Task 3: 后端 — 试听 API（克隆+设计）

**Files:**
- Create: `backend/src/routes/voicePresets.js`

- [ ] **Step 1: 创建 voicePresets.js 路由文件，实现试听接口**

创建 `backend/src/routes/voicePresets.js`：

```js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mimo = require('../services/mimo');
const db = require('../db');

// 音频目录
const audioDir = path.join(__dirname, '../../audio');
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
}

// multer 配置：存到内存，后续处理
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/webm'];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(mp3|wav|ogg|m4a|webm|aac|flac)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的音频格式，请上传 MP3/WAV/OGG/M4A 等格式'));
    }
  }
});

/**
 * 将音频 buffer 转为 base64 data URI（MiMo API 要求格式）
 * 对于 mp3 和 wav 直接使用，其他格式通过 ffmpeg 转为 wav
 */
async function audioBufferToBase64(buffer, originalName) {
  const ext = path.extname(originalName).toLowerCase();

  if (ext === '.mp3') {
    return `data:audio/mpeg;base64,${buffer.toString('base64')}`;
  }
  if (ext === '.wav') {
    return `data:audio/wav;base64,${buffer.toString('base64')}`;
  }

  // 其他格式：用 ffmpeg 转为 wav
  const ffmpeg = require('fluent-ffmpeg');
  const os = require('os');
  const tmpInput = path.join(os.tmpdir(), `tts_input_${Date.now()}${ext}`);
  const tmpOutput = path.join(os.tmpdir(), `tts_output_${Date.now()}.wav`);

  try {
    fs.writeFileSync(tmpInput, buffer);
    await new Promise((resolve, reject) => {
      ffmpeg(tmpInput)
        .toFormat('wav')
        .audioChannels(1)
        .audioFrequency(24000)
        .on('end', resolve)
        .on('error', reject)
        .save(tmpOutput);
    });
    const wavBuffer = fs.readFileSync(tmpOutput);
    return `data:audio/wav;base64,${wavBuffer.toString('base64')}`;
  } finally {
    try { fs.unlinkSync(tmpInput); } catch {}
    try { fs.unlinkSync(tmpOutput); } catch {}
  }
}

/**
 * POST /api/voice-presets/trial/clone
 * 克隆试听：上传参考音频 + 试听文本 → 生成试听音频
 */
router.post('/trial/clone', upload.single('reference_audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传参考音频文件' });
    }
    const { trial_text, style_prompt } = req.body;
    if (!trial_text || !trial_text.trim()) {
      return res.status(400).json({ error: '请输入试听文本' });
    }

    // 将上传的音频转为 base64
    const voiceBase64 = await audioBufferToBase64(req.file.buffer, req.file.originalname);

    // 调用 MiMo TTS 克隆 API
    const audioBuffer = await mimo.generateSpeech({
      text: trial_text.trim(),
      voiceType: 'clone',
      voiceClone: voiceBase64,
      stylePrompt: style_prompt || '',
    });

    // 保存试听音频文件
    const filename = `preset_trial_clone_${Date.now()}.wav`;
    const filePath = path.join(audioDir, filename);
    fs.writeFileSync(filePath, audioBuffer);

    res.json({ audioUrl: `/audio/${filename}` });
  } catch (err) {
    console.error('克隆试听失败:', err.message);
    res.status(500).json({ error: err.message || '试听生成失败' });
  }
});

/**
 * POST /api/voice-presets/trial/design
 * 设计试听：音色描述 + 试听文本 → 生成试听音频
 */
router.post('/trial/design', async (req, res) => {
  try {
    const { design_prompt, trial_text, style_prompt } = req.body;
    if (!design_prompt || !design_prompt.trim()) {
      return res.status(400).json({ error: '请输入音色描述' });
    }
    if (!trial_text || !trial_text.trim()) {
      return res.status(400).json({ error: '请输入试听文本' });
    }

    const audioBuffer = await mimo.generateSpeech({
      text: trial_text.trim(),
      voiceType: 'design',
      voiceDesign: design_prompt.trim(),
      stylePrompt: style_prompt || '',
    });

    const filename = `preset_trial_design_${Date.now()}.wav`;
    const filePath = path.join(audioDir, filename);
    fs.writeFileSync(filePath, audioBuffer);

    res.json({ audioUrl: `/audio/${filename}` });
  } catch (err) {
    console.error('设计试听失败:', err.message);
    res.status(500).json({ error: err.message || '试听生成失败' });
  }
});

/**
 * GET /api/voice-presets
 * 列出所有预设
 */
router.get('/', (req, res) => {
  try {
    const presets = db.prepare('SELECT * FROM voice_presets ORDER BY created_at DESC').all();
    res.json({ presets });
  } catch (err) {
    console.error('获取预设列表失败:', err.message);
    res.status(500).json({ error: '获取预设列表失败' });
  }
});

/**
 * POST /api/voice-presets
 * 创建预设（multipart/form-data）
 */
router.post('/', upload.fields([
  { name: 'trial_audio', maxCount: 1 },
  { name: 'reference_audio', maxCount: 1 },
]), async (req, res) => {
  try {
    const { type, name, style_prompt, design_prompt } = req.body;

    if (!type || !['clone', 'design'].includes(type)) {
      return res.status(400).json({ error: '预设类型必须为 clone 或 design' });
    }
    if (!name || !name.trim()) {
      return res.status(400).json({ error: '请输入预设名称' });
    }

    // 检查数量上限
    const count = db.prepare('SELECT COUNT(*) as cnt FROM voice_presets').get();
    if (count.cnt >= 20) {
      return res.status(400).json({ error: '预设数量已达上限（20个），请先删除旧预设' });
    }

    let trialAudioPath = null;
    let originalAudioPath = null;

    // 保存试听音频
    if (req.files?.trial_audio?.[0]) {
      const file = req.files.trial_audio[0];
      const filename = `preset_trial_${Date.now()}.wav`;
      fs.writeFileSync(path.join(audioDir, filename), file.buffer);
      trialAudioPath = `/audio/${filename}`;
    }

    // 保存原始参考音频（仅 clone）
    if (type === 'clone' && req.files?.reference_audio?.[0]) {
      const file = req.files.reference_audio[0];
      const ext = path.extname(file.originalname) || '.wav';
      const filename = `preset_original_${Date.now()}${ext}`;
      fs.writeFileSync(path.join(audioDir, filename), file.buffer);
      originalAudioPath = `/audio/${filename}`;
    }

    const result = db.prepare(`
      INSERT INTO voice_presets (type, name, style_prompt, trial_audio_path, original_audio_path, design_prompt)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(type, name.trim(), style_prompt || '', trialAudioPath, originalAudioPath, design_prompt || null);

    const preset = db.prepare('SELECT * FROM voice_presets WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ preset });
  } catch (err) {
    console.error('创建预设失败:', err.message);
    res.status(500).json({ error: '创建预设失败' });
  }
});

/**
 * DELETE /api/voice-presets/:id
 * 删除预设及其关联音频文件
 */
router.delete('/:id', (req, res) => {
  try {
    const preset = db.prepare('SELECT * FROM voice_presets WHERE id = ?').get(req.params.id);
    if (!preset) {
      return res.status(404).json({ error: '预设不存在' });
    }

    // 删除关联音频文件
    if (preset.trial_audio_path) {
      const fullPath = path.join(__dirname, '../..', preset.trial_audio_path);
      try { fs.unlinkSync(fullPath); } catch {}
    }
    if (preset.original_audio_path) {
      const fullPath = path.join(__dirname, '../..', preset.original_audio_path);
      try { fs.unlinkSync(fullPath); } catch {}
    }

    db.prepare('DELETE FROM voice_presets WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('删除预设失败:', err.message);
    res.status(500).json({ error: '删除预设失败' });
  }
});

module.exports = router;
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/routes/voicePresets.js
git commit -m "feat: add voice presets API routes (trial + CRUD)"
```

---

### Task 4: 后端 — 注册路由

**Files:**
- Modify: `backend/src/app.js`

- [ ] **Step 1: 在 app.js 注册 voicePresets 路由**

在 `backend/src/app.js` 第 20 行（`app.use('/api/schedules', ...)` 之后）添加：

```js
app.use('/api/voice-presets', require('./routes/voicePresets'));
```

- [ ] **Step 2: 验证服务器启动正常**

```bash
cd backend && timeout 5 node src/app.js 2>&1 || true
```

Expected: 看到 `服务器运行在 http://localhost:3001`，无路由注册报错。

- [ ] **Step 3: Commit**

```bash
git add backend/src/app.js
git commit -m "feat: register voice presets route"
```

---

### Task 5: 后端 — API 测试

**Files:**
- Create: `backend/tests/routes/voicePresets.test.js`

- [ ] **Step 1: 创建测试文件**

创建 `backend/tests/routes/voicePresets.test.js`：

```js
const request = require('supertest');
const path = require('path');
const fs = require('fs');

// Mock mimo service 避免真实 API 调用
jest.mock('../../src/services/mimo', () => ({
  generateSpeech: jest.fn().mockResolvedValue(Buffer.from('fake-audio-data')),
}));

const app = require('../../src/app');
const db = require('../../src/db');

describe('Voice Presets API', () => {
  beforeEach(() => {
    // 清理测试数据
    db.prepare('DELETE FROM voice_presets').run();
  });

  describe('GET /api/voice-presets', () => {
    it('should return empty list initially', async () => {
      const res = await request(app).get('/api/voice-presets');
      expect(res.status).toBe(200);
      expect(res.body.presets).toEqual([]);
    });

    it('should return presets ordered by created_at DESC', async () => {
      db.prepare("INSERT INTO voice_presets (type, name) VALUES ('design', '测试1')").run();
      db.prepare("INSERT INTO voice_presets (type, name) VALUES ('clone', '测试2')").run();

      const res = await request(app).get('/api/voice-presets');
      expect(res.status).toBe(200);
      expect(res.body.presets).toHaveLength(2);
      expect(res.body.presets[0].name).toBe('测试2');
    });
  });

  describe('POST /api/voice-presets', () => {
    it('should create a design preset', async () => {
      const res = await request(app)
        .post('/api/voice-presets')
        .field('type', 'design')
        .field('name', '温柔女声')
        .field('style_prompt', '温柔')
        .field('design_prompt', '年轻女性，温柔甜美');

      expect(res.status).toBe(201);
      expect(res.body.preset.name).toBe('温柔女声');
      expect(res.body.preset.type).toBe('design');
    });

    it('should reject invalid type', async () => {
      const res = await request(app)
        .post('/api/voice-presets')
        .field('type', 'invalid')
        .field('name', '测试');

      expect(res.status).toBe(400);
    });

    it('should reject missing name', async () => {
      const res = await request(app)
        .post('/api/voice-presets')
        .field('type', 'design')
        .field('name', '');

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/voice-presets/:id', () => {
    it('should delete an existing preset', async () => {
      const insert = db.prepare("INSERT INTO voice_presets (type, name) VALUES ('design', '测试')").run();

      const res = await request(app).delete(`/api/voice-presets/${insert.lastInsertRowid}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 for non-existent preset', async () => {
      const res = await request(app).delete('/api/voice-presets/99999');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/voice-presets/trial/design', () => {
    it('should return audio URL on success', async () => {
      const res = await request(app)
        .post('/api/voice-presets/trial/design')
        .send({ design_prompt: '温柔女声', trial_text: '你好' });

      expect(res.status).toBe(200);
      expect(res.body.audioUrl).toMatch(/^\/audio\/preset_trial_design_/);
    });

    it('should reject missing design_prompt', async () => {
      const res = await request(app)
        .post('/api/voice-presets/trial/design')
        .send({ trial_text: '你好' });

      expect(res.status).toBe(400);
    });

    it('should reject missing trial_text', async () => {
      const res = await request(app)
        .post('/api/voice-presets/trial/design')
        .send({ design_prompt: '温柔女声' });

      expect(res.status).toBe(400);
    });
  });
});
```

- [ ] **Step 2: 运行测试**

```bash
cd backend && npx jest tests/routes/voicePresets.test.js --verbose
```

Expected: 所有测试通过。

- [ ] **Step 3: Commit**

```bash
git add backend/tests/routes/voicePresets.test.js
git commit -m "test: add voice presets API tests"
```

---

### Task 6: 前端 — API 服务层

**Files:**
- Modify: `frontend/src/services/api.ts`

- [ ] **Step 1: 在 api.ts 末尾（`export default api;` 之前）添加 voicePresetApi**

```ts
// 音色预设 API
export const voicePresetApi = {
  getAll: () => api.get('/voice-presets'),

  create: (formData: FormData) =>
    api.post('/voice-presets', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  delete: (id: number) => api.delete(`/voice-presets/${id}`),

  trialClone: (formData: FormData) =>
    api.post('/voice-presets/trial/clone', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  trialDesign: (data: { design_prompt: string; trial_text: string; style_prompt?: string }) =>
    api.post('/voice-presets/trial/design', data),
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/services/api.ts
git commit -m "feat: add voice preset API client"
```

---

### Task 7: 前端 — Zustand Store 扩展

**Files:**
- Modify: `frontend/src/store/index.ts`

- [ ] **Step 1: 添加 VoicePreset 接口和 store 状态/action**

在 `frontend/src/store/index.ts` 中：

1. 在 `Schedule` 接口之后（约第 65 行）添加接口定义：

```ts
/** 音色预设 */
export interface VoicePreset {
  id: number;
  type: 'clone' | 'design';
  name: string;
  style_prompt: string;
  trial_audio_path: string | null;
  original_audio_path: string | null;
  design_prompt: string | null;
  created_at: string;
  updated_at: string;
}
```

2. 在 `AppState` 接口中（`schedules: Schedule[];` 之后）添加：

```ts
  // 音色预设状态
  presets: VoicePreset[];

  // 音色预设操作
  fetchPresets: () => Promise<void>;
  deletePreset: (id: number) => Promise<void>;
```

3. 在 store 实现中（`schedules: [],` 之后）添加初始状态：

```ts
  presets: [],
```

4. 在 store 实现末尾（`toggleSchedule` 之后）添加 actions：

```ts
  // ============ 音色预设操作 ============

  fetchPresets: async () => {
    try {
      const { voicePresetApi } = await import('../services/api');
      const response = await voicePresetApi.getAll();
      set({ presets: response.data.presets });
    } catch (error) {
      console.error('获取预设列表失败:', error);
    }
  },

  deletePreset: async (id) => {
    try {
      const { voicePresetApi } = await import('../services/api');
      await voicePresetApi.delete(id);
      set((state) => ({
        presets: state.presets.filter((p) => p.id !== id),
      }));
    } catch (error) {
      console.error('删除预设失败:', error);
      throw error;
    }
  },
```

- [ ] **Step 2: 验证前端编译通过**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: 无类型错误。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/store/index.ts
git commit -m "feat: add voice presets to Zustand store"
```

---

### Task 8: 前端 — AudioUploader 组件

**Files:**
- Create: `frontend/src/components/Dashboard/AudioUploader.tsx`

- [ ] **Step 1: 创建 AudioUploader 组件**

创建 `frontend/src/components/Dashboard/AudioUploader.tsx`：

```tsx
import React, { useRef, useState, useCallback } from 'react';

interface AudioUploaderProps {
  onFileSelect: (file: File) => void;
  currentFileName?: string;
}

const ACCEPTED_FORMATS = '.mp3,.wav,.ogg,.m4a,.webm,.aac,.flac';
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export const AudioUploader: React.FC<AudioUploaderProps> = ({ onFileSelect, currentFileName }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateAndSelect = useCallback((file: File) => {
    setError(null);
    if (file.size > MAX_SIZE) {
      setError('文件大小不能超过 10MB');
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase();
    const allowed = ['mp3', 'wav', 'ogg', 'm4a', 'webm', 'aac', 'flac'];
    if (!ext || !allowed.includes(ext)) {
      setError('不支持的格式，请上传 MP3/WAV/OGG/M4A 等格式');
      return;
    }
    onFileSelect(file);
  }, [onFileSelect]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) validateAndSelect(file);
  }, [validateAndSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndSelect(file);
  }, [validateAndSelect]);

  return (
    <div className="animate-fade-in">
      <label className="font-body text-[10px] uppercase tracking-wider text-ink-soft/50 mb-1.5 block">
        参考音频
      </label>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        className={`relative rounded-xl border-2 border-dashed p-3 text-center cursor-pointer transition-all duration-150 ${
          isDragOver
            ? 'border-lilac bg-lilac/10'
            : currentFileName
              ? 'border-ink/15 bg-white/70'
              : 'border-card-border bg-white/50 hover:border-ink/20 hover:bg-white/70'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_FORMATS}
          onChange={handleChange}
          className="hidden"
        />
        {currentFileName ? (
          <div className="flex items-center justify-center gap-2">
            <span className="text-[11px] text-ink font-body truncate max-w-[150px]">
              {currentFileName}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onFileSelect(null as any);
                if (inputRef.current) inputRef.current.value = '';
              }}
              className="text-[10px] text-ink-soft/50 hover:text-ink transition-colors"
            >
              ✕
            </button>
          </div>
        ) : (
          <div>
            <p className="font-body text-[11px] text-ink-soft/60">
              📎 点击或拖拽上传音频
            </p>
            <p className="font-body text-[9px] text-ink-soft/40 mt-0.5">
              支持 MP3/WAV/OGG/M4A（最大 10MB）
            </p>
          </div>
        )}
      </div>
      {error && (
        <p className="font-body text-[10px] text-pink mt-1 animate-shake">{error}</p>
      )}
    </div>
  );
};

export default AudioUploader;
```

- [ ] **Step 2: 验证编译**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Dashboard/AudioUploader.tsx
git commit -m "feat: add AudioUploader component"
```

---

### Task 9: 前端 — CloneTrialPanel 组件

**Files:**
- Create: `frontend/src/components/Dashboard/CloneTrialPanel.tsx`

- [ ] **Step 1: 创建 CloneTrialPanel**

创建 `frontend/src/components/Dashboard/CloneTrialPanel.tsx`：

```tsx
import React, { useState, useCallback } from 'react';
import { voicePresetApi } from '../../services/api';
import { useStore } from '../../store';
import AudioUploader from './AudioUploader';

interface CloneTrialPanelProps {
  onVoiceCloneChange: (base64: string) => void;
  onStylePromptChange: (prompt: string) => void;
  voiceClone: string;
  stylePrompt: string;
}

export const CloneTrialPanel: React.FC<CloneTrialPanelProps> = ({
  onVoiceCloneChange,
  onStylePromptChange,
  voiceClone,
  stylePrompt,
}) => {
  const { presets, fetchPresets } = useStore();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [trialText, setTrialText] = useState('');
  const [trialAudioUrl, setTrialAudioUrl] = useState<string | null>(null);
  const [isTrialing, setIsTrialing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleTrial = async () => {
    if (!selectedFile) {
      setError('请先上传参考音频');
      return;
    }
    if (!trialText.trim()) {
      setError('请输入试听文本');
      return;
    }
    setError(null);
    setIsTrialing(true);
    setTrialAudioUrl(null);

    try {
      const formData = new FormData();
      formData.append('reference_audio', selectedFile);
      formData.append('trial_text', trialText.trim());
      if (stylePrompt.trim()) {
        formData.append('style_prompt', stylePrompt.trim());
      }
      const res = await voicePresetApi.trialClone(formData);
      setTrialAudioUrl(res.data.audioUrl);
    } catch (err: any) {
      setError(err.response?.data?.error || '试听生成失败');
    } finally {
      setIsTrialing(false);
    }
  };

  const handleSavePreset = async () => {
    if (!presetName.trim()) {
      setError('请输入预设名称');
      return;
    }
    if (!selectedFile) {
      setError('请先上传参考音频');
      return;
    }
    setError(null);
    setIsSaving(true);

    try {
      const formData = new FormData();
      formData.append('type', 'clone');
      formData.append('name', presetName.trim());
      formData.append('style_prompt', stylePrompt);
      formData.append('reference_audio', selectedFile);
      if (trialAudioUrl) {
        // 试听音频需要先下载再上传
        const audioRes = await fetch(trialAudioUrl);
        const audioBlob = await audioRes.blob();
        formData.append('trial_audio', audioBlob, 'trial.wav');
      }
      await voicePresetApi.create(formData);
      await fetchPresets();
      setShowSaveDialog(false);
      setPresetName('');
    } catch (err: any) {
      setError(err.response?.data?.error || '保存预设失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileSelect = useCallback((file: File | null) => {
    setSelectedFile(file);
    setTrialAudioUrl(null);
    if (file) {
      // 将文件转为 base64 供 VoiceGenerator 使用
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        onVoiceCloneChange(base64);
      };
      reader.readAsDataURL(file);
    } else {
      onVoiceCloneChange('');
    }
  }, [onVoiceCloneChange]);

  return (
    <div className="mb-3 animate-fade-in flex-shrink-0 space-y-2.5">
      {/* 参考音频上传 */}
      <AudioUploader
        onFileSelect={handleFileSelect}
        currentFileName={selectedFile?.name}
      />

      {/* 风格提示词 */}
      <div>
        <label className="font-body text-[10px] uppercase tracking-wider text-ink-soft/50 mb-1.5 block">
          风格提示词（可选）
        </label>
        <input
          type="text"
          value={stylePrompt}
          onChange={(e) => onStylePromptChange(e.target.value)}
          placeholder="温柔、专业..."
          className="w-full bg-white/70 text-ink rounded-xl px-3 py-2 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[11px] transition-colors"
        />
      </div>

      {/* 试听文本 */}
      <div>
        <label className="font-body text-[10px] uppercase tracking-wider text-ink-soft/50 mb-1.5 block">
          试听文本
        </label>
        <textarea
          value={trialText}
          onChange={(e) => setTrialText(e.target.value)}
          placeholder="输入任意文本进行试听..."
          className="w-full h-16 bg-white/70 text-ink rounded-xl px-3 py-2 border border-card-border focus:border-ink/20 focus:outline-none resize-none font-body text-[11px] transition-colors"
        />
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-2">
        <button
          onClick={handleTrial}
          disabled={isTrialing || !selectedFile || !trialText.trim()}
          className="flex-1 bg-lilac hover:brightness-105 disabled:opacity-40 text-ink font-body font-medium text-[11px] rounded-xl px-3 py-2 shadow-btn transition-all duration-150 uppercase tracking-wider"
        >
          {isTrialing ? '生成中...' : '▶ 试听'}
        </button>
        <button
          onClick={() => setShowSaveDialog(true)}
          disabled={!trialAudioUrl || presets.length >= 20}
          className="bg-sage/30 hover:bg-sage/50 disabled:opacity-40 text-ink font-body font-medium text-[11px] rounded-xl px-3 py-2 transition-all duration-150"
          title={presets.length >= 20 ? '预设已达上限' : '保存为预设'}
        >
          💾
        </button>
      </div>

      {/* 试听结果播放器 */}
      {trialAudioUrl && (
        <div className="bg-white/40 rounded-xl p-2.5 border border-card-border animate-fade-in">
          <audio controls src={trialAudioUrl} className="w-full h-8" />
        </div>
      )}

      {/* 保存预设对话框 */}
      {showSaveDialog && (
        <div className="bg-white/80 rounded-xl p-3 border border-card-border animate-fade-in">
          <label className="font-body text-[10px] uppercase tracking-wider text-ink-soft/50 mb-1.5 block">
            预设名称
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="如：温柔女声"
              className="flex-1 bg-white/70 text-ink rounded-lg px-3 py-1.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[11px]"
              autoFocus
            />
            <button
              onClick={handleSavePreset}
              disabled={isSaving}
              className="bg-lemon hover:brightness-105 disabled:opacity-40 text-ink font-body text-[11px] rounded-lg px-3 py-1.5 transition-colors"
            >
              {isSaving ? '...' : '保存'}
            </button>
            <button
              onClick={() => { setShowSaveDialog(false); setPresetName(''); }}
              className="text-ink-soft/40 hover:text-ink font-body text-[11px] transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="bg-pink/10 border border-pink/30 rounded-xl p-2 text-ink text-[10px] font-body animate-shake">
          {error}
        </div>
      )}
    </div>
  );
};

export default CloneTrialPanel;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/Dashboard/CloneTrialPanel.tsx
git commit -m "feat: add CloneTrialPanel component"
```

---

### Task 10: 前端 — DesignTrialPanel 组件

**Files:**
- Create: `frontend/src/components/Dashboard/DesignTrialPanel.tsx`

- [ ] **Step 1: 创建 DesignTrialPanel**

创建 `frontend/src/components/Dashboard/DesignTrialPanel.tsx`：

```tsx
import React, { useState } from 'react';
import { voicePresetApi } from '../../services/api';
import { useStore } from '../../store';

interface DesignTrialPanelProps {
  onVoiceDesignChange: (design: string) => void;
  onStylePromptChange: (prompt: string) => void;
  voiceDesign: string;
  stylePrompt: string;
}

export const DesignTrialPanel: React.FC<DesignTrialPanelProps> = ({
  onVoiceDesignChange,
  onStylePromptChange,
  voiceDesign,
  stylePrompt,
}) => {
  const { presets, fetchPresets } = useStore();
  const [trialText, setTrialText] = useState('');
  const [trialAudioUrl, setTrialAudioUrl] = useState<string | null>(null);
  const [isTrialing, setIsTrialing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleTrial = async () => {
    if (!voiceDesign.trim()) {
      setError('请输入音色描述');
      return;
    }
    if (!trialText.trim()) {
      setError('请输入试听文本');
      return;
    }
    setError(null);
    setIsTrialing(true);
    setTrialAudioUrl(null);

    try {
      const res = await voicePresetApi.trialDesign({
        design_prompt: voiceDesign.trim(),
        trial_text: trialText.trim(),
        style_prompt: stylePrompt.trim() || undefined,
      });
      setTrialAudioUrl(res.data.audioUrl);
    } catch (err: any) {
      setError(err.response?.data?.error || '试听生成失败');
    } finally {
      setIsTrialing(false);
    }
  };

  const handleSavePreset = async () => {
    if (!presetName.trim()) {
      setError('请输入预设名称');
      return;
    }
    setError(null);
    setIsSaving(true);

    try {
      const formData = new FormData();
      formData.append('type', 'design');
      formData.append('name', presetName.trim());
      formData.append('style_prompt', stylePrompt);
      formData.append('design_prompt', voiceDesign);
      if (trialAudioUrl) {
        const audioRes = await fetch(trialAudioUrl);
        const audioBlob = await audioRes.blob();
        formData.append('trial_audio', audioBlob, 'trial.wav');
      }
      await voicePresetApi.create(formData);
      await fetchPresets();
      setShowSaveDialog(false);
      setPresetName('');
    } catch (err: any) {
      setError(err.response?.data?.error || '保存预设失败');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mb-3 animate-fade-in flex-shrink-0 space-y-2.5">
      {/* 音色描述 */}
      <div>
        <label className="font-body text-[10px] uppercase tracking-wider text-ink-soft/50 mb-1.5 block">
          音色描述
        </label>
        <textarea
          value={voiceDesign}
          onChange={(e) => onVoiceDesignChange(e.target.value)}
          placeholder="描述你想要的音色..."
          className="w-full h-20 bg-white/70 text-ink rounded-xl px-3 py-2 border border-card-border focus:border-ink/20 focus:outline-none resize-none font-body text-[11px] transition-colors"
        />
      </div>

      {/* 风格提示词 */}
      <div>
        <label className="font-body text-[10px] uppercase tracking-wider text-ink-soft/50 mb-1.5 block">
          风格提示词（可选）
        </label>
        <input
          type="text"
          value={stylePrompt}
          onChange={(e) => onStylePromptChange(e.target.value)}
          placeholder="温柔、专业..."
          className="w-full bg-white/70 text-ink rounded-xl px-3 py-2 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[11px] transition-colors"
        />
      </div>

      {/* 试听文本 */}
      <div>
        <label className="font-body text-[10px] uppercase tracking-wider text-ink-soft/50 mb-1.5 block">
          试听文本
        </label>
        <textarea
          value={trialText}
          onChange={(e) => setTrialText(e.target.value)}
          placeholder="输入任意文本进行试听..."
          className="w-full h-16 bg-white/70 text-ink rounded-xl px-3 py-2 border border-card-border focus:border-ink/20 focus:outline-none resize-none font-body text-[11px] transition-colors"
        />
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-2">
        <button
          onClick={handleTrial}
          disabled={isTrialing || !voiceDesign.trim() || !trialText.trim()}
          className="flex-1 bg-lilac hover:brightness-105 disabled:opacity-40 text-ink font-body font-medium text-[11px] rounded-xl px-3 py-2 shadow-btn transition-all duration-150 uppercase tracking-wider"
        >
          {isTrialing ? '生成中...' : '▶ 试听'}
        </button>
        <button
          onClick={() => setShowSaveDialog(true)}
          disabled={!trialAudioUrl || presets.length >= 20}
          className="bg-sage/30 hover:bg-sage/50 disabled:opacity-40 text-ink font-body font-medium text-[11px] rounded-xl px-3 py-2 transition-all duration-150"
          title={presets.length >= 20 ? '预设已达上限' : '保存为预设'}
        >
          💾
        </button>
      </div>

      {/* 试听结果播放器 */}
      {trialAudioUrl && (
        <div className="bg-white/40 rounded-xl p-2.5 border border-card-border animate-fade-in">
          <audio controls src={trialAudioUrl} className="w-full h-8" />
        </div>
      )}

      {/* 保存预设对话框 */}
      {showSaveDialog && (
        <div className="bg-white/80 rounded-xl p-3 border border-card-border animate-fade-in">
          <label className="font-body text-[10px] uppercase tracking-wider text-ink-soft/50 mb-1.5 block">
            预设名称
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="如：磁性男声"
              className="flex-1 bg-white/70 text-ink rounded-lg px-3 py-1.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[11px]"
              autoFocus
            />
            <button
              onClick={handleSavePreset}
              disabled={isSaving}
              className="bg-lemon hover:brightness-105 disabled:opacity-40 text-ink font-body text-[11px] rounded-lg px-3 py-1.5 transition-colors"
            >
              {isSaving ? '...' : '保存'}
            </button>
            <button
              onClick={() => { setShowSaveDialog(false); setPresetName(''); }}
              className="text-ink-soft/40 hover:text-ink font-body text-[11px] transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="bg-pink/10 border border-pink/30 rounded-xl p-2 text-ink text-[10px] font-body animate-shake">
          {error}
        </div>
      )}
    </div>
  );
};

export default DesignTrialPanel;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/Dashboard/DesignTrialPanel.tsx
git commit -m "feat: add DesignTrialPanel component"
```

---

### Task 11: 前端 — VoicePresetTab 组件

**Files:**
- Create: `frontend/src/components/Dashboard/VoicePresetTab.tsx`

- [ ] **Step 1: 创建 VoicePresetTab**

创建 `frontend/src/components/Dashboard/VoicePresetTab.tsx`：

```tsx
import React, { useEffect, useState } from 'react';
import { useStore, VoicePreset } from '../../store';

interface VoicePresetTabProps {
  onApplyPreset: (preset: VoicePreset) => void;
}

export const VoicePresetTab: React.FC<VoicePresetTabProps> = ({ onApplyPreset }) => {
  const { presets, fetchPresets, deletePreset } = useStore();
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

  const handleDelete = async (id: number) => {
    try {
      await deletePreset(id);
      setDeleteConfirmId(null);
    } catch {
      // store 已处理错误
    }
  };

  if (presets.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center animate-fade-in min-h-0">
        <p className="font-body text-[11px] text-ink-soft/40 text-center px-4">
          暂无保存的预设<br />
          <span className="text-[9px]">在克隆或设计页签中试听满意后可保存</span>
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto mb-3 animate-fade-in min-h-0">
      <label className="font-body text-[10px] uppercase tracking-wider text-ink-soft/50 mb-1.5 block">
        已保存预设 ({presets.length}/20)
      </label>
      <div className="flex flex-col gap-1.5">
        {presets.map((preset) => (
          <div
            key={preset.id}
            className="bg-white/50 border border-card-border rounded-xl p-2.5 hover:border-ink/15 transition-all duration-150 cursor-pointer"
            onClick={() => onApplyPreset(preset)}
          >
            {/* 头部：标签 + 名称 */}
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-body uppercase tracking-wider ${
                preset.type === 'clone'
                  ? 'bg-lilac/20 text-ink-soft'
                  : 'bg-sage/30 text-ink-soft'
              }`}>
                {preset.type === 'clone' ? '克隆' : '设计'}
              </span>
              <span className="font-body text-[12px] font-medium text-ink truncate flex-1">
                {preset.name}
              </span>
            </div>

            {/* 摘要信息 */}
            <p className="font-body text-[9px] text-ink-soft/50 truncate mb-1.5">
              {preset.type === 'clone'
                ? (preset.style_prompt ? `风格：${preset.style_prompt}` : '无风格提示')
                : (preset.design_prompt ? preset.design_prompt.slice(0, 40) + (preset.design_prompt.length > 40 ? '...' : '') : '无描述')
              }
            </p>

            {/* 操作按钮 */}
            <div className="flex items-center gap-2">
              {preset.trial_audio_path && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setPlayingId(playingId === preset.id ? null : preset.id);
                  }}
                  className="font-body text-[10px] text-ink-soft/50 hover:text-ink transition-colors"
                >
                  {playingId === preset.id ? '⏸ 停止' : '▶ 试听'}
                </button>
              )}
              <div className="flex-1" />
              {deleteConfirmId === preset.id ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(preset.id); }}
                    className="font-body text-[10px] text-pink hover:text-pink/80 transition-colors"
                  >
                    确认删除
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(null); }}
                    className="font-body text-[10px] text-ink-soft/40 hover:text-ink transition-colors"
                  >
                    取消
                  </button>
                </div>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(preset.id); }}
                  className="font-body text-[10px] text-ink-soft/30 hover:text-pink transition-colors"
                >
                  🗑
                </button>
              )}
            </div>

            {/* 内联音频播放器 */}
            {playingId === preset.id && preset.trial_audio_path && (
              <div className="mt-2 animate-fade-in" onClick={(e) => e.stopPropagation()}>
                <audio
                  controls
                  src={preset.trial_audio_path}
                  className="w-full h-7"
                  onEnded={() => setPlayingId(null)}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default VoicePresetTab;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/Dashboard/VoicePresetTab.tsx
git commit -m "feat: add VoicePresetTab component"
```

---

### Task 12: 前端 — 重构 VoiceGenerator

**Files:**
- Modify: `frontend/src/components/Dashboard/VoiceGenerator.tsx`

- [ ] **Step 1: 更新 VOICE_TYPES 和导入**

将 `VoiceGenerator.tsx` 的顶部改为：

```tsx
import React, { useState, useEffect, useRef } from 'react';
import { useStore, VoicePreset } from '../../store';
import { broadcastApi } from '../../services/api';
import { CloneTrialPanel } from './CloneTrialPanel';
import { DesignTrialPanel } from './DesignTrialPanel';
import { VoicePresetTab } from './VoicePresetTab';

interface VoiceGeneratorProps {
  layout?: 'horizontal' | 'vertical';
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
  { value: 'builtin', label: '内置' },
  { value: 'clone', label: '克隆' },
  { value: 'design', label: '设计' },
  { value: 'preset', label: '预设' },
];
```

- [ ] **Step 2: 更新组件状态和 store 初始化**

在组件函数体开头，将 `voiceType` 的默认值从 `'preset'` 改为 `'builtin'`：

```tsx
  const [voiceType, setVoiceType] = useState(voiceConfig.voiceType === 'preset' ? 'builtin' : (voiceConfig.voiceType || 'builtin'));
```

- [ ] **Step 3: 添加应用预设的回调函数**

在 `handleBatchGenerate` 函数之前添加：

```tsx
  const handleApplyPreset = (preset: VoicePreset) => {
    if (preset.type === 'clone') {
      setVoiceType('clone');
      setVoiceClone(preset.original_audio_path || '');
      setStylePrompt(preset.style_prompt || '');
    } else {
      setVoiceType('design');
      setVoiceDesign(preset.design_prompt || '');
      setStylePrompt(preset.style_prompt || '');
    }
  };
```

- [ ] **Step 4: 更新 store 同步逻辑中的 voiceType 映射**

将 `useEffect` 中同步到 store 的逻辑（第 42-50 行区域）改为，将 `'builtin'` 映射回 `'preset'` 以保持后端兼容：

```tsx
  useEffect(() => {
    const mappedType = voiceType === 'builtin' ? 'preset' : voiceType;
    updateVoiceConfig({
      voice: selectedVoice,
      voiceType: mappedType,
      voiceDesign,
      voiceClone,
      stylePrompt,
    });
  }, [selectedVoice, voiceType, voiceDesign, voiceClone, stylePrompt, updateVoiceConfig]);
```

同样更新同步到后端的 `useEffect`（第 54-67 行区域）中的类型映射：

```tsx
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (!currentBroadcast) return;
    const mappedType = voiceType === 'builtin' ? 'preset' : voiceType;
    broadcastApi.updateVoiceConfig(currentBroadcast.id, {
      voiceType: mappedType,
      voice: voiceType === 'builtin' ? selectedVoice : undefined,
      voiceDesign: voiceType === 'design' ? voiceDesign : undefined,
      voiceClone: voiceType === 'clone' ? voiceClone : undefined,
      stylePrompt: stylePrompt || undefined,
    }).catch(() => {/* 静默失败 */});
  }, [selectedVoice, voiceType, voiceDesign, voiceClone, stylePrompt, currentBroadcast]);
```

- [ ] **Step 5: 替换垂直布局中的预设/克隆/设计区域**

将垂直布局中 `voiceType === 'preset'` 的区域条件改为 `voiceType === 'builtin'`：

```tsx
        {/* 内置音色列表（纵向） */}
        {voiceType === 'builtin' && (
          // ... 保持原有代码不变，只改条件
        )}
```

将 `voiceType === 'clone'` 的区域替换为 CloneTrialPanel：

```tsx
        {/* 克隆试听面板 */}
        {voiceType === 'clone' && (
          <CloneTrialPanel
            voiceClone={voiceClone}
            stylePrompt={stylePrompt}
            onVoiceCloneChange={setVoiceClone}
            onStylePromptChange={setStylePrompt}
          />
        )}
```

将 `voiceType === 'design'` 的区域替换为 DesignTrialPanel：

```tsx
        {/* 设计试听面板 */}
        {voiceType === 'design' && (
          <DesignTrialPanel
            voiceDesign={voiceDesign}
            stylePrompt={stylePrompt}
            onVoiceDesignChange={setVoiceDesign}
            onStylePromptChange={setStylePrompt}
          />
        )}
```

在 design 区域之后添加预设页签：

```tsx
        {/* 预设列表 */}
        {voiceType === 'preset' && (
          <VoicePresetTab onApplyPreset={handleApplyPreset} />
        )}
```

删除原来的独立"风格提示词"区域（因为 CloneTrialPanel 和 DesignTrialPanel 内部已包含）。

将生成按钮之前的条件 `voiceType !== 'preset'` 改为 `voiceType === 'clone' || voiceType === 'design'`（如果需要保留风格提示词的话，但由于已移入子组件，这部分可以删除）。

- [ ] **Step 6: 同步更新水平布局**

对水平布局做同样的条件替换（`preset` → `builtin`），克隆和设计区域保持原有简化输入框即可（水平布局不在主流程中使用）。

- [ ] **Step 7: 验证编译**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/Dashboard/VoiceGenerator.tsx
git commit -m "feat: refactor VoiceGenerator with trial panels and preset tab"
```

---

### Task 13: 前端 — 面板宽度动态调整

**Files:**
- Modify: `frontend/src/pages/ScriptEditor.tsx`

- [ ] **Step 1: 将固定常量改为动态计算**

将 `ScriptEditor.tsx` 中的常量定义（第 10-12 行）替换为：

```ts
const DEFAULT_LEFT_WIDTH = 260;
```

- [ ] **Step 2: 添加动态限制的 useEffect**

在 `containerRef` 定义之后添加一个 state 和 useEffect：

```tsx
  const [widthLimits, setWidthLimits] = useState({ min: 200, max: 600 });

  useEffect(() => {
    const updateLimits = () => {
      setWidthLimits({
        min: window.innerWidth * 0.25,
        max: window.innerWidth * 0.75,
      });
    };
    updateLimits();
    window.addEventListener('resize', updateLimits);
    return () => window.removeEventListener('resize', updateLimits);
  }, []);
```

- [ ] **Step 3: 更新拖拽处理中的钳制逻辑**

将 `handleMouseMove` 中的钳制逻辑（第 40 行）从：

```ts
const clamped = Math.min(MAX_LEFT_WIDTH, Math.max(MIN_LEFT_WIDTH, newWidth));
```

改为：

```ts
const clamped = Math.min(widthLimits.max, Math.max(widthLimits.min, newWidth));
```

同时将 `useEffect` 的依赖数组加上 `widthLimits`：

```tsx
  useEffect(() => {
    if (!isDragging) return;
    // ... handleMouseMove 和 handleMouseUp
  }, [isDragging, widthLimits]);
```

- [ ] **Step 4: 验证编译**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/ScriptEditor.tsx
git commit -m "feat: dynamic panel width limits based on viewport"
```

---

### Task 14: 集成验证

- [ ] **Step 1: 启动后端，确认无报错**

```bash
cd backend && timeout 5 node src/app.js 2>&1 || true
```

- [ ] **Step 2: 运行后端测试**

```bash
cd backend && npx jest --verbose 2>&1 | tail -30
```

Expected: 所有测试通过。

- [ ] **Step 3: 启动前端，确认无编译错误**

```bash
cd frontend && npx vite build 2>&1 | tail -10
```

Expected: 构建成功，无错误。

- [ ] **Step 4: 最终 Commit**

```bash
git add -A && git commit -m "feat: voice generator enhancement - trial, presets, dynamic panel"
```
