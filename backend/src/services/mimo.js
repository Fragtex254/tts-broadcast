const Anthropic = require('@anthropic-ai/sdk');
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
 * 生成 TTS 语音
 * @param {Object} params
 * @param {string} params.text - 口播稿
 * @param {string} params.voice - 音色 ID
 * @param {string} params.voiceType - 音色类型 (preset/design/clone)
 * @param {string} params.voiceDesign - 音色设计描述
 * @param {string} params.voiceClone - 音色克隆音频 (base64)
 * @param {string} params.stylePrompt - 风格提示
 * @returns {Promise<Buffer>} 音频 Buffer
 */
async function generateSpeech({ text, voice = '冰糖', voiceType = 'preset', voiceDesign, voiceClone, stylePrompt }) {
  const axios = require('axios');
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

  // MiMo 可能返回 thinking + text 两种 content block，提取 text 类型
  const textBlock = message.content.find(b => b.type === 'text');
  if (!textBlock?.text) {
    throw new Error('MiMo API 返回内容为空');
  }

  const rawText = textBlock.text.trim();

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
 * @returns {Promise<boolean>} 是否有效
 */
async function testApiKey(type = 'anthropic') {
  try {
    if (type === 'tts') {
      // 测试 TTS API Key
      const { OpenAI } = require('openai');
      const ttsApiKey = getApiKey('tts');
      const client = new OpenAI({
        apiKey: ttsApiKey,
        baseURL: 'https://api.xiaomimimo.com/v1',
        defaultHeaders: {
          'api-key': ttsApiKey
        }
      });
      await client.chat.completions.create({
        model: 'mimo-v2.5-tts',
        messages: [
          { role: 'user', content: '测试' },
          { role: 'assistant', content: '测试' }
        ],
        audio: { format: 'wav', voice: '冰糖' }
      });
    } else {
      // 测试 Anthropic API Key
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

module.exports = {
  rewriteToScript,
  generateSpeech,
  splitScript,
  testApiKey
};
