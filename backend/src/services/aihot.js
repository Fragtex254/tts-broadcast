const axios = require('axios');
const https = require('https');
const tls = require('tls');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://aihot.virxact.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// 加载系统 CA 证书，补充 Node.js 内置根证书（解决 Let's Encrypt ISRG Root X2 缺失问题）
function loadSystemCAs() {
  const caPaths = [
    '/etc/ssl/cert.pem',          // macOS
    '/etc/ssl/certs/ca-certificates.crt', // Debian/Ubuntu
    '/etc/pki/tls/certs/ca-bundle.crt',  // RHEL/CentOS
  ];
  for (const p of caPaths) {
    try {
      const pem = fs.readFileSync(p, 'utf8');
      // 拆分为单个证书
      const certs = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
      if (certs?.length) return certs;
    } catch { /* 文件不存在，继续 */ }
  }
  return null;
}

const systemCAs = loadSystemCAs();
const httpsAgent = systemCAs
  ? new https.Agent({ ca: [...tls.rootCertificates, ...systemCAs] })
  : undefined;

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'User-Agent': UA
  },
  timeout: 10000,
  httpsAgent,
  proxy: false, // 禁用代理，避免环境变量中的代理干扰 TLS 连接
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
