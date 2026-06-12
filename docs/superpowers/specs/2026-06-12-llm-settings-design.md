# LLM 设置、双协议与模型发现设计文档

## 背景

当前项目的 LLM 调用集中在 `backend/src/services/mimo.js`。资讯改写和文本切分都固定使用 Anthropic SDK、固定 baseURL `https://token-plan-cn.xiaomimimo.com/anthropic`、固定模型 `mimo-v2.5`，系统提示词也写死在服务函数中。设置页只能配置 LLM API Key，不能配置 baseURL、协议格式、模型、system prompt 或 thinking 行为。

用户需要在设置界面配置 LLM 请求，并同时支持 OpenAI 兼容 API 与 Anthropic 兼容 API。模型层也需要支持自动获取：用户填入 baseURL 和 API Key 后，后端尝试 OpenAI-compatible `/models` 端点，前端将返回的模型 ID 填入下拉框供选择。

## 目标

- 在设置页新增 LLM 配置组：协议格式、baseURL、模型、改写系统提示词、切分系统提示词、改写 thinking 开关、切分 thinking 开关。
- 后端 LLM 调用根据设置选择 Anthropic 兼容或 OpenAI 兼容请求格式。
- 支持从 baseURL + API Key 自动获取 OpenAI-compatible 模型列表，并在前端下拉选择。
- 保留手动输入模型名能力，自动获取失败不能阻断配置。
- 保持现有默认 MiMo 调用行为：默认协议为 Anthropic，默认 baseURL 为当前 MiMo Anthropic 地址，默认模型为 `mimo-v2.5`。

## 非目标

- 不引入 LiteLLM 或额外网关。
- 不硬编码各厂商模型清单。
- 不引入 OpenAI SDK；OpenAI 兼容请求使用现有 `axios`。
- 不改动 TTS/ASR 的 baseURL 配置，本次只处理 LLM。

## 设置字段

新增 settings key：

| key | 默认值 | 说明 |
| --- | --- | --- |
| `llm_api_format` | `anthropic` | LLM 请求格式，取值 `anthropic` 或 `openai` |
| `llm_base_url` | `https://token-plan-cn.xiaomimimo.com/anthropic` | LLM API baseURL |
| `llm_model` | `mimo-v2.5` | LLM 模型 ID |
| `llm_rewrite_system_prompt` | `你是一位专业的播音稿撰写者。` | 资讯改写 system prompt |
| `llm_split_system_prompt` | `你是一个文本切分助手，只输出 JSON 数组格式。` | 文本切分 system prompt |
| `llm_rewrite_thinking_enabled` | `true` | 改写是否启用 thinking；Anthropic 格式下启用时不传 disabled |
| `llm_split_thinking_enabled` | `false` | 切分是否启用 thinking；默认保持现有 `disabled` 行为 |

旧字段 `mimo_api_key` 继续作为 LLM API Key 使用，避免迁移 API Key 名称带来额外风险。`mimo_tts_api_key` 继续只服务 TTS/ASR。

## 后端设计

### LLM 配置读取

`mimo.js` 增加内部配置读取函数，统一从 settings 表获取上述字段，并对缺失字段使用默认值兜底。`getApiKey('anthropic')` 保留，用于读取 `mimo_api_key`。新增错误消息保持中文，例如 `请先在设置中配置 LLM API Key`。

### Anthropic 兼容调用

Anthropic 格式继续使用 `@anthropic-ai/sdk`：

- `apiKey`: `mimo_api_key`
- `baseURL`: `llm_base_url`
- `defaultHeaders`: `{ 'api-key': apiKey }`
- `model`: `llm_model`
- `system`: 对应任务的 system prompt
- `thinking`: 当对应开关为 `false` 时传 `{ type: 'disabled' }`；为 `true` 时不传该字段，保持当前改写任务的默认行为。

### OpenAI 兼容调用

OpenAI 格式使用 `axios.post()` 调用 chat completions：

- 请求 URL 由 `llm_base_url` 拼出 chat completions endpoint。
- 如果 baseURL 已以 `/chat/completions` 结尾，直接使用。
- 如果 baseURL 路径已包含版本段（如 `/v1`、`/v4`），拼 `/chat/completions`。
- 否则拼 `/v1/chat/completions`。
- headers 同时带：
  - `Authorization: Bearer {apiKey}`
  - `api-key: {apiKey}`
  - `Content-Type: application/json`
- body：
  - `model`: `llm_model`
  - `messages`: `[{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }]`
  - `max_tokens`: 改写 2000，切分 4000

OpenAI-compatible thinking 参数没有统一标准，本次不向 OpenAI 格式请求体发送 thinking 字段。设置页保留 thinking 开关，说明其主要用于 Anthropic 兼容服务。

