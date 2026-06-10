# ASR 接入 + LiteLLM 集成 + API Key 命名规范化 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 集成 MiMo ASR 语音转录能力，部署 LiteLLM Proxy 统一 LLM 调用网关，规范化 API Key 命名体系。

**Architecture:** 后端 `mimo.js` 从 Anthropic SDK 迁移到 OpenAI SDK 经 LiteLLM Proxy 调用 LLM；新增 `asr.js` 服务镜像 `tts.js` 模式直连 MiMo API；前端新增独立转录页面。数据库迁移处理 Key 重命名。

**Tech Stack:** Node.js, Express 5, OpenAI SDK, Axios, multer, ffmpeg-static, Docker Compose, LiteLLM Proxy, React 19, TypeScript, Zustand

**Design Spec:** `docs/superpowers/specs/2026-06-10-asr-litellm-design.md`

**Worktree:** 在新 worktree 分支上开发，测试通过后合入主干。

---

## File Structure

### 新增文件

| 文件 | 职责 |
|------|------|
| `docker-compose.yml` | LiteLLM Proxy Docker 部署配置 |
| `litellm_config.yaml` | LiteLLM 模型映射配置 |
| `.env.example` | 环境变量模板 |
| `backend/src/services/asr.js` | ASR 语音转录服务（镜像 tts.js 模式） |
| `backend/src/routes/transcribe.js` | 转录 API 路由（音频/视频上传 + 转录） |
| `backend/tests/services/asr.test.js` | ASR 服务单元测试 |
| `backend/tests/routes/transcribe.test.js` | 转录路由集成测试 |
| `frontend/src/pages/Transcribe.tsx` | 转录独立页面 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `backend/src/db/index.js` | 新增 Key 重命名迁移逻辑 + 默认值更新 |
| `backend/src/services/mimo.js` | Anthropic SDK → OpenAI SDK；getApiKey 类型映射更新 |
| `backend/src/services/tts.js` | getApiKey 调用参数 `'tts'` → `'mimo'` |
| `backend/src/services/audio.js` | 新增 extractAudioFromVideo 函数 |
| `backend/src/routes/settings.js` | test-key 端点适配新 Key 名 |
| `backend/src/app.js` | 挂载 transcribe 路由 |
| `backend/package.json` | 添加 ffmpeg-static；移除 @anthropic-ai/sdk、fluent-ffmpeg |
| `.gitignore` | 新增 uploads/ 目录 |
| `frontend/src/store/index.ts` | Settings 接口 + 转录 state/action |
| `frontend/src/services/api.ts` | 新增转录 API + testKey 参数更新 |
| `frontend/src/pages/Settings.tsx` | Key 标签更新 |
| `frontend/src/App.tsx` | 新增 /transcribe 路由 |
| `frontend/src/components/Layout/Sidebar.tsx` | 新增转录导航项 |
| `CLAUDE.md` | 新增 ASR 说明、Key 命名更新 |
| `backend/BACKEND_CONVENTIONS.md` | 新增 ASR 服务说明 |

---

### Task 1: 基础设施 — 依赖更新与 LiteLLM 配置

**Files:**
- Modify: `backend/package.json`
- Create: `docker-compose.yml`
- Create: `litellm_config.yaml`
- Create: `.env.example`
- Modify: `.gitignore`

- [ ] **Step 1: 更新后端依赖**

编辑 `backend/package.json`，添加 `ffmpeg-static`，移除 `@anthropic-ai/sdk` 和 `fluent-ffmpeg`：

```json
{
  "dependencies": {
    "axios": "^1.16.1",
    "better-sqlite3": "^12.10.0",
    "cors": "^2.8.6",
    "dotenv": "^17.4.2",
    "express": "^5.2.1",
    "ffmpeg-static": "^0.6.0",
    "multer": "^2.1.1",
    "node-cron": "^4.2.1",
    "openai": "^6.39.0"
  }
}
```

- [ ] **Step 2: 安装依赖**

```bash
cd backend && npm install
```

Expected: `ffmpeg-static` 安装成功，`@anthropic-ai/sdk` 和 `fluent-ffmpeg` 从 node_modules 移除。

- [ ] **Step 3: 创建 docker-compose.yml**

在项目根目录创建：

```yaml
version: '3.8'

services:
  litellm:
    image: ghcr.io/berriai/litellm:main-latest
    ports:
      - "4000:4000"
    volumes:
      - ./litellm_config.yaml:/app/config.yaml
    command: --config /app/config.yaml
    environment:
      - LITELLM_MASTER_KEY=${LITELLM_MASTER_KEY:-sk-litellm-local}
    restart: unless-stopped
```

- [ ] **Step 4: 创建 litellm_config.yaml**

在项目根目录创建：

```yaml
model_list:
  - model_name: mimo-v2.5
    litellm_params:
      model: anthropic/mimo-v2.5
      api_base: https://token-plan-cn.xiaomimimo.com/anthropic/v1
      api_key: fake-key
      extra_headers:
        api-key: fake-key

general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY
```

- [ ] **Step 5: 创建 .env.example**

```env
# LiteLLM Proxy 管理 Key
LITELLM_MASTER_KEY=sk-litellm-local

# LiteLLM Proxy 地址（后端使用）
LITELLM_BASE_URL=http://localhost:4000/v1
```

- [ ] **Step 6: 更新 .gitignore**

在 `.gitignore` 末尾追加：

```
# 临时上传目录
backend/uploads/
```

- [ ] **Step 7: 提交**

```bash
git add backend/package.json backend/package-lock.json docker-compose.yml litellm_config.yaml .env.example .gitignore
git commit -m "chore: 更新依赖（添加 ffmpeg-static，移除 @anthropic-ai/sdk、fluent-ffmpeg）+ LiteLLM Proxy 配置"
```

---

### Task 2: 数据库迁移 — API Key 重命名

**Files:**
- Modify: `backend/src/db/index.js`

- [ ] **Step 1: 编写迁移逻辑**

在 `backend/src/db/index.js` 中，在现有的 `voice_presets` 迁移之后、默认设置之前，添加 Key 重命名迁移：

