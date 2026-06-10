const axios = require('axios');

const BASE_URL = 'https://aihot.virxact.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// AI HOT API 配置
// 注意：证书验证通过 NODE_TLS_REJECT_UNAUTHORIZED=0 环境变量禁用（见 package.json dev 脚本）
// TODO: 联系 AI HOT 运维团队修复证书链，然后移除环境变量配置
const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'User-Agent': UA
  },
  timeout: 10000,
});

/**
 * 获取精选资讯
 * @param {Object} params
 * @param {string} params.category - 分类 (ai-models, ai-products, industry, paper, tip)
 * @param {string} params.since - ISO 8601 时间字符串
 * @param {number} params.take - 获取数量 (1-100)
 * @returns {Promise<Array>} 资讯列表
 */
async function getSelectedItems({ category, since, take = 50 } = {}) {
  const params = { mode: 'selected', take };
  if (category) params.category = category;
  if (since) params.since = since;

  const response = await api.get('/api/public/items', { params });
  return response.data.items || [];
}

/**
 * 获取日报
 * @param {string} date - YYYY-MM-DD 格式日期，不传则获取最新
 * @returns {Promise<Object>} 日报数据
 */
async function getDaily(date) {
  const url = date ? `/api/public/daily/${date}` : '/api/public/daily';
  const response = await api.get(url);
  return response.data;
}

/**
 * 关键词搜索
 * @param {Object} params
 * @param {string} params.q - 搜索关键词
 * @param {string} params.category - 分类
 * @param {number} params.take - 获取数量
 * @returns {Promise<Array>} 搜索结果
 */
async function searchItems({ q, category, take = 30 } = {}) {
  const params = { q, take };
  if (category) params.category = category;

  const response = await api.get('/api/public/items', { params });
  return response.data.items || [];
}

/**
 * 获取日报归档
 * @param {number} take - 获取数量
 * @returns {Promise<Array>} 日报列表
 */
async function getDailyArchive(take = 14) {
  const response = await api.get('/api/public/dailies', { params: { take } });
  return response.data.items || [];
}

module.exports = {
  getSelectedItems,
  getDaily,
  searchItems,
  getDailyArchive
};
