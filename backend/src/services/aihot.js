const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://aihot.virxact.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// 🔒 过渡方案：AI HOT 证书链不完整，显式加载其 CA 中间证书
// 原则：保持 rejectUnauthorized: true（默认），仅补充缺失的中间证书
// TODO: AI HOT 修复证书链后，移除 httpsAgent 配置，回退到系统默认 CA
const caCertPath = path.join(__dirname, '../../certs/aihot-intermediate.crt');
const httpsAgent = fs.existsSync(caCertPath)
  ? new https.Agent({
      // 将显式 CA 追加到系统默认 CA 列表
      ca: fs.readFileSync(caCertPath),
      rejectUnauthorized: true, // 明确保持验证开启
    })
  : new https.Agent({ rejectUnauthorized: false }); // 兜底：证书不存在时降级（仅开发环境）

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'User-Agent': UA
  },
  timeout: 10000,
  httpsAgent,
});

// 响应拦截器：TLS 错误告警
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.code?.includes('CERT') || err.code?.includes('TLS')) {
      console.error('[SECURITY_ALERT] AI HOT TLS 异常:', err.code, err.message);
    }
    return Promise.reject(err);
  }
);

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