```js
// 迁移：API Key 重命名
// mimo_tts_api_key → mimo_api_key（TTS/ASR 共用的 MiMo 标准服务 Key）
// mimo_api_key → mimo_token_plan_api_key（MiMo Token Plan 订阅 Key）
try {
  // 1. 新增 mimo_token_plan_api_key（如果不存在）
  db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
    .run('mimo_token_plan_api_key', JSON.stringify(''));

  // 2. 将旧 mimo_api_key 的值迁移到 mimo_token_plan_api_key
  const oldLlmKey = db.prepare('SELECT value FROM settings WHERE key = ?').get('mimo_api_key');
  if (oldLlmKey) {
    const parsed = JSON.parse(oldLlmKey.value);
    if (parsed) {
      db.prepare('UPDATE settings SET value = ? WHERE key = ?')
        .run(oldLlmKey.value, 'mimo_token_plan_api_key');
    }
  }

  // 3. 将 mimo_tts_api_key 的值迁移到 mimo_api_key
  const oldTtsKey = db.prepare('SELECT value FROM settings WHERE key = ?').get('mimo_tts_api_key');
  if (oldTtsKey) {
    const parsed = JSON.parse(oldTtsKey.value);
    if (parsed) {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
        .run('mimo_api_key', oldTtsKey.value);
    }
  }

  // 4. 清理旧 key
  db.prepare('DELETE FROM settings WHERE key = ?').run('mimo_tts_api_key');
} catch (err) {
  console.error('API Key 迁移失败:', err.message);
}
```

- [ ] **Step 2: 更新默认设置**

将 `defaultSettings` 对象更新为：

```js
const defaultSettings = {
  mimo_api_key: '',
  mimo_token_plan_api_key: '',
  default_voice: '冰糖',
  opening_script: '大家好，欢迎收听今日 AI 简讯。',
  closing_script: '以上就是今天的 AI 简讯，感谢收听，我们明天再见。',
  content_categories: '["ai-models", "ai-products", "industry", "paper", "tip"]'
};
```

注意移除旧的 `mimo_tts_api_key`，新增 `mimo_token_plan_api_key`。

- [ ] **Step 3: 验证迁移**

```bash
cd backend && npm test -- --testPathPattern='tests/services/mimo' 2>&1 | head -20
```

Expected: 测试可能因 Key 名变化而失败（后续 Task 修复），但数据库迁移本身应无报错。

- [ ] **Step 4: 提交**

```bash
git add backend/src/db/index.js
git commit -m "feat(db): API Key 重命名迁移 — mimo_tts_api_key→mimo_api_key, mimo_api_key→mimo_token_plan_api_key"
```

---

### Task 3: 后端服务 — mimo.js 重写（Anthropic SDK → OpenAI SDK）

**Files:**
- Modify: `backend/src/services/mimo.js`
- Modify: `backend/tests/services/mimo.test.js`

- [ ] **Step 1: 重写 mimo.js**

将 `backend/src/services/mimo.js` 完整重写为以下内容。核心变更：
- `@anthropic-ai/sdk` → `openai`
- `client.messages.create()` → `client.chat.completions.create()`
- `getApiKey` 类型映射更新：`'anthropic'` → `'token_plan'`，`'tts'` → `'mimo'`

```js
const OpenAI = require('openai');
const axios = require('axios');
const db = require('../db');

const LITELLM_BASE_URL = process.env.LITELLM_BASE_URL || 'http://localhost:4000/v1';

/**
 * 获取 API Key
 * @param {string} type - Key 类型: 'mimo'（TTS/ASR 共用）或 'token_plan'（LLM 专用）
 * @returns {string} API Key
 */
function getApiKey(type = 'mimo') {
  const keyNameMap = {
    'mimo': 'mimo_api_key',
    'token_plan': 'mimo_token_plan_api_key',
  };
  const keyName = keyNameMap[type];
  if (!keyName) throw new Error(`未知的 Key 类型: ${type}`);
  const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get(keyName);
  if (!setting) throw new Error(`请先在设置中配置 ${keyName}`);
  let key;
  try {
    key = JSON.parse(setting.value);
  } catch (e) {
    throw new Error(`${keyName} 配置格式错误`);
  }
  if (!key) throw new Error(`请先在设置中配置 ${keyName}`);
  return key;
}

/**
 * 创建 OpenAI 客户端（指向 LiteLLM Proxy）
 * @returns {OpenAI} 客户端实例
 */
function createClient() {
  const apiKey = getApiKey('token_plan');
  return new OpenAI({
    apiKey,
    baseURL: LITELLM_BASE_URL,
  });
}

/**
 * 将资讯改写成口播稿
 * @param {Object} params
 * @param {Array} params.items - 资讯列表
 * @param {string} params.opening - 开场白
 * @param {string} params.closing - 结束语
 * @returns {Promise<string>} 口播稿
 */
async function rewriteToScript({ items, opening, closing }) {
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new Error('请提供有效的资讯列表');
  }

  const client = createClient();

  const itemsText = items.map((item, i) =>
    `${i + 1}. ${item.title}\n   ${item.summary}\n   来源：${item.source}`
  ).join('\n\n');

  const prompt = `你是一位专业的 AI 资讯播报员。请将以下 AI 资讯改写成适合口播的风格。

要求：
1. 语言自然流畅，适合朗读
2. 保持信息准确性
3. 适当添加过渡语句
4. 控制总时长在 3-5 分钟内
5. 使用中文
6. 纯文本输出，不要使用任何 Markdown 格式（不要用 **、##、- 等符号），直接输出可朗读的文字

开场白：${opening}

资讯内容：
${itemsText}

结束语：${closing}