响应解析优先读取 `choices[0].message.content`。如果为空，抛出 `LLM API 返回内容为空`。

### 模型列表获取

新增后端端点：

`POST /api/settings/llm-models`

请求体：

```json
{
  "baseUrl": "https://example.com/anthropic",
  "apiKey": "sk-...",
  "apiFormat": "openai"
}
```

`apiFormat` 用于后续扩展和日志，本次模型发现始终按 OpenAI-compatible `/models` 探测，因为多数第三方网关在模型列表上实现该格式。

候选 URL 生成规则：

1. 规范化 baseURL：去掉尾部 `/`。
2. 对原始 baseURL 生成：
   - 默认候选：`{baseUrl}/v1/models`
   - 若路径包含版本段 `/v1`、`/v2`、`/v3`、`/v4` 等，再加入 `{baseUrl}/models`
3. 若 baseURL 以已知兼容子路径结尾，剥掉后缀后对父路径重复第 2 步：
   - `/anthropic`
   - `/apps/anthropic`
   - `/api/coding`
   - `/api/coding/paas/v4`
4. 对候选 URL 去重，按生成顺序逐个请求。

请求配置：

- 方法：`GET`
- timeout：15 秒
- headers：
  - `Authorization: Bearer {apiKey}`
  - `api-key: {apiKey}`
  - `User-Agent: tts-broadcast`

成功响应必须兼容 OpenAI 格式：

```json
{
  "data": [
    { "id": "model-a", "owned_by": "provider" }
  ]
}
```

后端返回：

```json
{
  "models": [
    { "id": "model-a", "owned_by": "provider" }
  ],
  "resolvedUrl": "https://example.com/v1/models"
}
```

模型按 `id` 升序排序。若所有候选都失败，返回 400 和中文错误，错误中包含已尝试的 URL 数量，不暴露 API Key。

## 前端设计

`Settings.tsx` 的「API 配置」卡片扩展为 LLM 和 TTS 两个区域。LLM 区域包含：

- LLM API Key
- API 格式选择：`OpenAI 兼容` / `Anthropic 兼容`
- LLM Base URL
- 模型输入和下拉选择
- 「获取模型」按钮
- 改写系统提示词 textarea
- 切分系统提示词 textarea
- 改写 thinking toggle
- 切分 thinking toggle

交互规则：

- 用户修改 baseURL 时，如果 URL 包含 `/anthropic`，自动预选 Anthropic；否则预选 OpenAI。用户手动改过 API 格式后，不再强制覆盖。
- 点击「获取模型」时使用当前表单中的 `mimo_api_key` 和 `llm_base_url`，不要求先保存。
- 成功后将模型列表保存在页面局部 state，并展示下拉框；用户选择模型后写入 `formData.llm_model`。
- 获取失败显示 `bg-pink/10` 错误提示，手动输入仍可用。
- 保存按钮继续走现有 `updateSettings`。

## 测试策略

后端使用 TDD：

- `backend/tests/services/mimo.test.js`
  - Anthropic 格式使用 settings 中的 baseURL、model、system prompt 和 thinking disabled 设置。
  - OpenAI 格式调用正确的 chat completions URL、headers、payload，并解析 `choices[0].message.content`。
  - OpenAI 格式空响应抛出中文错误。
- `backend/tests/routes/settings.test.js`
  - `POST /api/settings/llm-models` 能从 OpenAI 格式响应返回排序模型。
  - baseURL 已含版本段时尝试 `{baseUrl}/models`。
  - baseURL 以 `/anthropic` 结尾时会尝试剥父路径后的 `/v1/models`。
  - 所有候选失败时返回 400。

前端验证：

- `npm run build` 保证新增设置字段和 API 类型通过 TypeScript。

完整验证：

- 后端：`cd backend && npm test -- --runInBand`
- 前端：`cd frontend && npm run build`

## 文档更新

实现时同步更新：

- `CLAUDE.md`：外部 API、关键开发模式、settings 字段说明。
- `backend/BACKEND_CONVENTIONS.md`：`mimo.js` 职责更新为双协议 LLM + 模型发现。
- `frontend/FRONTEND_CONVENTIONS.md`：Settings 页面 API 配置区说明。

## 自检

- 本设计范围聚焦在 LLM 设置、双协议请求与模型发现，没有包含 TTS/ASR baseURL。
- 默认值保持现有 MiMo Anthropic 行为，不破坏已有用户。
- 模型发现仅依赖 OpenAI-compatible `/models`，失败可手动输入模型名。
- OpenAI 请求不发送未标准化的 thinking 参数，避免兼容服务报错。
