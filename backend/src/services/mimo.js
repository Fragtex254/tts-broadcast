const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');
const db = require('../db');
const llmModels = require('./llmModels');
const llmQueue = require('./llmQueue');
const { createScopedLogger } = require('./logger');
const {
  AUTO_SEGMENT_MIN_LENGTH,
  AUTO_SEGMENT_MAX_LENGTH,
  normalizeAutoSegmentTexts
} = require('../utils/segmentText');

const logger = createScopedLogger('mimo-service');

const DEFAULT_LLM_SETTINGS = {
  llm_api_format: 'anthropic',
  llm_base_url: 'https://token-plan-cn.xiaomimimo.com/anthropic',
  llm_model: 'mimo-v2.5',
  llm_rewrite_system_prompt: '你是一位专业的播音稿撰写者。',
  llm_split_system_prompt: '你是一个文本切分助手，只输出 JSON 数组格式。',
  llm_rewrite_thinking_enabled: true,
  llm_split_thinking_enabled: false,
};

const LLM_REQUEST_TIMEOUT_MS = 120000;
const STYLE_TAG_SUGGEST_BATCH_SIZE = 10;
const SEGMENT_AUDIO_TAG_SUGGEST_BATCH_SIZE = 6;
const SPLIT_SCRIPT_CHUNK_LENGTH = 2500;
const FORMAT_TRANSCRIPTION_CHUNK_LENGTH = 1200;
const FORMAT_TRANSCRIPTION_MIN_RETRY_LENGTH = 260;

/**
 * 读取设置值，缺失或格式错误时使用默认值
 * @param {string} key - 设置 key
 * @param {*} fallback - 默认值
 * @returns {*} 设置值
 */
function getSettingValue(key, fallback) {
  const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!setting) return fallback;
  try {
    const value = JSON.parse(setting.value);
    return value === undefined || value === null || value === '' ? fallback : value;
  } catch (e) {
    return fallback;
  }
}

/**
 * 获取 API Key
 * @param {string} type - Key 类型: 'anthropic' 或 'tts'
 * @returns {string} API Key
 */
function getApiKey(type = 'anthropic') {
  const keyName = type === 'tts' ? 'mimo_tts_api_key' : 'mimo_api_key';
  const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get(keyName);
  if (!setting) throw new Error(type === 'tts' ? `请先在设置中配置 ${keyName}` : '请先在设置中配置 LLM API Key');
  let key;
  try {
    key = JSON.parse(setting.value);
  } catch (e) {
    throw new Error(`${keyName} 配置格式错误`);
  }
  if (!key) throw new Error(type === 'tts' ? `请先在设置中配置 ${keyName}` : '请先在设置中配置 LLM API Key');
  return key;
}

/**
 * 获取 LLM 配置
 * @param {Object} [override] - 临时覆盖配置
 * @returns {Object} LLM 配置
 */
function getLlmConfig(override = {}) {
  const apiFormat = override.apiFormat || getSettingValue('llm_api_format', DEFAULT_LLM_SETTINGS.llm_api_format);
  return {
    apiFormat: apiFormat === 'openai' ? 'openai' : 'anthropic',
    baseUrl: override.baseUrl || getSettingValue('llm_base_url', DEFAULT_LLM_SETTINGS.llm_base_url),
    model: override.model || getSettingValue('llm_model', DEFAULT_LLM_SETTINGS.llm_model),
    rewriteSystemPrompt: getSettingValue(
      'llm_rewrite_system_prompt',
      DEFAULT_LLM_SETTINGS.llm_rewrite_system_prompt
    ),
    splitSystemPrompt: getSettingValue(
      'llm_split_system_prompt',
      DEFAULT_LLM_SETTINGS.llm_split_system_prompt
    ),
    rewriteThinkingEnabled: Boolean(getSettingValue(
      'llm_rewrite_thinking_enabled',
      DEFAULT_LLM_SETTINGS.llm_rewrite_thinking_enabled
    )),
    splitThinkingEnabled: Boolean(getSettingValue(
      'llm_split_thinking_enabled',
      DEFAULT_LLM_SETTINGS.llm_split_thinking_enabled
    )),
  };
}

/**
 * 创建 Anthropic 客户端
 * @param {string} [apiKeyOverride] - 临时验证用 API Key，不传则读取已保存设置
 * @param {Object} [configOverride] - 临时 LLM 配置
 * @returns {Anthropic} 客户端实例
 */
function createClient(apiKeyOverride, configOverride) {
  const config = configOverride || getLlmConfig();
  const apiKey = apiKeyOverride || getApiKey('anthropic');
  return new Anthropic({
    apiKey,
    baseURL: config.baseUrl,
    defaultHeaders: { 'api-key': apiKey },
    timeout: LLM_REQUEST_TIMEOUT_MS
  });
}

/**
 * 创建 thinking 参数
 * @param {boolean} enabled - 是否启用 thinking
 * @returns {Object|undefined} Anthropic thinking 参数
 */
function createThinkingOption(enabled) {
  return enabled ? undefined : { type: 'disabled' };
}

function isMiniMaxOpenAiConfig(config) {
  return /minimax/i.test(String(config.baseUrl || '')) || /minimax/i.test(String(config.model || ''));
}

/**
 * 拼接 OpenAI chat completions URL
 * @param {string} baseUrl - LLM baseURL
 * @returns {string} chat completions URL
 */
function createOpenAiChatCompletionsUrl(baseUrl) {
  const normalized = String(baseUrl || '').replace(/\/+$/, '');
  if (normalized.endsWith('/chat/completions')) return normalized;
  if (/\/v\d+(?:\/.*)?$/.test(new URL(normalized).pathname)) {
    return `${normalized}/chat/completions`;
  }
  return `${normalized}/v1/chat/completions`;
}

