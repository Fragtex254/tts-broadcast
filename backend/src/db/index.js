// backend/src/db/index.js
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { hashSourceContent } = require('../utils/contentSourceFragments');

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

function ensureBroadcastArtifactRevisionColumn() {
  const broadcastsTable = db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'broadcasts'
  `).get();
  if (!broadcastsTable) return;
  try {
    db.prepare('SELECT artifact_revision_id FROM broadcasts LIMIT 1').get();
  } catch {
    db.exec(`
      ALTER TABLE broadcasts
      ADD COLUMN artifact_revision_id INTEGER DEFAULT NULL
        REFERENCES content_artifact_revisions(id) ON DELETE SET NULL
    `);
  }
}

function ensureContentRevisionProvenanceColumns() {
  const revisionsTable = db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'content_artifact_revisions'
  `).get();
  if (!revisionsTable) return;
  const columns = [
    ['parent_revision_id', 'INTEGER DEFAULT NULL'],
    ['generation_job_id', 'INTEGER DEFAULT NULL'],
    ['request_key', "TEXT NOT NULL DEFAULT ''"],
    ['provenance_json', "TEXT NOT NULL DEFAULT '{}'"],
  ];
  for (const [column, definition] of columns) {
    try {
      db.prepare(`SELECT ${column} FROM content_artifact_revisions LIMIT 1`).get();
    } catch {
      db.exec(`ALTER TABLE content_artifact_revisions ADD COLUMN ${column} ${definition}`);
    }
  }
}

function ensureContentProjectSourceIdempotencyColumns() {
  const table = db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'content_project_sources'
  `).get();
  if (!table) return;
  const columns = [
    ['request_key', "TEXT NOT NULL DEFAULT ''"],
    ['input_sha256', "TEXT NOT NULL DEFAULT ''"],
  ];
  for (const [column, definition] of columns) {
    try {
      db.prepare(`SELECT ${column} FROM content_project_sources LIMIT 1`).get();
    } catch {
      db.exec(`ALTER TABLE content_project_sources ADD COLUMN ${column} ${definition}`);
    }
  }
}

function ensureContentEvidenceLifecycleColumns() {
  const table = db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'content_evidence_cards'
  `).get();
  if (!table) return;
  const columns = [
    ['decision_state', "TEXT NOT NULL DEFAULT 'candidate'"],
    ['lifecycle_status', "TEXT NOT NULL DEFAULT 'active'"],
    ['request_key', "TEXT NOT NULL DEFAULT ''"],
    ['input_sha256', "TEXT NOT NULL DEFAULT ''"],
  ];
  for (const [column, definition] of columns) {
    try {
      db.prepare(`SELECT ${column} FROM content_evidence_cards LIMIT 1`).get();
    } catch {
      db.exec(`ALTER TABLE content_evidence_cards ADD COLUMN ${column} ${definition}`);
    }
  }
}

// 旧库必须先补列，否则完整 Schema 中的 Revision 索引会因列不存在而中断初始化。
ensureBroadcastArtifactRevisionColumn();
ensureContentRevisionProvenanceColumns();
ensureContentProjectSourceIdempotencyColumns();
ensureContentEvidenceLifecycleColumns();

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

// 迁移：将音频 Render 可选关联到不可变的口播稿 Revision。
ensureBroadcastArtifactRevisionColumn();
db.exec('CREATE INDEX IF NOT EXISTS idx_broadcasts_artifact_revision_id ON broadcasts(artifact_revision_id)');

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

