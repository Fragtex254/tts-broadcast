# LLM Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configurable LLM protocol/baseURL/model/system prompts/thinking controls plus OpenAI-compatible model discovery.

**Architecture:** Keep `backend/src/services/mimo.js` as the LLM boundary, but split it internally into config reading, Anthropic calls, OpenAI-compatible calls, endpoint URL builders, and model discovery helpers. Extend the existing generic settings persistence and the Settings page instead of adding new tables or routes outside the settings resource.

**Tech Stack:** Node.js, Express 5, better-sqlite3, Anthropic SDK, axios, Jest, React 19, TypeScript, Zustand, Vite.

---

## File Map

- Modify: `backend/src/db/index.js` — add default LLM settings.
- Modify: `backend/src/services/mimo.js` — read LLM config, route Anthropic/OpenAI calls, re-export model discovery.
- Create: `backend/src/services/llmModels.js` — discover OpenAI-compatible model lists via candidate `/models` endpoints.
- Modify: `backend/src/routes/settings.js` — add `POST /api/settings/llm-models`.
- Modify: `backend/tests/services/mimo.test.js` — add red tests for configurable Anthropic calls and OpenAI-compatible calls.
- Modify: `backend/tests/routes/settings.test.js` — add red tests for model discovery endpoint.
- Modify: `frontend/src/store/types.ts` — add settings fields and model discovery action types.
- Modify: `frontend/src/store/defaults.ts` — add default settings values.
- Modify: `frontend/src/services/api.ts` — add `settingsApi.fetchLlmModels`.
- Modify: `frontend/src/store/settingsSlice.ts` — expose `fetchLlmModels`.
- Modify: `frontend/src/pages/Settings.tsx` — extend API config UI.
- Modify: `CLAUDE.md`, `backend/BACKEND_CONVENTIONS.md`, `frontend/FRONTEND_CONVENTIONS.md` — document the new LLM configuration behavior.

---

### Task 1: Backend LLM Configuration and Dual Protocol

**Files:**
- Modify: `backend/tests/services/mimo.test.js`
- Modify: `backend/src/db/index.js`
- Modify: `backend/src/services/mimo.js`

- [ ] **Step 1: Write failing service tests**

Add tests in `backend/tests/services/mimo.test.js` that insert these settings before invoking `mimo.rewriteToScript()` and `mimo.splitScript()`:

```js
db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_api_format', '"anthropic"');
db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_base_url', '"https://custom.example/anthropic"');
db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_model', '"custom-model"');
db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_rewrite_system_prompt', '"自定义改写 system"');
db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_split_system_prompt', '"自定义切分 system"');
db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_rewrite_thinking_enabled', 'false');
db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_split_thinking_enabled', 'false');
```

Assert:

```js
expect(Anthropic).toHaveBeenCalledWith(expect.objectContaining({
  apiKey: 'test-key',
  baseURL: 'https://custom.example/anthropic',
  defaultHeaders: { 'api-key': 'test-key' },
}));
expect(mockMessagesCreate).toHaveBeenCalledWith(expect.objectContaining({
  model: 'custom-model',
  system: '自定义改写 system',
  thinking: { type: 'disabled' },
}));
```

Mock axios and add an OpenAI-compatible rewrite test:

```js
db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_api_format', '"openai"');
db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_base_url', '"https://openai.example/v1"');
db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_model', '"gpt-compatible"');
db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_rewrite_system_prompt', '"OpenAI 改写 system"');
axios.post.mockResolvedValue({ data: { choices: [{ message: { content: '改写结果' } }] } });
```

Assert URL `https://openai.example/v1/chat/completions`, bearer/api-key headers, and system/user messages.

- [ ] **Step 2: Run failing service tests**

Run: `cd backend && npm test -- --runInBand tests/services/mimo.test.js`

Expected: FAIL because `mimo.js` does not yet read the new settings or support OpenAI-compatible calls.

- [ ] **Step 3: Add default LLM settings**

Modify `backend/src/db/index.js` `defaultSettings`:

```js
llm_api_format: 'anthropic',
llm_base_url: 'https://token-plan-cn.xiaomimimo.com/anthropic',
llm_model: 'mimo-v2.5',
llm_rewrite_system_prompt: '你是一位专业的播音稿撰写者。',
llm_split_system_prompt: '你是一个文本切分助手，只输出 JSON 数组格式。',
llm_rewrite_thinking_enabled: true,
llm_split_thinking_enabled: false,
```

- [ ] **Step 4: Implement minimal service support**

Modify `backend/src/services/mimo.js`:

- Add settings defaults and `getSettingValue(key, fallback)`.
- Add `getLlmConfig()`.
- Change `createClient()` to accept config and use `config.baseUrl`.
- Add `createThinkingOption(enabled)` returning `undefined` when enabled and `{ type: 'disabled' }` when disabled.
- Add `createOpenAiChatCompletionsUrl(baseUrl)`.
- Add `createAnthropicMessage({ prompt, systemPrompt, maxTokens, thinkingEnabled })`.
- Add `createOpenAiMessage({ prompt, systemPrompt, maxTokens })`.
- Update `rewriteToScript()` and `splitScript()` to select implementation based on `llm_api_format`.

- [ ] **Step 5: Run service tests**

Run: `cd backend && npm test -- --runInBand tests/services/mimo.test.js`

Expected: PASS for `mimo.test.js`.

---

### Task 2: Backend Model Discovery Endpoint

**Files:**
- Modify: `backend/tests/routes/settings.test.js`
- Modify: `backend/src/services/mimo.js`
- Modify: `backend/src/routes/settings.js`

- [ ] **Step 1: Write failing route tests**

Mock `axios.get` and add tests for:

```js
POST /api/settings/llm-models
```

Cases:

- `baseUrl: 'https://provider.example'` returns sorted models from `https://provider.example/v1/models`.
- `baseUrl: 'https://provider.example/v4'` succeeds on `https://provider.example/v4/models`.
- `baseUrl: 'https://provider.example/anthropic'` first fails on child candidates and succeeds on `https://provider.example/v1/models`.
- all candidates fail returns `400` with `{ error }`.

- [ ] **Step 2: Run failing route tests**

Run: `cd backend && npm test -- --runInBand tests/routes/settings.test.js`

Expected: FAIL because the endpoint does not exist.

- [ ] **Step 3: Implement model discovery helpers**

Add exports in `backend/src/services/mimo.js`:

```js
buildModelEndpointCandidates(baseUrl)
fetchModelsForConfig({ baseUrl, apiKey })
```

`fetchModelsForConfig` uses `axios.get(candidate, { headers, timeout: 15000 })`, parses `data.data`, sorts by `id`, and returns `{ models, resolvedUrl }`.

- [ ] **Step 4: Add settings route**

In `backend/src/routes/settings.js`, add:

```js
router.post('/llm-models', async (req, res) => {
  try {
    const { baseUrl, apiKey } = req.body || {};
    if (!baseUrl || typeof baseUrl !== 'string') {
      return res.status(400).json({ error: '请提供 LLM Base URL' });
    }
    const keyToUse = typeof apiKey === 'string' ? apiKey.trim() : '';
    const result = await mimo.fetchModelsForConfig({ baseUrl: baseUrl.trim(), apiKey: keyToUse });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message || '获取模型列表失败' });
  }
});
```

- [ ] **Step 5: Run route tests**

Run: `cd backend && npm test -- --runInBand tests/routes/settings.test.js`

Expected: PASS for `settings.test.js`.

---

### Task 3: Frontend Store and API Contract

**Files:**
- Modify: `frontend/src/store/types.ts`
- Modify: `frontend/src/store/defaults.ts`
- Modify: `frontend/src/services/api.ts`
- Modify: `frontend/src/store/settingsSlice.ts`

- [ ] **Step 1: Add types**

Add:

```ts
export type LlmApiFormat = 'openai' | 'anthropic';

export interface LlmModelOption {
  id: string;
  owned_by?: string;
}
```

