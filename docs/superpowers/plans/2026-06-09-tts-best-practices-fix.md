# TTS 最佳实践修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 TTS 服务层 6 个最佳实践问题：输入校验、超时、限流重试、错误分类、精细控制参数、格式参数、voiceClone 校验

**Architecture:** 所有改动集中在 `backend/src/services/tts.js` 和 `backend/src/services/audio.js`，不改变外部 API 接口签名（仅扩展可选参数），不影响路由层和前端。遵循 TDD：先写失败测试，再写最小实现。

**Tech Stack:** Jest（测试）、Axios（HTTP）、Node.js（setTimeout/retry）

---

## 文件变更清单

| 文件 | 操作 | 负责 Issue |
|------|------|-----------|
| `backend/src/services/tts.js` | 修改 | #1 #2 #3 #4 #6 |
| `backend/src/services/audio.js` | 修改 | #5 |
| `backend/tests/services/tts.test.js` | 修改 | #1 #2 #3 #4 #6 |
| `backend/tests/services/audio.test.js` | 修改 | #5 |
| `backend/src/routes/voicePresets.js` | 修改 | 附带修复：改用 tts.generateSpeech |

---

### Task 1: 输入校验（Issue #6）

**Files:**
- Modify: `backend/src/services/tts.js:15-46`
- Modify: `backend/tests/services/tts.test.js`

- [ ] **Step 1: 写失败测试 — text 为空时抛错**

在 `backend/tests/services/tts.test.js` 的 `describe('generateSpeech')` 块末尾添加：

```js
    test('text 为空时抛出校验错误', async () => {
      await expect(tts.generateSpeech({ text: '' }))
        .rejects.toThrow('请提供合成文本');
      await expect(tts.generateSpeech({ text: null }))
        .rejects.toThrow('请提供合成文本');
    });

    test('clone 模式缺少 voiceClone 时抛出校验错误', async () => {
      await expect(tts.generateSpeech({ text: '测试', voiceType: 'clone' }))
        .rejects.toThrow('clone 模式需要提供 voiceClone');
    });

    test('design 模式缺少 voiceDesign 时抛出校验错误', async () => {
      await expect(tts.generateSpeech({ text: '测试', voiceType: 'design' }))
        .rejects.toThrow('design 模式需要提供 voiceDesign');
    });
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd /Users/jinghao/Desktop/workBase/hcds-studio/backend && npm test -- --testPathPattern=tts.test
```

Expected: 3 个新测试 FAIL（当前没有校验逻辑）

- [ ] **Step 3: 实现输入校验**

在 `backend/src/services/tts.js` 的 `generateSpeech` 函数开头（`const ttsApiKey = ...` 之前）添加：

```js
  // 输入校验
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('请提供合成文本');
  }
  if (voiceType === 'clone' && !voiceClone) {
    throw new Error('clone 模式需要提供 voiceClone');
  }
  if (voiceType === 'design' && !voiceDesign) {
    throw new Error('design 模式需要提供 voiceDesign');
  }
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd /Users/jinghao/Desktop/workBase/hcds-studio/backend && npm test -- --testPathPattern=tts.test
```

Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add backend/src/services/tts.js backend/tests/services/tts.test.js
git commit -m "fix(tts): 添加 generateSpeech 输入校验"
```

---

### Task 2: 超时修复（Issue #3a）

**Files:**
- Modify: `backend/src/services/tts.js:59`
- Modify: `backend/tests/services/tts.test.js`

- [ ] **Step 1: 写失败测试 — 验证 timeout 不为 0**

在 `backend/tests/services/tts.test.js` 的 `describe('generateSpeech')` 块末尾添加：

```js
    test('请求设置了合理的超时时间', async () => {
      mockTtsResponse();
      await tts.generateSpeech({ text: '测试' });
      const config = axios.post.mock.calls[0][2];
      expect(config.timeout).toBeGreaterThan(0);
    });
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd /Users/jinghao/Desktop/workBase/hcds-studio/backend && npm test -- --testPathPattern=tts.test
```

Expected: `timeout` 测试 FAIL（当前 timeout 为 0）

- [ ] **Step 3: 修改 timeout**

在 `backend/src/services/tts.js` 中，将 axios.post 调用的 `timeout: 0` 改为：

```js
      timeout: 120000  // 2 分钟超时，TTS 长文本需要较长时间
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd /Users/jinghao/Desktop/workBase/hcds-studio/backend && npm test -- --testPathPattern=tts.test
```

Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add backend/src/services/tts.js backend/tests/services/tts.test.js
git commit -m "fix(tts): 设置 120 秒请求超时替代无超时"
```

