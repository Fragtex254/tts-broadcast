const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');
const db = require('../db');
const llmModels = require('./llmModels');

const DEFAULT_LLM_SETTINGS = {
  llm_api_format: 'anthropic',
  llm_base_url: 'https://token-plan-cn.xiaomimimo.com/anthropic',
  llm_model: 'mimo-v2.5',
  llm_rewrite_system_prompt: '你是一位专业的播音稿撰写者。',
  llm_split_system_prompt: '你是一个文本切分助手，只输出 JSON 数组格式。',
  llm_rewrite_thinking_enabled: true,
  llm_split_thinking_enabled: false,
};

const LLM_REQUEST_TIMEOUT_MS = 60000;

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
    defaultHeaders: { 'api-key': apiKey }
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
  const response = await axios.post(createOpenAiChatCompletionsUrl(config.baseUrl), {
    model: config.model,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ]
  }, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'api-key': apiKey,
      'Content-Type': 'application/json'
    },
    timeout: LLM_REQUEST_TIMEOUT_MS
  });

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
  const config = getLlmConfig(configOverride);
  if (config.apiFormat === 'openai') {
    return createOpenAiMessage({ prompt, systemPrompt, maxTokens, config, apiKeyOverride });
  }
  return createAnthropicMessage({ prompt, systemPrompt, maxTokens, thinkingEnabled, config, apiKeyOverride });
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

/**
 * 将口播稿切分为适合 TTS 的短句
 * @param {string} text - 完整口播稿
 * @returns {Promise<string[]>} 切分后的短句数组
 */
async function splitScript(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('请提供有效的口播稿文本');
  }

  const config = getLlmConfig();
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

  const rawText = await createLlmMessage({
    prompt,
    systemPrompt: config.splitSystemPrompt,
    maxTokens: 4000,
    thinkingEnabled: config.splitThinkingEnabled
  });

  const trimmedText = rawText.trim();

  // 尝试解析 JSON，处理可能的 markdown 代码块包裹
  let jsonStr = trimmedText;
  const codeBlockMatch = trimmedText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
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
    console.error('测试 API Key 失败:', error.message);
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
  rewriteToScript,
  splitScript,
  testApiKey,
};

// Re-export generateSpeech 保持向后兼容
const { generateSpeech } = require('./tts');
module.exports.generateSpeech = generateSpeech;
