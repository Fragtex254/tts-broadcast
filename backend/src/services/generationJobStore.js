const db = require('../db');

const JOB_TYPE_SEGMENT_BATCH_TTS = 'segment-batch-tts';

function acquire({ broadcastId, jobType = JOB_TYPE_SEGMENT_BATCH_TTS, nowMs = Date.now(), leaseMs }) {
  const leaseExpiresAtMs = nowMs + leaseMs;
  const run = db.transaction(() => {
    const active = db.prepare(`
      SELECT *
      FROM generation_jobs
      WHERE broadcast_id = ?
        AND job_type = ?
        AND status = 'running'
        AND lease_expires_at_ms > ?
      ORDER BY id DESC
      LIMIT 1
    `).get(broadcastId, jobType, nowMs);

    if (active) return null;

    db.prepare(`
      UPDATE generation_jobs
      SET status = 'expired', updated_at = CURRENT_TIMESTAMP
      WHERE broadcast_id = ?
        AND job_type = ?
        AND status = 'running'
        AND lease_expires_at_ms <= ?
    `).run(broadcastId, jobType, nowMs);

    const result = db.prepare(`
      INSERT INTO generation_jobs (broadcast_id, job_type, status, lease_expires_at_ms)
      VALUES (?, ?, 'running', ?)
    `).run(broadcastId, jobType, leaseExpiresAtMs);

    return db.prepare('SELECT * FROM generation_jobs WHERE id = ?').get(result.lastInsertRowid);
  });

  return run();
}

function heartbeat({ jobId, nowMs = Date.now(), leaseMs }) {
  const leaseExpiresAtMs = nowMs + leaseMs;
  db.prepare(`
    UPDATE generation_jobs
    SET lease_expires_at_ms = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'running'
  `).run(leaseExpiresAtMs, jobId);
}

function finish({ jobId, status = 'completed' }) {
  db.prepare(`
    UPDATE generation_jobs
    SET status = ?, lease_expires_at_ms = 0, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status, jobId);
}

function getActive({ broadcastId, jobType = JOB_TYPE_SEGMENT_BATCH_TTS, nowMs = Date.now() }) {
  return db.prepare(`
    SELECT *
    FROM generation_jobs
    WHERE broadcast_id = ?
      AND job_type = ?
      AND status = 'running'
      AND lease_expires_at_ms > ?
    ORDER BY id DESC
    LIMIT 1
  `).get(broadcastId, jobType, nowMs);
}

function clear() {
  db.prepare('DELETE FROM generation_jobs').run();
}

module.exports = {
  JOB_TYPE_SEGMENT_BATCH_TTS,
  acquire,
  heartbeat,
  finish,
  getActive,
  clear,
};