---

### Task 3: 429 限流重试（Issue #3b）

**Files:**
- Modify: `backend/src/services/tts.js:48-66`
- Modify: `backend/tests/services/tts.test.js`

- [ ] **Step 1: 写失败测试 — 429 自动重试**

在 `backend/tests/services/tts.test.js` 的 `describe('generateSpeech')` 块末尾添加：

```js
    test('429 错误自动重试最多 3 次', async () => {
      // 前两次 429，第三次成功
      axios.post
        .mockRejectedValueOnce({ response: { status: 429 } })
        .mockRejectedValueOnce({ response: { status: 429 } })
        .mockResolvedValueOnce({
          data: { choices: [{ message: { audio: { data: fakeAudioBase64 } } }] }
        });

      const result = await tts.generateSpeech({ text: '测试' });
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(axios.post).toHaveBeenCalledTimes(3);
    });

    test('429 重试 3 次后仍失败则抛错', async () => {
      axios.post.mockRejectedValue({ response: { status: 429 } });

      await expect(tts.generateSpeech({ text: '测试' }))
        .rejects.toThrow('MiMo API 请求过于频繁，请稍后再试');
      expect(axios.post).toHaveBeenCalledTimes(3);
    });
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd /Users/jinghao/Desktop/workBase/hcds-studio/backend && npm test -- --testPathPattern=tts.test
```

Expected: 重试相关测试 FAIL（当前无重试逻辑）

- [ ] **Step 3: 实现重试逻辑**

将 `backend/src/services/tts.js` 中的 `let response;` 到 `}` 结束的 try-catch 块替换为：

```js
  // 带重试的 API 调用（429 限流时最多重试 3 次）
  const MAX_RETRIES = 3;
  let response;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
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
        timeout: 120000
      });
      break; // 成功，跳出重试循环
    } catch (err) {
      if (err.response?.status === 429 && attempt < MAX_RETRIES) {
        // 429 限流，指数退避后重试
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // 非 429 错误或重试耗尽
      if (err.response?.status === 429) {
        throw new Error('MiMo API 请求过于频繁，请稍后再试');
      }
      if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
        throw new Error('MiMo TTS API 请求超时，请稍后再试');
      }
      if (!err.response) {
        throw new Error(`MiMo TTS API 网络错误: ${err.message}`);
      }
      throw new Error(`MiMo TTS API 调用失败: ${err.response?.data?.error?.message || err.message}`);
    }
  }
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd /Users/jinghao/Desktop/workBase/hcds-studio/backend && npm test -- --testPathPattern=tts.test
```

Expected: 全部 PASS

- [ ] **Step 5: 运行全部测试确认无回归**

```bash
cd /Users/jinghao/Desktop/workBase/hcds-studio/backend && npm test
```

Expected: 全部 PASS

- [ ] **Step 6: 提交**

```bash
git add backend/src/services/tts.js backend/tests/services/tts.test.js
git commit -m "fix(tts): 429 限流自动重试（指数退避，最多 3 次）+ 错误分类"
```

> 注：Task 3 同时修复了 Issue #3c（错误分类），因为重试逻辑天然需要区分错误类型。

---

### Task 4: 精细控制参数（Issue #1 + #2）

**Files:**
- Modify: `backend/src/services/tts.js:15-46`
- Modify: `backend/tests/services/tts.test.js`

- [ ] **Step 1: 写失败测试 — speed/emotion/pitch 参数传递**

在 `backend/tests/services/tts.test.js` 的 `describe('generateSpeech')` 块末尾添加：

