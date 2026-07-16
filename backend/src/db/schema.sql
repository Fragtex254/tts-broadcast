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
  engine TEXT DEFAULT '',
  model TEXT DEFAULT '',
  context TEXT DEFAULT '',
  usage TEXT,
  task_id TEXT DEFAULT '',
  file_size_bytes INTEGER DEFAULT 0,
  audio_duration_seconds REAL DEFAULT 0,
  processing_seconds REAL DEFAULT 0,
  content_mode TEXT DEFAULT 'standard',
  structure_status TEXT DEFAULT 'unavailable',
  summary_status TEXT DEFAULT 'not_started',
  summary_error TEXT DEFAULT '',
  speaker_scope TEXT DEFAULT '',
  diarization_status TEXT DEFAULT '',
  speaker_count INTEGER DEFAULT 0,
  diarization_conflicts INTEGER DEFAULT 0,
  asr_diagnostics TEXT DEFAULT '{}',
  asr_warnings TEXT DEFAULT '[]',
  summary_model TEXT DEFAULT '',
  summary_updated_at DATETIME DEFAULT NULL,
  claims_status TEXT NOT NULL DEFAULT 'not_started',
  claims_error TEXT NOT NULL DEFAULT '',
  claims_model TEXT NOT NULL DEFAULT '',
  claims_updated_at DATETIME DEFAULT NULL,
  podcast_name TEXT NOT NULL DEFAULT '',
  episode_title TEXT NOT NULL DEFAULT '',
  guest_names TEXT NOT NULL DEFAULT '[]',
  source_url TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL DEFAULT '',
  topic_tags TEXT NOT NULL DEFAULT '[]',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transcription_results_created_at ON transcription_results(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transcription_results_task_id ON transcription_results(task_id);

CREATE TABLE IF NOT EXISTS transcription_speakers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transcription_id INTEGER NOT NULL,
  speaker_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  speaker_scope TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (transcription_id) REFERENCES transcription_results(id) ON DELETE CASCADE,
  UNIQUE (transcription_id, speaker_key)
);

CREATE INDEX IF NOT EXISTS idx_transcription_speakers_transcription
  ON transcription_speakers(transcription_id, sort_order);

CREATE TABLE IF NOT EXISTS transcription_segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transcription_id INTEGER NOT NULL,
  segment_index INTEGER NOT NULL,
  source_index INTEGER NOT NULL DEFAULT -1,
  speaker_key TEXT NOT NULL,
  source_speaker TEXT DEFAULT '',
  speaker_scope TEXT DEFAULT '',
  speaker_resolution TEXT DEFAULT '',
  chunk_index INTEGER DEFAULT -1,
  start_seconds REAL NOT NULL,
  end_seconds REAL NOT NULL,
  text TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (transcription_id) REFERENCES transcription_results(id) ON DELETE CASCADE,
  UNIQUE (transcription_id, segment_index)
);

CREATE INDEX IF NOT EXISTS idx_transcription_segments_transcription
  ON transcription_segments(transcription_id, segment_index);

CREATE TABLE IF NOT EXISTS transcription_turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transcription_id INTEGER NOT NULL,
  turn_index INTEGER NOT NULL,
  speaker_key TEXT NOT NULL,
  start_seconds REAL NOT NULL,
  end_seconds REAL NOT NULL,
  text TEXT NOT NULL,
  corrected_text TEXT NOT NULL DEFAULT '',
  evidence_segment_indexes TEXT NOT NULL DEFAULT '[]',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (transcription_id) REFERENCES transcription_results(id) ON DELETE CASCADE,
  UNIQUE (transcription_id, turn_index)
);

CREATE INDEX IF NOT EXISTS idx_transcription_turns_transcription
  ON transcription_turns(transcription_id, turn_index);

CREATE TABLE IF NOT EXISTS transcription_summaries (
  transcription_id INTEGER PRIMARY KEY,
  one_liner TEXT NOT NULL DEFAULT '',
  overview TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (transcription_id) REFERENCES transcription_results(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS transcription_summary_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transcription_id INTEGER NOT NULL,
  item_type TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  speaker_key TEXT DEFAULT '',
  title TEXT DEFAULT '',
  content TEXT NOT NULL,
  evidence_start_index INTEGER NOT NULL,
  evidence_end_index INTEGER NOT NULL,
  start_seconds REAL NOT NULL,
  end_seconds REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (transcription_id) REFERENCES transcription_results(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_transcription_summary_items_transcription
  ON transcription_summary_items(transcription_id, item_type, sort_order);

CREATE TABLE IF NOT EXISTS transcription_summary_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transcription_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  lease_expires_at_ms INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (transcription_id) REFERENCES transcription_results(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_transcription_summary_jobs_active
  ON transcription_summary_jobs(transcription_id, status, lease_expires_at_ms);

CREATE TABLE IF NOT EXISTS transcription_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transcription_id INTEGER NOT NULL,
  speaker_key TEXT NOT NULL,
  question TEXT NOT NULL,
  claim TEXT NOT NULL,
  reasoning TEXT NOT NULL DEFAULT '',
  evidence_excerpt TEXT NOT NULL,
  evidence_start_index INTEGER NOT NULL,
  evidence_end_index INTEGER NOT NULL,
  start_seconds REAL NOT NULL,
  end_seconds REAL NOT NULL,
  topic_tags TEXT NOT NULL DEFAULT '[]',
  content_value INTEGER NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 0,
  user_note TEXT NOT NULL DEFAULT '',
  is_starred INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  analysis_model TEXT NOT NULL DEFAULT '',
  embedding TEXT NOT NULL DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (transcription_id) REFERENCES transcription_results(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_transcription_claims_transcription
  ON transcription_claims(transcription_id, status, content_value DESC);

CREATE TABLE IF NOT EXISTS transcription_claim_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transcription_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  lease_expires_at_ms INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (transcription_id) REFERENCES transcription_results(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_transcription_claim_jobs_active
  ON transcription_claim_jobs(transcription_id, status, lease_expires_at_ms);

CREATE TABLE IF NOT EXISTS claim_relations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  claim_a_id INTEGER NOT NULL,
  claim_b_id INTEGER NOT NULL,
  relation_type TEXT NOT NULL,
  explanation TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0,
  analysis_model TEXT NOT NULL DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (claim_a_id) REFERENCES transcription_claims(id) ON DELETE CASCADE,
  FOREIGN KEY (claim_b_id) REFERENCES transcription_claims(id) ON DELETE CASCADE,
  UNIQUE (claim_a_id, claim_b_id)
);

CREATE TABLE IF NOT EXISTS content_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT '',
  target_platform TEXT NOT NULL DEFAULT 'general',
  thesis TEXT NOT NULL DEFAULT '',
  personal_practice TEXT NOT NULL DEFAULT '',
  personal_judgment TEXT NOT NULL DEFAULT '',
  discussion_question TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS content_project_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  claim_id INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  usage_note TEXT NOT NULL DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES content_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (claim_id) REFERENCES transcription_claims(id) ON DELETE CASCADE,
  UNIQUE (project_id, claim_id)
);

CREATE INDEX IF NOT EXISTS idx_content_project_claims_order
  ON content_project_claims(project_id, sort_order, id);

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
  adaptive_concurrency_limit INTEGER DEFAULT 0,
  adaptive_concurrency_ceiling INTEGER DEFAULT 0,
  last_rate_limit_at_ms INTEGER DEFAULT 0,
  circuit_until_ms INTEGER DEFAULT 0,
  circuit_reason TEXT DEFAULT '',
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
