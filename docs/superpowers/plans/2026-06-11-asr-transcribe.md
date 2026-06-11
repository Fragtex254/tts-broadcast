# ASR Transcription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an independent ASR transcription page that accepts uploaded audio/video, calls MiMo ASR, and lets users copy or import the result into the script editor.

**Architecture:** The backend adds a narrow `/api/transcribe` route, with route code limited to HTTP validation and response formatting. Media conversion, MiMo ASR payload construction, and MiMo HTTP retry/error mapping live in focused services. The frontend adds a `transcribeSlice`, `transcribeApi`, and `/transcribe` page that follows the existing Soft Editorial UI and Zustand patterns.

**Tech Stack:** Node.js, Express 5, multer, axios, ffmpeg-static, Jest, supertest, React 19, TypeScript, Zustand, Vite.

---

## File Structure

- Create `backend/src/services/mimoApiClient.js`: shared MiMo standard API HTTP client for `api.xiaomimimo.com/v1/chat/completions`; used by ASR only in this plan.
- Create `backend/src/services/media.js`: convert uploaded media buffers to ASR-compatible data URLs; direct encode wav/mp3, convert m4a/mp4/mov/webm through ffmpeg-static.
- Create `backend/src/services/asr.js`: validate language, build ASR payload, call `mimoApiClient`, extract transcription text.
- Create `backend/src/routes/transcribe.js`: `POST /api/transcribe` multipart route using memory multer and ASR service.
- Modify `backend/src/app.js`: mount `/api/transcribe`.
- Create `backend/tests/services/mimoApiClient.test.js`: retry and error mapping coverage with mocked axios.
- Create `backend/tests/services/media.test.js`: data URL encoding and file-type validation coverage.
- Create `backend/tests/services/asr.test.js`: ASR payload, language validation, empty response coverage.
- Create `backend/tests/routes/transcribe.test.js`: upload route success and validation coverage.
- Modify `backend/package.json` and `backend/package-lock.json`: add `ffmpeg-static`.
- Modify `frontend/src/services/api.ts`: add `transcribeApi`.
- Modify `frontend/src/store/types.ts`: add transcription state and actions.
- Create `frontend/src/store/transcribeSlice.ts`: Zustand actions for upload and result state.
- Modify `frontend/src/store/index.ts`: compose transcribe slice and export types.
- Create `frontend/src/pages/Transcribe.tsx`: independent transcription workspace.
- Modify `frontend/src/App.tsx`: add `/transcribe` route.
- Modify `frontend/src/components/Layout/Sidebar.tsx`: add "转录" nav item.
- Modify `CLAUDE.md`, `backend/BACKEND_CONVENTIONS.md`, `frontend/FRONTEND_CONVENTIONS.md`: document the new route/services/page.

---

### Task 1: MiMo Standard API Client

**Files:**
- Create: `backend/tests/services/mimoApiClient.test.js`
- Create: `backend/src/services/mimoApiClient.js`

- [ ] **Step 1: Write failing tests for retry, headers, and error mapping**

Create `backend/tests/services/mimoApiClient.test.js`:

```js
jest.mock('axios');
const axios = require('axios');

const { postChatCompletions } = require('../../src/services/mimoApiClient');

describe('MiMo 标准 API 客户端', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('发送 chat completions 请求时带上 api-key、JSON 头和超时', async () => {
    axios.post.mockResolvedValue({ data: { ok: true } });

    const result = await postChatCompletions({
      apiKey: 'test-key',
      payload: { model: 'mimo-v2.5-asr' },
      serviceName: 'ASR'
    });

    expect(result).toEqual({ ok: true });
    expect(axios.post).toHaveBeenCalledWith(
      'https://api.xiaomimimo.com/v1/chat/completions',
      { model: 'mimo-v2.5-asr' },
      {
        headers: {
          'api-key': 'test-key',
          'Content-Type': 'application/json'
        },
        timeout: 120000
      }
    );
  });

  test('429 限流自动重试最多三次并最终成功', async () => {
    axios.post
      .mockRejectedValueOnce({ response: { status: 429 } })
      .mockRejectedValueOnce({ response: { status: 429 } })
      .mockResolvedValueOnce({ data: { ok: true } });

    const result = await postChatCompletions({
      apiKey: 'test-key',
      payload: { model: 'mimo-v2.5-asr' },
      serviceName: 'ASR'
    });

    expect(result).toEqual({ ok: true });
    expect(axios.post).toHaveBeenCalledTimes(3);
  });

  test('429 重试耗尽后抛出友好错误', async () => {
    axios.post.mockRejectedValue({ response: { status: 429 } });

    await expect(postChatCompletions({
      apiKey: 'test-key',
      payload: { model: 'mimo-v2.5-asr' },
      serviceName: 'ASR'
    })).rejects.toThrow('MiMo API 请求过于频繁，请稍后再试');

    expect(axios.post).toHaveBeenCalledTimes(3);
  });

  test('401 映射为 API Key 无效提示', async () => {
    axios.post.mockRejectedValue({ response: { status: 401 } });

    await expect(postChatCompletions({
      apiKey: 'bad-key',
      payload: { model: 'mimo-v2.5-asr' },
      serviceName: 'ASR'
    })).rejects.toThrow('MiMo API Key 无效，请检查设置');
  });

  test('超时和网络错误带服务名', async () => {
    axios.post.mockRejectedValueOnce({ code: 'ECONNABORTED', message: 'timeout' });
    await expect(postChatCompletions({
      apiKey: 'test-key',
      payload: {},
      serviceName: 'ASR'
    })).rejects.toThrow('MiMo ASR API 请求超时，请稍后再试');

    axios.post.mockRejectedValueOnce({ code: 'ENOTFOUND', message: 'network down' });
    await expect(postChatCompletions({
      apiKey: 'test-key',
      payload: {},
      serviceName: 'ASR'
    })).rejects.toThrow('MiMo ASR API 网络错误: network down');
  });
});
```

- [ ] **Step 2: Run the client tests and verify RED**

Run:

```bash
cd backend
npm test -- tests/services/mimoApiClient.test.js --runInBand
```

Expected: FAIL with `Cannot find module '../../src/services/mimoApiClient'`.

- [ ] **Step 3: Implement the MiMo API client**

Create `backend/src/services/mimoApiClient.js`:

```js
const axios = require('axios');

const CHAT_COMPLETIONS_URL = 'https://api.xiaomimimo.com/v1/chat/completions';
const REQUEST_TIMEOUT_MS = 120000;
const MAX_RETRIES = 3;

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getApiErrorMessage(error) {
  return error.response?.data?.error?.message || error.response?.data?.message || error.message;
}

/**
 * 调用 MiMo 标准 Chat Completions API
 * @param {Object} params
 * @param {string} params.apiKey - MiMo API Key
 * @param {Object} params.payload - 请求体
 * @param {string} params.serviceName - 服务名称，用于错误提示
 * @returns {Promise<Object>} 响应 data
 */
async function postChatCompletions({ apiKey, payload, serviceName }) {
  if (!apiKey) {
    throw new Error('请先在设置中配置 mimo_tts_api_key');
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.post(CHAT_COMPLETIONS_URL, payload, {
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json'
        },
        timeout: REQUEST_TIMEOUT_MS
      });
      return response.data;
    } catch (error) {
      if (error.response?.status === 429 && attempt < MAX_RETRIES) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
        await wait(delay);
        continue;
      }

      if (error.response?.status === 429) {
        throw new Error('MiMo API 请求过于频繁，请稍后再试');
      }
      if (error.response?.status === 401) {
        throw new Error('MiMo API Key 无效，请检查设置');
      }
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        throw new Error(`MiMo ${serviceName} API 请求超时，请稍后再试`);
      }
      if (!error.response) {
        throw new Error(`MiMo ${serviceName} API 网络错误: ${error.message}`);
      }

      throw new Error(`MiMo ${serviceName} API 调用失败: ${getApiErrorMessage(error)}`);
    }
  }

  throw new Error(`MiMo ${serviceName} API 调用失败`);
}

module.exports = { postChatCompletions };
```

- [ ] **Step 4: Run the client tests and verify GREEN**

Run:

```bash
cd backend
npm test -- tests/services/mimoApiClient.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add backend/src/services/mimoApiClient.js backend/tests/services/mimoApiClient.test.js
git commit -m "feat(asr): add MiMo standard API client"
```

---