```js
    test('preset 模式传入 speed 参数到 audioConfig', async () => {
      mockTtsResponse();
      await tts.generateSpeech({
        text: '测试文本',
        voice: '冰糖',
        voiceType: 'preset',
        speed: { speed_ratio: 0.9, style: '固定' }
      });
      const body = axios.post.mock.calls[0][1];
      expect(body.audio.speed).toEqual({ speed_ratio: 0.9, style: '固定' });
    });

    test('preset 模式传入 emotion 参数到 audioConfig', async () => {
      mockTtsResponse();
      await tts.generateSpeech({
        text: '测试文本',
        voice: '冰糖',
        voiceType: 'preset',
        emotion: 'happy'
      });
      const body = axios.post.mock.calls[0][1];
      expect(body.audio.emotion).toBe('happy');
    });

    test('preset 模式传入 emotion_weights 到 audioConfig', async () => {
      mockTtsResponse();
      const weights = [
        { emotion: 'happy', weight: 0.6 },
        { emotion: 'surprised', weight: 0.4 }
      ];
      await tts.generateSpeech({
        text: '测试文本',
        voice: '冰糖',
        voiceType: 'preset',
        emotion: weights
      });
      const body = axios.post.mock.calls[0][1];
      expect(body.audio.emotion_weights).toEqual(weights);
    });

    test('preset 模式传入 pitch 参数到 audioConfig', async () => {
      mockTtsResponse();
      await tts.generateSpeech({
        text: '测试文本',
        voice: '冰糖',
        voiceType: 'preset',
        pitch: { pitch_ratio: 1.2, style: '随机' }
      });
      const body = axios.post.mock.calls[0][1];
      expect(body.audio.pitch).toEqual({ pitch_ratio: 1.2, style: '随机' });
    });

    test('有精细参数时清除 stylePrompt 避免冲突', async () => {
      mockTtsResponse();
      await tts.generateSpeech({
        text: '测试文本',
        voice: '冰糖',
        voiceType: 'preset',
        stylePrompt: '用温柔的语气',
        speed: { speed_ratio: 0.9 }
      });
      const body = axios.post.mock.calls[0][1];
      // user message 应为空，避免与精细参数冲突
      expect(body.messages[0].content).toBe('');
    });

    test('无精细参数时保留 stylePrompt', async () => {
      mockTtsResponse();
      await tts.generateSpeech({
        text: '测试文本',
        voice: '冰糖',
        voiceType: 'preset',
        stylePrompt: '用温柔的语气播报'
      });
      const body = axios.post.mock.calls[0][1];
      expect(body.messages[0].content).toBe('用温柔的语气播报');
    });
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd /Users/jinghao/Desktop/workBase/hcds-studio/backend && npm test -- --testPathPattern=tts.test
```

Expected: 6 个新测试 FAIL

- [ ] **Step 3: 修改 generateSpeech 函数签名和实现**

将 `backend/src/services/tts.js` 的函数签名改为：

```js
async function generateSpeech({ text, voice = '冰糖', voiceType = 'preset', voiceDesign, voiceClone, stylePrompt, speed, emotion, pitch }) {
```

将 `let model, messages, audioConfig;` 改为：

```js
  let model, messages, audioConfig;

  // 判断是否使用了精细参数（speed/emotion/pitch），若是则清除 stylePrompt 避免冲突
  const hasFineGrainedParams = speed || emotion || pitch;
  const effectiveStylePrompt = hasFineGrainedParams ? '' : (stylePrompt || '');
```

将 preset 分支（`default:` case）改为：

```js
    default: // preset
      model = 'mimo-v2.5-tts';
      messages = [
        { role: 'user', content: effectiveStylePrompt || '用专业新闻主播的语气，语速适中，沉稳大气' },
        { role: 'assistant', content: text }
      ];
      audioConfig = { format: 'wav', voice };
      // 精细控制参数
      if (speed) audioConfig.speed = speed;
      if (emotion) {
        if (Array.isArray(emotion)) {
          audioConfig.emotion_weights = emotion;
        } else {
          audioConfig.emotion = emotion;
        }
      }
      if (pitch) audioConfig.pitch = pitch;
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd /Users/jinghao/Desktop/workBase/hcds-studio/backend && npm test -- --testPathPattern=tts.test
```

