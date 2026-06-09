# 后端技术债全面治理 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除后端全部 12 项技术债，引入 DAL 层、拆分大文件、统一公共逻辑、补充测试覆盖。

**Architecture:** 三波推进 — 第一波修复小问题+提取工具+拆分 mimo；第二波引入 DAL 层+拆分 broadcast.js；第三波补充测试。每一步独立可提交，API 契约不变。

**Tech Stack:** Node.js, Express 5, better-sqlite3, Jest, supertest, axios, @anthropic-ai/sdk

---

## 文件结构总览

### 新建文件
| 文件 | 职责 | Task |
|------|------|------|
| `backend/src/utils/validation.js` | validateId, cleanAudioFile, audioDir | 1 |
| `backend/src/services/tts.js` | generateSpeech TTS 服务 | 4 |
| `backend/src/services/broadcastStore.js` | broadcast 表 DAL | 5 |
| `backend/src/services/segmentStore.js` | segment 表 DAL | 6 |
| `backend/src/routes/segments.js` | segment 子路由 | 8 |
| `backend/tests/utils/validation.test.js` | validation 工具测试 | 1 |
| `backend/tests/services/tts.test.js` | TTS 服务测试 | 4 |
| `backend/tests/services/broadcastStore.test.js` | broadcastStore 测试 | 5 |
| `backend/tests/services/segmentStore.test.js` | segmentStore 测试 | 6 |
| `backend/tests/routes/segments.test.js` | segment 路由测试 | 12 |

### 修改文件
| 文件 | 变更 | Task |
|------|------|------|
| `backend/src/services/aihot.js` | 删除 TLS 全局行 | 2 |
| `backend/src/services/scheduler.js` | global → 模块级变量 | 3 |
| `backend/src/services/mimo.js` | 拆出 generateSpeech，re-export；testApiKey 改用 axios | 4 |
| `backend/src/services/audio.js` | 新增 resolveVoiceClone | 7 |
| `backend/src/routes/broadcast.js` | 使用 DAL + validateId + cleanAudioFile，删除 segment 路由 | 8 |
| `backend/src/app.js` | 新增 segments 路由挂载 | 9 |
| `backend/tests/services/mimo.test.js` | 扩充 mock 测试 | 11 |
| `backend/tests/routes/broadcast.test.js` | 扩充端点覆盖 | 10 |

---

## 第一波：小问题修复 + 共享工具 + mimo 拆分

---

### Task 1: 创建 utils/validation.js 及其测试

**Files:**
- Create: `backend/src/utils/validation.js`
- Create: `backend/tests/utils/validation.test.js`

- [ ] **Step 1: 创建 validation.test.js（TDD — 先写测试）**

```js
// backend/tests/utils/validation.test.js
const path = require('path');
const fs = require('fs');
const os = require('os');
const { validateId, cleanAudioFile, audioDir } = require('../../src/utils/validation');

describe('validation 工具', () => {
  describe('validateId', () => {
    test('有效正整数返回 { valid: true, id }', () => {
      const result = validateId('42');
      expect(result).toEqual({ valid: true, id: 42 });
    });

    test('自定义 label 出现在错误消息中', () => {
      const result = validateId('abc', '播报 ID');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('无效的播报 ID');
    });

    test('默认 label 为 ID', () => {
      const result = validateId('-1');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('无效的ID');
    });

    test('零返回无效', () => {
      expect(validateId('0').valid).toBe(false);
    });

    test('负数返回无效', () => {
      expect(validateId('-5').valid).toBe(false);
    });

    test('浮点数截断后有效', () => {
      const result = validateId('3.7');
      expect(result).toEqual({ valid: true, id: 3 });
    });

    test('空字符串返回无效', () => {
      expect(validateId('').valid).toBe(false);
    });

    test('非数字字符串返回无效', () => {
      expect(validateId('hello').valid).toBe(false);
    });
  });

  describe('cleanAudioFile', () => {
    let tmpDir;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-audio-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('删除存在的文件', () => {
      const fp = path.join(tmpDir, 'test.wav');
      fs.writeFileSync(fp, 'data');
      expect(fs.existsSync(fp)).toBe(true);

      // 临时覆盖 audioDir 以测试 — 直接传绝对路径
      cleanAudioFile(fp);
      expect(fs.existsSync(fp)).toBe(false);
    });

    test('文件不存在时静默跳过', () => {
      expect(() => cleanAudioFile('/nonexistent/path.wav')).not.toThrow();
    });

    test('路径为空时静默跳过', () => {
      expect(() => cleanAudioFile(null)).not.toThrow();
      expect(() => cleanAudioFile(undefined)).not.toThrow();
      expect(() => cleanAudioFile('')).not.toThrow();
    });
  });

  describe('audioDir', () => {
    test('导出为字符串路径', () => {
      expect(typeof audioDir).toBe('string');
      expect(audioDir).toContain('audio');
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && npx jest tests/utils/validation.test.js --no-cache 2>&1 | head -20`
Expected: FAIL — `Cannot find module '../../src/utils/validation'`

- [ ] **Step 3: 创建 validation.js 实现**

```js
// backend/src/utils/validation.js
const path = require('path');
const fs = require('fs');

const audioDir = path.join(__dirname, '../../audio');

/**
 * 校验 URL 路径中的 ID 参数
 * @param {string} idStr - 原始字符串
 * @param {string} [label='ID'] - 用于错误消息的标签
 * @returns {{ valid: true, id: number } | { valid: false, error: string }}
 */
function validateId(idStr, label = 'ID') {
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return { valid: false, error: `无效的${label}` };
  }
  return { valid: true, id };
}

/**
 * 安全删除音频文件
 * @param {string} audioPath - 文件路径（绝对路径或以 /audio/ 开头的相对路径）
 */
function cleanAudioFile(audioPath) {
  if (!audioPath) return;
  let fp = audioPath;
  if (audioPath.startsWith('/audio/')) {
    fp = path.join(__dirname, '../..', audioPath);
  }
  if (fs.existsSync(fp)) {
    fs.unlinkSync(fp);
  }
}

module.exports = { validateId, cleanAudioFile, audioDir };
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd backend && npx jest tests/utils/validation.test.js --no-cache`
Expected: PASS — 8 tests passed

- [ ] **Step 5: 提交**

```bash
git add backend/src/utils/validation.js backend/tests/utils/validation.test.js
git commit -m "feat: add shared validation utilities (validateId, cleanAudioFile)"
```

---

### Task 2: 修复 aihot.js TLS 全局关闭

**Files:**
- Modify: `backend/src/services/aihot.js:5`

- [ ] **Step 1: 运行现有 aihot 测试确认基线**

Run: `cd backend && npx jest tests/services/aihot.test.js --no-cache 2>&1 | tail -5`
Expected: 现有测试通过（注意：aihot 测试是集成测试，可能因网络原因跳过）

- [ ] **Step 2: 删除 TLS 全局行**

在 `backend/src/services/aihot.js` 中，删除第 5 行：

```diff
 const axios = require('axios');
 const https = require('https');
 
-// 解决部分环境下的 TLS 证书验证问题
-process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
-
 const BASE_URL = 'https://aihot.virxact.com';
```

第 16 行的 `httpsAgent: new https.Agent({ rejectUnauthorized: false })` 保持不变，它已为 aihot 请求单独禁用 TLS 验证。

- [ ] **Step 3: 运行全部测试确认无回归**

Run: `cd backend && npx jest --no-cache 2>&1 | tail -10`
Expected: 所有现有测试通过

- [ ] **Step 4: 提交**

```bash
git add backend/src/services/aihot.js
git commit -m "fix: remove global TLS override in aihot.js, use per-instance httpsAgent only"
```

---

### Task 3: 修复 scheduler.js global 变量

**Files:**
- Modify: `backend/src/services/scheduler.js`

- [ ] **Step 1: 运行现有 scheduler 测试确认基线**

Run: `cd backend && npx jest tests/services/scheduler.test.js --no-cache`
Expected: PASS

- [ ] **Step 2: 将 global.onScheduleTrigger 改为模块级变量**

将 `backend/src/services/scheduler.js` 修改如下：

```diff
 // 存储活跃的 cron 任务
 const activeJobs = new Map();
 
+// 模块级回调变量（替代 global 变量）
+let onTriggerCallback = null;
+
 /**
  * 初始化调度器，加载所有活跃任务
  * @param {Function} [onTrigger] - 任务触发时的回调函数
  */
 function init(onTrigger) {
   if (onTrigger) {
-    global.onScheduleTrigger = onTrigger;
+    onTriggerCallback = onTrigger;
   }
   const schedules = db.prepare('SELECT * FROM schedules WHERE is_active = 1').all();
```

```diff
   const job = cron.schedule(schedule.cron_expression, async () => {
     console.log(`执行定时任务: ${schedule.name}`);
     try {
-      if (global.onScheduleTrigger) {
-        await global.onScheduleTrigger(schedule);
+      if (onTriggerCallback) {
+        await onTriggerCallback(schedule);
       }
```

- [ ] **Step 3: 运行测试确认通过**

Run: `cd backend && npx jest tests/services/scheduler.test.js --no-cache`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add backend/src/services/scheduler.js
git commit -m "fix: replace global.onScheduleTrigger with module-level variable"
```

---

### Task 4: 拆分 mimo.js → mimo.js + tts.js

**Files:**
- Create: `backend/src/services/tts.js`
- Create: `backend/tests/services/tts.test.js`
- Modify: `backend/src/services/mimo.js`

本任务分两个阶段：先创建 tts.js（TDD），再重构 mimo.js。

#### 阶段 A：创建 tts.js

- [ ] **Step 1: 创建 tts.test.js**

```js
// backend/tests/services/tts.test.js
jest.mock('axios');
const axios = require('axios');