/**
 * 从 Anthropic 响应中提取文本
 * @param {Object} message - Anthropic 响应
 * @returns {string} 文本
 */
function extractAnthropicText(message) {
  const textBlock = message.content.find(b => b.type === 'text');
  if (!textBlock?.text) {
    throw new Error('LLM API 返回内容为空');
  }
  return textBlock.text;
}

/**
 * 从 OpenAI 兼容响应中提取文本
 * @param {Object} response - axios 响应
 * @returns {string} 文本
 */
function extractOpenAiText(response) {
  const text = response?.data?.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error('LLM API 返回内容为空');
  }
  return text;
}

function getErrorStatus(error) {
  return error?.status || error?.response?.status || error?.response?.data?.error?.code;
}

function getProviderStatusCode(error) {
  const explicit = error?.providerStatusCode
    || error?.response?.data?.base_resp?.status_code
    || error?.response?.data?.error?.code;
  if (explicit !== undefined && explicit !== null && explicit !== '') return explicit;
  const statusMessage = error?.response?.data?.base_resp?.status_msg
    || error?.response?.data?.error?.message
    || error?.response?.data?.message;
  const match = String(statusMessage || '').match(/\((\d{4,5})\)/);
  return match ? Number(match[1]) : undefined;
}

function getProviderErrorMessage(error) {
  const data = error?.response?.data;
  const candidates = [
    data?.error?.message,
    data?.message,
    data?.msg,
    data?.base_resp?.status_msg,
    typeof data === 'string' ? data : '',
  ];
  return String(candidates.find((value) => typeof value === 'string' && value.trim()) || '').trim();
}

function annotateOpenAiProviderError(error) {
  const providerStatusCode = getProviderStatusCode(error);
  if (providerStatusCode !== undefined && providerStatusCode !== null && providerStatusCode !== '') {
    error.providerStatusCode = providerStatusCode;
  }
  if (providerStatusCode === 1002 || providerStatusCode === '1002') {
    error.status = 429;
    error.isRateLimit = true;
  }
  return error;
}

function createLlmError(message, { code, status, providerStatusCode } = {}) {
  const mapped = new Error(message);
  if (code) mapped.code = code;
  if (status) mapped.status = status;
  if (providerStatusCode !== undefined && providerStatusCode !== null && providerStatusCode !== '') {
    mapped.providerStatusCode = providerStatusCode;
  }
  return mapped;
}

function mapLlmError(error) {
  const status = getErrorStatus(error);
  const providerStatusCode = getProviderStatusCode(error);
  const providerMessage = getProviderErrorMessage(error);
  const message = providerMessage || String(error?.message || '');
  if (status) {
    logger.error({
      err: error,
      status,
      providerStatusCode,
      providerMessage: providerMessage.slice(0, 500),
    }, 'LLM API 请求失败');
  }
  if ((status === 400 || status === '400' || status === 422 || status === '422')
    && /image|vision|media|multimodal|content block|unsupported|input_image|image_url|图片|图像|视觉/i.test(message)) {
    return new Error('当前 LLM 模型或接口不支持图片输入，请在设置中切换到原生支持视觉的模型后重试');
  }
  if (status === 401 || status === '401' || message.includes('401') || message.includes('invalid_key')) {
    return new Error('LLM API Key 无效或已过期，请在设置中重新配置');
  }
  if (status === 403 || status === '403') {
    return new Error('LLM API 无权访问当前模型或服务，请检查 Key 权限与模型配置');
  }
  if (status === 429 || status === '429') {
    return new Error('LLM API 请求过于频繁，请稍后重试');
  }
  if (providerStatusCode === 1026 || providerStatusCode === '1026') {
    return createLlmError('LLM API 拒绝了输入中的敏感内容，请调整原文或改用其他模型', {
      code: 'LLM_INPUT_SENSITIVE', status, providerStatusCode
    });
  }
  if (providerStatusCode === 1027 || providerStatusCode === '1027'
    || /output.*sensitive|输出内容涉敏/i.test(providerMessage)) {
    return createLlmError('LLM 输出触发内容安全过滤，正在尝试用中性表述重新生成', {
      code: 'LLM_OUTPUT_SENSITIVE', status, providerStatusCode
    });
  }
  if (providerStatusCode === 1039 || providerStatusCode === '1039') {
    return createLlmError('LLM 请求超过 Token 限制，请缩短输入或输出长度', {
      code: 'LLM_TOKEN_LIMIT', status, providerStatusCode
    });
  }
  if (status === 422 || status === '422') {
    const detail = providerMessage ? `：${providerMessage}` : '';
    return new Error(`LLM API 拒绝了当前请求（422）${detail}`);
  }
  if (error?.code === 'ECONNABORTED') {
    return createLlmError('LLM API 请求超时，请稍后重试', { code: 'LLM_TIMEOUT' });
  }
  if (error?.code === 'ECONNREFUSED' || error?.code === 'ENOTFOUND' || error?.code === 'EHOSTUNREACH') {
    return new Error('无法连接 LLM API，请检查 Base URL 或网络');
  }
  return error;
}

function stripThinkingContent(text) {
  return String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^\s*<\/think>/i, '')
    .trim();
}

function extractJsonArrayText(text) {
  let jsonStr = stripThinkingContent(text);
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  const arrayStart = jsonStr.indexOf('[');
  const arrayEnd = jsonStr.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    return jsonStr.slice(arrayStart, arrayEnd + 1).trim();
  }
  return jsonStr.trim();
}

function extractJsonObjectText(text) {
  let jsonStr = stripThinkingContent(text);
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  const objectStart = jsonStr.indexOf('{');
  const objectEnd = jsonStr.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    return jsonStr.slice(objectStart, objectEnd + 1).trim();
  }
  return jsonStr.trim();
}

