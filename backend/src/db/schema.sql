-- backend/src/db/schema.sql
CREATE TABLE IF NOT EXISTS broadcasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  audio_path TEXT,
  duration INTEGER,
  voice_type TEXT,
  voice_config TEXT,
  source_items TEXT,
  status TEXT DEFAULT 'pending',
  saved BOOLEAN DEFAULT 0,
  mode TEXT DEFAULT 'whole' CHECK (mode IN ('whole', 'segmented')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  content_types TEXT,
  is_active BOOLEAN DEFAULT 1,
  last_run_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  broadcast_id INTEGER NOT NULL,
  "index" INTEGER NOT NULL,
  text TEXT NOT NULL,
  audio_path TEXT,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (broadcast_id) REFERENCES broadcasts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_broadcasts_created_at ON broadcasts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_schedules_is_active ON schedules(is_active);
CREATE INDEX IF NOT EXISTS idx_segments_broadcast_id ON segments(broadcast_id);

CREATE TABLE IF NOT EXISTS voice_presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('clone', 'design')),
  name TEXT NOT NULL,
  style_prompt TEXT DEFAULT '',
  trial_audio_path TEXT,
  original_audio_path TEXT,
  design_prompt TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_voice_presets_type ON voice_presets(type);