Expected: 全部 PASS

- [ ] **Step 5: 更新 JSDoc 注释**

更新函数顶部的 JSDoc，添加新参数说明：

```js
/**
 * 生成 TTS 语音
 * @param {Object} params
 * @param {string} params.text - 口播稿
 * @param {string} [params.voice='冰糖'] - 音色 ID
 * @param {string} [params.voiceType='preset'] - 音色类型 (preset/design/clone)
 * @param {string} [params.voiceDesign] - 音色设计描述
 * @param {string} [params.voiceClone] - 音色克隆音频 (base64)
 * @param {string} [params.stylePrompt] - 风格提示（与精细参数互斥）
 * @param {Object} [params.speed] - 速度控制 { speed_ratio: 0.5-2.0, style: '固定'|'随机' }
 * @param {string|Array} [params.emotion] - 情感控制，字符串或 [{ emotion, weight }] 数组
 * @param {Object} [params.pitch] - 音调控制 { pitch_ratio: 0.5-2.0, style: '固定'|'随机' }
 * @returns {Promise<Buffer>} 音频 Buffer
 */
```

- [ ] **Step 6: 提交**

```bash
git add backend/src/services/tts.js backend/tests/services/tts.test.js
git commit -m "feat(tts): 支持 speed/emotion/pitch 精细控制参数"
```

---

### Task 5: 输出格式参数（Issue #4）

**Files:**
- Modify: `backend/src/services/tts.js`
- Modify: `backend/tests/services/tts.test.js`

- [ ] **Step 1: 写失败测试 — format 参数可配置**

在 `backend/tests/services/tts.test.js` 的 `describe('generateSpeech')` 块末尾添加：

```js
    test('可自定义输出格式（如 mp3）', async () => {
      mockTtsResponse();
      await tts.generateSpeech({
        text: '测试文本',
        voice: '冰糖',
        voiceType: 'preset',
        format: 'mp3'
      });
      const body = axios.post.mock.calls[0][1];
      expect(body.audio.format).toBe('mp3');
    });

    test('不传 format 时默认为 wav', async () => {
      mockTtsResponse();
      await tts.generateSpeech({ text: '测试文本' });
      const body = axios.post.mock.calls[0][1];
      expect(body.audio.format).toBe('wav');
    });
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd /Users/jinghao/Desktop/workBase/hcds-studio/backend && npm test -- --testPathPattern=tts.test
```

Expected: format 测试 FAIL

- [ ] **Step 3: 修改函数签名和实现**

更新函数签名，添加 `format` 参数：

```js
async function generateSpeech({ text, voice = '冰糖', voiceType = 'preset', voiceDesign, voiceClone, stylePrompt, speed, emotion, pitch, format = 'wav' }) {
```

将三个分支中硬编码的 `format: 'wav'` 替换为 `format`：

- design 分支: `{ format, optimize_text_preview: true }`
- clone 分支: `{ format, voice: voiceClone }`
- preset 分支: `{ format, voice }`

- [ ] **Step 4: 运行测试确认通过**

