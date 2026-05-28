// backend/src/db/index.js
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/broadcast.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

// 确保 data 目录存在
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 创建数据库连接
const db = new Database(DB_PATH);

// 启用 WAL 模式提高性能
db.pragma('journal_mode = WAL');

// 初始化数据库表
const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
db.exec(schema);

// 默认设置
const defaultSettings = {
  mimo_api_key: '',
  default_voice: '冰糖',
  opening_script: '大家好，欢迎收听今日 AI 简讯。',
  closing_script: '以上就是今天的 AI 简讯，感谢收听，我们明天再见。',
  content_categories: '["ai-models", "ai-products", "industry", "paper", "tip"]'
};

// 插入默认设置（如果不存在）
const insertSetting = db.prepare(`
  INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)
`);

for (const [key, value] of Object.entries(defaultSettings)) {
  insertSetting.run(key, JSON.stringify(value));
}

module.exports = db;