请直接输出口播稿，不需要额外说明，不要使用任何 Markdown 格式。`;

  const completion = await client.chat.completions.create({
    model: 'mimo-v2.5',
    max_tokens: 2000,
    messages: [
      { role: 'system', content: '你是一位专业的播音稿撰写者。' },
      { role: 'user', content: prompt }
    ]
  });

  const text = completion.choices[0]?.message?.content;
  if (!text) {
    throw new Error('MiMo API 返回内容为空');
  }

  return text;
}

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

  const completion = await client.chat.completions.create({
    model: 'mimo-v2.5',
    max_tokens: 4000,
    messages: [
      { role: 'system', content: '你是一个文本切分助手，只输出 JSON 数组格式。' },
      { role: 'user', content: prompt }
    ]
  });

  const rawText = completion.choices[0]?.message?.content?.trim();
  if (!rawText) {
    throw new Error('MiMo API 返回内容为空');
  }

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

  for (const seg of segments) {
    if (typeof seg !== 'string' || seg.trim().length === 0) {
      throw new Error('切分结果包含空句子');
    }
  }

  return segments.map(s => s.trim());
}

/**
 * 测试 API Key 是否有效
 * @param {string} type - Key 类型: 'mimo' 或 'token_plan'
 * @returns {Promise<boolean>} 是否有效
 */
async function testApiKey(type = 'mimo') {
  try {
    if (type === 'mimo') {
      const mimoApiKey = getApiKey('mimo');
      await axios.post('https://api.xiaomimimo.com/v1/chat/completions', {
        model: 'mimo-v2.5-tts',
        messages: [
          { role: 'user', content: '测试' },
          { role: 'assistant', content: '测试' }
        ],
        audio: { format: 'wav', voice: '冰糖' }
      }, {
        headers: {
          'api-key': mimoApiKey,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
    } else {
      const client = createClient();
      await client.chat.completions.create({
        model: 'mimo-v2.5',
        max_tokens: 10,
        messages: [{ role: 'user', content: '你好' }]
      });
    }
    return true;
  } catch (error) {
    console.error('测试 API Key 失败:', error.message);
    return false;
  }
}

// 先导出已有函数，再 require('./tts') 避免循环依赖
module.exports = {
  getApiKey,
  rewriteToScript,
  splitScript,
  testApiKey,
};

// Re-export generateSpeech 保持向后兼容
const { generateSpeech } = require('./tts');
module.exports.generateSpeech = generateSpeech;
```

- [ ] **Step 2: 更新 mimo.test.js**

将 `backend/tests/services/mimo.test.js` 更新为：

```js
jest.mock('openai');

const mimo = require('../../src/services/mimo');

describe('MiMo 服务', () => {
  test('testApiKey 函数存在', () => {
    expect(typeof mimo.testApiKey).toBe('function');
  });

  test('generateSpeech 函数存在', () => {
    expect(typeof mimo.generateSpeech).toBe('function');
  });

  test('splitScript 存在且为函数', () => {
    expect(typeof mimo.splitScript).toBe('function');
  });

  test('getApiKey 存在且为函数', () => {
    expect(typeof mimo.getApiKey).toBe('function');
  });

  describe('rewriteToScript 错误路径', () => {
    test('空 items 抛出错误', async () => {
      await expect(mimo.rewriteToScript({ items: [] }))
        .rejects.toThrow('请提供有效的资讯列表');
    });

    test('非数组 items 抛出错误', async () => {
      await expect(mimo.rewriteToScript({ items: 'not-array' }))
        .rejects.toThrow('请提供有效的资讯列表');
    });
  });

  describe('splitScript 错误路径', () => {
    test('空文本抛出错误', async () => {
      await expect(mimo.splitScript(''))
        .rejects.toThrow('请提供有效的口播稿文本');
    });

    test('非字符串抛出错误', async () => {
      await expect(mimo.splitScript(null))
        .rejects.toThrow('请提供有效的口播稿文本');
    });
  });
});
```

注意：移除了集成测试（会真实调用 API），只保留函数存在性检查和输入校验测试。

- [ ] **Step 3: 运行测试验证**

```bash
cd backend && npm test -- --testPathPattern='tests/services/mimo'
```

Expected: 所有测试 PASS。

- [ ] **Step 4: 提交**

```bash
git add backend/src/services/mimo.js backend/tests/services/mimo.test.js
git commit -m "refactor(mimo): Anthropic SDK → OpenAI SDK，经 LiteLLM Proxy 调用 LLM；getApiKey 类型映射更新"
```

---

### Task 4: 后端服务 — tts.js 适配 Key 重命名

**Files:**
- Modify: `backend/src/services/tts.js`
- Modify: `backend/tests/services/tts.test.js`

- [ ] **Step 1: 更新 tts.js 的 getApiKey 调用**

编辑 `backend/src/services/tts.js`，将第 38 行：

```js
const ttsApiKey = getApiKey('tts');
```

改为：

```js
const ttsApiKey = getApiKey('mimo');
```

- [ ] **Step 2: 更新 tts.test.js 的 mock 断言**

编辑 `backend/tests/services/tts.test.js`，将最后一组测试：

```js
test('使用 tts 类型的 API Key', async () => {
  mockTtsResponse();
  await tts.generateSpeech({ text: '测试' });
  expect(mimo.getApiKey).toHaveBeenCalledWith('tts');
});
```

改为：

```js
test('使用 mimo 类型的 API Key', async () => {
  mockTtsResponse();
  await tts.generateSpeech({ text: '测试' });
  expect(mimo.getApiKey).toHaveBeenCalledWith('mimo');
});
```

- [ ] **Step 3: 运行测试验证**

```bash
cd backend && npm test -- --testPathPattern='tests/services/tts'
```

Expected: 所有测试 PASS。

- [ ] **Step 4: 提交**

```bash
git add backend/src/services/tts.js backend/tests/services/tts.test.js
git commit -m "refactor(tts): getApiKey 调用参数 'tts' → 'mimo' 适配 Key 重命名"
```

---

### Task 5: 后端服务 — ASR 服务 (asr.js) + 测试

**Files:**
- Create: `backend/src/services/asr.js`
- Create: `backend/tests/services/asr.test.js`

- [ ] **Step 1: 编写 ASR 服务测试**

创建 `backend/tests/services/asr.test.js`：

