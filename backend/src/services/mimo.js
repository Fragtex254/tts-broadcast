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
  return new Anthropic({
    apiKey: getApiKey('anthropic'),
    baseURL: BASE_URL
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

  if (!message?.content?.[0]?.text) {
    throw new Error('MiMo API 返回内容为空');
  }

  return message.content[0].text;
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

  const response = await axios.post('https://api.xiaomimimo.com/v1/chat/completions', {
    model,
    messages,
    audio: audioConfig
  }, {
    headers: {
      'api-key': ttsApiKey,
      'Content-Type': 'application/json'
    },
    timeout: 0 // 不设置超时限制，TTS 生成可能需要较长时间
  });

  const audioBase64 = response.data?.choices?.[0]?.message?.audio?.data;
  if (!audioBase64) {
    throw new Error('MiMo TTS API 未返回音频数据');
  }
  return Buffer.from(audioBase64, 'base64');
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
  testApiKey
};