### Task 2: Media Conversion Service

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`
- Create: `backend/tests/services/media.test.js`
- Create: `backend/src/services/media.js`

- [ ] **Step 1: Install ffmpeg-static**

Run:

```bash
cd backend
npm install ffmpeg-static
```

Expected: `backend/package.json` and `backend/package-lock.json` include `ffmpeg-static`. If local certificate validation fails with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, stop and report before using any insecure workaround because this repo explicitly disallows global TLS disabling.

- [ ] **Step 2: Write failing tests for direct audio encoding and validation**

Create `backend/tests/services/media.test.js`:

```js
const { fileToAsrDataUrl } = require('../../src/services/media');

describe('媒体转 ASR data URL 服务', () => {
  test('wav 文件直接编码为 audio/wav data URL', async () => {
    const file = {
      originalname: 'sample.wav',
      mimetype: 'audio/wav',
      buffer: Buffer.from('wav-bytes')
    };

    const result = await fileToAsrDataUrl({ file });

    expect(result).toBe(`data:audio/wav;base64,${Buffer.from('wav-bytes').toString('base64')}`);
  });

  test('mp3 文件直接编码为 audio/mpeg data URL', async () => {
    const file = {
      originalname: 'sample.mp3',
      mimetype: 'audio/mpeg',
      buffer: Buffer.from('mp3-bytes')
    };

    const result = await fileToAsrDataUrl({ file });

    expect(result).toBe(`data:audio/mpeg;base64,${Buffer.from('mp3-bytes').toString('base64')}`);
  });

  test('缺少文件时抛出中文错误', async () => {
    await expect(fileToAsrDataUrl({ file: null }))
      .rejects.toThrow('请上传需要转录的音频或视频文件');
  });

  test('不支持的文件类型抛出中文错误', async () => {
    const file = {
      originalname: 'notes.txt',
      mimetype: 'text/plain',
      buffer: Buffer.from('hello')
    };

    await expect(fileToAsrDataUrl({ file }))
      .rejects.toThrow('暂不支持该文件类型');
  });
});
```

- [ ] **Step 3: Run media tests and verify RED**

Run:

```bash
cd backend
npm test -- tests/services/media.test.js --runInBand
```

Expected: FAIL with `Cannot find module '../../src/services/media'`.

- [ ] **Step 4: Implement media direct encoding and ffmpeg conversion scaffold**

Create `backend/src/services/media.js`:

```js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

const DIRECT_AUDIO_TYPES = new Map([
  ['wav', 'audio/wav'],
  ['mp3', 'audio/mpeg'],
  ['mpeg', 'audio/mpeg']
]);

const CONVERTIBLE_TYPES = new Set(['m4a', 'mp4', 'mov', 'webm']);

function getExtension(file) {
  return path.extname(file.originalname || '').toLowerCase().replace('.', '');
}

function bufferToDataUrl(buffer, mimeType) {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

function runFfmpeg(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, [
      '-y',
      '-i', inputPath,
      '-vn',
      '-acodec', 'pcm_s16le',
      '-ar', '24000',
      '-ac', '1',
      outputPath
    ], (error) => {
      if (error) {
        reject(new Error(`媒体转换失败: ${error.message}`));
        return;
      }
      resolve();
    });
  });
}