```js
jest.mock('axios');
const axios = require('axios');

jest.mock('../../src/services/mimo', () => ({
  getApiKey: jest.fn().mockReturnValue('fake-mimo-key')
}));

const fs = require('fs');
const path = require('path');
const os = require('os');
const asr = require('../../src/services/asr');
const mimo = require('../../src/services/mimo');

describe('ASR 服务', () => {
  let tmpDir;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asr-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function createFakeWavFile() {
    const filePath = path.join(tmpDir, 'test.wav');
    fs.writeFileSync(filePath, Buffer.from('fake-wav-audio-data'));
    return filePath;
  }

  function mockAsrResponse(text = '这是转录结果') {
    axios.post.mockResolvedValue({
      data: {
        choices: [{ message: { content: text } }],
        usage: { total_tokens: 100 }
      }
    });
  }

  describe('transcribeAudio', () => {
    test('成功转录音频文件', async () => {
      const audioPath = createFakeWavFile();
      mockAsrResponse('你好世界');

      const result = await asr.transcribeAudio({ audioPath });

      expect(result.text).toBe('你好世界');
      expect(result.usage).toEqual({ total_tokens: 100 });
    });

    test('调用正确的 API URL', async () => {
      const audioPath = createFakeWavFile();
      mockAsrResponse();
      await asr.transcribeAudio({ audioPath });

      expect(axios.post).toHaveBeenCalledWith(
        'https://api.xiaomimimo.com/v1/chat/completions',
        expect.any(Object),
        expect.any(Object)
      );
    });

    test('使用 mimo-v2.5-asr 模型', async () => {
      const audioPath = createFakeWavFile();
      mockAsrResponse();
      await asr.transcribeAudio({ audioPath });

      const body = axios.post.mock.calls[0][1];
      expect(body.model).toBe('mimo-v2.5-asr');
    });

    test('音频数据以 input_audio 格式传入', async () => {
      const audioPath = createFakeWavFile();
      mockAsrResponse();
      await asr.transcribeAudio({ audioPath });

      const body = axios.post.mock.calls[0][1];
      expect(body.messages[0].content[0].type).toBe('input_audio');
      expect(body.messages[0].content[0].input_audio.data).toMatch(/^data:audio\/wav;base64,/);
    });

    test('默认语言为 auto', async () => {
      const audioPath = createFakeWavFile();
      mockAsrResponse();
      await asr.transcribeAudio({ audioPath });

      const body = axios.post.mock.calls[0][1];
      expect(body.asr_options.language).toBe('auto');
    });

    test('可指定语言为 zh', async () => {
      const audioPath = createFakeWavFile();
      mockAsrResponse();
      await asr.transcribeAudio({ audioPath, language: 'zh' });

      const body = axios.post.mock.calls[0][1];
      expect(body.asr_options.language).toBe('zh');
    });

    test('使用 mimo 类型的 API Key', async () => {
      const audioPath = createFakeWavFile();
      mockAsrResponse();
      await asr.transcribeAudio({ audioPath });

      expect(mimo.getApiKey).toHaveBeenCalledWith('mimo');
    });

    test('请求 header 包含 api-key', async () => {
      const audioPath = createFakeWavFile();
      mockAsrResponse();
      await asr.transcribeAudio({ audioPath });

      const config = axios.post.mock.calls[0][2];
      expect(config.headers['api-key']).toBe('fake-mimo-key');
    });

    test('请求超时设置为 120 秒', async () => {
      const audioPath = createFakeWavFile();
      mockAsrResponse();
      await asr.transcribeAudio({ audioPath });

      const config = axios.post.mock.calls[0][2];
      expect(config.timeout).toBe(120000);
    });

    test('audioPath 为空时抛出校验错误', async () => {
      await expect(asr.transcribeAudio({}))
        .rejects.toThrow('请提供音频文件路径');
      await expect(asr.transcribeAudio({ audioPath: '' }))
        .rejects.toThrow('请提供音频文件路径');
      await expect(asr.transcribeAudio({ audioPath: null }))
        .rejects.toThrow('请提供音频文件路径');
    });

    test('API 返回无转录结果时抛出错误', async () => {
      const audioPath = createFakeWavFile();
      axios.post.mockResolvedValue({
        data: { choices: [{ message: {} }] }
      });
      await expect(asr.transcribeAudio({ audioPath }))
        .rejects.toThrow('MiMo ASR API 未返回转录结果');
    });

    test('429 限流自动重试 3 次后报错', async () => {
      const audioPath = createFakeWavFile();
      axios.post.mockRejectedValue({ response: { status: 429 } });
      await expect(asr.transcribeAudio({ audioPath }))
        .rejects.toThrow('MiMo API 请求过于频繁，请稍后再试');
      expect(axios.post).toHaveBeenCalledTimes(3);
    });

    test('429 重试后成功', async () => {
      const audioPath = createFakeWavFile();
      axios.post
        .mockRejectedValueOnce({ response: { status: 429 } })
        .mockRejectedValueOnce({ response: { status: 429 } })
        .mockResolvedValueOnce({
          data: {
            choices: [{ message: { content: '重试成功' } }],
            usage: {}
          }
        });

      const result = await asr.transcribeAudio({ audioPath });
      expect(result.text).toBe('重试成功');
      expect(axios.post).toHaveBeenCalledTimes(3);
    });

    test('超时错误抛出超时提示', async () => {
      const audioPath = createFakeWavFile();
      axios.post.mockRejectedValue({ code: 'ECONNABORTED', message: 'timeout' });
      await expect(asr.transcribeAudio({ audioPath }))
        .rejects.toThrow('MiMo ASR API 请求超时');
    });

    test('网络错误抛出网络提示', async () => {
      const audioPath = createFakeWavFile();
      axios.post.mockRejectedValue({ message: 'ENOTFOUND', code: 'ENOTFOUND' });
      await expect(asr.transcribeAudio({ audioPath }))
        .rejects.toThrow('MiMo ASR API 网络错误');
    });

    test('其他 API 错误抛出包含状态信息的错误', async () => {
      const audioPath = createFakeWavFile();
      axios.post.mockRejectedValue({
        response: { status: 500, data: { error: { message: '内部错误' } } }
      });
      await expect(asr.transcribeAudio({ audioPath }))
        .rejects.toThrow('MiMo ASR API 调用失败');
    });

    test('MP3 文件使用 audio/mpeg MIME 类型', async () => {
      const mp3Path = path.join(tmpDir, 'test.mp3');
      fs.writeFileSync(mp3Path, Buffer.from('fake-mp3-data'));
      mockAsrResponse();
      await asr.transcribeAudio({ audioPath: mp3Path });

      const body = axios.post.mock.calls[0][1];
      expect(body.messages[0].content[0].input_audio.data).toMatch(/^data:audio\/mpeg;base64,/);
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd backend && npm test -- --testPathPattern='tests/services/asr'
```

