const db = require('../db');

function acquire({ transcriptionId, nowMs = Date.now(), leaseMs }) {
  return db.transaction(() => {
    const active = db.prepare(`SELECT * FROM transcription_claim_jobs WHERE transcription_id = ? AND status = 'running' AND lease_expires_at_ms > ? ORDER BY id DESC LIMIT 1`).get(transcriptionId, nowMs);
    if (active) return null;
    db.prepare(`UPDATE transcription_claim_jobs SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE transcription_id = ? AND status = 'running' AND lease_expires_at_ms <= ?`).run(transcriptionId, nowMs);
    const result = db.prepare(`INSERT INTO transcription_claim_jobs (transcription_id, status, lease_expires_at_ms) VALUES (?, 'running', ?)`).run(transcriptionId, nowMs + leaseMs);
    return db.prepare('SELECT * FROM transcription_claim_jobs WHERE id = ?').get(result.lastInsertRowid);
  })();
}

function hasActive({ transcriptionId, nowMs = Date.now() }) {
  db.prepare(`UPDATE transcription_claim_jobs SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE transcription_id = ? AND status = 'running' AND lease_expires_at_ms <= ?`).run(transcriptionId, nowMs);
  return Boolean(db.prepare(`SELECT id FROM transcription_claim_jobs WHERE transcription_id = ? AND status = 'running' AND lease_expires_at_ms > ? LIMIT 1`).get(transcriptionId, nowMs));
}

function heartbeat({ jobId, nowMs = Date.now(), leaseMs }) {
  db.prepare(`UPDATE transcription_claim_jobs SET lease_expires_at_ms = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'running'`).run(nowMs + leaseMs, jobId);
}

function finish({ jobId, status }) {
  db.prepare(`UPDATE transcription_claim_jobs SET status = ?, lease_expires_at_ms = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(status, jobId);
}

module.exports = { acquire, finish, hasActive, heartbeat };