// 迁移：持久化每次分段生成的唯一令牌，防止超时恢复后的旧请求 ABA 写回。
try {
  db.prepare('SELECT generation_token FROM segments LIMIT 1').get();
} catch {
  db.exec('ALTER TABLE segments ADD COLUMN generation_token TEXT DEFAULT NULL');
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

const transcriptionWorkspaceColumns = [
  ['content_mode', "TEXT DEFAULT 'standard'"],
  ['structure_status', "TEXT DEFAULT 'unavailable'"],
  ['summary_status', "TEXT DEFAULT 'not_started'"],
  ['summary_error', "TEXT DEFAULT ''"],
  ['speaker_scope', "TEXT DEFAULT ''"],
  ['diarization_status', "TEXT DEFAULT ''"],
  ['speaker_count', 'INTEGER DEFAULT 0'],
  ['diarization_conflicts', 'INTEGER DEFAULT 0'],
  ['asr_diagnostics', "TEXT DEFAULT '{}'"],
  ['asr_warnings', "TEXT DEFAULT '[]'"],
  ['summary_model', "TEXT DEFAULT ''"],
  ['summary_updated_at', 'DATETIME DEFAULT NULL'],
  ['claims_status', "TEXT NOT NULL DEFAULT 'not_started'"],
  ['claims_error', "TEXT NOT NULL DEFAULT ''"],
  ['claims_model', "TEXT NOT NULL DEFAULT ''"],
  ['claims_updated_at', 'DATETIME DEFAULT NULL'],
  ['podcast_name', "TEXT NOT NULL DEFAULT ''"],
  ['episode_title', "TEXT NOT NULL DEFAULT ''"],
  ['guest_names', "TEXT NOT NULL DEFAULT '[]'"],
  ['source_url', "TEXT NOT NULL DEFAULT ''"],
  ['published_at', "TEXT NOT NULL DEFAULT ''"],
  ['topic_tags', "TEXT NOT NULL DEFAULT '[]'"]
];

for (const [column, definition] of transcriptionWorkspaceColumns) {
  try {
    db.prepare(`SELECT ${column} FROM transcription_results LIMIT 1`).get();
  } catch {
    db.exec(`ALTER TABLE transcription_results ADD COLUMN ${column} ${definition}`);
  }
}

db.prepare(`
  UPDATE transcription_results
  SET episode_title = file_name
  WHERE episode_title = ''
`).run();

// 研究工作台表族使用 CREATE TABLE IF NOT EXISTS，兼容所有旧数据库版本。
db.exec(`
  CREATE TABLE IF NOT EXISTS transcription_claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT, transcription_id INTEGER NOT NULL, speaker_key TEXT NOT NULL,
    question TEXT NOT NULL, claim TEXT NOT NULL, reasoning TEXT NOT NULL DEFAULT '', evidence_excerpt TEXT NOT NULL,
    evidence_start_index INTEGER NOT NULL, evidence_end_index INTEGER NOT NULL, start_seconds REAL NOT NULL,
    end_seconds REAL NOT NULL, topic_tags TEXT NOT NULL DEFAULT '[]', content_value INTEGER NOT NULL DEFAULT 0,
    confidence REAL NOT NULL DEFAULT 0, user_note TEXT NOT NULL DEFAULT '', is_starred INTEGER NOT NULL DEFAULT 0,
    is_hidden INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active', analysis_model TEXT NOT NULL DEFAULT '', embedding TEXT NOT NULL DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (transcription_id) REFERENCES transcription_results(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_transcription_claims_transcription
    ON transcription_claims(transcription_id, status, content_value DESC);
  CREATE TABLE IF NOT EXISTS transcription_claim_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, transcription_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'running',
    lease_expires_at_ms INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (transcription_id) REFERENCES transcription_results(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_transcription_claim_jobs_active
    ON transcription_claim_jobs(transcription_id, status, lease_expires_at_ms);
  CREATE TABLE IF NOT EXISTS claim_relations (
    id INTEGER PRIMARY KEY AUTOINCREMENT, claim_a_id INTEGER NOT NULL, claim_b_id INTEGER NOT NULL,
    relation_type TEXT NOT NULL, explanation TEXT NOT NULL, confidence REAL NOT NULL DEFAULT 0,
    analysis_model TEXT NOT NULL DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (claim_a_id) REFERENCES transcription_claims(id) ON DELETE CASCADE,
    FOREIGN KEY (claim_b_id) REFERENCES transcription_claims(id) ON DELETE CASCADE,
    UNIQUE (claim_a_id, claim_b_id)
  );
  CREATE TABLE IF NOT EXISTS content_projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, topic TEXT NOT NULL DEFAULT '',
    target_platform TEXT NOT NULL DEFAULT 'general', thesis TEXT NOT NULL DEFAULT '', personal_practice TEXT NOT NULL DEFAULT '',
    audience TEXT NOT NULL DEFAULT '', goal TEXT NOT NULL DEFAULT '', angle TEXT NOT NULL DEFAULT '',
    tone TEXT NOT NULL DEFAULT '', content_format TEXT NOT NULL DEFAULT '',
    personal_judgment TEXT NOT NULL DEFAULT '', discussion_question TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft', created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS content_project_claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, claim_id INTEGER NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0, usage_note TEXT NOT NULL DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES content_projects(id) ON DELETE CASCADE,
    FOREIGN KEY (claim_id) REFERENCES transcription_claims(id) ON DELETE CASCADE,
    UNIQUE (project_id, claim_id)
  );
  CREATE INDEX IF NOT EXISTS idx_content_project_claims_order
    ON content_project_claims(project_id, sort_order, id);
  CREATE INDEX IF NOT EXISTS idx_content_project_claims_claim
    ON content_project_claims(claim_id);
  CREATE TABLE IF NOT EXISTS content_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT, source_type TEXT NOT NULL DEFAULT 'manual',
    title TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '',
    external_ref TEXT NOT NULL DEFAULT '', metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_content_sources_type_external_ref
    ON content_sources(source_type, external_ref);
  CREATE TABLE IF NOT EXISTS content_project_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, source_id INTEGER NOT NULL,
    usage_note TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0,
    request_key TEXT NOT NULL DEFAULT '', input_sha256 TEXT NOT NULL DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES content_projects(id) ON DELETE CASCADE,
    FOREIGN KEY (source_id) REFERENCES content_sources(id) ON DELETE CASCADE,
    UNIQUE (project_id, source_id)
  );
  CREATE INDEX IF NOT EXISTS idx_content_project_sources_order
    ON content_project_sources(project_id, sort_order, id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_content_project_sources_request_key
    ON content_project_sources(project_id, request_key) WHERE request_key <> '';
  CREATE TABLE IF NOT EXISTS content_source_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    request_key TEXT NOT NULL,
    input_sha256 TEXT NOT NULL,
    source_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES content_projects(id) ON DELETE CASCADE,
    FOREIGN KEY (source_id) REFERENCES content_sources(id) ON DELETE RESTRICT,
    UNIQUE (project_id, request_key)
  );
  CREATE INDEX IF NOT EXISTS idx_content_source_requests_source
    ON content_source_requests(source_id, project_id);
  CREATE TABLE IF NOT EXISTS content_artifacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, kind TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '', platform TEXT NOT NULL DEFAULT 'general', status TEXT NOT NULL DEFAULT 'draft',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES content_projects(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_content_artifacts_project_updated
    ON content_artifacts(project_id, updated_at DESC, id DESC);
  CREATE TABLE IF NOT EXISTS content_artifact_revisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, artifact_id INTEGER NOT NULL, revision_number INTEGER NOT NULL,
    content TEXT NOT NULL DEFAULT '', change_reason TEXT NOT NULL DEFAULT 'manual',
    parent_revision_id INTEGER DEFAULT NULL, generation_job_id INTEGER DEFAULT NULL,
    request_key TEXT NOT NULL DEFAULT '', provenance_json TEXT NOT NULL DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (artifact_id) REFERENCES content_artifacts(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_revision_id) REFERENCES content_artifact_revisions(id) ON DELETE SET NULL,
    UNIQUE (artifact_id, revision_number)
  );
  CREATE INDEX IF NOT EXISTS idx_content_artifact_revisions_artifact_number
    ON content_artifact_revisions(artifact_id, revision_number DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_content_artifact_revisions_request_key
    ON content_artifact_revisions(artifact_id, request_key) WHERE request_key <> '';
`);

// 迁移：把旧关联行上最后一个可用 request key 回填到独立账本。
// 旧结构无法恢复曾被覆盖的 key，但新请求从此只向账本追加。
db.exec(`
  INSERT OR IGNORE INTO content_source_requests (
    project_id, request_key, input_sha256, source_id
  )
  SELECT project_id, request_key, input_sha256, source_id
  FROM content_project_sources
  WHERE request_key <> ''
`);

const contentProjectBriefColumns = [
  ['audience', "TEXT NOT NULL DEFAULT ''"],
  ['goal', "TEXT NOT NULL DEFAULT ''"],
  ['angle', "TEXT NOT NULL DEFAULT ''"],
  ['tone', "TEXT NOT NULL DEFAULT ''"],
  ['content_format', "TEXT NOT NULL DEFAULT ''"]
];

for (const [column, definition] of contentProjectBriefColumns) {
  try {
    db.prepare(`SELECT ${column} FROM content_projects LIMIT 1`).get();
  } catch {
    db.exec(`ALTER TABLE content_projects ADD COLUMN ${column} ${definition}`);
  }
}

try {
  db.prepare('SELECT change_reason FROM content_artifact_revisions LIMIT 1').get();
} catch {
  db.exec("ALTER TABLE content_artifact_revisions ADD COLUMN change_reason TEXT NOT NULL DEFAULT 'manual'");
}

const contentRevisionColumns = [
  ['parent_revision_id', 'INTEGER DEFAULT NULL'],
  ['generation_job_id', 'INTEGER DEFAULT NULL'],
  ['request_key', "TEXT NOT NULL DEFAULT ''"],
  ['provenance_json', "TEXT NOT NULL DEFAULT '{}'"],
];
for (const [column, definition] of contentRevisionColumns) {
  try {
    db.prepare(`SELECT ${column} FROM content_artifact_revisions LIMIT 1`).get();
  } catch {
    db.exec(`ALTER TABLE content_artifact_revisions ADD COLUMN ${column} ${definition}`);
  }
}
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_content_artifact_revisions_request_key
    ON content_artifact_revisions(artifact_id, request_key) WHERE request_key <> ''
`);

try {
  db.prepare('SELECT content_sha256 FROM content_sources LIMIT 1').get();
} catch {
  db.exec("ALTER TABLE content_sources ADD COLUMN content_sha256 TEXT NOT NULL DEFAULT ''");
}
const sourcesMissingContentHash = db.prepare(`
  SELECT id, content FROM content_sources WHERE content_sha256 = ''
`).all();
const updateSourceContentHash = db.prepare('UPDATE content_sources SET content_sha256 = ? WHERE id = ? AND content_sha256 = ?');
for (const source of sourcesMissingContentHash) {
  updateSourceContentHash.run(hashSourceContent(source.content), source.id, '');
}

db.exec(`
  CREATE TABLE IF NOT EXISTS content_evidence_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    source_id INTEGER NOT NULL,
    source_content_sha256 TEXT NOT NULL,
    start_fragment_index INTEGER NOT NULL,
    end_fragment_index INTEGER NOT NULL,
    start_offset INTEGER NOT NULL,
    end_offset INTEGER NOT NULL,
    excerpt TEXT NOT NULL,
    origin TEXT NOT NULL DEFAULT 'user' CHECK (origin IN ('ai', 'user')),
    state TEXT NOT NULL DEFAULT 'candidate'
      CHECK (state IN ('candidate', 'selected', 'rejected', 'superseded', 'stale')),
    decision_state TEXT NOT NULL DEFAULT 'candidate'
      CHECK (decision_state IN ('candidate', 'selected', 'rejected')),
    lifecycle_status TEXT NOT NULL DEFAULT 'active'
      CHECK (lifecycle_status IN ('active', 'superseded', 'stale')),
    ai_note TEXT NOT NULL DEFAULT '',
    user_note TEXT NOT NULL DEFAULT '',
    supersedes_id INTEGER DEFAULT NULL,
    generation_job_id INTEGER DEFAULT NULL,
    request_key TEXT NOT NULL DEFAULT '', input_sha256 TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES content_projects(id) ON DELETE CASCADE,
    FOREIGN KEY (source_id) REFERENCES content_sources(id) ON DELETE RESTRICT,
    FOREIGN KEY (supersedes_id) REFERENCES content_evidence_cards(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_content_evidence_project_state
    ON content_evidence_cards(project_id, state, sort_order, id);
  CREATE INDEX IF NOT EXISTS idx_content_evidence_source
    ON content_evidence_cards(source_id, source_content_sha256);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_content_evidence_request_key
    ON content_evidence_cards(project_id, request_key) WHERE request_key <> '';
  CREATE UNIQUE INDEX IF NOT EXISTS idx_content_evidence_generation_range
    ON content_evidence_cards(generation_job_id, source_id, start_fragment_index, end_fragment_index)
    WHERE generation_job_id IS NOT NULL;
  CREATE TABLE IF NOT EXISTS content_project_milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    result_id INTEGER DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES content_projects(id) ON DELETE CASCADE,
    UNIQUE (project_id, kind)
  );
  CREATE TABLE IF NOT EXISTS content_revision_citations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    revision_id INTEGER NOT NULL,
    evidence_id INTEGER NOT NULL,
    citation_order INTEGER NOT NULL,
    marker_start_offset INTEGER NOT NULL,
    marker_end_offset INTEGER NOT NULL,
    excerpt_snapshot TEXT NOT NULL,
    source_id_snapshot INTEGER NOT NULL,
    source_title_snapshot TEXT NOT NULL DEFAULT '',
    source_url_snapshot TEXT NOT NULL DEFAULT '',
    source_content_sha256 TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (revision_id) REFERENCES content_artifact_revisions(id) ON DELETE CASCADE,
    FOREIGN KEY (evidence_id) REFERENCES content_evidence_cards(id) ON DELETE RESTRICT,
    UNIQUE (revision_id, citation_order)
  );
  CREATE INDEX IF NOT EXISTS idx_content_revision_citations_evidence
    ON content_revision_citations(evidence_id, revision_id);
  CREATE TABLE IF NOT EXISTS content_generation_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('extract_evidence', 'generate_outline', 'generate_master')),
    request_key TEXT NOT NULL,
    input_sha256 TEXT NOT NULL,
    input_snapshot_json TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'queued'
      CHECK (status IN ('queued', 'running', 'completed', 'failed', 'superseded')),
    phase TEXT NOT NULL DEFAULT 'queued',
    progress INTEGER DEFAULT NULL,
    error TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '', provider TEXT NOT NULL DEFAULT '', prompt_version TEXT NOT NULL DEFAULT '',
    run_token TEXT NOT NULL DEFAULT '', lease_expires_at_ms INTEGER DEFAULT NULL,
    attempt INTEGER NOT NULL DEFAULT 0,
    result_artifact_id INTEGER DEFAULT NULL, result_revision_id INTEGER DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES content_projects(id) ON DELETE CASCADE,
    FOREIGN KEY (result_artifact_id) REFERENCES content_artifacts(id) ON DELETE SET NULL,
    FOREIGN KEY (result_revision_id) REFERENCES content_artifact_revisions(id) ON DELETE SET NULL,
    UNIQUE (project_id, operation, request_key)
  );
  CREATE INDEX IF NOT EXISTS idx_content_generation_jobs_project_recent
    ON content_generation_jobs(project_id, updated_at DESC, id DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_content_generation_jobs_active_input
    ON content_generation_jobs(project_id, operation, input_sha256)
    WHERE status IN ('queued', 'running', 'completed');
  CREATE UNIQUE INDEX IF NOT EXISTS idx_content_artifact_revisions_generation_job
    ON content_artifact_revisions(generation_job_id) WHERE generation_job_id IS NOT NULL;
`);

const contentEvidenceLifecycleColumns = [
  ['decision_state', "TEXT NOT NULL DEFAULT 'candidate'"],
  ['lifecycle_status', "TEXT NOT NULL DEFAULT 'active'"],
  ['request_key', "TEXT NOT NULL DEFAULT ''"],
  ['input_sha256', "TEXT NOT NULL DEFAULT ''"],
];
for (const [column, definition] of contentEvidenceLifecycleColumns) {
  try {
    db.prepare(`SELECT ${column} FROM content_evidence_cards LIMIT 1`).get();
  } catch {
    db.exec(`ALTER TABLE content_evidence_cards ADD COLUMN ${column} ${definition}`);
  }
}
db.exec(`
  UPDATE content_evidence_cards
  SET decision_state = CASE
      WHEN state IN ('candidate', 'selected', 'rejected') THEN state
      ELSE decision_state
    END,
    lifecycle_status = CASE
      WHEN state = 'stale' THEN 'stale'
      WHEN state = 'superseded' THEN 'superseded'
      ELSE lifecycle_status
    END;
  CREATE INDEX IF NOT EXISTS idx_content_evidence_project_lifecycle_decision
    ON content_evidence_cards(project_id, lifecycle_status, decision_state, sort_order, id);
`);

// 迁移：已有事实只回填里程碑账本，不向用户补发“第一次”庆祝。
db.exec(`
  INSERT OR IGNORE INTO content_project_milestones (project_id, kind, result_id)
  SELECT ps.project_id, 'source_saved', MIN(s.id)
  FROM content_project_sources ps
  INNER JOIN content_sources s ON s.id = ps.source_id
  WHERE TRIM(s.content) <> '' GROUP BY ps.project_id;

  INSERT OR IGNORE INTO content_project_milestones (project_id, kind, result_id)
  SELECT project_id, 'evidence_selected', MIN(id)
  FROM content_evidence_cards
  WHERE decision_state = 'selected' AND lifecycle_status = 'active'
  GROUP BY project_id;

  INSERT OR IGNORE INTO content_project_milestones (project_id, kind, result_id)
  SELECT a.project_id, 'outline_saved', MIN(r.id)
  FROM content_artifact_revisions r
  INNER JOIN content_artifacts a ON a.id = r.artifact_id
  WHERE a.kind = 'outline' AND TRIM(r.content) <> '' GROUP BY a.project_id;

`);
const historicalCitedMasters = db.prepare(`
  SELECT a.project_id, r.id, r.content
  FROM content_artifact_revisions r
  INNER JOIN content_artifacts a ON a.id = r.artifact_id
  WHERE a.kind = 'master'
    AND EXISTS (SELECT 1 FROM content_revision_citations c WHERE c.revision_id = r.id)
  ORDER BY r.id
`).all();
const backfillCitedMaster = db.prepare(`
  INSERT OR IGNORE INTO content_project_milestones (project_id, kind, result_id)
  VALUES (?, 'cited_master_saved', ?)
`);
for (const revision of historicalCitedMasters) {
  if (revision.content.replace(/\[证据#[1-9]\d*\]/g, '').trim()) {
    backfillCitedMaster.run(revision.project_id, revision.id);
  }
}

try {
  db.prepare('SELECT is_hidden FROM transcription_claims LIMIT 1').get();
} catch {
  db.exec('ALTER TABLE transcription_claims ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0');
}

try {
  db.prepare('SELECT corrected_text FROM transcription_turns LIMIT 1').get();
} catch {
  db.exec("ALTER TABLE transcription_turns ADD COLUMN corrected_text TEXT NOT NULL DEFAULT ''");
}

try {
  db.prepare('SELECT source_index FROM transcription_segments LIMIT 1').get();
} catch {
  db.exec('ALTER TABLE transcription_segments ADD COLUMN source_index INTEGER NOT NULL DEFAULT -1');
  db.exec('UPDATE transcription_segments SET source_index = segment_index WHERE source_index = -1');
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
  embedding_enabled: false,
  embedding_base_url: '',
  embedding_api_key: '',
  embedding_model: '',
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