async function convertToWavDataUrl(file, ext) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-broadcast-asr-'));
  const inputPath = path.join(tmpDir, `input.${ext}`);
  const outputPath = path.join(tmpDir, 'output.wav');

  try {
    fs.writeFileSync(inputPath, file.buffer);
    await runFfmpeg(inputPath, outputPath);
    const wavBuffer = fs.readFileSync(outputPath);
    return bufferToDataUrl(wavBuffer, 'audio/wav');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * 将上传媒体转换为 MiMo ASR 接受的 data URL
 * @param {Object} params
 * @param {Object} params.file - multer 文件对象
 * @returns {Promise<string>} data URL
 */
async function fileToAsrDataUrl({ file }) {
  if (!file || !file.buffer) {
    throw new Error('请上传需要转录的音频或视频文件');
  }

  const ext = getExtension(file);
  if (DIRECT_AUDIO_TYPES.has(ext)) {
    return bufferToDataUrl(file.buffer, DIRECT_AUDIO_TYPES.get(ext));
  }

  if (CONVERTIBLE_TYPES.has(ext)) {
    return convertToWavDataUrl(file, ext);
  }

  throw new Error('暂不支持该文件类型，请上传 wav、mp3、m4a、mp4、mov 或 webm');
}

module.exports = { fileToAsrDataUrl };
```

- [ ] **Step 5: Run media tests and verify GREEN**

Run:

```bash
cd backend
npm test -- tests/services/media.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add backend/package.json backend/package-lock.json backend/src/services/media.js backend/tests/services/media.test.js
git commit -m "feat(asr): add media conversion service"
```

---

### Task 3: ASR Service and Transcribe Route

**Files:**
- Create: `backend/tests/services/asr.test.js`
- Create: `backend/src/services/asr.js`
- Create: `backend/tests/routes/transcribe.test.js`
- Create: `backend/src/routes/transcribe.js`
- Modify: `backend/src/app.js`

- [ ] **Step 1: Write failing ASR service tests**

Create `backend/tests/services/asr.test.js`:

```js
jest.mock('../../src/services/mimo', () => ({
  getApiKey: jest.fn().mockReturnValue('fake-tts-key')
}));

jest.mock('../../src/services/media', () => ({
  fileToAsrDataUrl: jest.fn().mockResolvedValue('data:audio/wav;base64,AAAA')
}));

jest.mock('../../src/services/mimoApiClient', () => ({
  postChatCompletions: jest.fn().mockResolvedValue({
    choices: [{ message: { content: '转录文本' } }],
    usage: { total_tokens: 12 }
  })
}));

const mimo = require('../../src/services/mimo');
const media = require('../../src/services/media');
const mimoApiClient = require('../../src/services/mimoApiClient');
const asr = require('../../src/services/asr');

describe('ASR 服务', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mimo.getApiKey.mockReturnValue('fake-tts-key');
    media.fileToAsrDataUrl.mockResolvedValue('data:audio/wav;base64,AAAA');
    mimoApiClient.postChatCompletions.mockResolvedValue({
      choices: [{ message: { content: '转录文本' } }],
      usage: { total_tokens: 12 }
    });
  });

  test('成功调用 MiMo ASR 并返回文本与 usage', async () => {
    const file = { originalname: 'a.wav', buffer: Buffer.from('a') };

    const result = await asr.transcribeMedia({ file, language: 'zh' });

    expect(result).toEqual({ text: '转录文本', usage: { total_tokens: 12 } });
    expect(mimo.getApiKey).toHaveBeenCalledWith('tts');
    expect(media.fileToAsrDataUrl).toHaveBeenCalledWith({ file });
    expect(mimoApiClient.postChatCompletions).toHaveBeenCalledWith({
      apiKey: 'fake-tts-key',
      serviceName: 'ASR',
      payload: {
        model: 'mimo-v2.5-asr',
        messages: [{
          role: 'user',
          content: [{
            type: 'input_audio',
            input_audio: { data: 'data:audio/wav;base64,AAAA' }
          }]
        }],
        asr_options: { language: 'zh' }
      }
    });
  });

  test('默认语言为 auto', async () => {
    await asr.transcribeMedia({ file: { originalname: 'a.wav', buffer: Buffer.from('a') } });

    const call = mimoApiClient.postChatCompletions.mock.calls[0][0];
    expect(call.payload.asr_options.language).toBe('auto');
  });

  test('语言参数无效时抛出中文错误', async () => {
    await expect(asr.transcribeMedia({
      file: { originalname: 'a.wav', buffer: Buffer.from('a') },
      language: 'jp'
    })).rejects.toThrow('语言参数无效，请选择自动、中文或英文');
  });

  test('Base64 data URL 超过限制时抛出中文错误', async () => {
    media.fileToAsrDataUrl.mockResolvedValue(`data:audio/wav;base64,${'a'.repeat(10 * 1024 * 1024 + 1)}`);

    await expect(asr.transcribeMedia({
      file: { originalname: 'large.wav', buffer: Buffer.from('a') }
    })).rejects.toThrow('音频内容过大，转换后超过 ASR 10MB 限制');
  });

  test('MiMo 未返回文本时抛出中文错误', async () => {
    mimoApiClient.postChatCompletions.mockResolvedValue({ choices: [{ message: {} }] });

    await expect(asr.transcribeMedia({
      file: { originalname: 'a.wav', buffer: Buffer.from('a') }
    })).rejects.toThrow('MiMo ASR API 未返回转录结果');
  });
});
```

- [ ] **Step 2: Run ASR service tests and verify RED**

Run:

```bash
cd backend
npm test -- tests/services/asr.test.js --runInBand
```

Expected: FAIL with `Cannot find module '../../src/services/asr'`.

- [ ] **Step 3: Implement ASR service**

Create `backend/src/services/asr.js`:

```js
const { getApiKey } = require('./mimo');
const { fileToAsrDataUrl } = require('./media');
const { postChatCompletions } = require('./mimoApiClient');