Expected: FAIL — `Cannot find module '../../src/services/asr'`

- [ ] **Step 3: 实现 ASR 服务**

创建 `backend/src/services/asr.js`：

```js
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { getApiKey } = require('./mimo');

const ASR_URL = 'https://api.xiaomimimo.com/v1/chat/completions';
const ASR_MODEL = 'mimo-v2.5-asr';
const MAX_BASE64_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * 转录音频文件为文字
 * @param {Object} params
 * @param {string} params.audioPath - 音频文件路径（WAV/MP3）
 * @param {string} [params.language='auto'] - 语言 (auto/zh/en)
 * @returns {Promise<{text: string, usage: Object}>} 转录结果
 */
async function transcribeAudio({ audioPath, language = 'auto' }) {
  if (!audioPath) {
    throw new Error('请提供音频文件路径');
  }

  const audioBuffer = fs.readFileSync(audioPath);
  const base64Audio = audioBuffer.toString('base64');

  if (base64Audio.length > MAX_BASE64_SIZE) {
    throw new Error('音频文件过大，Base64 编码后不能超过 10MB');
  }

  const mimeType = getMimeType(audioPath);
  const apiKey = getApiKey('mimo');

  // 带重试的 API 调用（与 tts.js 一致的重试逻辑）
  const MAX_RETRIES = 3;
  let response;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      response = await axios.post(ASR_URL, {
        model: ASR_MODEL,
        messages: [{
          role: 'user',
          content: [{
            type: 'input_audio',
            input_audio: {
              data: `data:${mimeType};base64,${base64Audio}`
            }
          }]
        }],
        asr_options: { language }
      }, {
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json'
        },
        timeout: 120000
      });
      break;
    } catch (err) {
      if (err.response?.status === 429 && attempt < MAX_RETRIES) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      if (err.response?.status === 429) {
        throw new Error('MiMo API 请求过于频繁，请稍后再试');
      }
      if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
        throw new Error('MiMo ASR API 请求超时，请稍后再试');
      }
      if (!err.response) {
        throw new Error(`MiMo ASR API 网络错误: ${err.message}`);
      }
      throw new Error(`MiMo ASR API 调用失败: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  const text = response.data?.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error('MiMo ASR API 未返回转录结果');
  }

  return {
    text,
    usage: response.data.usage,
  };
}

/** 根据文件扩展名获取 MIME 类型 */
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap = { '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };
  return mimeMap[ext] || 'audio/wav';
}

module.exports = { transcribeAudio };
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd backend && npm test -- --testPathPattern='tests/services/asr'
```

Expected: 所有测试 PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/src/services/asr.js backend/tests/services/asr.test.js
git commit -m "feat(asr): 新增 ASR 语音转录服务，镜像 tts.js 模式，含完整测试"
```

---

### Task 6: 后端服务 — 视频音频提取 (audio.js 更新)

**Files:**
- Modify: `backend/src/services/audio.js`

- [ ] **Step 1: 在 audio.js 末尾添加 extractAudioFromVideo**

在 `backend/src/services/audio.js` 的 `module.exports` 之前，添加：

```js
const { execFile } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

/**
 * 从视频文件提取音频
 * @param {string} videoPath - 视频文件路径
 * @returns {Promise<string>} 提取的音频文件路径（WAV，24kHz/16bit/mono）
 */
async function extractAudioFromVideo(videoPath) {
  if (!videoPath) {
    throw new Error('请提供视频文件路径');
  }
  const outputPath = videoPath.replace(/\.[^.]+$/, '.wav');
  await new Promise((resolve, reject) => {
    execFile(ffmpegPath, [
      '-i', videoPath,
      '-vn',
      '-acodec', 'pcm_s16le',
      '-ar', '24000',
      '-ac', '1',
      '-y',
      outputPath
    ], (error) => {
      if (error) reject(new Error(`音频提取失败: ${error.message}`));
      else resolve();
    });
  });
  return outputPath;
}
```

- [ ] **Step 2: 更新 module.exports**

将 audio.js 现有的 `module.exports` 更新，添加 `extractAudioFromVideo`：

```js
module.exports = {
  mergeWavFiles,
  resolveVoiceClone,
  extractAudioFromVideo,
};
```

- [ ] **Step 3: 提交**

```bash
git add backend/src/services/audio.js
git commit -m "feat(audio): 新增 extractAudioFromVideo，使用 ffmpeg-static 从视频提取音频"
```

---

### Task 7: 后端路由 — 转录路由 (transcribe.js) + 测试

**Files:**
- Create: `backend/src/routes/transcribe.js`
- Create: `backend/tests/routes/transcribe.test.js`
- Modify: `backend/src/app.js`

- [ ] **Step 1: 编写转录路由测试**

创建 `backend/tests/routes/transcribe.test.js`：

```js
jest.mock('../../src/services/asr', () => ({
  transcribeAudio: jest.fn().mockResolvedValue({
    text: '这是转录结果',
    usage: { total_tokens: 50 }
  })
}));

jest.mock('../../src/services/audio', () => ({
  extractAudioFromVideo: jest.fn().mockResolvedValue('/tmp/extracted.wav')
}));

const request = require('supertest');
const app = require('../../src/app');
const asr = require('../../src/services/asr');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('转录 API', () => {
  let tmpDir;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'transcribe-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('POST /api/transcribe', () => {
    test('上传音频文件成功转录', async () => {
      const audioFile = path.join(tmpDir, 'test.wav');
      fs.writeFileSync(audioFile, Buffer.from('fake-wav-data'));

      const res = await request(app)
        .post('/api/transcribe')
        .attach('audio', audioFile);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('transcription', '这是转录结果');
      expect(res.body).toHaveProperty('usage');
    });

    test('未上传文件返回 400', async () => {
      const res = await request(app)
        .post('/api/transcribe');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    test('可指定语言参数', async () => {
      const audioFile = path.join(tmpDir, 'test.wav');
      fs.writeFileSync(audioFile, Buffer.from('fake-wav-data'));

      const res = await request(app)
        .post('/api/transcribe')
        .attach('audio', audioFile)
        .field('language', 'zh');

      expect(res.status).toBe(200);
      expect(asr.transcribeAudio).toHaveBeenCalledWith(
        expect.objectContaining({ language: 'zh' })
      );
    });
  });

  describe('POST /api/transcribe/video', () => {
    test('上传视频文件成功提取音频并转录', async () => {
      const videoFile = path.join(tmpDir, 'test.mp4');
      fs.writeFileSync(videoFile, Buffer.from('fake-video-data'));

      const res = await request(app)
        .post('/api/transcribe/video')
        .attach('video', videoFile);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('transcription', '这是转录结果');
    });

    test('未上传文件返回 400', async () => {
      const res = await request(app)
        .post('/api/transcribe/video');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd backend && npm test -- --testPathPattern='tests/routes/transcribe'
```

