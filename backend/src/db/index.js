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

// 启用外键约束（SQLite 默认关闭）
db.pragma('foreign_keys = ON');

// 初始化数据库表
const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
db.exec(schema);

// 迁移：为旧数据库添加 saved 列
try {
  db.prepare('SELECT saved FROM broadcasts LIMIT 1').get();
} catch {
  db.exec('ALTER TABLE broadcasts ADD COLUMN saved BOOLEAN DEFAULT 0');
}

// 迁移：为旧数据库添加 mode 列
try {
  db.prepare('SELECT mode FROM broadcasts LIMIT 1').get();
} catch {
  db.exec("ALTER TABLE broadcasts ADD COLUMN mode TEXT DEFAULT 'whole'");
}

// 迁移：确保 voice_presets 表存在
try {
  db.prepare('SELECT id FROM voice_presets LIMIT 1').get();
} catch {
  db.exec(`
    CREATE TABLE IF NOT EXISTS voice_presets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('clone', 'design')),
      name TEXT NOT NULL,
      style_prompt TEXT DEFAULT '',
      trial_audio_path TEXT DEFAULT '',
      original_audio_path TEXT DEFAULT '',
      design_prompt TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_voice_presets_type ON voice_presets(type);
  `);
}

// 默认设置
const defaultSettings = {
  mimo_api_key: '',
  mimo_tts_api_key: '',
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