Extend `Settings` with the seven new fields. Extend `AppState` with:

```ts
fetchLlmModels: (data: { baseUrl: string; apiKey?: string; apiFormat?: LlmApiFormat }) => Promise<{
  models: LlmModelOption[];
  resolvedUrl?: string;
}>;
```

- [ ] **Step 2: Add defaults**

Update `frontend/src/store/defaults.ts` with the same defaults as backend.

- [ ] **Step 3: Add API method**

Update `frontend/src/services/api.ts` Settings interface and add:

```ts
fetchLlmModels: (data: { baseUrl: string; apiKey?: string; apiFormat?: 'openai' | 'anthropic' }) =>
  api.post('/settings/llm-models', data),
```

- [ ] **Step 4: Add store action**

Update `createSettingsSlice()` Pick list and return object to expose `fetchLlmModels`, returning `response.data`.

- [ ] **Step 5: Run frontend build as type check**

Run: `cd frontend && npm run build`

Expected: TypeScript may fail until `Settings.tsx` is updated in Task 4. If it fails only for missing UI usage of new store fields, continue to Task 4.

---

### Task 4: Settings Page UI

**Files:**
- Modify: `frontend/src/pages/Settings.tsx`

- [ ] **Step 1: Add local state and helpers**

Add local state:

```ts
const [modelOptions, setModelOptions] = useState<LlmModelOption[]>([]);
const [isFetchingModels, setIsFetchingModels] = useState(false);
const [modelFetchResult, setModelFetchResult] = useState<{ error?: string; resolvedUrl?: string } | null>(null);
const [apiFormatTouched, setApiFormatTouched] = useState(false);
```

Add helpers:

```ts
const inferApiFormat = (baseUrl: string): 'openai' | 'anthropic' =>
  baseUrl.toLowerCase().includes('/anthropic') ? 'anthropic' : 'openai';
```

- [ ] **Step 2: Extend API config card**

Add controls for `llm_api_format`, `llm_base_url`, `llm_model`, model fetch, rewrite/split system prompts, and rewrite/split thinking toggles. Keep existing TTS API Key controls.

- [ ] **Step 3: Add fetch model handler**

Add:

```ts
const handleFetchModels = async () => {
  setIsFetchingModels(true);
  setModelFetchResult(null);
  try {
    const result = await fetchLlmModels({
      baseUrl: formData.llm_base_url,
      apiKey: formData.mimo_api_key,
      apiFormat: formData.llm_api_format,
    });
    setModelOptions(result.models);
    setModelFetchResult({ resolvedUrl: result.resolvedUrl });
  } catch (e) {
    setModelFetchResult({ error: (e as Error).message || '获取模型列表失败' });
  } finally {
    setIsFetchingModels(false);
  }
};
```

- [ ] **Step 4: Run frontend build**

Run: `cd frontend && npm run build`

Expected: PASS.

---

### Task 5: Documentation and Full Verification

**Files:**
- Modify: `CLAUDE.md`
- Modify: `backend/BACKEND_CONVENTIONS.md`
- Modify: `frontend/FRONTEND_CONVENTIONS.md`

- [ ] **Step 1: Update docs**

Document:

- LLM settings fields.
- `mimo.js` now supports Anthropic/OpenAI-compatible LLM calls.
- Settings page model discovery uses OpenAI-compatible `/models`.

- [ ] **Step 2: Run backend tests**

Run: `cd backend && npm test -- --runInBand`

Expected: PASS.

- [ ] **Step 3: Run frontend build**

Run: `cd frontend && npm run build`

Expected: PASS.

- [ ] **Step 4: Review diff**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; changed files match this plan.

---

## Self-Review

- Spec coverage: dual protocol calls, configurable prompts, thinking controls, baseURL/model settings, model discovery endpoint, Settings UI, tests, and docs are all mapped to tasks.
- Placeholder scan: no TODO/TBD placeholders are used as implementation instructions.
- Type consistency: frontend names match backend settings keys and API payload names.