Expected: FAIL — 路由不存在。

- [ ] **Step 3: 实现转录路由**

创建 `backend/src/routes/transcribe.js`：

```js
// 音频转录路由
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { transcribeAudio } = require('../services/asr');
const { extractAudioFromVideo } = require('../services/audio');
const { cleanAudioFile } = require('../utils/validation');

// multer 配置：临时上传目录
const upload = multer({
  dest: path.join(__dirname, '../../uploads'),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

/**
 * POST /api/transcribe
 * 上传音频文件并转录为文字
 * Body: multipart/form-data, field: audio
 * 可选: language (auto/zh/en)
 */
router.post('/', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传音频文件' });
    }

    const { language } = req.body;
    const result = await transcribeAudio({
      audioPath: req.file.path,
      language: language || 'auto'
    });

    res.json({ transcription: result.text, usage: result.usage });
  } catch (error) {
    console.error('转录失败:', error);
    res.status(500).json({ error: error.message || '转录失败' });
  } finally {
    // 清理临时文件
    if (req.file) cleanAudioFile(req.file.path);
  }
});

/**
 * POST /api/transcribe/video
 * 上传视频文件，提取音频后转录
 * Body: multipart/form-data, field: video
 * 可选: language (auto/zh/en)
 */
router.post('/video', upload.single('video'), async (req, res) => {
  let audioPath = null;
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传视频文件' });
    }

    audioPath = await extractAudioFromVideo(req.file.path);

    const { language } = req.body;
    const result = await transcribeAudio({
      audioPath,
      language: language || 'auto'
    });

    res.json({ transcription: result.text, usage: result.usage });
  } catch (error) {
    console.error('视频转录失败:', error);
    res.status(500).json({ error: error.message || '视频转录失败' });
  } finally {
    if (req.file) cleanAudioFile(req.file.path);
    if (audioPath) cleanAudioFile(audioPath);
  }
});

module.exports = router;
```

- [ ] **Step 4: 在 app.js 挂载路由**

编辑 `backend/src/app.js`，在现有的路由挂载之后添加：

```js
app.use('/api/transcribe', require('./routes/transcribe'));
```

- [ ] **Step 5: 确保 uploads 目录存在**

```bash
mkdir -p backend/uploads
```

- [ ] **Step 6: 运行测试确认通过**

```bash
cd backend && npm test -- --testPathPattern='tests/routes/transcribe'
```

Expected: 所有测试 PASS。

- [ ] **Step 7: 运行全部测试确认无回归**

```bash
cd backend && npm test
```

Expected: 所有测试 PASS，无回归。

- [ ] **Step 8: 提交**

```bash
git add backend/src/routes/transcribe.js backend/tests/routes/transcribe.test.js backend/src/app.js
git commit -m "feat(transcribe): 新增转录 API 路由（音频/视频），挂载到 app.js，含完整测试"
```

---

### Task 8: 后端路由 — settings.js 适配 Key 重命名

**Files:**
- Modify: `backend/src/routes/settings.js`

- [ ] **Step 1: 更新 test-key 端点**

编辑 `backend/src/routes/settings.js` 的 `POST /test-key` 端点。将：

```js
const testType = type === 'tts' ? 'tts' : 'anthropic';
const valid = await mimo.testApiKey(testType);
```

改为：

```js
const testType = type === 'token_plan' ? 'token_plan' : 'mimo';
const valid = await mimo.testApiKey(testType);
```

- [ ] **Step 2: 提交**

```bash
git add backend/src/routes/settings.js
git commit -m "refactor(settings): test-key 端点适配新 Key 类型名 mimo/token_plan"
```

---

### Task 9: 前端 — Store 接口与 API 层更新

**Files:**
- Modify: `frontend/src/store/index.ts`
- Modify: `frontend/src/services/api.ts`

- [ ] **Step 1: 更新 store/index.ts 中的 Settings 接口**

编辑 `frontend/src/store/index.ts`，将 Settings 接口：

```typescript
export interface Settings {
  mimo_api_key: string;
  mimo_tts_api_key: string;
  default_voice: string;
  opening_script: string;
  closing_script: string;
  content_categories: string;
}
```

改为：

```typescript
export interface Settings {
  mimo_api_key: string;
  mimo_token_plan_api_key: string;
  default_voice: string;
  opening_script: string;
  closing_script: string;
  content_categories: string;
}
```

- [ ] **Step 2: 在 store 中添加转录相关 state 和 action**

在 AppState 接口中添加：

```typescript
// 转录状态
transcribing: boolean;
transcriptionResult: string;
transcribeError: string;
transcribeAudio: (file: File, language?: string) => Promise<void>;
transcribeVideo: (file: File, language?: string) => Promise<void>;
clearTranscription: () => void;
```

在 store 实现中添加初始值和 action 实现：

```typescript
// 初始值
transcribing: false,
transcriptionResult: '',
transcribeError: '',

// Actions
transcribeAudio: async (file, language) => {
  set({ transcribing: true, transcribeError: '', transcriptionResult: '' });
  try {
    const { transcribeApi } = require('../services/api');
    const res = await transcribeApi.audio(file, language);
    set({ transcriptionResult: res.data.transcription, transcribing: false });
  } catch (err: any) {
    set({ transcribeError: err.response?.data?.error || '转录失败', transcribing: false });
  }
},

transcribeVideo: async (file, language) => {
  set({ transcribing: true, transcribeError: '', transcriptionResult: '' });
  try {
    const { transcribeApi } = require('../services/api');
    const res = await transcribeApi.video(file, language);
    set({ transcriptionResult: res.data.transcription, transcribing: false });
  } catch (err: any) {
    set({ transcribeError: err.response?.data?.error || '转录失败', transcribing: false });
  }
},

clearTranscription: () => set({ transcriptionResult: '', transcribeError: '' }),
```

