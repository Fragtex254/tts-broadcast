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
  style_tag TEXT DEFAULT '',
  playback_rate REAL DEFAULT 1.0,
  error_message TEXT DEFAULT '',
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
  character_image_path TEXT DEFAULT NULL,
  use_trial_audio_as_clone BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_voice_presets_type ON voice_presets(type);

CREATE TABLE IF NOT EXISTS transcription_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_name TEXT NOT NULL,
  relative_path TEXT DEFAULT '',
  text TEXT NOT NULL,
  formatted_text TEXT DEFAULT '',
  language TEXT DEFAULT 'auto',
  provider TEXT DEFAULT '',
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

CREATE TABLE IF NOT EXISTS api_rate_limit_state (
  scope TEXT PRIMARY KEY,
  backoff_until_ms INTEGER DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

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