function splitTextForFormatting(text, maxLength = FORMAT_TRANSCRIPTION_CHUNK_LENGTH) {
  const source = String(text || '').trim();
  if (source.length <= maxLength) return [source];

  const chunks = [];
  let remaining = source;
  while (remaining.length > maxLength) {
    const window = remaining.slice(0, maxLength);
    const boundary = Math.max(
      window.lastIndexOf('。'),
      window.lastIndexOf('！'),
      window.lastIndexOf('？'),
      window.lastIndexOf('\n')
    );
    const splitAt = boundary >= Math.floor(maxLength * 0.6) ? boundary + 1 : maxLength;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function normalizeForCoverage(text) {
  return String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/[\s\u3000，。！？、；：,.!?;: “‘”"'\-—（）()\[\]【】《》<>]/g, '')
    .trim();
}

function assertFormattedTextComplete(sourceText, formattedText) {
  const source = normalizeForCoverage(sourceText);
  const formatted = normalizeForCoverage(formattedText);
  if (!source || !formatted) return;

  const tailLength = Math.min(24, source.length);
  const tail = source.slice(-tailLength);
  if (tail.length >= 8 && !formatted.includes(tail)) {
    throw new Error('AI 排版结果疑似不完整，请重试或先缩短文本后分段排版');
  }
}

function isTextTailCovered(sourceText, targetText) {
  const source = normalizeForCoverage(sourceText);
  const target = normalizeForCoverage(targetText);
  if (!source || !target) return true;

  const tailLength = Math.min(24, source.length);
  const tail = source.slice(-tailLength);
  return tail.length < 8 || target.includes(tail);
}

function splitTextInHalfForFormatting(text) {
  const source = String(text || '').trim();
  const middle = Math.floor(source.length / 2);
  const leftWindow = source.slice(0, middle);
  const rightWindow = source.slice(middle);
  const leftBoundary = Math.max(
    leftWindow.lastIndexOf('。'),
    leftWindow.lastIndexOf('！'),
    leftWindow.lastIndexOf('？'),
    leftWindow.lastIndexOf('\n')
  );
  const rightBoundaryCandidates = ['。', '！', '？', '\n']
    .map((mark) => rightWindow.indexOf(mark))
    .filter((index) => index >= 0);
  const rightBoundary = rightBoundaryCandidates.length > 0
    ? middle + Math.min(...rightBoundaryCandidates) + 1
    : -1;

  let splitAt = middle;
  if (leftBoundary >= Math.floor(source.length * 0.3)) {
    splitAt = leftBoundary + 1;
  } else if (rightBoundary > 0 && rightBoundary <= Math.floor(source.length * 0.7)) {
    splitAt = rightBoundary;
  }

  return [
    source.slice(0, splitAt).trim(),
    source.slice(splitAt).trim()
  ].filter(Boolean);
}

async function formatTranscriptionChunk(chunk) {
  const prompt = `你是一个严谨的中文转录稿编辑。请把下面的 ASR 转录文本整理成适合阅读和后续编辑的自然段。

要求：
1. 只做标点、换行和自然段排版，可修正明显的口语断句错误
2. 不要改写事实、不要增删信息、不要总结
3. 保留专有名词、数字、英文和原始顺序
4. 每段围绕一个完整语义，段落之间用一个空行分隔
5. 不要使用 Markdown 标题、列表、加粗或引用符号
6. 不要输出思考过程、解释、分析或前后缀
7. 只输出排版后的正文

转录文本：
${chunk}`;

  const formatted = await createLlmMessage({
    prompt,
    systemPrompt: '你是一个转录稿排版助手，只输出排版后的正文。',
    maxTokens: 4000,
    thinkingEnabled: false
  });

  const chunkResult = stripThinkingContent(formatted);
  if (!chunkResult) {
    throw new Error('AI 排版结果为空');
  }
  assertFormattedTextComplete(chunk, chunkResult);
  return chunkResult;
}

async function formatTranscriptionChunkWithRetry(chunk) {
  try {
    return await formatTranscriptionChunk(chunk);
  } catch (error) {
    const message = String(error?.message || '');
    if (!message.includes('AI 排版结果疑似不完整') || chunk.length <= FORMAT_TRANSCRIPTION_MIN_RETRY_LENGTH) {
      throw error;
    }

    const parts = splitTextInHalfForFormatting(chunk);
    if (parts.length < 2) throw error;
    const results = [];
    for (const part of parts) {
      results.push(await formatTranscriptionChunkWithRetry(part));
    }
    return results.join('\n\n');
  }
}

function fallbackStyleTag(text, allowedTags) {
  const allowed = new Set(allowedTags);
  const value = String(text || '');
  if (allowed.has('惊讶') && /没想到|竟然|突然|震惊|意外|惊人|出乎/.test(value)) return '惊讶';
  if (allowed.has('兴奋') && /发布|突破|上线|提升|成功|灿烂|笃定|烈日|未来/.test(value)) return '兴奋';
  if (allowed.has('严肃') && /战争|危机|饥荒|压力|管控|失败|风险|寒冷|死亡|困境/.test(value)) return '严肃';
  if (allowed.has('温柔') && /细雨|温暖|湿润|春水|听雨|轻轻|柔和|西湖/.test(value)) return '温柔';
  if (allowed.has('深沉') && /历史|文明|王朝|命运|悲歌|大雪|正统|文学|地理/.test(value)) return '深沉';
  if (allowed.has('干练') && value.length < 28) return '干练';
  if (allowed.has('平静')) return '平静';
  return allowedTags[0] || '';
}

function isRecoverableStructuredOutputError(error) {
  const status = getErrorStatus(error);
  const message = String(error?.message || error?.response?.data?.error?.message || '');
  return status === 422 || status === '422'
    || message.includes('数量与句子数量不一致')
    || message.includes('数量与段落数量不一致')
    || message.includes('解析失败')
    || message.includes('格式不正确');
}

/**
 * 调用 Anthropic 兼容 LLM
 * @param {Object} params
 * @param {string} params.prompt - 用户提示词
 * @param {string} params.systemPrompt - 系统提示词
 * @param {number} params.maxTokens - 最大 token 数
 * @param {boolean} params.thinkingEnabled - 是否启用 thinking
 * @param {Object} params.config - LLM 配置
 * @param {string} [params.apiKeyOverride] - 临时 API Key
 * @returns {Promise<string>} 文本结果
 */
async function createAnthropicMessage({ prompt, systemPrompt, maxTokens, thinkingEnabled, config, apiKeyOverride }) {
  const client = createClient(apiKeyOverride, config);
  const thinking = createThinkingOption(thinkingEnabled);
  const payload = {
    model: config.model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [
      { role: 'user', content: prompt }
    ]
  };
  if (thinking) payload.thinking = thinking;

  const message = await client.messages.create(payload);
  return extractAnthropicText(message);
}

/**
 * 调用 OpenAI 兼容 LLM
 * @param {Object} params
 * @param {string} params.prompt - 用户提示词
 * @param {string} params.systemPrompt - 系统提示词
 * @param {number} params.maxTokens - 最大 token 数
 * @param {Object} params.config - LLM 配置
 * @param {string} [params.apiKeyOverride] - 临时 API Key
 * @returns {Promise<string>} 文本结果
 */
async function createOpenAiMessage({ prompt, systemPrompt, maxTokens, config, apiKeyOverride }) {
  const apiKey = apiKeyOverride || getApiKey('anthropic');
  const payload = {
    model: config.model,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ]
  };
  if (isMiniMaxOpenAiConfig(config)) {
    payload.thinking = createThinkingOption(false);
  }

  let response;
  try {
    response = await axios.post(createOpenAiChatCompletionsUrl(config.baseUrl), payload, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'api-key': apiKey,
        'Content-Type': 'application/json'
      },
      timeout: LLM_REQUEST_TIMEOUT_MS
    });
  } catch (error) {
    throw annotateOpenAiProviderError(error);
  }

  return extractOpenAiText(response);
}