- [ ] **Step 3: 更新 api.ts 中的 settingsApi.testKey 类型**

编辑 `frontend/src/services/api.ts`，将：

```typescript
testKey: (type?: 'llm' | 'tts') => api.post('/settings/test-key', { type }),
```

改为：

```typescript
testKey: (type?: 'mimo' | 'token_plan') => api.post('/settings/test-key', { type }),
```

- [ ] **Step 4: 在 api.ts 中添加转录 API**

在 `settingsApi` 之后添加：

```typescript
// 转录 API
export const transcribeApi = {
  audio: (file: File, language?: string) => {
    const formData = new FormData();
    formData.append('audio', file);
    if (language) formData.append('language', language);
    return api.post('/transcribe', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  video: (file: File, language?: string) => {
    const formData = new FormData();
    formData.append('video', file);
    if (language) formData.append('language', language);
    return api.post('/transcribe/video', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};
```

- [ ] **Step 5: 运行前端构建验证**

```bash
cd frontend && npm run build
```

Expected: 无 TypeScript 错误。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/store/index.ts frontend/src/services/api.ts
git commit -m "feat(frontend): 更新 Settings 接口 + 新增转录 store action 和 API 调用"
```

---

### Task 10: 前端 — Settings.tsx 标签更新

**Files:**
- Modify: `frontend/src/pages/Settings.tsx`

- [ ] **Step 1: 更新 API 配置区的 Key 标签**

在 `frontend/src/pages/Settings.tsx` 中，找到两个 API Key 输入框的标签，将：

- "LLM API Key" / "MiMo 模型 API Key" / 对应的 label → 改为 "MiMo Token Plan API Key"，描述改为 "用于 AI 稿件改写（Token Plan 订阅）"
- "TTS API Key" / "MiMo TTS API Key" / 对应的 label → 改为 "MiMo API Key"，描述改为 "用于语音合成和语音识别"

同时更新对应的 `handleTestKey` 调用参数：
- 测试 LLM Key 的按钮：`testApiKey('llm')` → `testApiKey('token_plan')`
- 测试 TTS Key 的按钮：`testApiKey('tts')` → `testApiKey('mimo')`

以及 `handleSaveField` 中的字段名：
- 保存 LLM Key：`'mimo_api_key'` → `'mimo_token_plan_api_key'`
- 保存 TTS Key：`'mimo_tts_api_key'` → `'mimo_api_key'`

- [ ] **Step 2: 运行前端构建验证**

```bash
cd frontend && npm run build
```

Expected: 无 TypeScript 错误。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/pages/Settings.tsx
git commit -m "refactor(settings): 更新 API Key 标签和字段名适配重命名"
```

---

### Task 11: 前端 — 新增转录页面 (Transcribe.tsx) + 路由 + 导航

**Files:**
- Create: `frontend/src/pages/Transcribe.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Layout/Sidebar.tsx`

- [ ] **Step 1: 创建 Transcribe.tsx**

创建 `frontend/src/pages/Transcribe.tsx`，遵循 FRONTEND_CONVENTIONS.md 中的设计系统（Soft Editorial 风格、毛玻璃卡片、色点标题、入场动画、骨架屏加载态）：

```tsx
import React, { useCallback, useState, useRef } from 'react';
import useStore from '../store';

const LANGUAGE_OPTIONS = [
  { value: 'auto', label: '自动检测' },
  { value: 'zh', label: '中文' },
  { value: 'en', label: '英文' },
];

export const Transcribe: React.FC = () => {
  const {
    transcribing,
    transcriptionResult,
    transcribeError,
    transcribeAudio,
    transcribeVideo,
    clearTranscription,
  } = useStore();

  const [language, setLanguage] = useState('auto');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      clearTranscription();
    }
  }, [clearTranscription]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      setSelectedFile(file);
      clearTranscription();
    }
  }, [clearTranscription]);

  const handleTranscribe = useCallback(async () => {
    if (!selectedFile) return;
    const isVideo = /\.(mp4|mov|avi|mkv|webm)$/i.test(selectedFile.name);
    if (isVideo) {
      await transcribeVideo(selectedFile, language);
    } else {
      await transcribeAudio(selectedFile, language);
    }
  }, [selectedFile, language, transcribeAudio, transcribeVideo]);

  const handleCopy = useCallback(async () => {
    if (transcriptionResult) {
      await navigator.clipboard.writeText(transcriptionResult);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [transcriptionResult]);

  return (
    <main className="flex-1 overflow-y-auto p-8">
      <h2 className="font-display text-[32px] font-medium text-ink mb-8 tracking-tight">
        音频转录
      </h2>

      <div className="max-w-3xl space-y-5">
        {/* 文件上传区 */}
        <div
          className="bg-white/[0.55] backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border"
          style={{ animation: 'fade-in-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) both' }}
        >
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-lilac" />
            <h3 className="font-display italic text-[14px] font-medium text-ink-soft">
              上传文件
            </h3>
          </div>

          <div
            className="border-2 border-dashed border-card-border rounded-2xl p-8 text-center cursor-pointer hover:border-ink/20 transition-colors"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".wav,.mp3,.mp4,.mov,.avi,.mkv,.webm"
              onChange={handleFileSelect}
              className="hidden"
            />
            {selectedFile ? (
              <div>
                <p className="font-body text-[13px] text-ink font-medium">{selectedFile.name}</p>
                <p className="font-body text-[11px] text-ink-soft mt-1">
                  {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
                </p>
              </div>
            ) : (
              <div>
                <p className="font-body text-[13px] text-ink-soft">
                  拖拽文件到此处，或点击选择文件
                </p>
                <p className="font-body text-[11px] text-ink-soft/60 mt-1">
                  支持 WAV / MP3 / MP4 / MOV 等格式
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 mt-4">
            <div className="flex items-center gap-2">
              <span className="font-body text-[12px] text-ink-soft">语言：</span>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="bg-white/70 text-ink rounded-full px-3.5 py-2 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[12px]"
              >
                {LANGUAGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <button
              onClick={handleTranscribe}
              disabled={!selectedFile || transcribing}
              className="bg-lemon hover:brightness-105 text-ink rounded-full px-5 py-2 shadow-btn font-body text-[12px] font-medium uppercase tracking-wider hover:-translate-y-px active:translate-y-0 active:shadow-none disabled:opacity-40 transition-all"
            >
              {transcribing ? '转录中...' : '开始转录'}
            </button>
          </div>
        </div>

        {/* 错误状态 */}
        {transcribeError && (
          <div className="bg-pink/10 border border-pink/30 rounded-xl p-3 text-ink text-[12px] font-body animate-shake">
            {transcribeError}
          </div>
        )}

        {/* 转录结果 */}
        {(transcriptionResult || transcribing) && (
          <div
            className="bg-white/[0.55] backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border"
            style={{ animation: 'fade-in-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.04s both' }}
          >
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-sage" />
              <h3 className="font-display italic text-[14px] font-medium text-ink-soft">
                转录结果
              </h3>
            </div>

            {transcribing ? (
              <div className="space-y-3">
                <div className="h-3 bg-ink/5 rounded w-3/4 animate-pulse" />
                <div className="h-3 bg-ink/5 rounded w-1/2 animate-pulse" />
                <div className="h-3 bg-ink/5 rounded w-2/3 animate-pulse" />
              </div>
            ) : (
              <>
                <textarea
                  value={transcriptionResult}
                  readOnly
                  rows={8}
                  className="w-full bg-white/60 rounded-2xl p-4 border border-card-border font-body text-[13px] text-ink resize-y focus:outline-none"
                />
                <div className="flex gap-3 mt-3">
                  <button
                    onClick={handleCopy}
                    className="bg-sage hover:brightness-105 text-ink rounded-xl px-4 py-2.5 shadow-btn font-body text-[12px] hover:-translate-y-px active:translate-y-0 active:shadow-none transition-all"
                  >
                    {copied ? '✓ 已复制' : '复制文字'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
};

export default Transcribe;
```