const ASR_MODEL = 'mimo-v2.5-asr';
const MAX_DATA_URL_SIZE = 10 * 1024 * 1024;
const SUPPORTED_LANGUAGES = new Set(['auto', 'zh', 'en']);

/**
 * 转录上传媒体为文字
 * @param {Object} params
 * @param {Object} params.file - multer 文件对象
 * @param {string} [params.language='auto'] - auto/zh/en
 * @returns {Promise<{text: string, usage: Object|null}>}
 */
async function transcribeMedia({ file, language = 'auto' }) {
  if (!SUPPORTED_LANGUAGES.has(language)) {
    throw new Error('语言参数无效，请选择自动、中文或英文');
  }

  const dataUrl = await fileToAsrDataUrl({ file });
  if (dataUrl.length > MAX_DATA_URL_SIZE) {
    throw new Error('音频内容过大，转换后超过 ASR 10MB 限制');
  }

  const apiKey = getApiKey('tts');
  const data = await postChatCompletions({
    apiKey,
    serviceName: 'ASR',
    payload: {
      model: ASR_MODEL,
      messages: [{
        role: 'user',
        content: [{
          type: 'input_audio',
          input_audio: { data: dataUrl }
        }]
      }],
      asr_options: { language }
    }
  });

  const text = data?.choices?.[0]?.message?.content;
  if (!text || typeof text !== 'string') {
    throw new Error('MiMo ASR API 未返回转录结果');
  }

  return { text, usage: data.usage || null };
}

module.exports = { transcribeMedia };
```

- [ ] **Step 4: Run ASR service tests and verify GREEN**

Run:

```bash
cd backend
npm test -- tests/services/asr.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 5: Write failing transcribe route tests**

Create `backend/tests/routes/transcribe.test.js`:

```js
const request = require('supertest');

jest.mock('../../src/services/asr', () => ({
  transcribeMedia: jest.fn().mockResolvedValue({
    text: '转录文本',
    usage: { total_tokens: 12 }
  })
}));

const app = require('../../src/app');
const asr = require('../../src/services/asr');

describe('转录 API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asr.transcribeMedia.mockResolvedValue({
      text: '转录文本',
      usage: { total_tokens: 12 }
    });
  });

  test('POST /api/transcribe 上传文件后返回转录文本', async () => {
    const res = await request(app)
      .post('/api/transcribe')
      .field('language', 'zh')
      .attach('media', Buffer.from('fake-wav'), 'sample.wav');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      text: '转录文本',
      usage: { total_tokens: 12 }
    });
    expect(asr.transcribeMedia).toHaveBeenCalledWith({
      file: expect.objectContaining({ originalname: 'sample.wav' }),
      language: 'zh'
    });
  });

  test('未上传文件返回 400', async () => {
    const res = await request(app)
      .post('/api/transcribe')
      .field('language', 'auto');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('请上传需要转录的音频或视频文件');
  });

  test('service 抛出的业务错误返回 500 和中文消息', async () => {
    asr.transcribeMedia.mockRejectedValue(new Error('MiMo ASR API 请求超时，请稍后再试'));

    const res = await request(app)
      .post('/api/transcribe')
      .attach('media', Buffer.from('fake-wav'), 'sample.wav');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('MiMo ASR API 请求超时，请稍后再试');
  });
});
```

- [ ] **Step 6: Run route tests and verify RED**

Run:

```bash
cd backend
npm test -- tests/routes/transcribe.test.js --runInBand
```

Expected: FAIL with status 404 for `/api/transcribe`.

- [ ] **Step 7: Implement transcribe route and mount it**

Create `backend/src/routes/transcribe.js`:

```js
const express = require('express');
const multer = require('multer');
const asr = require('../services/asr');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

/**
 * POST /api/transcribe
 * 上传音频或视频并转录为文本
 */
router.post('/', upload.single('media'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传需要转录的音频或视频文件' });
    }

    const result = await asr.transcribeMedia({
      file: req.file,
      language: req.body.language || 'auto'
    });

    res.json(result);
  } catch (error) {
    console.error('转录失败:', error);
    res.status(500).json({ error: error.message || '转录失败' });
  }
});

module.exports = router;
```

Modify `backend/src/app.js` by adding the route with the other API routes:

```js
app.use('/api/transcribe', require('./routes/transcribe'));
```

- [ ] **Step 8: Run route tests and verify GREEN**

Run:

```bash
cd backend
npm test -- tests/routes/transcribe.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 9: Commit Task 3**

```bash
git add backend/src/services/asr.js backend/src/routes/transcribe.js backend/src/app.js backend/tests/services/asr.test.js backend/tests/routes/transcribe.test.js
git commit -m "feat(asr): add transcription service and route"
```

---

### Task 4: Frontend Transcription Page

**Files:**
- Modify: `frontend/src/services/api.ts`
- Modify: `frontend/src/store/types.ts`
- Create: `frontend/src/store/transcribeSlice.ts`
- Modify: `frontend/src/store/index.ts`
- Create: `frontend/src/pages/Transcribe.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Layout/Sidebar.tsx`

- [ ] **Step 1: Add frontend API and store types**

Modify `frontend/src/services/api.ts` by adding:

```ts
export const transcribeApi = {
  transcribe: (formData: FormData) =>
    api.post('/transcribe', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
};
```

Modify `frontend/src/store/types.ts`:

```ts
export type AsrLanguage = 'auto' | 'zh' | 'en';

export interface TranscriptionResult {
  text: string;
  usage?: Record<string, unknown> | null;
}
```

Add these fields to `AppState`:

```ts
transcriptionText: string;
isTranscribing: boolean;
transcribeMedia: (file: File, language: AsrLanguage) => Promise<TranscriptionResult>;
setTranscriptionText: (text: string) => void;
clearTranscription: () => void;
```

- [ ] **Step 2: Create transcribe slice**

Create `frontend/src/store/transcribeSlice.ts`:

```ts
import { transcribeApi } from '../services/api';
import type { AppState, AsrLanguage, TranscriptionResult } from './types';
import type { StoreSet } from './storeTypes';

export function createTranscribeSlice(set: StoreSet): Pick<
  AppState,
  | 'transcriptionText'
  | 'isTranscribing'
  | 'transcribeMedia'
  | 'setTranscriptionText'
  | 'clearTranscription'
> {
  return {
    transcriptionText: '',
    isTranscribing: false,

    transcribeMedia: async (file: File, language: AsrLanguage) => {
      set({ isTranscribing: true });
      try {
        const formData = new FormData();
        formData.append('media', file);
        formData.append('language', language);

        const response = await transcribeApi.transcribe(formData);
        const result = response.data as TranscriptionResult;
        set({ transcriptionText: result.text, isTranscribing: false });
        return result;
      } catch (error) {
        set({ isTranscribing: false });
        console.error('转录失败:', error);
        throw error;
      }
    },

    setTranscriptionText: (text) => {
      set({ transcriptionText: text });
    },

    clearTranscription: () => {
      set({ transcriptionText: '' });
    },
  };
}
```

Modify `frontend/src/store/index.ts`:

```ts
import { createTranscribeSlice } from './transcribeSlice';
```

Add the export:

```ts
AsrLanguage,
TranscriptionResult,
```

Add the slice to the store:

```ts
...createTranscribeSlice(set),
```

- [ ] **Step 3: Create the Transcribe page**

Create `frontend/src/pages/Transcribe.tsx`:

```tsx
import React, { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Layout/Header';
import useStore, { type AsrLanguage } from '../store';

const LANGUAGE_OPTIONS: { value: AsrLanguage; label: string }[] = [
  { value: 'auto', label: '自动检测' },
  { value: 'zh', label: '中文' },
  { value: 'en', label: '英文' },
];

function getErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { error?: string } } }).response;
    if (response?.data?.error) return response.data.error;
  }
  if (error instanceof Error) return error.message;
  return '转录失败，请稍后重试';
}