async function createAnthropicVisionMessage({ prompt, systemPrompt, maxTokens, config, imageBuffer, mimeType }) {
  const client = createClient(undefined, config);
  const message = await client.messages.create({
    model: config.model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimeType,
              data: imageBuffer.toString('base64'),
            },
          },
          { type: 'text', text: prompt },
        ],
      },
    ],
    thinking: createThinkingOption(false),
  });
  return extractAnthropicText(message);
}

async function createOpenAiVisionMessage({ prompt, systemPrompt, maxTokens, config, imageBuffer, mimeType }) {
  const apiKey = getApiKey('anthropic');
  const payload = {
    model: config.model,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${imageBuffer.toString('base64')}`,
            },
          },
        ],
      },
    ],
  };
  if (isMiniMaxOpenAiConfig(config)) {
    payload.thinking = createThinkingOption(false);
  }

  let response;
  try {
    response = await axios.post(createOpenAiChatCompletionsUrl(config.baseUrl), payload, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'api-key': apiKey,
        'Content-Type': 'application/json'
      },
      timeout: LLM_REQUEST_TIMEOUT_MS
    });
  } catch (error) {
    throw annotateOpenAiProviderError(error);
  }

  return extractOpenAiText(response);
}

/**
 * 调用当前配置的 LLM
 * @param {Object} params
 * @param {string} params.prompt - 用户提示词
 * @param {string} params.systemPrompt - 系统提示词
 * @param {number} params.maxTokens - 最大 token 数
 * @param {boolean} params.thinkingEnabled - 是否启用 thinking
 * @param {string} [params.apiKeyOverride] - 临时 API Key
 * @param {Object} [params.configOverride] - 临时 LLM 配置
 * @returns {Promise<string>} 文本结果
 */
async function createLlmMessage({ prompt, systemPrompt, maxTokens, thinkingEnabled, apiKeyOverride, configOverride }) {
  try {
    const config = getLlmConfig(configOverride);
    return await llmQueue.enqueueLlm({ prompt, systemPrompt, maxTokens }, async () => {
      if (config.apiFormat === 'openai') {
        return createOpenAiMessage({ prompt, systemPrompt, maxTokens, config, apiKeyOverride });
      }
      return createAnthropicMessage({ prompt, systemPrompt, maxTokens, thinkingEnabled, config, apiKeyOverride });
    });
  } catch (error) {
    throw mapLlmError(error);
  }
}

async function createVisionMessage({ prompt, systemPrompt, maxTokens, imageBuffer, mimeType }) {
  try {
    const config = getLlmConfig();
    return await llmQueue.enqueueLlm({ prompt, systemPrompt, maxTokens, imageBuffer }, async () => {
      if (config.apiFormat === 'openai') {
        return createOpenAiVisionMessage({ prompt, systemPrompt, maxTokens, config, imageBuffer, mimeType });
      }
      return createAnthropicVisionMessage({ prompt, systemPrompt, maxTokens, config, imageBuffer, mimeType });
    });
  } catch (error) {
    throw mapLlmError(error);
  }
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

  const config = getLlmConfig();
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

  return createLlmMessage({
    prompt,
    systemPrompt: config.rewriteSystemPrompt,
    maxTokens: 2000,
    thinkingEnabled: config.rewriteThinkingEnabled
  });
}

function buildSplitScriptPrompt(text) {
  return `你是一个专业的口播稿语义切块助手。请将以下口播稿切分为适合 TTS 语音合成的语义块。

切分原则：
1. 以播报语义、话题推进、情绪承接为边界切分，不要简单按标点符号或单句话拆分
2. 尽量让连续铺垫、同一新闻点、同一转折保留在同一块中，减少 TTS 分段后情绪跳变
3. 每个块目标长度为 ${AUTO_SEGMENT_MIN_LENGTH}-${AUTO_SEGMENT_MAX_LENGTH} 个中文字符；明显短于 ${AUTO_SEGMENT_MIN_LENGTH} 字的块应尽量与相邻同主题内容合并，超过 ${AUTO_SEGMENT_MAX_LENGTH} 字的块必须继续拆分
4. 开场白和结束语可独立成块，但不要把普通自然句拆成零碎短句
5. 不要修改、概括、增删原文内容，只做切分
6. 保持原文顺序

请以 JSON 数组格式输出，每个元素是一个语义块字符串。只输出 JSON 数组，不要有其他内容。

示例输出：["大家好，欢迎收听今日AI简讯。今天我们来聊聊几个重要的AI动态。", "首先是OpenAI发布了最新模型……这一部分值得关注的是……", "..."]

口播稿内容：
${text}`;
}

function parseSplitSegments(rawText, sourceText) {
  try {
    const jsonStr = extractJsonArrayText(rawText);
    const segments = JSON.parse(jsonStr);
    if (!Array.isArray(segments) || segments.length === 0) {
      return null;
    }
    if (segments.some((seg) => typeof seg !== 'string' || seg.trim().length === 0)) {
      return null;
    }
    const normalized = normalizeAutoSegmentTexts(segments);
    if (!isTextTailCovered(sourceText, normalized.join(''))) {
      return null;
    }
    return normalized;
  } catch {
    return null;
  }
}

async function splitScriptChunk(text, config) {
  const rawText = await createLlmMessage({
    prompt: buildSplitScriptPrompt(text),
    systemPrompt: config.splitSystemPrompt,
    maxTokens: 4000,
    thinkingEnabled: config.splitThinkingEnabled
  });

  return parseSplitSegments(rawText, text) || normalizeAutoSegmentTexts([text]);
}

/**
 * 将口播稿切分为适合 TTS 的语义块
 * @param {string} text - 完整口播稿
 * @returns {Promise<string[]>} 切分后的语义块数组
 */
async function splitScript(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('请提供有效的口播稿文本');
  }

  const config = getLlmConfig();
  const chunks = splitTextForFormatting(text, SPLIT_SCRIPT_CHUNK_LENGTH);
  const allSegments = [];
  for (const chunk of chunks) {
    allSegments.push(...await splitScriptChunk(chunk, config));
  }
  return normalizeAutoSegmentTexts(allSegments);
}

/**
 * 将转录文本整理为可阅读的自然段
 * @param {string} text - 转录原文
 * @returns {Promise<string>} 排版后的文本
 */
async function formatTranscriptionText(text) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('请提供需要排版的转录文本');
  }

  const chunks = splitTextForFormatting(text);
  const formattedChunks = [];

  for (const chunk of chunks) {
    formattedChunks.push(await formatTranscriptionChunkWithRetry(chunk));
  }

  const result = formattedChunks.join('\n\n').trim();
  if (!result) {
    throw new Error('AI 排版结果为空');
  }
  assertFormattedTextComplete(text, result);
  return result;
}

/**
 * 为各段建议整体风格标签
 * @param {string[]} texts - 各段文本（按 index）
 * @param {string[]} allowedTags - 候选风格标签集
 * @returns {Promise<string[]>} 与 texts 等长的标签数组（候选之一或空串）
 */
async function suggestStyleTagsBatch(texts, allowedTags, config) {
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
    maxTokens: Math.min(1200, 200 + texts.length * 60),
    thinkingEnabled: config.splitThinkingEnabled,
  });

  const jsonStr = extractJsonArrayText(rawText);

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

async function suggestStyleTags(texts, allowedTags) {
  if (!Array.isArray(texts) || texts.length === 0) {
    throw new Error('请提供有效的句子列表');
  }
  if (!Array.isArray(allowedTags) || allowedTags.length === 0) {
    throw new Error('请提供候选风格标签');
  }

  const config = getLlmConfig();
  const allTags = [];
  for (let start = 0; start < texts.length; start += STYLE_TAG_SUGGEST_BATCH_SIZE) {
    const batch = texts.slice(start, start + STYLE_TAG_SUGGEST_BATCH_SIZE);
    try {
      const batchTags = await suggestStyleTagsBatch(batch, allowedTags, config);
      allTags.push(...batchTags);
    } catch (error) {
      if (!isRecoverableStructuredOutputError(error)) throw error;
      logger.warn({
        err: error,
        start,
        batchSize: batch.length,
      }, 'AI 风格建议批次失败，使用本地兜底标签');
      allTags.push(...batch.map((text) => fallbackStyleTag(text, allowedTags)));
    }
  }
  return allTags;
}

function parseVoiceDesignInference(rawText) {
  const cleaned = stripThinkingContent(rawText);
  try {
    const json = JSON.parse(extractJsonObjectText(cleaned));
    const designPrompt = typeof json.designPrompt === 'string'
      ? json.designPrompt.trim()
      : (typeof json.design_prompt === 'string' ? json.design_prompt.trim() : '');
    const stylePrompt = typeof json.stylePrompt === 'string'
      ? json.stylePrompt.trim()
      : (typeof json.style_prompt === 'string' ? json.style_prompt.trim() : '');
    const characterSummary = typeof json.characterSummary === 'string'
      ? json.characterSummary.trim()
      : (typeof json.character_summary === 'string' ? json.character_summary.trim() : '');
    if (designPrompt) {
      return { designPrompt, stylePrompt, characterSummary };
    }
  } catch {
    // 非 JSON 输出走纯文本兜底。
  }

  const fallback = cleaned.trim();
  if (!fallback) {
    throw new Error('角色立绘反推结果为空');
  }
  return {
    designPrompt: fallback,
    stylePrompt: '',
    characterSummary: '',
  };
}

/**
 * 根据角色立绘反推 MiMo voicedesign 可用的音色描述
 * @param {Object} params
 * @param {Buffer} params.imageBuffer - 角色立绘图片
 * @param {string} params.mimeType - 图片 MIME 类型
 * @returns {Promise<{designPrompt: string, stylePrompt: string, characterSummary: string}>}
 */
async function inferVoiceDesignFromImage({ imageBuffer, mimeType }) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    throw new Error('请上传角色立绘图片');
  }
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) {
    throw new Error('仅支持 PNG、JPG 或 WebP 角色立绘');
  }

  const prompt = `请观察这张角色立绘，仅基于画面中可见的外貌、表情、姿态、服装风格、年龄感与整体气质，创作一组适合 MiMo TTS 的中文提示词。

你不是在识别角色真实声音，也不要模仿任何真人、演员、声优或公众人物。
请只做“视觉印象下的原创音色设计”。

MiMo TTS 的关键规则：
- voicedesign 模型的 user.content 用来描述“音色本体”，assistant.content 才是要合成的文本。
- 自然语言控制放在 user.content；音频标签控制放在 assistant.content 的文本中。
- designPrompt 会保存为可复用的音色资产，只能写“性别年龄 + 音色质感 + 角色感”，不要复杂堆词。
- stylePrompt 只描述“语气情绪 + 语速节奏”，不要混入音色身份、角色背景、场景或导演模式。

分析时请重点考虑：
1. designPrompt：性别年龄（如 少女 / 青年女性 / 成熟女性 / 少年 / 青年男性）+ 音色质感（如 清亮 / 柔和 / 低柔 / 透明 / 磁性）+ 角色感（如 温顺 / 冷静 / 活泼 / 疏离 / 自信）。
2. stylePrompt：语气情绪（如 温柔、克制、好奇、冷静）+ 语速节奏（如 语速适中、节奏轻快、短句稍停、尾音轻收）。

输出要求：
- 不要写长篇角色背景
- 不要提到“我看到图片中”
- 不要使用真实人物或声优名字
- 不要判断敏感身份属性
- designPrompt 要极简，控制在 35 字以内，推荐格式：“青年女性，清亮柔和，带冷静角色感”
- designPrompt 不要写语速、节奏、咬字、情绪表演、停顿、尾音、距离感
- stylePrompt 要能直接作为自然语言风格控制，控制在 80 字以内
- stylePrompt 必须承接语气情绪 + 语速节奏，例如：“语气克制温柔，语速适中，短句间轻微停顿”
- characterSummary 控制在 100 字以内
- 不要生成具体场景、台词表演、导演模式或分镜化指导

请只输出 JSON 对象：
{
  "designPrompt": "35 字以内，性别年龄 + 音色质感 + 角色感",
  "stylePrompt": "80 字以内，语气情绪 + 语速节奏",
  "characterSummary": "100 字以内，概括角色视觉气质"
}`;

  const rawText = await createVisionMessage({
    prompt,
    systemPrompt: '你是一个角色视觉分析与 TTS 音色设计助手。只基于画面可见特征生成创作性音色描述，不识别真实声纹。',
    maxTokens: 800,
    imageBuffer,
    mimeType,
  });
  return parseVoiceDesignInference(rawText);
}

const TRIAL_TEXT_ALLOWED_STYLE_TAGS = [
  '开心', '悲伤', '愤怒', '恐惧', '惊讶', '兴奋', '委屈', '平静', '冷漠',
  '怅然', '欣慰', '无奈', '愧疚', '释然', '嫉妒', '厌倦', '忐忑', '动情',
  '温柔', '高冷', '活泼', '严肃', '慵懒', '俏皮', '深沉', '干练', '凌厉',
  '磁性', '醇厚', '清亮', '空灵', '稚嫩', '苍老', '甜美', '沙哑', '醇雅',
  '夹子音', '御姐音', '正太音', '大叔音', '台湾腔',
  '东北话', '四川话', '河南话', '粤语',
  '孙悟空', '林黛玉',
];

const TRIAL_TEXT_ALLOWED_AUDIO_TAGS = [
  '吸气', '深呼吸', '叹气', '长叹一口气', '喘息', '屏息',
  '紧张', '害怕', '激动', '疲惫', '委屈', '撒娇', '心虚', '震惊', '不耐烦',
  '颤抖', '声音颤抖', '变调', '破音', '鼻音', '气声', '沙哑',
  '笑', '轻笑', '大笑', '冷笑', '抽泣', '呜咽', '哽咽', '嚎啕大哭',
  '语速加快', '语速放慢', '停顿片刻', '沉默片刻', '小声', '提高音量喊话',
];

function parseTaggedTrialTextSuggestion(rawText, fallbackText) {
  const cleaned = stripThinkingContent(rawText).trim();
  if (!cleaned) {
    return { taggedText: fallbackText, stylePrompt: '' };
  }
  try {
    const json = JSON.parse(extractJsonObjectText(cleaned));
    const stylePrompt = typeof json.stylePrompt === 'string'
      ? json.stylePrompt.trim()
      : (typeof json.style_prompt === 'string' ? json.style_prompt.trim() : '');
    if (typeof json.taggedText === 'string' && json.taggedText.trim()) {
      return {
        taggedText: normalizeTrialTextTagSyntax(json.taggedText.trim()),
        stylePrompt,
      };
    }
    if (typeof json.tagged_text === 'string' && json.tagged_text.trim()) {
      return {
        taggedText: normalizeTrialTextTagSyntax(json.tagged_text.trim()),
        stylePrompt,
      };
    }
  } catch {
    // 非 JSON 输出走纯文本兜底。
  }
  return {
    taggedText: normalizeTrialTextTagSyntax(cleaned),
    stylePrompt: '',
  };
}

function normalizeTrialTextTagSyntax(text) {
  return String(text || '')
    .replace(/（([^（）]+)）/g, (_, content) => `[${normalizeTagContent(content)}]`)
    .replace(/\(([^()]+)\)/g, (_, content) => `[${normalizeTagContent(content)}]`)
    .replace(/\[([^\]]+)\]/g, (_, content) => `[${normalizeTagContent(content)}]`);
}

function normalizeTagContent(content) {
  return String(content || '')
    .split(/[，,、\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join('，');
}

/**
 * 为试听文本建议 MiMo 音频标签，只返回可放入 assistant.content 的文本
 * @param {Object} params
 * @param {string} params.text - 原始试听文本
 * @param {string} [params.voiceDesign] - 音色描述
 * @param {string} [params.stylePrompt] - 自然语言风格提示
 * @returns {Promise<{taggedText:string, stylePrompt:string}>}
 */
async function suggestTrialTextTags({ text, voiceDesign = '', stylePrompt = '' }) {
  const sourceText = String(text || '').trim();
  if (!sourceText) {
    throw new Error('请提供试听文本');
  }

  const prompt = `你是 MiMo TTS 台词表演标签导演。你的任务不是简单补标签，而是根据台词本身的气口、情绪弧线、语速快慢变化、停顿位置和重音落点，使用合法标签优化这句试听文本，让情绪能被 TTS 明确表达。

你会收到两类输入：
1. 没有任何标签的原始台词：你需要从 0 到 1 设计标签。
2. 已经带有标签的草稿：你需要评估已有标签是否准确，保留有用标签，删除冲突或多余标签，并补充更合适的标签。

MiMo TTS 标签规则：
- 所有标签都必须使用方括号，格式如：[温柔]、[轻笑]、[停顿片刻]。
- 如果同一位置需要多个情绪或声音控制，必须合并成一个标签，例如：[温柔，平静]正文，不要写成 [温柔][平静] 或 (温柔 平静)。
- 风格标签通常放在目标文本最开头；音频标签可以放在 assistant.content 的正文任意位置。
- 不要把标签写进音色描述；你只处理要合成的试听文本。
- 不要添加角色背景、场景说明或导演模式字段。

优化原则：
- 先判断台词的核心情绪和说话意图，再决定开头整体标签。
- 在逗号、顿号、转折词、感叹号、疑问句、情绪突变处考虑插入 [停顿片刻]、[吸气]、[语速加快]、[语速放慢] 等节奏标签。
- 对需要强调的短语，用现有标签表达表现方式，例如 [提高音量喊话]、[小声]、[语速放慢]、[激动]、[震惊]，不要创造“重音”这类列表外标签。
- 如果原文已有标签但过弱，应更换或补强；如果已有标签与台词矛盾，应删除。
- 标签应明显改变表演效果，但不能密到破坏朗读。短句 2-4 个标签，中长句 3-7 个标签。

允许使用的开头风格标签：
${TRIAL_TEXT_ALLOWED_STYLE_TAGS.join('、')}

允许使用的正文音频标签：
${TRIAL_TEXT_ALLOWED_AUDIO_TAGS.join('、')}

参考音色描述：
${voiceDesign || '无'}

参考风格提示：
${stylePrompt || '无'}

原始试听文本：
${sourceText}

输出要求：
- 保留原文主要文字，不要扩写成长段
- 标签总数控制在 2 到 7 个；极短句可以少于 2 个
- 不要使用上述列表外的标签
- 禁止输出圆括号标签
- 如果输入已有标签，输出应体现你对已有标签的优化结果，而不是原样返回
- 同时根据最终台词情绪生成 stylePrompt，只写“语气情绪 + 语速节奏”，不要写音色身份、角色背景或场景
- stylePrompt 控制在 80 字以内，例如：“语气先平静后惊喜，语速前半适中，转折后略加快，关键短语前轻停顿”
- 只输出 JSON 对象：{"taggedText":"带标签的试听文本","stylePrompt":"语气情绪 + 语速节奏"}`;

  const rawText = await createLlmMessage({
    prompt,
    systemPrompt: '你是 MiMo TTS 标签编辑助手，只输出 JSON 对象。',
    maxTokens: 800,
    thinkingEnabled: false,
  });

  return parseTaggedTrialTextSuggestion(rawText, sourceText);
}

function parseTaggedSegmentSuggestions(rawText, fallbackTexts) {
  const jsonStr = extractJsonArrayText(rawText);
  let suggestions;
  try {
    suggestions = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`AI 标签优化结果解析失败: ${e.message}`);
  }

  if (!Array.isArray(suggestions) || suggestions.length !== fallbackTexts.length) {
    throw new Error('AI 标签优化结果数量与段落数量不一致');
  }

  return suggestions.map((item, index) => {
    const fallbackText = fallbackTexts[index];
    if (typeof item === 'string') {
      return {
        taggedText: normalizeTrialTextTagSyntax(item.trim() || fallbackText),
        stylePrompt: '',
      };
    }
    if (!item || typeof item !== 'object') {
      return {
        taggedText: normalizeTrialTextTagSyntax(fallbackText),
        stylePrompt: '',
      };
    }

    const taggedText = typeof item.taggedText === 'string'
      ? item.taggedText.trim()
      : (typeof item.tagged_text === 'string' ? item.tagged_text.trim() : '');
    const stylePrompt = typeof item.stylePrompt === 'string'
      ? item.stylePrompt.trim()
      : (typeof item.style_prompt === 'string' ? item.style_prompt.trim() : '');

    return {
      taggedText: normalizeTrialTextTagSyntax(taggedText || fallbackText),
      stylePrompt,
    };
  });
}

function fallbackTaggedSegmentSuggestion(text) {
  return {
    taggedText: normalizeTrialTextTagSyntax(text),
    stylePrompt: '',
  };
}

async function suggestSegmentAudioTagsBatch({ texts, voiceDesign, stylePrompt, config }) {
  const numbered = texts.map((text, index) => `${index + 1}. ${text}`).join('\n');
  const maxTokens = Math.min(
    6000,
    1200 + texts.reduce((sum, text) => sum + Math.ceil(String(text || '').length * 1.4), 0)
  );

  const prompt = `你是 MiMo TTS 口播段落标签导演。请把下面每个口播段落优化成“方括号内联标签 + 原文正文”的形式，用于 assistant.content 直接合成。

目标不是给一个单独风格分类，而是根据每段文本的气口、情绪弧线、语速快慢变化、停顿位置和强调点，插入合法标签。

MiMo TTS 标签规则：
- 所有标签都必须使用方括号，格式如：[温柔]、[轻笑]、[停顿片刻]。
- 如果同一位置需要多个控制，必须合并为一个标签，例如：[温柔，平静]正文。
- 风格标签通常放在段落开头；音频标签可以放在正文任意位置。
- 输入里可能已有旧标签或旧整体风格，你需要保留有效控制、删除冲突或多余控制，并统一为方括号。
- 不要输出圆括号标签，不要把标签写进音色描述，不要添加角色背景、场景说明或导演模式。

允许使用的开头风格标签：
${TRIAL_TEXT_ALLOWED_STYLE_TAGS.join('、')}

允许使用的正文音频标签：
${TRIAL_TEXT_ALLOWED_AUDIO_TAGS.join('、')}

参考音色描述：
${voiceDesign || '无'}

参考风格提示：
${stylePrompt || '无'}

段落列表：
${numbered}

输出要求：
1. 只输出 JSON 数组，数组长度必须等于段落数量（${texts.length}）
2. 每个元素是对象：{"taggedText":"带标签的段落文本","stylePrompt":"语气情绪 + 语速节奏"}
3. 保留每段原文主要文字、事实和顺序，不要扩写成长段，不要合并或拆分段落
4. 每段标签数量控制在 2 到 7 个；极短段可以少于 2 个
5. 不要使用上述列表外的标签
6. stylePrompt 控制在 80 字以内，不要写音色身份、角色背景或场景`;

  const rawText = await createLlmMessage({
    prompt,
    systemPrompt: '你是 MiMo TTS 标签编辑助手，只输出 JSON 数组。',
    maxTokens,
    thinkingEnabled: config.splitThinkingEnabled,
  });

  return parseTaggedSegmentSuggestions(rawText, texts);
}

/**
 * 为口播编辑器的分段文本批量建议 MiMo 内联音频标签。
 * @param {Object} params
 * @param {string[]} params.texts - 各段文本（按 index）
 * @param {string} [params.voiceDesign] - 音色设计描述
 * @param {string} [params.stylePrompt] - 当前自然语言风格提示
 * @returns {Promise<Array<{taggedText:string, stylePrompt:string}>>}
 */
async function suggestSegmentAudioTags({ texts, voiceDesign = '', stylePrompt = '' }) {
  if (!Array.isArray(texts) || texts.length === 0) {
    throw new Error('请提供有效的段落列表');
  }
  if (!texts.every((text) => typeof text === 'string' && text.trim().length > 0)) {
    throw new Error('段落列表中包含空文本');
  }

  const config = getLlmConfig();
  const suggestions = [];
  for (let start = 0; start < texts.length; start += SEGMENT_AUDIO_TAG_SUGGEST_BATCH_SIZE) {
    const batch = texts.slice(start, start + SEGMENT_AUDIO_TAG_SUGGEST_BATCH_SIZE);
    try {
      suggestions.push(...await suggestSegmentAudioTagsBatch({
        texts: batch,
        voiceDesign,
        stylePrompt,
        config,
      }));
    } catch (error) {
      if (!isRecoverableStructuredOutputError(error)) throw error;
      logger.warn({
        err: error,
        start,
        batchSize: batch.length,
      }, 'AI 段落标签优化批次失败，保留原文标签');
      suggestions.push(...batch.map(fallbackTaggedSegmentSuggestion));
    }
  }
  return suggestions;
}

/**
 * 测试 API Key 是否有效
 * @param {string} type - Key 类型: 'anthropic' 或 'tts'
 * @param {string} [apiKeyOverride] - 临时验证用 API Key，不传则读取已保存设置
 * @param {Object} [configOverride] - 临时 LLM 配置
 * @returns {Promise<boolean>} 是否有效
 */
async function testApiKey(type = 'anthropic', apiKeyOverride, configOverride) {
  try {
    if (type === 'tts') {
      // 测试 TTS API Key（使用 axios 替代 OpenAI SDK）
      const ttsApiKey = apiKeyOverride || getApiKey('tts');
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
      await createLlmMessage({
        prompt: '你好',
        systemPrompt: '',
        maxTokens: 10,
        thinkingEnabled: false,
        apiKeyOverride,
        configOverride
      });
    }
    return true;
  } catch (error) {
    logger.error({ err: error }, '测试 API Key 失败');
    return false;
  }
}

// 先导出已有函数，再 require('./tts') 避免循环依赖
// （tts.js 依赖 mimo.getApiKey，如果在 require 之后才赋值 module.exports 会拿到空对象）
module.exports = {
  buildModelEndpointCandidates: llmModels.buildModelEndpointCandidates,
  fetchModelsForConfig: llmModels.fetchModelsForConfig,
  getApiKey,
  getLlmConfig,
  createLlmMessage,
  formatTranscriptionText,
  inferVoiceDesignFromImage,
  rewriteToScript,
  suggestSegmentAudioTags,
  suggestTrialTextTags,
  splitScript,
  suggestStyleTags,
  testApiKey,
};

// Re-export generateSpeech 保持向后兼容
const { generateSpeech } = require('./tts');
module.exports.generateSpeech = generateSpeech;