- [ ] **Step 2: 更新 App.tsx 添加路由**

在 `frontend/src/App.tsx` 中：

1. 添加 import：
```tsx
import { Transcribe } from './pages/Transcribe'
```

2. 在 Routes 中添加：
```tsx
<Route path="/transcribe" element={<Transcribe />} />
```

- [ ] **Step 3: 更新 Sidebar.tsx 添加导航项**

编辑 `frontend/src/components/Layout/Sidebar.tsx`，在 `navItems` 数组中 Settings 之前添加：

```tsx
{ path: '/transcribe', label: '音频转录', icon: '○' },
```

- [ ] **Step 4: 运行前端构建验证**

```bash
cd frontend && npm run build
```

Expected: 无 TypeScript 错误。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/pages/Transcribe.tsx frontend/src/App.tsx frontend/src/components/Layout/Sidebar.tsx
git commit -m "feat(transcribe): 新增音频转录页面、路由和侧边栏导航"
```

---

### Task 12: 项目文档更新

**Files:**
- Modify: `CLAUDE.md`
- Modify: `backend/BACKEND_CONVENTIONS.md`

- [ ] **Step 1: 更新 CLAUDE.md**

在 CLAUDE.md 中做以下更新：

1. **外部 API 章节** — 添加 ASR 模型说明：

在 MiMo TTS API 行后添加：
```
- **MiMo ASR API**（`https://api.xiaomimimo.com/v1`）：语音识别（mimo-v2.5-asr）
```

2. **MiMo API 模型与限速** — TTS 模型表格中添加：

```
| `mimo-v2.5-asr` | 语音识别（ASR） |
```

3. **数据库结构** — settings 表说明中更新 Key 名：

将 `mimo_api_key` 的说明更新为"MiMo 平台标准服务 Key（TTS + ASR 共用）"，新增 `mimo_token_plan_api_key` 说明为"MiMo Token Plan 订阅 Key（LLM 调用）"，移除 `mimo_tts_api_key`。

4. **目录结构** — 在 routes/ 下添加 `transcribe.js`，在 services/ 下添加 `asr.js`。

5. **关键开发模式** — 添加：
```
- ASR 转录通过 `services/asr.js` 调用 MiMo ASR API，模式与 TTS 一致
- LLM 调用通过 LiteLLM Proxy（Docker），使用 OpenAI SDK
- 视频音频提取使用 ffmpeg-static
```

- [ ] **Step 2: 更新 BACKEND_CONVENTIONS.md**

1. **技术栈** — 更新为：
```
- OpenAI SDK（LLM 稿件改写与文本切分，经 LiteLLM Proxy）
- Axios（TTS/ASR HTTP 请求 + API Key 测试）
```

2. **目录结构** — 在 services/ 下添加 `asr.js`（ASR 转录服务），在 routes/ 下添加 `transcribe.js`（转录路由）。

3. **服务职责表** — 添加：
```
| asr.js | ASR 语音转录 | 调用 MiMo ASR API |
```

- [ ] **Step 3: 提交**

```bash
git add CLAUDE.md backend/BACKEND_CONVENTIONS.md
git commit -m "docs: 更新项目文档 — 添加 ASR 服务说明、Key 命名更新、LiteLLM 集成说明"
```

---

### Task 13: 端到端验证

- [ ] **Step 1: 运行全部后端测试**

```bash
cd backend && npm test
```

Expected: 所有测试 PASS。

- [ ] **Step 2: 运行前端构建**

```bash
cd frontend && npm run build
```

Expected: 无 TypeScript 错误，构建成功。

- [ ] **Step 3: 启动后端验证数据库迁移**

```bash
cd backend && npm start &
sleep 2
curl -s http://localhost:3001/api/settings | python3 -m json.tool
```

Expected: 返回的 settings 中包含 `mimo_api_key` 和 `mimo_token_plan_api_key`，不包含 `mimo_tts_api_key`。

- [ ] **Step 4: 测试转录路由（无文件上传）**

```bash
curl -s -X POST http://localhost:3001/api/transcribe | python3 -m json.tool
```

Expected: `400` 状态码，`{"error": "请上传音频文件"}`

- [ ] **Step 5: 提交最终验证结果**

如果所有验证通过，无需额外提交。如有修复，提交修复：
```bash
git commit -m "fix: 修复端到端验证发现的问题"
```
