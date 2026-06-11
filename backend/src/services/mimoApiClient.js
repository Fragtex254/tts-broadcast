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