```bash
cd /Users/jinghao/Desktop/workBase/hcds-studio/backend && npm test -- --testPathPattern=tts.test
```

Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add backend/src/services/tts.js backend/tests/services/tts.test.js
git commit -m "feat(tts): 支持自定义输出格式参数（默认 wav）"
```

---

### Task 6: voiceClone 校验（Issue #5）

**Files:**
- Modify: `backend/src/services/audio.js`
- Modify: `backend/tests/services/audio.test.js`

- [ ] **Step 1: 写失败测试 — resolveVoiceClone 校验**

在 `backend/tests/services/audio.test.js` 末尾添加新的 describe 块：

```js
describe('resolveVoiceClone', () => {
  const { resolveVoiceClone } = require('../../src/services/audio');

  test('data: 前缀的 base64 直接返回', async () => {
    const input = 'data:audio/wav;base64,AAAA';
    const result = await resolveVoiceClone(input);
    expect(result).toBe(input);
  });

  test('无效输入（非 data: 且非文件路径）抛出校验错误', async () => {
    await expect(resolveVoiceClone('not-valid-input'))
      .rejects.toThrow('voiceClone 格式无效');
  });

  test('空值抛出校验错误', async () => {
    await expect(resolveVoiceClone(null))
      .rejects.toThrow('voiceClone 不能为空');
    await expect(resolveVoiceClone(''))
      .rejects.toThrow('voiceClone 不能为空');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd /Users/jinghao/Desktop/workBase/hcds-studio/backend && npm test -- --testPathPattern=audio.test
```

Expected: 新测试 FAIL（当前 resolveVoiceClone 对无效输入直接 passthrough）

- [ ] **Step 3: 修改 resolveVoiceClone 添加校验**

读取 `backend/src/services/audio.js`，找到 `resolveVoiceClone` 函数，在函数开头添加校验：

```js
async function resolveVoiceClone(voiceClone) {
  // 校验
  if (!voiceClone) {
    throw new Error('voiceClone 不能为空');
  }
  // ... 原有逻辑不变
  // 在最后的 else 分支（非 data: 且非 /audio/ 路径）改为抛错：
  // 原来: return voiceClone;
  // 改为: throw new Error('voiceClone 格式无效，需要 data: 前缀或 /audio/ 文件路径');
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd /Users/jinghao/Desktop/workBase/hcds-studio/backend && npm test -- --testPathPattern=audio.test
```

Expected: 全部 PASS

- [ ] **Step 5: 运行全部测试确认无回归**

```bash
cd /Users/jinghao/Desktop/workBase/hcds-studio/backend && npm test
```

Expected: 全部 PASS

- [ ] **Step 6: 提交**

```bash
git add backend/src/services/audio.js backend/tests/services/audio.test.js
git commit -m "fix(audio): resolveVoiceClone 添加输入校验"
```

---

### Task 7: 修复 voicePresets.js 调用路径

**Files:**
- Modify: `backend/src/routes/voicePresets.js`

- [ ] **Step 1: 将 mimo.generateSpeech 改为 tts.generateSpeech**

在 `backend/src/routes/voicePresets.js` 文件顶部的 require 区域，将：

```js
const mimo = require('../services/mimo');
```

改为：

```js
const mimo = require('../services/mimo');
const tts = require('../services/tts');
```

然后将两处 `mimo.generateSpeech` 调用改为 `tts.generateSpeech`：

- `/trial/clone` 路由中的 `await mimo.generateSpeech({` → `await tts.generateSpeech({`
- `/trial/design` 路由中的 `await mimo.generateSpeech({` → `await tts.generateSpeech({`

- [ ] **Step 2: 运行全部测试确认无回归**

```bash
cd /Users/jinghao/Desktop/workBase/hcds-studio/backend && npm test
```

Expected: 全部 PASS

- [ ] **Step 3: 提交**

```bash
git add backend/src/routes/voicePresets.js
git commit -m "fix(voicePresets): 改用 tts.generateSpeech 替代 mimo.generateSpeech"
```

---

### Task 8: 最终验证与文档同步

- [ ] **Step 1: 运行全部测试**

```bash
cd /Users/jinghao/Desktop/workBase/hcds-studio/backend && npm test
```

Expected: 全部 PASS

- [ ] **Step 2: 更新 ttsSeries.md 中项目实际使用章节**

读取 `docs/ttsSeries.md`，更新"项目中的实际使用"章节中 `generateSpeech` 的参数签名：

```
**核心函数**：`backend/src/services/tts.js` — `generateSpeech({ text, voice, voiceType, voiceDesign, voiceClone, stylePrompt, speed, emotion, pitch, format })`
```

- [ ] **Step 3: 提交**

```bash
git add docs/ttsSeries.md
git commit -m "docs: 同步 ttsSeries.md 中 generateSpeech 参数签名"
```