export const Transcribe: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    transcriptionText,
    isTranscribing,
    transcribeMedia,
    setTranscriptionText,
    updateScript,
  } = useStore();

  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState<AsrLanguage>('auto');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleFile = useCallback((nextFile: File | null) => {
    setError(null);
    setCopied(false);
    setFile(nextFile);
  }, []);

  const handleSubmit = async () => {
    if (!file) {
      setError('请上传需要转录的音频或视频文件');
      return;
    }

    setError(null);
    try {
      await transcribeMedia(file, language);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleCopy = async () => {
    if (!transcriptionText) return;
    await navigator.clipboard.writeText(transcriptionText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const handleImport = () => {
    if (!transcriptionText.trim()) return;
    updateScript(transcriptionText.trim());
    navigate('/editor');
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header title="转录" subtitle="上传音频或视频并转换为口播稿文本" />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-4">
          <section
            className="bg-white/[0.55] backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border"
            style={{ animation: 'fade-in-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.04s both' }}
          >
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-lilac" />
              <h3 className="font-display italic text-[14px] font-medium text-ink-soft">上传媒体</h3>
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFile(e.dataTransfer.files[0] ?? null);
              }}
              className="bg-white/60 rounded-2xl p-8 border border-card-border text-center cursor-pointer hover:border-ink/15 transition-colors"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".wav,.mp3,.mpeg,.m4a,.mp4,.mov,.webm,audio/*,video/*"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
              <p className="font-display italic text-[18px] text-ink-soft mb-1">
                {file ? file.name : '选择或拖拽音频 / 视频'}
              </p>
              <p className="font-body text-[12px] text-ink-soft/45">
                wav, mp3, m4a, mp4, mov, webm
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mt-4">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as AsrLanguage)}
                className="bg-white/70 text-ink rounded-full px-3.5 py-2.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[12px] transition-colors"
              >
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <button
                onClick={handleSubmit}
                disabled={isTranscribing || !file}
                className="relative overflow-hidden bg-lemon hover:brightness-105 disabled:opacity-40 text-ink rounded-full px-5 py-2.5 shadow-btn font-body text-[12px] font-medium uppercase tracking-wider transition-all duration-150"
              >
                {isTranscribing && (
                  <span className="absolute left-0 top-0 h-full w-2/3 bg-white/20 animate-pulse" />
                )}
                <span className="relative">{isTranscribing ? '转录中...' : '开始转录'}</span>
              </button>
            </div>

            {error && (
              <div className="mt-3 bg-pink/10 border border-pink/30 rounded-xl p-3 text-ink text-[12px] font-body animate-shake">
                {error}
              </div>
            )}
          </section>

          <section
            className="bg-white/[0.55] backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border"
            style={{ animation: 'fade-in-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.08s both' }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-sage" />
                <h3 className="font-display italic text-[14px] font-medium text-ink-soft">转录结果</h3>
              </div>
              {transcriptionText && (
                <span className="font-body text-[10px] uppercase tracking-wider text-ink-soft/40">
                  {transcriptionText.length} 字
                </span>
              )}
            </div>

            <textarea
              value={transcriptionText}
              onChange={(e) => setTranscriptionText(e.target.value)}
              className="w-full h-72 bg-white/60 text-ink rounded-2xl p-4 border border-card-border focus:border-ink/20 focus:outline-none resize-none font-body text-[13px] leading-[1.9] transition-colors"
              placeholder="转录完成后，文本会出现在这里..."
            />

            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={handleCopy}
                disabled={!transcriptionText}
                className="px-4 py-2 font-body text-[12px] text-ink-soft hover:text-ink disabled:opacity-40 transition-colors"
              >
                {copied ? '已复制' : '复制'}
              </button>
              <button
                onClick={handleImport}
                disabled={!transcriptionText.trim()}
                className="px-4 py-2 font-body text-[12px] bg-sage hover:brightness-105 disabled:opacity-40 text-ink rounded-xl shadow-btn transition-all duration-150"
              >
                导入稿件
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default Transcribe;
```

- [ ] **Step 4: Wire route and sidebar**

Modify `frontend/src/App.tsx`:

```tsx
import { Transcribe } from './pages/Transcribe'
```

Add:

```tsx
<Route path="/transcribe" element={<Transcribe />} />
```

Modify `frontend/src/components/Layout/Sidebar.tsx`:

```ts
{ path: '/transcribe', label: '转录', icon: '○' },
```

- [ ] **Step 5: Run frontend build**

Run:

```bash
cd frontend
npm run build
```

Expected: PASS with TypeScript and Vite build success.

- [ ] **Step 6: Commit Task 4**

```bash
git add frontend/src/services/api.ts frontend/src/store/types.ts frontend/src/store/transcribeSlice.ts frontend/src/store/index.ts frontend/src/pages/Transcribe.tsx frontend/src/App.tsx frontend/src/components/Layout/Sidebar.tsx
git commit -m "feat(asr): add transcription page"
```

---

### Task 5: Documentation, Full Verification, and Manual QA

**Files:**
- Modify: `CLAUDE.md`
- Modify: `backend/BACKEND_CONVENTIONS.md`
- Modify: `frontend/FRONTEND_CONVENTIONS.md`

- [ ] **Step 1: Update CLAUDE.md**

Update the project structure to include:

```text
routes/transcribe.js
services/asr.js
services/media.js
services/mimoApiClient.js
```

Update the external API section so MiMo ASR says it is implemented through `services/asr.js`, direct to `https://api.xiaomimimo.com/v1`, reusing `mimo_tts_api_key`.

- [ ] **Step 2: Update backend conventions**

In `backend/BACKEND_CONVENTIONS.md`, add the route and services to the structure and service responsibility table:

```text
transcribe.js: ASR 上传转录路由
asr.js: MiMo ASR 服务
media.js: 上传媒体转 ASR data URL
mimoApiClient.js: MiMo 标准 API HTTP client
```

Keep the statement that routes do not call external APIs directly.

- [ ] **Step 3: Update frontend conventions**

In `frontend/FRONTEND_CONVENTIONS.md`, add `/transcribe` to the route table:

```text
/transcribe | Transcribe | 音视频上传转录
```

Add the page to the project structure list under `pages/`.

- [ ] **Step 4: Run backend tests**

Run:

```bash
cd backend
npm test -- --runInBand
```

Expected: PASS. If tests fail because `ffmpeg-static` did not install, fix dependency installation before proceeding. If unrelated pre-existing tests fail, capture the failing names and output before deciding whether to continue.

- [ ] **Step 5: Run frontend build**

Run:

```bash
cd frontend
npm run build
```

Expected: PASS.

- [ ] **Step 6: Start dev servers for manual QA**

Run backend:

```bash
cd backend
npm run dev
```

Run frontend in a second shell:

```bash
cd frontend
npm run dev
```

Expected URLs:

- Backend: `http://localhost:3001`
- Frontend: `http://localhost:5173`

- [ ] **Step 7: Browser QA**

Open `http://localhost:5173/transcribe` in the in-app browser. Verify:

- Sidebar has a "转录" item.
- Upload card renders without text overlap at desktop width.
- Language select and button are visible.
- Empty submit shows "请上传需要转录的音频或视频文件".
- Textarea accepts typed text.
- "导入稿件" navigates to `/editor` and the script preview contains the imported text.

- [ ] **Step 8: Commit Task 5**

```bash
git add CLAUDE.md backend/BACKEND_CONVENTIONS.md frontend/FRONTEND_CONVENTIONS.md
git commit -m "docs: document ASR transcription workflow"
```

---

## Self-Review

Spec coverage:

- Independent `/transcribe` page: Task 4.
- Audio/video upload: Tasks 2, 3, 4.
- Language selection: Tasks 3 and 4.
- MiMo ASR call: Tasks 1 and 3.
- Editable result, copy, import to editor: Task 4.
- Media service and MiMo client boundaries: Tasks 1 and 2.
- No LiteLLM, no LLM rewrite, no key rename, no TTS migration: preserved by file structure and task scope.
- Documentation updates: Task 5.
- Verification: Task 5.

Placeholder scan:

- No TBD/TODO/implement-later placeholders are intentionally left in task steps.
- Each code-changing task includes concrete files, code snippets, commands, and expected output.

Type consistency:

- `AsrLanguage`, `TranscriptionResult`, `transcribeMedia`, `transcriptionText`, and `isTranscribing` are introduced in Task 4 before use.
- Backend field name is consistently `media`.
- Route path is consistently `/api/transcribe` backend and `/transcribe` frontend.
