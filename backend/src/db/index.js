// backend/src/db/index.js
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.NODE_ENV === 'test'
  ? ':memory:'
  : path.join(__dirname, '../../data/broadcast.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

// 确保 data 目录存在
const dataDir = path.dirname(DB_PATH);
if (DB_PATH !== ':memory:' && !fs.existsSync(dataDir)) {
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

// 迁移：为旧数据库的 segments 添加 style_tag 列
try {
  db.prepare('SELECT style_tag FROM segments LIMIT 1').get();
} catch {
  db.exec("ALTER TABLE segments ADD COLUMN style_tag TEXT DEFAULT ''");
}

// 迁移：为旧数据库的 segments 添加 error_message 列
try {
  db.prepare('SELECT error_message FROM segments LIMIT 1').get();
} catch {
  db.exec("ALTER TABLE segments ADD COLUMN error_message TEXT DEFAULT ''");
}

// 迁移：为旧数据库的 segments 添加 playback_rate 列
try {
  db.prepare('SELECT playback_rate FROM segments LIMIT 1').get();
} catch {
  db.exec('ALTER TABLE segments ADD COLUMN playback_rate REAL DEFAULT 1.0');
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
      character_image_path TEXT DEFAULT NULL,
      use_trial_audio_as_clone BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_voice_presets_type ON voice_presets(type);
  `);
}

// 迁移：为旧数据库的 voice_presets 添加角色立绘路径
try {
  db.prepare('SELECT character_image_path FROM voice_presets LIMIT 1').get();
} catch {
  db.exec('ALTER TABLE voice_presets ADD COLUMN character_image_path TEXT DEFAULT NULL');
}

// 迁移：为设计预设添加“使用试听音频作为克隆音频”开关
try {
  db.prepare('SELECT use_trial_audio_as_clone FROM voice_presets LIMIT 1').get();
} catch {
  db.exec('ALTER TABLE voice_presets ADD COLUMN use_trial_audio_as_clone BOOLEAN DEFAULT 0');
}

// 迁移：确保 transcription_results 表存在
try {
  db.prepare('SELECT id FROM transcription_results LIMIT 1').get();
} catch {
  db.exec(`
    CREATE TABLE IF NOT EXISTS transcription_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_name TEXT NOT NULL,
      relative_path TEXT DEFAULT '',
      text TEXT NOT NULL,
      formatted_text TEXT DEFAULT '',
      language TEXT DEFAULT 'auto',
      provider TEXT DEFAULT '',
      engine TEXT DEFAULT '',
      model TEXT DEFAULT '',
      context TEXT DEFAULT '',
      usage TEXT,
      task_id TEXT DEFAULT '',
      file_size_bytes INTEGER DEFAULT 0,
      audio_duration_seconds REAL DEFAULT 0,
      processing_seconds REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_transcription_results_created_at ON transcription_results(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_transcription_results_task_id ON transcription_results(task_id);
  `);
}

// 迁移：为旧数据库的 transcription_results 添加统计字段
try {
  db.prepare('SELECT file_size_bytes FROM transcription_results LIMIT 1').get();
} catch {
  db.exec('ALTER TABLE transcription_results ADD COLUMN file_size_bytes INTEGER DEFAULT 0');
}

try {
  db.prepare('SELECT audio_duration_seconds FROM transcription_results LIMIT 1').get();
} catch {
  db.exec('ALTER TABLE transcription_results ADD COLUMN audio_duration_seconds REAL DEFAULT 0');
}

try {
  db.prepare('SELECT processing_seconds FROM transcription_results LIMIT 1').get();
} catch {
  db.exec('ALTER TABLE transcription_results ADD COLUMN processing_seconds REAL DEFAULT 0');
}

// 迁移：记录 WSL 内部使用的 ASR 引擎，并归并旧 MOSS provider 历史。
try {
  db.prepare('SELECT engine FROM transcription_results LIMIT 1').get();
} catch {
  db.exec("ALTER TABLE transcription_results ADD COLUMN engine TEXT DEFAULT ''");
}
db.prepare("UPDATE transcription_results SET provider = 'wsl_asr', engine = 'moss' WHERE provider = 'moss_asr'").run();
db.prepare("UPDATE transcription_results SET engine = 'qwen' WHERE provider = 'wsl_asr' AND engine = ''").run();

// 迁移：确保 API 限速账本表存在，用于外部模型队列跨进程重启保留近窗口用量。
try {
  db.prepare('SELECT id FROM api_rate_limit_events LIMIT 1').get();
} catch {
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_rate_limit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL,
      started_at_ms INTEGER NOT NULL,
      request_cost INTEGER DEFAULT 1,
      token_cost INTEGER DEFAULT 1,
      payload_cost INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_api_rate_limit_events_scope_started
      ON api_rate_limit_events(scope, started_at_ms);
  `);
}

try {
  db.prepare('SELECT scope FROM api_rate_limit_state LIMIT 1').get();
} catch {
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_rate_limit_state (
      scope TEXT PRIMARY KEY,
      backoff_until_ms INTEGER DEFAULT 0,
      adaptive_concurrency_limit INTEGER DEFAULT 0,
      adaptive_concurrency_ceiling INTEGER DEFAULT 0,
      last_rate_limit_at_ms INTEGER DEFAULT 0,
      circuit_until_ms INTEGER DEFAULT 0,
      circuit_reason TEXT DEFAULT '',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

// 迁移：持久化队列从 429 学到的安全并发与非重试型限流熔断状态。
try {
  db.prepare('SELECT adaptive_concurrency_limit FROM api_rate_limit_state LIMIT 1').get();
} catch {
  db.exec('ALTER TABLE api_rate_limit_state ADD COLUMN adaptive_concurrency_limit INTEGER DEFAULT 0');
}

try {
  db.prepare('SELECT last_rate_limit_at_ms FROM api_rate_limit_state LIMIT 1').get();
} catch {
  db.exec('ALTER TABLE api_rate_limit_state ADD COLUMN last_rate_limit_at_ms INTEGER DEFAULT 0');
}

try {
  db.prepare('SELECT adaptive_concurrency_ceiling FROM api_rate_limit_state LIMIT 1').get();
} catch {
  db.exec('ALTER TABLE api_rate_limit_state ADD COLUMN adaptive_concurrency_ceiling INTEGER DEFAULT 0');
}

try {
  db.prepare('SELECT circuit_until_ms FROM api_rate_limit_state LIMIT 1').get();
} catch {
  db.exec('ALTER TABLE api_rate_limit_state ADD COLUMN circuit_until_ms INTEGER DEFAULT 0');
}

try {
  db.prepare('SELECT circuit_reason FROM api_rate_limit_state LIMIT 1').get();
} catch {
  db.exec("ALTER TABLE api_rate_limit_state ADD COLUMN circuit_reason TEXT DEFAULT ''");
}

// 迁移：MiMo RPM 按真实 HTTP 请求计数。旧版曾把 clone payload MiB 错当成请求数。
db.prepare("UPDATE api_rate_limit_events SET request_cost = 1 WHERE scope = 'mimo-tts' AND request_cost <> 1").run();

// 迁移：确保批量生成 job/lease 表存在，避免同一播报重复入队。
try {
  db.prepare('SELECT id FROM generation_jobs LIMIT 1').get();
} catch {
  db.exec(`
    CREATE TABLE IF NOT EXISTS generation_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      broadcast_id INTEGER NOT NULL,
      job_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      lease_expires_at_ms INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (broadcast_id) REFERENCES broadcasts(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_generation_jobs_broadcast_type_status
      ON generation_jobs(broadcast_id, job_type, status);
  `);
}

// 默认设置
const defaultSettings = {
  mimo_api_key: '',
  mimo_tts_api_key: '',
  llm_api_format: 'anthropic',
  llm_base_url: 'https://token-plan-cn.xiaomimimo.com/anthropic',
  llm_model: 'mimo-v2.5',
  llm_rewrite_system_prompt: '你是一位专业的播音稿撰写者。',
  llm_split_system_prompt: '你是一个文本切分助手，只输出 JSON 数组格式。',
  llm_rewrite_thinking_enabled: true,
  llm_split_thinking_enabled: false,
  asr_provider: 'wsl_asr',
  qwen_asr_base_url: 'http://localhost:8765/v1',
  qwen_asr_model: 'Qwen/Qwen3-ASR-1.7B',
  qwen_asr_api_key: '',
  wsl_asr_base_url: 'http://192.168.31.137:18080/v1',
  wsl_asr_engine: 'qwen',
  wsl_asr_model: 'qwen3-asr-1.7b',
  wsl_asr_api_key: '',
  default_voice: '冰糖',
  ui_font_preset: 'modern',
  ui_font_scale: 'comfortable',
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

// 迁移：WSL ASR 接入后，将旧默认 MiMo 转录引擎切到 WSL ASR。
db.prepare("UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = 'asr_provider' AND value = ?")
  .run(JSON.stringify('wsl_asr'), JSON.stringify('mimo'));

// 迁移：旧 MOSS provider 归入 WSL 局域网连接，并复用原有连接参数。
const readSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
const writeSetting = db.prepare(`
  INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
`);
const storedAsrProvider = readSetting.get('asr_provider');
if (storedAsrProvider?.value === JSON.stringify('moss_asr')) {
  const migrateLegacyMossSetting = db.transaction(() => {
    const legacyBaseUrl = readSetting.get('moss_asr_base_url')?.value ?? JSON.stringify(defaultSettings.wsl_asr_base_url);
    const legacyModel = readSetting.get('moss_asr_model')?.value ?? JSON.stringify('');
    const legacyApiKey = readSetting.get('moss_asr_api_key')?.value ?? JSON.stringify('');
    writeSetting.run('asr_provider', JSON.stringify('wsl_asr'));
    writeSetting.run('wsl_asr_engine', JSON.stringify('moss'));
    writeSetting.run('wsl_asr_base_url', legacyBaseUrl);
    writeSetting.run('wsl_asr_model', legacyModel);
    writeSetting.run('wsl_asr_api_key', legacyApiKey);
  });
  migrateLegacyMossSetting();
}

module.exports = db;