jest.mock('../../src/services/mimo', () => ({
  getApiKey: jest.fn().mockReturnValue('fake-tts-key')
}));

const tts = require('../../src/services/tts');
const mimo = require('../../src/services/mimo');

describe('TTS 服务', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateSpeech', () => {
    const fakeAudioBase64 = Buffer.from('fake-wav-data').toString('base64');

    function mockTtsResponse() {
      axios.post.mockResolvedValue({
        data: {
          choices: [{ message: { audio: { data: fakeAudioBase64 } } }]
        }
      });
    }

    test('preset 模式成功生成音频 Buffer', async () => {
      mockTtsResponse();
      const result = await tts.generateSpeech({
        text: '测试文本',
        voice: '冰糖',
        voiceType: 'preset'
      });
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.toString()).toBe('fake-wav-data');
      expect(axios.post).toHaveBeenCalledWith(
        'https://api.xiaomimimo.com/v1/chat/completions',
        expect.objectContaining({ model: 'mimo-v2.5-tts' }),
        expect.any(Object)
      );
    });

    test('design 模式使用 voicedesign 模型', async () => {
      mockTtsResponse();
      await tts.generateSpeech({
        text: '测试文本',
        voiceType: 'design',
        voiceDesign: '温柔女声'
      });
      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ model: 'mimo-v2.5-tts-voicedesign' }),
        expect.any(Object)
      );
    });

    test('clone 模式使用 voiceclone 模型', async () => {
      mockTtsResponse();
      await tts.generateSpeech({
        text: '测试文本',
        voiceType: 'clone',
        voiceClone: 'data:audio/wav;base64,AAAA'
      });
      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ model: 'mimo-v2.5-tts-voiceclone' }),
        expect.any(Object)
      );
    });

    test('429 错误抛出友好消息', async () => {
      axios.post.mockRejectedValue({
        response: { status: 429 }
      });
      await expect(tts.generateSpeech({ text: '测试' }))
        .rejects.toThrow('MiMo API 请求过于频繁，请稍后再试');
    });

    test('API 返回无音频数据时抛出错误', async () => {
      axios.post.mockResolvedValue({
        data: { choices: [{ message: {} }] }
      });
      await expect(tts.generateSpeech({ text: '测试' }))
        .rejects.toThrow('MiMo TTS API 未返回音频数据');
    });

    test('其他 API 错误抛出包含状态信息的错误', async () => {
      axios.post.mockRejectedValue({
        response: {
          status: 500,
          data: { error: { message: '内部错误' } }
        }
      });
      await expect(tts.generateSpeech({ text: '测试' }))
        .rejects.toThrow('MiMo TTS API 调用失败');
    });

    test('使用 tts 类型的 API Key', async () => {
      mockTtsResponse();
      await tts.generateSpeech({ text: '测试' });
      expect(mimo.getApiKey).toHaveBeenCalledWith('tts');
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && npx jest tests/services/tts.test.js --no-cache 2>&1 | head -10`
Expected: FAIL — `Cannot find module '../../src/services/tts'`

- [ ] **Step 3: 创建 tts.js**

```js
// backend/src/services/tts.js
const axios = require('axios');
const { getApiKey } = require('./mimo');

/**
 * 生成 TTS 语音
 * @param {Object} params
 * @param {string} params.text - 口播稿
 * @param {string} [params.voice='冰糖'] - 音色 ID
 * @param {string} [params.voiceType='preset'] - 音色类型 (preset/design/clone)
 * @param {string} [params.voiceDesign] - 音色设计描述
 * @param {string} [params.voiceClone] - 音色克隆音频 (base64)
 * @param {string} [params.stylePrompt] - 风格提示
 * @returns {Promise<Buffer>} 音频 Buffer
 */
async function generateSpeech({ text, voice = '冰糖', voiceType = 'preset', voiceDesign, voiceClone, stylePrompt }) {
  const ttsApiKey = getApiKey('tts');

  let model, messages, audioConfig;

  switch (voiceType) {
    case 'design':
      model = 'mimo-v2.5-tts-voicedesign';
      messages = [
        { role: 'user', content: voiceDesign },
        { role: 'assistant', content: text }
      ];
      audioConfig = { format: 'wav', optimize_text_preview: true };
      break;

    case 'clone':
      model = 'mimo-v2.5-tts-voiceclone';
      messages = [
        { role: 'user', content: stylePrompt || '' },
        { role: 'assistant', content: text }
      ];
      audioConfig = { format: 'wav', voice: voiceClone };
      break;

    default: // preset
      model = 'mimo-v2.5-tts';
      messages = [
        { role: 'user', content: stylePrompt || '用专业新闻主播的语气，语速适中，沉稳大气' },
        { role: 'assistant', content: text }
      ];
      audioConfig = { format: 'wav', voice };
  }

  let response;
  try {
    response = await axios.post('https://api.xiaomimimo.com/v1/chat/completions', {
      model,
      messages,
      audio: audioConfig
    }, {
      headers: {
        'api-key': ttsApiKey,
        'Content-Type': 'application/json'
      },
      timeout: 0
    });
  } catch (err) {
    if (err.response?.status === 429) {
      throw new Error('MiMo API 请求过于频繁，请稍后再试');
    }
    throw new Error(`MiMo TTS API 调用失败: ${err.response?.data?.error?.message || err.message}`);
  }

  const audioBase64 = response.data?.choices?.[0]?.message?.audio?.data;
  if (!audioBase64) {
    throw new Error('MiMo TTS API 未返回音频数据');
  }
  return Buffer.from(audioBase64, 'base64');
}

module.exports = { generateSpeech };
```

- [ ] **Step 4: 运行 tts 测试确认通过**

Run: `cd backend && npx jest tests/services/tts.test.js --no-cache`
Expected: PASS — 7 tests passed

- [ ] **Step 5: 重构 mimo.js — 移除 generateSpeech，re-export，testApiKey 改用 axios**

完整替换 `backend/src/services/mimo.js`：

```js
// backend/src/services/mimo.js
const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');
const db = require('../db');

const BASE_URL = 'https://token-plan-cn.xiaomimimo.com/anthropic';

/**
 * 获取 API Key
 * @param {string} type - Key 类型: 'anthropic' 或 'tts'
 * @returns {string} API Key
 */
function getApiKey(type = 'anthropic') {
  const keyName = type === 'tts' ? 'mimo_tts_api_key' : 'mimo_api_key';
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
 * 创建 Anthropic 客户端
 * @returns {Anthropic} 客户端实例
 */
function createClient() {
  const apiKey = getApiKey('anthropic');
  return new Anthropic({
    apiKey,
    baseURL: BASE_URL,
    defaultHeaders: { 'api-key': apiKey }
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

  const message = await client.messages.create({
    model: 'mimo-v2.5',
    max_tokens: 2000,
    system: '你是一位专业的播音稿撰写者。',
    messages: [
      { role: 'user', content: prompt }
    ]
  });

  const textBlock = message.content.find(b => b.type === 'text');
  if (!textBlock?.text) {
    throw new Error('MiMo API 返回内容为空');
  }

  return textBlock.text;
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

  const message = await client.messages.create({
    model: 'mimo-v2.5',
    max_tokens: 4000,
    thinking: { type: 'disabled' },
    system: '你是一个文本切分助手，只输出 JSON 数组格式。',
    messages: [
      { role: 'user', content: prompt }
    ]
  });

  const textBlock = message.content.find(b => b.type === 'text');
  if (!textBlock?.text) {
    throw new Error('MiMo API 返回内容为空');
  }

  const rawText = textBlock.text.trim();

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
 * @param {string} type - Key 类型: 'anthropic' 或 'tts'
 * @returns {Promise<boolean>} 是否有效
 */
async function testApiKey(type = 'anthropic') {
  try {
    if (type === 'tts') {
      const ttsApiKey = getApiKey('tts');
      await axios.post('https://api.xiaomimimo.com/v1/chat/completions', {
        model: 'mimo-v2.5-tts',
        messages: [
          { role: 'user', content: '测试' },
          { role: 'assistant', content: '测试' }
        ],
        audio: { format: 'wav', voice: '冰糖' }
      }, {
        headers: {
          'api-key': ttsApiKey,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
    } else {
      const client = createClient();
      await client.messages.create({
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

// Re-export generateSpeech 保持向后兼容（voicePresets.js 等仍通过 mimo 调用）
const { generateSpeech } = require('./tts');

module.exports = {
  getApiKey,
  rewriteToScript,
  splitScript,
  testApiKey,
  generateSpeech
};
```

- [ ] **Step 6: 运行全部测试确认无回归**

Run: `cd backend && npx jest --no-cache 2>&1 | tail -15`
Expected: 所有现有测试通过（tts.test.js 7 PASS，mimo.test.js 原有用例 PASS）

- [ ] **Step 7: 提交**

```bash
git add backend/src/services/tts.js backend/src/services/mimo.js backend/tests/services/tts.test.js
git commit -m "refactor: split mimo.js into mimo.js (LLM) + tts.js (TTS), replace OpenAI SDK with axios in testApiKey"
```

---

## 第二波：DAL 层 + broadcast.js 拆分

---

### Task 5: 创建 broadcastStore.js DAL 及其测试

**Files:**
- Create: `backend/src/services/broadcastStore.js`
- Create: `backend/tests/services/broadcastStore.test.js`

- [ ] **Step 1: 创建 broadcastStore.test.js（TDD）**

```js
// backend/tests/services/broadcastStore.test.js
const broadcastStore = require('../../src/services/broadcastStore');
const db = require('../../src/db');

describe('broadcastStore', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM segments').run();
    db.prepare('DELETE FROM broadcasts').run();
  });

  function insertBroadcast(overrides = {}) {
    const defaults = {
      title: '测试标题',
      content: '测试内容',
      audioPath: null,
      voiceType: 'preset',
      voiceConfig: '{"voice":"冰糖"}',
      sourceItems: null,
      status: 'pending',
      mode: 'whole'
    };
    const data = { ...defaults, ...overrides };
    return broadcastStore.create(data);
  }

  describe('create', () => {
    test('创建播报记录并返回完整对象', () => {
      const broadcast = insertBroadcast();
      expect(broadcast).toHaveProperty('id');
      expect(broadcast.title).toBe('测试标题');
      expect(broadcast.status).toBe('pending');
      expect(broadcast.mode).toBe('whole');
    });
  });

  describe('getById', () => {
    test('返回存在的记录', () => {
      const created = insertBroadcast();
      const found = broadcastStore.getById(created.id);
      expect(found.id).toBe(created.id);
      expect(found.title).toBe('测试标题');
    });

    test('不存在时返回 undefined', () => {
      expect(broadcastStore.getById(99999)).toBeUndefined();
    });
  });

  describe('getHistory', () => {
    test('返回分页列表', () => {
      insertBroadcast({ title: '第一条' });
      insertBroadcast({ title: '第二条' });
      const result = broadcastStore.getHistory({ limit: 10, offset: 0 });
      expect(result.length).toBe(2);
    });

    test('支持分页偏移', () => {
      for (let i = 0; i < 5; i++) insertBroadcast({ title: `第${i}条` });
      const page2 = broadcastStore.getHistory({ limit: 2, offset: 2 });
      expect(page2.length).toBe(2);
    });
  });

  describe('count 函数', () => {
    test('countAll 返回总数', () => {
      insertBroadcast();
      insertBroadcast();
      expect(broadcastStore.countAll()).toBe(2);
    });

    test('countUnsaved 统计未保存', () => {
      const b = insertBroadcast();
      insertBroadcast();
      expect(broadcastStore.countUnsaved()).toBe(2);
      broadcastStore.toggleSaved(b.id);
      expect(broadcastStore.countUnsaved()).toBe(1);
    });

    test('countSaved 统计已保存', () => {
      const b = insertBroadcast();
      expect(broadcastStore.countSaved()).toBe(0);
      broadcastStore.toggleSaved(b.id);
      expect(broadcastStore.countSaved()).toBe(1);
    });
  });

  describe('toggleSaved', () => {
    test('切换未保存为已保存', () => {
      const b = insertBroadcast();
      const result = broadcastStore.toggleSaved(b.id);
      expect(result.newSaved).toBe(1);
      expect(result.broadcast.saved).toBe(1);
    });

    test('切换已保存为未保存', () => {
      const b = insertBroadcast();
      broadcastStore.toggleSaved(b.id);
      const result = broadcastStore.toggleSaved(b.id);
      expect(result.newSaved).toBe(0);
    });
  });

  describe('updateAudioPath', () => {
    test('更新音频路径', () => {
      const b = insertBroadcast();
      broadcastStore.updateAudioPath(b.id, '/audio/test.wav');
      const updated = broadcastStore.getById(b.id);
      expect(updated.audio_path).toBe('/audio/test.wav');
    });
  });

  describe('updateVoiceConfig', () => {
    test('更新音色配置', () => {
      const b = insertBroadcast();
      broadcastStore.updateVoiceConfig(b.id, {
        voiceType: 'design',
        voiceConfig: '{"voiceDesign":"温柔女声"}'
      });
      const updated = broadcastStore.getById(b.id);
      expect(updated.voice_type).toBe('design');
    });
  });

  describe('deleteById', () => {
    test('删除并返回旧记录', () => {
      const b = insertBroadcast({ audioPath: '/audio/old.wav' });
      const deleted = broadcastStore.deleteById(b.id);
      expect(deleted.id).toBe(b.id);
      expect(broadcastStore.getById(b.id)).toBeUndefined();
    });

    test('不存在时返回 undefined', () => {
      expect(broadcastStore.deleteById(99999)).toBeUndefined();
    });
  });

  describe('getOldestUnsaved / getOldestSaved', () => {
    test('getOldestUnsaved 返回最旧的未保存记录', () => {
      insertBroadcast({ title: '旧' });
      insertBroadcast({ title: '新' });
      const oldest = broadcastStore.getOldestUnsaved(1);
      expect(oldest.length).toBe(1);
      expect(oldest[0].title).toBe('旧');
    });

    test('getOldestSaved 返回最旧的已保存记录', () => {
      const b1 = insertBroadcast({ title: '旧保存' });
      const b2 = insertBroadcast({ title: '新保存' });
      broadcastStore.toggleSaved(b1.id);
      broadcastStore.toggleSaved(b2.id);
      const oldest = broadcastStore.getOldestSaved(1);
      expect(oldest.length).toBe(1);
      expect(oldest[0].title).toBe('旧保存');
    });
  });

  describe('clearAudioAndSetMode', () => {
    test('清空音频路径并设置 mode', () => {
      const b = insertBroadcast({ audioPath: '/audio/test.wav', mode: 'whole' });
      broadcastStore.clearAudioAndSetMode(b.id, 'segmented');
      const updated = broadcastStore.getById(b.id);
      expect(updated.audio_path).toBeNull();
      expect(updated.mode).toBe('segmented');
    });
  });

  describe('updateStatus', () => {
    test('更新状态', () => {
      const b = insertBroadcast({ status: 'pending' });
      broadcastStore.updateStatus(b.id, 'generated');
      const updated = broadcastStore.getById(b.id);
      expect(updated.status).toBe('generated');
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && npx jest tests/services/broadcastStore.test.js --no-cache 2>&1 | head -10`
Expected: FAIL — `Cannot find module '../../src/services/broadcastStore'`

- [ ] **Step 3: 创建 broadcastStore.js**

```js
// backend/src/services/broadcastStore.js
const db = require('../db');

/**
 * 创建播报记录
 * @param {Object} params
 * @returns {Object} 创建的记录
 */
function create({ title, content, audioPath, voiceType, voiceConfig, sourceItems, status, mode }) {
  const result = db.prepare(`
    INSERT INTO broadcasts (title, content, audio_path, voice_type, voice_config, source_items, status, mode)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    title,
    content,
    audioPath || null,
    voiceType || 'preset',
    typeof voiceConfig === 'string' ? voiceConfig : JSON.stringify(voiceConfig || {}),
    sourceItems ? (typeof sourceItems === 'string' ? sourceItems : JSON.stringify(sourceItems)) : null,
    status || 'pending',
    mode || 'whole'
  );
  return db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(result.lastInsertRowid);
}

/**
 * 根据 ID 获取播报记录
 * @param {number} id
 * @returns {Object|undefined}
 */
function getById(id) {
  return db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(id);
}

/**
 * 获取历史播报列表
 * @param {Object} params
 * @param {number} params.limit
 * @param {number} params.offset
 * @returns {Array}
 */
function getHistory({ limit, offset }) {
  return db.prepare('SELECT * FROM broadcasts ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
}

/**
 * 统计总数
 * @returns {number}
 */
function countAll() {
  return db.prepare('SELECT COUNT(*) as count FROM broadcasts').get().count;
}

/**
 * 统计未保存数量
 * @returns {number}
 */
function countUnsaved() {
  return db.prepare('SELECT COUNT(*) as count FROM broadcasts WHERE saved = 0').get().count;
}

/**
 * 统计已保存数量
 * @returns {number}
 */
function countSaved() {
  return db.prepare('SELECT COUNT(*) as count FROM broadcasts WHERE saved = 1').get().count;
}

/**
 * 获取最旧的 N 条未保存记录
 * @param {number} n
 * @returns {Array}
 */
function getOldestUnsaved(n) {
  return db.prepare(
    'SELECT id, audio_path FROM broadcasts WHERE saved = 0 ORDER BY created_at ASC LIMIT ?'
  ).all(n);
}

/**
 * 获取最旧的 N 条已保存记录
 * @param {number} n
 * @returns {Array}
 */
function getOldestSaved(n) {
  return db.prepare(
    'SELECT id, audio_path FROM broadcasts WHERE saved = 1 ORDER BY created_at ASC LIMIT ?'
  ).all(n);
}

/**
 * 更新音频路径
 * @param {number} id
 * @param {string} audioPath
 */
function updateAudioPath(id, audioPath) {
  db.prepare('UPDATE broadcasts SET audio_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(audioPath, id);
}

/**
 * 更新音色配置
 * @param {number} id
 * @param {Object} params
 * @param {string} params.voiceType
 * @param {string} params.voiceConfig - JSON 字符串
 */
function updateVoiceConfig(id, { voiceType, voiceConfig }) {
  db.prepare('UPDATE broadcasts SET voice_type = ?, voice_config = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(voiceType || 'preset', voiceConfig, id);
}

/**
 * 切换保存状态
 * @param {number} id
 * @returns {{ newSaved: number, broadcast: Object }}
 */
function toggleSaved(id) {
  const broadcast = db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(id);
  if (!broadcast) return null;
  const newSaved = broadcast.saved ? 0 : 1;
  db.prepare('UPDATE broadcasts SET saved = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newSaved, id);
  const updated = db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(id);
  return { newSaved, broadcast: updated };
}

/**
 * 删除播报记录并返回旧记录
 * @param {number} id
 * @returns {Object|undefined} 被删除的记录
 */
function deleteById(id) {
  const record = db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(id);
  if (!record) return undefined;
  db.prepare('DELETE FROM broadcasts WHERE id = ?').run(id);
  return record;
}

/**
 * 清空音频路径并设置 mode
 * @param {number} id
 * @param {string} mode
 */
function clearAudioAndSetMode(id, mode) {
  db.prepare("UPDATE broadcasts SET mode = ?, audio_path = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(mode, id);
}

/**
 * 更新播报状态
 * @param {number} id
 * @param {string} status
 */
function updateStatus(id, status) {
  db.prepare('UPDATE broadcasts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(status, id);
}

module.exports = {
  create,
  getById,
  getHistory,
  countAll,
  countUnsaved,
  countSaved,
  getOldestUnsaved,
  getOldestSaved,
  updateAudioPath,
  updateVoiceConfig,
  toggleSaved,
  deleteById,
  clearAudioAndSetMode,
  updateStatus
};
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd backend && npx jest tests/services/broadcastStore.test.js --no-cache`
Expected: PASS — 所有用例通过

- [ ] **Step 5: 提交**

```bash
git add backend/src/services/broadcastStore.js backend/tests/services/broadcastStore.test.js
git commit -m "feat: add broadcastStore DAL for broadcasts table"
```

---

### Task 6: 创建 segmentStore.js DAL 及其测试

**Files:**
- Create: `backend/src/services/segmentStore.js`
- Create: `backend/tests/services/segmentStore.test.js`

- [ ] **Step 1: 创建 segmentStore.test.js（TDD）**

```js
// backend/tests/services/segmentStore.test.js
const segmentStore = require('../../src/services/segmentStore');
const broadcastStore = require('../../src/services/broadcastStore');
const db = require('../../src/db');

describe('segmentStore', () => {
  let broadcastId;

  beforeEach(() => {
    db.prepare('DELETE FROM segments').run();
    db.prepare('DELETE FROM broadcasts').run();
    const broadcast = broadcastStore.create({
      title: '测试播报',
      content: '测试内容',
      voiceType: 'preset',
      voiceConfig: '{"voice":"冰糖"}',
      status: 'pending',
      mode: 'segmented'
    });
    broadcastId = broadcast.id;
  });

  describe('createMany', () => {
    test('批量插入 segments', () => {
      segmentStore.createMany(broadcastId, ['第一句', '第二句', '第三句']);
      const segments = segmentStore.getByBroadcastId(broadcastId);
      expect(segments.length).toBe(3);
      expect(segments[0].text).toBe('第一句');
      expect(segments[0].index).toBe(0);
      expect(segments[2].text).toBe('第三句');
      expect(segments[2].index).toBe(2);
    });

    test('所有插入的 segment 状态为 pending', () => {
      segmentStore.createMany(broadcastId, ['一句']);
      const segs = segmentStore.getByBroadcastId(broadcastId);
      expect(segs[0].status).toBe('pending');
    });
  });

  describe('getByBroadcastId', () => {
    test('按 index 排序返回', () => {
      segmentStore.createMany(broadcastId, ['B', 'A', 'C']);
      const segs = segmentStore.getByBroadcastId(broadcastId);
      expect(segs.map(s => s.text)).toEqual(['B', 'A', 'C']);
    });

    test('无 segments 时返回空数组', () => {
      expect(segmentStore.getByBroadcastId(broadcastId)).toEqual([]);
    });
  });

  describe('getByIdAndBroadcastId', () => {
    test('返回匹配的 segment', () => {
      segmentStore.createMany(broadcastId, ['测试句']);
      const all = segmentStore.getByBroadcastId(broadcastId);
      const found = segmentStore.getByIdAndBroadcastId(all[0].id, broadcastId);
      expect(found.text).toBe('测试句');
    });

    test('不匹配时返回 undefined', () => {
      expect(segmentStore.getByIdAndBroadcastId(99999, broadcastId)).toBeUndefined();
    });
  });

  describe('getPendingByBroadcastId', () => {
    test('只返回 pending 和 failed 状态', () => {
      segmentStore.createMany(broadcastId, ['A', 'B', 'C']);
      const all = segmentStore.getByBroadcastId(broadcastId);
      segmentStore.updateStatus(all[0].id, 'generated', '/audio/test.wav');
      const pending = segmentStore.getPendingByBroadcastId(broadcastId);
      expect(pending.length).toBe(2);
    });
  });

  describe('updateStatus', () => {
    test('更新状态和音频路径', () => {
      segmentStore.createMany(broadcastId, ['测试']);
      const seg = segmentStore.getByBroadcastId(broadcastId)[0];
      segmentStore.updateStatus(seg.id, 'generated', '/audio/seg_0.wav');
      const updated = segmentStore.getByIdAndBroadcastId(seg.id, broadcastId);
      expect(updated.status).toBe('generated');
      expect(updated.audio_path).toBe('/audio/seg_0.wav');
    });

    test('不传 audioPath 时只更新状态', () => {
      segmentStore.createMany(broadcastId, ['测试']);
      const seg = segmentStore.getByBroadcastId(broadcastId)[0];
      segmentStore.updateStatus(seg.id, 'failed');
      const updated = segmentStore.getByIdAndBroadcastId(seg.id, broadcastId);
      expect(updated.status).toBe('failed');
    });
  });

  describe('updateText', () => {
    test('更新文本并重置状态为 pending', () => {
      segmentStore.createMany(broadcastId, ['旧文本']);
      const seg = segmentStore.getByBroadcastId(broadcastId)[0];
      segmentStore.updateStatus(seg.id, 'generated', '/audio/seg.wav');
      segmentStore.updateText(seg.id, '新文本');
      const updated = segmentStore.getByIdAndBroadcastId(seg.id, broadcastId);
      expect(updated.text).toBe('新文本');
      expect(updated.status).toBe('pending');
      expect(updated.audio_path).toBeNull();
    });
  });

  describe('reorder', () => {
    test('按新 ID 顺序重排 index', () => {
      segmentStore.createMany(broadcastId, ['A', 'B', 'C']);
      const segs = segmentStore.getByBroadcastId(broadcastId);
      segmentStore.reorder(broadcastId, [segs[2].id, segs[0].id, segs[1].id]);
      const reordered = segmentStore.getByBroadcastId(broadcastId);
      expect(reordered.map(s => s.text)).toEqual(['C', 'A', 'B']);
    });
  });

  describe('deleteById', () => {
    test('删除单条 segment', () => {
      segmentStore.createMany(broadcastId, ['A', 'B']);
      const segs = segmentStore.getByBroadcastId(broadcastId);
      segmentStore.deleteById(segs[0].id);
      const remaining = segmentStore.getByBroadcastId(broadcastId);
      expect(remaining.length).toBe(1);
      expect(remaining[0].text).toBe('B');
    });
  });

  describe('deleteByBroadcastId', () => {
    test('清空所有 segments', () => {
      segmentStore.createMany(broadcastId, ['A', 'B', 'C']);
      segmentStore.deleteByBroadcastId(broadcastId);
      expect(segmentStore.getByBroadcastId(broadcastId).length).toBe(0);
    });
  });

  describe('deleteAndReindex', () => {
    test('删除后重索引后续 segments', () => {
      segmentStore.createMany(broadcastId, ['A', 'B', 'C']);
      const segs = segmentStore.getByBroadcastId(broadcastId);
      segmentStore.deleteAndReindex(broadcastId, segs[1].id);
      const remaining = segmentStore.getByBroadcastId(broadcastId);
      expect(remaining.length).toBe(2);
      expect(remaining[0].text).toBe('A');
      expect(remaining[0].index).toBe(0);
      expect(remaining[1].text).toBe('C');
      expect(remaining[1].index).toBe(1);
    });
  });

  describe('countByIds', () => {
    test('统计匹配的 segment 数量', () => {
      segmentStore.createMany(broadcastId, ['A', 'B', 'C']);
      const segs = segmentStore.getByBroadcastId(broadcastId);
      expect(segmentStore.countByIds(broadcastId, [segs[0].id, segs[1].id])).toBe(2);
    });

    test('不匹配的 ID 不计入', () => {
      segmentStore.createMany(broadcastId, ['A']);
      const segs = segmentStore.getByBroadcastId(broadcastId);
      expect(segmentStore.countByIds(broadcastId, [segs[0].id, 99999])).toBe(1);
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && npx jest tests/services/segmentStore.test.js --no-cache 2>&1 | head -10`
Expected: FAIL — `Cannot find module '../../src/services/segmentStore'`

- [ ] **Step 3: 创建 segmentStore.js**

```js
// backend/src/services/segmentStore.js
const path = require('path');
const fs = require('fs');
const db = require('../db');

const audioDir = path.join(__dirname, '../../audio');

/**
 * 批量创建 segments
 * @param {number} broadcastId
 * @param {string[]} texts
 */
function createMany(broadcastId, texts) {
  const insertStmt = db.prepare(
    'INSERT INTO segments (broadcast_id, "index", text, status) VALUES (?, ?, ?, ?)'
  );
  const insertMany = db.transaction((items) => {
    for (const item of items) {
      insertStmt.run(item.broadcastId, item.index, item.text, 'pending');
    }
  });
  insertMany(texts.map((text, index) => ({ broadcastId, index, text })));
}

/**
 * 获取某 broadcast 的所有 segments（按 index 排序）
 * @param {number} broadcastId
 * @returns {Array}
 */
function getByBroadcastId(broadcastId) {
  return db.prepare('SELECT * FROM segments WHERE broadcast_id = ? ORDER BY "index"').all(broadcastId);
}

/**
 * 根据 ID 和 broadcastId 获取 segment
 * @param {number} segId
 * @param {number} broadcastId
 * @returns {Object|undefined}
 */
function getByIdAndBroadcastId(segId, broadcastId) {
  return db.prepare('SELECT * FROM segments WHERE id = ? AND broadcast_id = ?').get(segId, broadcastId);
}

/**
 * 获取某 broadcast 的 pending/failed segments
 * @param {number} broadcastId
 * @returns {Array}
 */
function getPendingByBroadcastId(broadcastId) {
  return db.prepare(
    'SELECT * FROM segments WHERE broadcast_id = ? AND status IN (\'pending\', \'failed\') ORDER BY "index"'
  ).all(broadcastId);
}

/**
 * 更新 segment 状态（和可选的音频路径）
 * @param {number} segId
 * @param {string} status
 * @param {string} [audioPath]
 */
function updateStatus(segId, status, audioPath) {
  if (audioPath) {
    db.prepare('UPDATE segments SET status = ?, audio_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(status, audioPath, segId);
  } else {
    db.prepare('UPDATE segments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(status, segId);
  }
}

/**
 * 更新 segment 文本，重置状态为 pending
 * @param {number} segId
 * @param {string} text
 */
function updateText(segId, text) {
  db.prepare(
    "UPDATE segments SET text = ?, status = 'pending', audio_path = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(text, segId);
}

/**
 * 重排序 segments
 * @param {number} broadcastId
 * @param {number[]} segmentIds
 */
function reorder(broadcastId, segmentIds) {
  const updateStmt = db.prepare(
    'UPDATE segments SET "index" = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND broadcast_id = ?'
  );
  const doReorder = db.transaction((ids) => {
    for (let i = 0; i < ids.length; i++) {
      updateStmt.run(i, ids[i], broadcastId);
    }
  });
  doReorder(segmentIds);
}

/**
 * 删除单条 segment
 * @param {number} segId
 */
function deleteById(segId) {
  db.prepare('DELETE FROM segments WHERE id = ?').run(segId);
}

/**
 * 删除某 broadcast 的所有 segments
 * @param {number} broadcastId
 */
function deleteByBroadcastId(broadcastId) {
  db.prepare('DELETE FROM segments WHERE broadcast_id = ?').run(broadcastId);
}

/**
 * 删除 segment 并重索引后续 segments（含文件重命名）
 * @param {number} broadcastId
 * @param {number} segId
 */
function deleteAndReindex(broadcastId, segId) {
  const segment = db.prepare('SELECT * FROM segments WHERE id = ? AND broadcast_id = ?').get(segId, broadcastId);
  if (!segment) return;

  const deletedIndex = segment.index;

  const doDeleteAndReindex = db.transaction(() => {
    db.prepare('DELETE FROM segments WHERE id = ?').run(segId);

    const laterSegments = db.prepare(
      'SELECT * FROM segments WHERE broadcast_id = ? AND "index" > ? ORDER BY "index"'
    ).all(broadcastId, deletedIndex);

    for (const seg of laterSegments) {
      const newIndex = seg.index - 1;

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
  });

  doDeleteAndReindex();
}

/**
 * 统计指定 IDs 中属于某 broadcast 的数量
 * @param {number} broadcastId
 * @param {number[]} ids
 * @returns {number}
 */
function countByIds(broadcastId, ids) {
  return db.prepare(
    `SELECT COUNT(*) as count FROM segments WHERE broadcast_id = ? AND id IN (${ids.map(() => '?').join(',')})`
  ).get(broadcastId, ...ids).count;
}

module.exports = {
  createMany,
  getByBroadcastId,
  getByIdAndBroadcastId,
  getPendingByBroadcastId,
  updateStatus,
  updateText,
  reorder,
  deleteById,
  deleteByBroadcastId,
  deleteAndReindex,
  countByIds
};
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd backend && npx jest tests/services/segmentStore.test.js --no-cache`
Expected: PASS — 所有用例通过

- [ ] **Step 5: 提交**

```bash
git add backend/src/services/segmentStore.js backend/tests/services/segmentStore.test.js
git commit -m "feat: add segmentStore DAL for segments table"
```

---

### Task 7: 移动 resolveVoiceClone 到 audio.js

**Files:**
- Modify: `backend/src/services/audio.js`

- [ ] **Step 1: 运行现有 audio 测试确认基线**

Run: `cd backend && npx jest tests/services/audio.test.js --no-cache`
Expected: PASS

- [ ] **Step 2: 在 audio.js 末尾添加 resolveVoiceClone**

在 `backend/src/services/audio.js` 的 `module.exports` 之前添加：

```js
/**
 * 解析 voiceClone：如果是文件路径则读取并转为 base64 data URI，
 * 如果已经是 base64 data URI 则直接返回
 * @param {string} voiceClone - base64 data URI 或 /audio/ 开头的文件路径
 * @returns {Promise<string>} base64 data URI
 */
async function resolveVoiceClone(voiceClone) {
  if (!voiceClone) return voiceClone;
  if (voiceClone.startsWith('data:')) return voiceClone;
  if (voiceClone.startsWith('/audio/')) {
    const filePath = path.join(__dirname, '../..', voiceClone);
    if (fs.existsSync(filePath)) {
      const buffer = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mime = ext === '.mp3' ? 'audio/mpeg' : 'audio/wav';
      return `data:${mime};base64,${buffer.toString('base64')}`;
    }
  }
  return voiceClone;
}
```

更新导出：

```diff
-module.exports = { mergeWavFiles };
+module.exports = { mergeWavFiles, resolveVoiceClone };
```

同时在文件顶部确保 `path` 已引入：

```diff
 const fs = require('fs');
+const path = require('path');
```

- [ ] **Step 3: 运行全部测试确认无回归**

Run: `cd backend && npx jest tests/services/audio.test.js --no-cache`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add backend/src/services/audio.js
git commit -m "refactor: move resolveVoiceClone from broadcast route to audio service"
```

---

### Task 8: 拆分 broadcast.js + 迁移到 DAL

**Files:**
- Rewrite: `backend/src/routes/broadcast.js`
- Create: `backend/src/routes/segments.js`

这是最大的一步。将原 broadcast.js（714行）拆为两个文件，同时：
- 所有 `db.prepare()` 调用替换为 store 函数
- 所有 ID 校验替换为 `validateId()`
- 所有文件删除替换为 `cleanAudioFile()`
- `resolveVoiceClone` 改为从 audio.js 引入

- [ ] **Step 1: 运行现有 broadcast 测试确认基线**

Run: `cd backend && npx jest tests/routes/broadcast.test.js --no-cache`
Expected: PASS（注意：部分测试依赖外部 API 可能集成失败，记录当前状态）

- [ ] **Step 2: 创建 segments.js（新文件，8 个端点）**

```js
// backend/src/routes/segments.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const mimo = require('../services/mimo');
const tts = require('../services/tts');
const audio = require('../services/audio');
const broadcastStore = require('../services/broadcastStore');
const segmentStore = require('../services/segmentStore');
const { validateId, cleanAudioFile, audioDir } = require('../utils/validation');

/**
 * POST /api/broadcast/:id/split
 * AI 切分口播稿为短句
 */
router.post('/:id/split', async (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '播报 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });

    const broadcast = broadcastStore.getById(idCheck.id);
    if (!broadcast) return res.status(404).json({ error: '播报记录不存在' });

    // 若已有 segments，先删除旧的及其音频文件
    const oldSegments = segmentStore.getByBroadcastId(idCheck.id);
    for (const seg of oldSegments) {
      cleanAudioFile(seg.audio_path);
    }
    segmentStore.deleteByBroadcastId(idCheck.id);

    // 调用 AI 切分
    const sentences = await mimo.splitScript(broadcast.content);

    // 创建 segment 记录
    segmentStore.createMany(idCheck.id, sentences);

    // 更新广播 mode，删除旧的整段音频文件
    cleanAudioFile(broadcast.audio_path);
    broadcastStore.clearAudioAndSetMode(idCheck.id, 'segmented');

    const segments = segmentStore.getByBroadcastId(idCheck.id);
    res.json({ segments });
  } catch (error) {
    console.error('切分失败:', error);
    res.status(500).json({ error: error.message || '切分失败' });
  }
});

/**
 * GET /api/broadcast/:id/segments
 * 获取 segments 列表
 */
router.get('/:id/segments', (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '播报 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });

    const broadcast = broadcastStore.getById(idCheck.id);
    if (!broadcast) return res.status(404).json({ error: '播报记录不存在' });

    const segments = segmentStore.getByBroadcastId(idCheck.id);
    res.json({ segments });
  } catch (error) {
    console.error('获取 segments 失败:', error);
    res.status(500).json({ error: '获取 segments 失败' });
  }
});

/**
 * POST /api/broadcast/:id/segments/batch-generate
 * 批量生成 segment 音频
 */
router.post('/:id/segments/batch-generate', async (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '播报 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });

    const broadcast = broadcastStore.getById(idCheck.id);
    if (!broadcast) return res.status(404).json({ error: '播报记录不存在' });

    const voiceConfig = JSON.parse(broadcast.voice_config || '{}');
    const resolvedVoiceClone = await audio.resolveVoiceClone(voiceConfig.voiceClone);
    const pendingSegments = segmentStore.getPendingByBroadcastId(idCheck.id);

    const results = [];
    for (const segment of pendingSegments) {
      segmentStore.updateStatus(segment.id, 'generating');

      try {
        const audioBuffer = await tts.generateSpeech({
          text: segment.text,
          voice: voiceConfig.voice,
          voiceType: broadcast.voice_type,
          voiceDesign: voiceConfig.voiceDesign,
          voiceClone: resolvedVoiceClone,
          stylePrompt: voiceConfig.stylePrompt
        });

        const filename = `segment_${idCheck.id}_${segment.index}.wav`;
        const filepath = path.join(audioDir, filename);
        fs.writeFileSync(filepath, audioBuffer);

        segmentStore.updateStatus(segment.id, 'generated', `/audio/${filename}`);
        results.push({ id: segment.id, status: 'generated' });
      } catch (ttsError) {
        segmentStore.updateStatus(segment.id, 'failed');
        results.push({ id: segment.id, status: 'failed', error: ttsError.message });
      }
    }

    const segments = segmentStore.getByBroadcastId(idCheck.id);
    res.json({ segments, results });
  } catch (error) {
    console.error('批量生成失败:', error);
    res.status(500).json({ error: '批量生成失败' });
  }
});

/**
 * POST /api/broadcast/:id/segments/merge
 * 合并所有 segment 音频
 */
router.post('/:id/segments/merge', (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '播报 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });

    const broadcast = broadcastStore.getById(idCheck.id);
    if (!broadcast) return res.status(404).json({ error: '播报记录不存在' });

    const segments = segmentStore.getByBroadcastId(idCheck.id);

    if (segments.length === 0) {
      return res.status(400).json({ error: '没有可合并的句子' });
    }

    const notGenerated = segments.filter(s => s.status !== 'generated');
    if (notGenerated.length > 0) {
      return res.status(400).json({
        error: `还有 ${notGenerated.length} 个句子未生成音频，请先完成所有句子的生成`
      });
    }

    const audioPaths = segments.map(s => path.join(__dirname, '../..', s.audio_path));
    const mergedBuffer = audio.mergeWavFiles(audioPaths);

    cleanAudioFile(broadcast.audio_path);

    const filename = `broadcast_${idCheck.id}_merged.wav`;
    const filepath = path.join(audioDir, filename);
    fs.writeFileSync(filepath, mergedBuffer);

    broadcastStore.updateAudioPath(idCheck.id, `/audio/${filename}`);
    broadcastStore.updateStatus(idCheck.id, 'generated');

    const updated = broadcastStore.getById(idCheck.id);
    res.json({ broadcast: updated });
  } catch (error) {
    console.error('合并失败:', error);
    res.status(500).json({ error: error.message || '合并失败' });
  }
});

/**
 * POST /api/broadcast/:id/segments/reorder
 * 重排序 segments
 */
router.post('/:id/segments/reorder', (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '播报 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });

    const { segmentIds } = req.body;
    if (!Array.isArray(segmentIds)) {
      return res.status(400).json({ error: '请提供 segmentIds 数组' });
    }

    // 验证所有 segment 都属于当前 broadcast
    const ownedCount = segmentStore.countByIds(idCheck.id, segmentIds);
    if (ownedCount !== segmentIds.length) {
      return res.status(400).json({ error: '部分句子不属于当前播报' });
    }

    segmentStore.reorder(idCheck.id, segmentIds);

    const segments = segmentStore.getByBroadcastId(idCheck.id);
    res.json({ segments });
  } catch (error) {
    console.error('重排序失败:', error);
    res.status(500).json({ error: '重排序失败' });
  }
});

/**
 * PUT /api/broadcast/:id/segments/:segId
 * 编辑单个 segment 文本
 */
router.put('/:id/segments/:segId', (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '播报 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });
    const segIdCheck = validateId(req.params.segId, '句子 ID');
    if (!segIdCheck.valid) return res.status(400).json({ error: segIdCheck.error });

    const { text } = req.body;
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: '请提供有效的文本内容' });
    }

    const segment = segmentStore.getByIdAndBroadcastId(segIdCheck.id, idCheck.id);
    if (!segment) return res.status(404).json({ error: '句子不存在' });

    cleanAudioFile(segment.audio_path);
    segmentStore.updateText(segIdCheck.id, text.trim());

    const updated = segmentStore.getByIdAndBroadcastId(segIdCheck.id, idCheck.id);
    res.json({ segment: updated });
  } catch (error) {
    console.error('编辑句子失败:', error);
    res.status(500).json({ error: '编辑句子失败' });
  }
});

/**
 * POST /api/broadcast/:id/segments/:segId/regenerate
 * 重新生成单个 segment 音频
 */
router.post('/:id/segments/:segId/regenerate', async (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '播报 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });
    const segIdCheck = validateId(req.params.segId, '句子 ID');
    if (!segIdCheck.valid) return res.status(400).json({ error: segIdCheck.error });

    const segment = segmentStore.getByIdAndBroadcastId(segIdCheck.id, idCheck.id);
    if (!segment) return res.status(404).json({ error: '句子不存在' });

    const broadcast = broadcastStore.getById(idCheck.id);
    const voiceConfig = JSON.parse(broadcast.voice_config || '{}');
    const resolvedVoiceClone = await audio.resolveVoiceClone(voiceConfig.voiceClone);

    segmentStore.updateStatus(segIdCheck.id, 'generating');

    try {
      const audioBuffer = await tts.generateSpeech({
        text: segment.text,
        voice: voiceConfig.voice,
        voiceType: broadcast.voice_type,
        voiceDesign: voiceConfig.voiceDesign,
        voiceClone: resolvedVoiceClone,
        stylePrompt: voiceConfig.stylePrompt
      });

      const filename = `segment_${idCheck.id}_${segment.index}.wav`;
      const filepath = path.join(audioDir, filename);
      fs.writeFileSync(filepath, audioBuffer);

      segmentStore.updateStatus(segIdCheck.id, 'generated', `/audio/${filename}`);
    } catch (ttsError) {
      segmentStore.updateStatus(segIdCheck.id, 'failed');
      return res.status(500).json({ error: '语音生成失败: ' + ttsError.message });
    }

    const updated = segmentStore.getByIdAndBroadcastId(segIdCheck.id, idCheck.id);
    res.json({ segment: updated });
  } catch (error) {
    console.error('重新生成失败:', error);
    res.status(500).json({ error: '重新生成失败' });
  }
});

/**
 * DELETE /api/broadcast/:id/segments/:segId
 * 删除单个 segment（含后续重索引）
 */
router.delete('/:id/segments/:segId', (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '播报 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });
    const segIdCheck = validateId(req.params.segId, '句子 ID');
    if (!segIdCheck.valid) return res.status(400).json({ error: segIdCheck.error });

    const segment = segmentStore.getByIdAndBroadcastId(segIdCheck.id, idCheck.id);
    if (!segment) return res.status(404).json({ error: '句子不存在' });

    cleanAudioFile(segment.audio_path);
    segmentStore.deleteAndReindex(idCheck.id, segIdCheck.id);

    const segments = segmentStore.getByBroadcastId(idCheck.id);
    res.json({ segments });
  } catch (error) {
    console.error('删除句子失败:', error);
    res.status(500).json({ error: '删除句子失败' });
  }
});

module.exports = router;
```

- [ ] **Step 3: 重写 broadcast.js（使用 DAL + validateId + cleanAudioFile）**

完整替换 `backend/src/routes/broadcast.js`：

```js
// backend/src/routes/broadcast.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const aihot = require('../services/aihot');
const tts = require('../services/tts');
const db = require('../db');
const broadcastStore = require('../services/broadcastStore');
const segmentStore = require('../services/segmentStore');
const { validateId, cleanAudioFile, audioDir } = require('../utils/validation');

/**
 * GET /api/broadcast/today
 * 获取今日 AI HOT 精选资讯
 */
router.get('/today', async (req, res) => {
  try {
    const { category, take = 30 } = req.query;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const items = await aihot.getSelectedItems({
      category,
      since,
      take: Math.min(parseInt(take, 10) || 30, 100)
    });

    res.json({ items });
  } catch (error) {
    console.error('获取资讯失败:', error);
    res.status(500).json({ error: '获取资讯失败' });
  }
});

/**
 * POST /api/broadcast/rewrite
 * 将资讯改写成口播稿
 */
router.post('/rewrite', async (req, res) => {
  try {
    const { items, opening, closing } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: '请提供资讯列表' });
    }

    const defaultOpening = db.prepare('SELECT value FROM settings WHERE key = ?').get('opening_script');
    const defaultClosing = db.prepare('SELECT value FROM settings WHERE key = ?').get('closing_script');

    const mimo = require('../services/mimo');
    const script = await mimo.rewriteToScript({
      items,
      opening: opening || JSON.parse(defaultOpening?.value || '""'),
      closing: closing || JSON.parse(defaultClosing?.value || '""')
    });

    res.json({ script });
  } catch (error) {
    console.error('改写失败:', error);
    res.status(500).json({ error: error.message || '改写失败' });
  }
});

/**
 * POST /api/broadcast/generate
 * 生成 TTS 语音（支持 whole 和 segmented 模式）
 */
router.post('/generate', async (req, res) => {
  try {
    const { text, voice, voiceType, voiceDesign, voiceClone, stylePrompt, sourceItems, mode } = req.body;

    if (!text) {
      return res.status(400).json({ error: '请提供口播稿内容' });
    }

    if (mode === 'segmented') {
      const broadcast = broadcastStore.create({
        title: text.substring(0, 50) + '...',
        content: text,
        voiceType: voiceType || 'preset',
        voiceConfig: { voice, voiceDesign, voiceClone, stylePrompt },
        sourceItems,
        status: 'pending',
        mode: 'segmented'
      });
      return res.json({ broadcast });
    }

    // 整篇生成
    const audioBuffer = await tts.generateSpeech({
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

    const broadcast = broadcastStore.create({
      title: text.substring(0, 50) + '...',
      content: text,
      audioPath: `/audio/${filename}`,
      voiceType: voiceType || 'preset',
      voiceConfig: { voice, voiceDesign, voiceClone, stylePrompt },
      sourceItems,
      status: 'generated',
      mode: 'whole'
    });

    // 清理旧的未保存记录，保留最近10条
    const unsavedCount = broadcastStore.countUnsaved();
    if (unsavedCount > 10) {
      const toDelete = broadcastStore.getOldestUnsaved(unsavedCount - 10);
      for (const item of toDelete) {
        broadcastStore.deleteById(item.id);
        cleanAudioFile(item.audio_path);
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

/**
 * GET /api/broadcast/history
 * 获取历史播报列表
 */
router.get('/history', (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const offset = (page - 1) * limit;

    const broadcasts = broadcastStore.getHistory({ limit, offset });
    const total = broadcastStore.countAll();

    res.json({
      broadcasts,
      pagination: { page, limit, total }
    });
  } catch (error) {
    console.error('获取历史记录失败:', error);
    res.status(500).json({ error: '获取历史记录失败' });
  }
});

/**
 * GET /api/broadcast/:id
 * 获取单条播报详情
 */
router.get('/:id', (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '播报 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });

    const broadcast = broadcastStore.getById(idCheck.id);
    if (!broadcast) return res.status(404).json({ error: '播报记录不存在' });

    res.json({ broadcast });
  } catch (error) {
    console.error('获取播报详情失败:', error);
    res.status(500).json({ error: '获取播报详情失败' });
  }
});

/**
 * PATCH /api/broadcast/:id/voice-config
 * 更新播报的音色配置
 */
router.patch('/:id/voice-config', (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '播报 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });

    const { voiceType, voice, voiceDesign, voiceClone, stylePrompt } = req.body;
    const voiceConfig = JSON.stringify({ voice, voiceDesign, voiceClone, stylePrompt });

    broadcastStore.updateVoiceConfig(idCheck.id, { voiceType, voiceConfig });

    const broadcast = broadcastStore.getById(idCheck.id);
    res.json({ broadcast });
  } catch (error) {
    console.error('更新音色配置失败:', error);
    res.status(500).json({ error: '更新音色配置失败' });
  }
});

/**
 * POST /api/broadcast/:id/save
 * 保存/取消保存播报
 */
router.post('/:id/save', (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '播报 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });

    const broadcast = broadcastStore.getById(idCheck.id);
    if (!broadcast) return res.status(404).json({ error: '播报记录不存在' });

    const result = broadcastStore.toggleSaved(idCheck.id);
    const { newSaved } = result;

    // 如果是保存操作，检查上限（最多50条已保存）
    if (newSaved === 1) {
      const savedCount = broadcastStore.countSaved();
      if (savedCount >= 50) {
        const oldest = broadcastStore.getOldestSaved(savedCount - 49);
        for (const item of oldest) {
          broadcastStore.deleteById(item.id);
          cleanAudioFile(item.audio_path);
          // 清理关联的 segment 音频文件
          const segs = segmentStore.getByBroadcastId(item.id);
          for (const seg of segs) {
            cleanAudioFile(seg.audio_path);
          }
        }
      }
    }

    const updated = broadcastStore.getById(idCheck.id);
    res.json({ broadcast: updated });
  } catch (error) {
    console.error('保存播报失败:', error);
    res.status(500).json({ error: '保存播报失败' });
  }
});

/**
 * GET /api/broadcast/:id/audio
 * 获取播报音频文件
 */
router.get('/:id/audio', (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '播报 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });

    const broadcast = broadcastStore.getById(idCheck.id);
    if (!broadcast) return res.status(404).json({ error: '播报记录不存在' });

    if (!broadcast.audio_path) {
      return res.status(404).json({ error: '音频文件不存在' });
    }

    const filepath = path.join(__dirname, '../..', broadcast.audio_path);
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: '音频文件不存在' });
    }

    res.sendFile(filepath);
  } catch (error) {
    console.error('获取音频失败:', error);
    res.status(500).json({ error: '获取音频失败' });
  }
});

module.exports = router;
```

- [ ] **Step 4: 运行全部测试，确认现有测试通过**

Run: `cd backend && npx jest --no-cache 2>&1 | tail -20`
Expected: 所有现有测试通过

- [ ] **Step 5: 提交**

```bash
git add backend/src/routes/broadcast.js backend/src/routes/segments.js
git commit -m "refactor: split broadcast.js into broadcast + segments routes, migrate to DAL"
```

---

### Task 9: 更新 app.js 路由挂载

**Files:**
- Modify: `backend/src/app.js`

- [ ] **Step 1: 添加 segments 路由挂载**

```diff
 // API 路由
 app.use('/api/broadcast', require('./routes/broadcast'));
+app.use('/api/broadcast', require('./routes/segments'));
 app.use('/api/settings', require('./routes/settings'));
 app.use('/api/schedules', require('./routes/schedule'));
 app.use('/api/voice-presets', require('./routes/voicePresets'));
```

- [ ] **Step 2: 运行全部测试确认无回归**

Run: `cd backend && npx jest --no-cache 2>&1 | tail -20`
Expected: 所有测试通过

- [ ] **Step 3: 提交**

```bash
git add backend/src/app.js
git commit -m "feat: mount segments router in app.js"
```

---

## 第三波：测试补充

---

### Task 10: 扩充 broadcast 路由测试

**Files:**
- Modify: `backend/tests/routes/broadcast.test.js`

- [ ] **Step 1: 在现有测试文件末尾添加新的测试用例**

在 `backend/tests/routes/broadcast.test.js` 的最后一个 `});` 之前添加：

```js
  // ============ 扩充测试 ============

  describe('POST /api/broadcast/rewrite', () => {
    test('成功改写口播稿（mock mimo）', async () => {
      // 注意：此测试依赖真实 API Key，若无 Key 则跳过
      const mimo = require('../../src/services/mimo');
      const originalRewrite = mimo.rewriteToScript;
      mimo.rewriteToScript = jest.fn().mockResolvedValue('这是改写的口播稿内容。');

      const res = await request(app)
        .post('/api/broadcast/rewrite')
        .send({
          items: [{ title: '测试', summary: '摘要', source: '来源' }],
          opening: '开场白',
          closing: '结束语'
        });

      expect(res.status).toBe(200);
      expect(res.body.script).toBe('这是改写的口播稿内容。');

      mimo.rewriteToScript = originalRewrite;
    });
  });

  describe('POST /api/broadcast/generate (whole)', () => {
    test('成功生成整篇语音', async () => {
      const tts = require('../../src/services/tts');
      const originalGenerate = tts.generateSpeech;
      tts.generateSpeech = jest.fn().mockResolvedValue(Buffer.from('fake-audio-data'));

      const res = await request(app)
        .post('/api/broadcast/generate')
        .send({
          text: '测试口播稿内容',
          voice: '冰糖',
          voiceType: 'preset',
          mode: 'whole'
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('broadcast');
      expect(res.body).toHaveProperty('audioUrl');

      tts.generateSpeech = originalGenerate;

      // 清理生成的音频文件
      if (res.body.audioUrl) {
        const fp = require('path').join(__dirname, '../..', res.body.audioUrl);
        if (require('fs').existsSync(fp)) require('fs').unlinkSync(fp);
      }
    });
  });

  describe('POST /api/broadcast/:id/save', () => {
    let testBroadcastId;

    beforeEach(() => {
      const result = db.prepare(`
        INSERT INTO broadcasts (title, content, voice_type, voice_config, status, mode, saved)
        VALUES (?, ?, ?, ?, ?, ?, 0)
      `).run('保存测试', '内容', 'preset', '{}', 'generated', 'whole');
      testBroadcastId = result.lastInsertRowid;
    });

    test('保存播报', async () => {
      const res = await request(app)
        .post(`/api/broadcast/${testBroadcastId}/save`);
      expect(res.status).toBe(200);
      expect(res.body.broadcast.saved).toBe(1);
    });

    test('取消保存播报', async () => {
      // 先保存
      await request(app).post(`/api/broadcast/${testBroadcastId}/save`);
      // 再取消
      const res = await request(app)
        .post(`/api/broadcast/${testBroadcastId}/save`);
      expect(res.status).toBe(200);
      expect(res.body.broadcast.saved).toBe(0);
    });

    test('不存在的播报返回 404', async () => {
      const res = await request(app).post('/api/broadcast/99999/save');
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/broadcast/:id/voice-config', () => {
    let testBroadcastId;

    beforeEach(() => {
      const result = db.prepare(`
        INSERT INTO broadcasts (title, content, voice_type, voice_config, status, mode)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('音色测试', '内容', 'preset', '{"voice":"冰糖"}', 'pending', 'whole');
      testBroadcastId = result.lastInsertRowid;
    });

    test('更新音色配置', async () => {
      const res = await request(app)
        .patch(`/api/broadcast/${testBroadcastId}/voice-config`)
        .send({ voiceType: 'design', voiceDesign: '温柔女声' });
      expect(res.status).toBe(200);
      expect(res.body.broadcast.voice_type).toBe('design');
    });
  });

  describe('GET /api/broadcast/:id/audio', () => {
    test('无音频时返回 404', async () => {
      const result = db.prepare(`
        INSERT INTO broadcasts (title, content, voice_type, voice_config, status, mode)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('无音频', '内容', 'preset', '{}', 'pending', 'whole');
      const res = await request(app).get(`/api/broadcast/${result.lastInsertRowid}/audio`);
      expect(res.status).toBe(404);
    });
  });
```

**注意：** 上面 `POST /:id/save` 的 `beforeEach` 有语法错误（`.save = `），需要修正为：

```js
  describe('POST /api/broadcast/:id/save', () => {
    let testBroadcastId;

    beforeEach(() => {
      const result = db.prepare(`
        INSERT INTO broadcasts (title, content, voice_type, voice_config, status, mode, saved)
        VALUES (?, ?, ?, ?, ?, ?, 0)
      `).run('保存测试', '内容', 'preset', '{}', 'generated', 'whole');
      testBroadcastId = result.lastInsertRowid;
    });
```

- [ ] **Step 2: 运行 broadcast 测试**

Run: `cd backend && npx jest tests/routes/broadcast.test.js --no-cache 2>&1 | tail -20`
Expected: 所有新旧测试通过

- [ ] **Step 3: 提交**

```bash
git add backend/tests/routes/broadcast.test.js
git commit -m "test: expand broadcast route test coverage (rewrite, generate, save, voice-config, audio)"
```

---

### Task 11: 扩充 mimo 服务测试

**Files:**
- Modify: `backend/tests/services/mimo.test.js`

- [ ] **Step 1: 在现有测试文件中添加 mock 测试**

在 `backend/tests/services/mimo.test.js` 末尾添加：

```js
  describe('rewriteToScript mock 测试', () => {
    test('空 items 抛出错误', async () => {
      await expect(mimo.rewriteToScript({ items: [] }))
        .rejects.toThrow('请提供有效的资讯列表');
    });

    test('非数组 items 抛出错误', async () => {
      await expect(mimo.rewriteToScript({ items: 'not-array' }))
        .rejects.toThrow('请提供有效的资讯列表');
    });
  });

  describe('splitScript mock 测试', () => {
    test('空文本抛出错误', async () => {
      await expect(mimo.splitScript(''))
        .rejects.toThrow('请提供有效的口播稿文本');
    });

    test('非字符串抛出错误', async () => {
      await expect(mimo.splitScript(null))
        .rejects.toThrow('请提供有效的口播稿文本');
    });
  });
```

- [ ] **Step 2: 运行 mimo 测试**

Run: `cd backend && npx jest tests/services/mimo.test.js --no-cache`
Expected: 所有测试通过

- [ ] **Step 3: 提交**

```bash
git add backend/tests/services/mimo.test.js
git commit -m "test: add mock tests for mimo service (error paths)"
```

---

### Task 12: 创建 segments 路由测试

**Files:**
- Create: `backend/tests/routes/segments.test.js`

- [ ] **Step 1: 创建 segments 路由测试文件**

```js
// backend/tests/routes/segments.test.js
const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/db');

describe('Segments API', () => {
  let broadcastId;

  beforeEach(() => {
    db.prepare('DELETE FROM segments').run();
    db.prepare('DELETE FROM broadcasts').run();

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
    broadcastId = result.lastInsertRowid;
  });

  afterEach(() => {
    db.prepare('DELETE FROM segments').run();
    db.prepare('DELETE FROM broadcasts').run();
  });

  describe('GET /api/broadcast/:id/segments', () => {
    test('返回空 segments 列表', async () => {
      const res = await request(app).get(`/api/broadcast/${broadcastId}/segments`);
      expect(res.status).toBe(200);
      expect(res.body.segments).toEqual([]);
    });

    test('不存在的 broadcast 返回 404', async () => {
      const res = await request(app).get('/api/broadcast/99999/segments');
      expect(res.status).toBe(404);
    });

    test('无效 ID 返回 400', async () => {
      const res = await request(app).get('/api/broadcast/abc/segments');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/broadcast/:id/segments/reorder', () => {
    test('成功重排序', async () => {
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status) VALUES (?, ?, ?, ?)`)
        .run(broadcastId, 0, '第一句', 'pending');
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status) VALUES (?, ?, ?, ?)`)
        .run(broadcastId, 1, '第二句', 'pending');

      const segments = db.prepare('SELECT id FROM segments WHERE broadcast_id = ? ORDER BY "index"')
        .all(broadcastId);

      const res = await request(app)
        .post(`/api/broadcast/${broadcastId}/segments/reorder`)
        .send({ segmentIds: [segments[1].id, segments[0].id] });

      expect(res.status).toBe(200);
      expect(res.body.segments[0].text).toBe('第二句');
      expect(res.body.segments[1].text).toBe('第一句');
    });

    test('缺少 segmentIds 返回 400', async () => {
      const res = await request(app)
        .post(`/api/broadcast/${broadcastId}/segments/reorder`)
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/broadcast/:id/segments/merge', () => {
    test('无 segments 时返回 400', async () => {
      const res = await request(app)
        .post(`/api/broadcast/${broadcastId}/segments/merge`)
        .send();
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/broadcast/:id/segments/:segId', () => {
    test('成功编辑文本', async () => {
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status) VALUES (?, ?, ?, ?)`)
        .run(broadcastId, 0, '旧文本', 'pending');
      const seg = db.prepare('SELECT id FROM segments WHERE broadcast_id = ?').get(broadcastId);

      const res = await request(app)
        .put(`/api/broadcast/${broadcastId}/segments/${seg.id}`)
        .send({ text: '新文本' });

      expect(res.status).toBe(200);
      expect(res.body.segment.text).toBe('新文本');
      expect(res.body.segment.status).toBe('pending');
    });

    test('空文本返回 400', async () => {
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status) VALUES (?, ?, ?, ?)`)
        .run(broadcastId, 0, '文本', 'pending');
      const seg = db.prepare('SELECT id FROM segments WHERE broadcast_id = ?').get(broadcastId);

      const res = await request(app)
        .put(`/api/broadcast/${broadcastId}/segments/${seg.id}`)
        .send({ text: '' });
      expect(res.status).toBe(400);
    });

    test('不存在的 segment 返回 404', async () => {
      const res = await request(app)
        .put(`/api/broadcast/${broadcastId}/segments/99999`)
        .send({ text: '新文本' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/broadcast/:id/segments/:segId', () => {
    test('成功删除 segment', async () => {
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status) VALUES (?, ?, ?, ?)`)
        .run(broadcastId, 0, '待删除', 'pending');
      const seg = db.prepare('SELECT id FROM segments WHERE broadcast_id = ?').get(broadcastId);

      const res = await request(app)
        .delete(`/api/broadcast/${broadcastId}/segments/${seg.id}`);

      expect(res.status).toBe(200);
      expect(res.body.segments.length).toBe(0);
    });

    test('不存在的 segment 返回 404', async () => {
      const res = await request(app)
        .delete(`/api/broadcast/${broadcastId}/segments/99999`);
      expect(res.status).toBe(404);
    });
  });
});
```

- [ ] **Step 2: 运行 segments 测试**

Run: `cd backend && npx jest tests/routes/segments.test.js --no-cache`
Expected: PASS — 所有用例通过

- [ ] **Step 3: 提交**

```bash
git add backend/tests/routes/segments.test.js
git commit -m "test: add comprehensive segments route tests"
```

---

### Task 13: 全量回归测试 + Checklist 验证

**Files:** 无新文件

- [ ] **Step 1: 运行全部测试**

Run: `cd backend && npx jest --no-cache --verbose 2>&1 | tail -40`
Expected: 所有测试通过

- [ ] **Step 2: 验证 Checklist**

逐项检查设计文档中的 Checklist：

- [ ] `broadcast.js` 行数 ≤ 300
- [ ] `mimo.js` 行数 ≤ 150
- [ ] 路由层不再直接调用 `db.prepare()`（broadcast.js 中的 settings 查询除外——它们是 settings 表操作，不需要 DAL）
- [ ] ID 校验零重复（全部使用 `validateId()`）
- [ ] 文件删除零重复（全部使用 `cleanAudioFile()`）
- [ ] 无 global 变量
- [ ] 无 `process.env.NODE_TLS_REJECT_UNAUTHORIZED`
- [ ] 无函数内 require
- [ ] 所有现有测试仍然通过
- [ ] 新增测试全部通过

Run: `wc -l backend/src/routes/broadcast.js backend/src/services/mimo.js`
Expected: broadcast.js ≤ 300 行，mimo.js ≤ 150 行

Run: `grep -r 'db\.prepare' backend/src/routes/ | grep -v settings.js`
Expected: 无输出（路由层除 settings.js 外不再直接操作 DB）

Run: `grep -r 'global\.' backend/src/`
Expected: 无输出

Run: `grep -r 'NODE_TLS_REJECT' backend/src/`
Expected: 无输出

- [ ] **Step 3: 最终提交**

```bash
git add -A
git commit -m "chore: backend tech debt remediation complete — all 12 issues resolved"
```

---

## 完成标准

所有任务完成后，后端代码应满足：

| 指标 | 目标 |
|------|------|
| broadcast.js 行数 | ≤ 300 |
| mimo.js 行数 | ≤ 150 |
| 路由层 db.prepare 调用数 | 0（settings.js 除外） |
| ID 校验重复次数 | 0 |
| global 变量 | 0 |
| TLS 全局关闭 | 无 |
| 函数内 require | 0 |
| 测试总数 | ≥ 100 |
| broadcast 端点测试覆盖 | ≥ 12/15 |
| API 契约变化 | 0（前端零改动） |
