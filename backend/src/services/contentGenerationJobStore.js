const crypto = require('crypto');
const db = require('../db');

const ACTIVE_STATUSES = new Set(['queued', 'running']);

function parseSnapshot(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function toJobDto(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    project_id: row.project_id,
    operation: row.operation,
    request_key: row.request_key,
    status: row.status,
    phase: row.phase,
    progress: row.progress === null ? null : Number(row.progress),
    error: row.error,
    result_artifact_id: row.result_artifact_id,
    result_revision_id: row.result_revision_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function getInternal(jobId) {
  const row = db.prepare('SELECT * FROM content_generation_jobs WHERE id = ?').get(jobId);
  return row ? { ...row, input_snapshot: parseSnapshot(row.input_snapshot_json) } : undefined;
}

function get(jobId) {
  return toJobDto(db.prepare('SELECT * FROM content_generation_jobs WHERE id = ?').get(jobId));
}

function listForProject({ projectId, limit = 20 }) {
  return db.prepare(`
    SELECT * FROM content_generation_jobs
    WHERE project_id = ?
    ORDER BY updated_at DESC, id DESC
    LIMIT ?
  `).all(projectId, limit).map(toJobDto);
}

const acquireTransaction = db.transaction(({
  projectId,
  operation,
  requestKey,
  inputSha256,
  snapshot,
  leaseMs,
}) => {
  const sameKey = db.prepare(`
    SELECT * FROM content_generation_jobs
    WHERE project_id = ? AND operation = ? AND request_key = ?
  `).get(projectId, operation, requestKey);
  if (sameKey) {
    if (sameKey.input_sha256 !== inputSha256) {
      const error = new Error('同一请求标识对应的创作上下文已经变化');
      error.code = 'IDEMPOTENCY_CONFLICT';
      throw error;
    }
    if (['failed', 'superseded'].includes(sameKey.status)) {
      // 另一个标签页可能已在旧任务失败后，用不同 requestKey 受理了同一事实快照。
      // 先收敛到那条唯一的 active/completed Job，避免把旧行复活时撞上唯一索引。
      const converged = db.prepare(`
        SELECT * FROM content_generation_jobs
        WHERE project_id = ? AND operation = ? AND input_sha256 = ? AND id <> ?
          AND status IN ('queued', 'running', 'completed')
        ORDER BY id DESC LIMIT 1
      `).get(projectId, operation, inputSha256, sameKey.id);
      if (converged) {
        return { job: toJobDto(converged), accepted: false, reused: true };
      }
      db.prepare(`
        UPDATE content_generation_jobs
        SET status = 'queued', phase = 'queued', progress = NULL, error = '',
          run_token = '', lease_expires_at_ms = ?, result_artifact_id = NULL,
          result_revision_id = NULL, updated_at = STRFTIME('%Y-%m-%d %H:%M:%f', 'now')
        WHERE id = ?
      `).run(Date.now() + leaseMs, sameKey.id);
      return { job: get(sameKey.id), accepted: true, reused: true };
    }
    return { job: toJobDto(sameKey), accepted: false, reused: true };
  }

  // 不同浏览器标签即使生成了不同 requestKey，只要事实快照相同也收敛为同一任务。
  const sameInput = db.prepare(`
    SELECT * FROM content_generation_jobs
    WHERE project_id = ? AND operation = ? AND input_sha256 = ?
      AND status IN ('queued', 'running', 'completed')
    ORDER BY id DESC LIMIT 1
  `).get(projectId, operation, inputSha256);
  if (sameInput) return { job: toJobDto(sameInput), accepted: false, reused: true };

  const result = db.prepare(`
    INSERT INTO content_generation_jobs (
      project_id, operation, request_key, input_sha256, input_snapshot_json,
      status, phase, lease_expires_at_ms
    ) VALUES (?, ?, ?, ?, ?, 'queued', 'queued', ?)
  `).run(
    projectId, operation, requestKey, inputSha256,
    JSON.stringify(snapshot), Date.now() + leaseMs
  );
  return { job: get(Number(result.lastInsertRowid)), accepted: true, reused: false };
});

function acquire(params) {
  return acquireTransaction(params);
}

const claimRunTransaction = db.transaction(({ jobId, leaseMs }) => {
  const current = db.prepare(`
    SELECT * FROM content_generation_jobs WHERE id = ? AND status = 'queued'
  `).get(jobId);
  if (!current) return undefined;
  const runToken = crypto.randomUUID();
  const result = db.prepare(`
    UPDATE content_generation_jobs
    SET status = 'running', phase = 'building_context', progress = 0, run_token = ?,
      lease_expires_at_ms = ?, attempt = attempt + 1,
      updated_at = STRFTIME('%Y-%m-%d %H:%M:%f', 'now')
    WHERE id = ? AND status = 'queued'
  `).run(runToken, Date.now() + leaseMs, jobId);
  if (result.changes === 0) return undefined;
  return { ...getInternal(jobId), run_token: runToken };
});

function claimRun(params) {
  return claimRunTransaction(params);
}

function heartbeat({ jobId, runToken, leaseMs, phase, progress }) {
  const result = db.prepare(`
    UPDATE content_generation_jobs
    SET lease_expires_at_ms = ?, phase = COALESCE(?, phase), progress = COALESCE(?, progress),
      updated_at = STRFTIME('%Y-%m-%d %H:%M:%f', 'now')
    WHERE id = ? AND status = 'running' AND run_token = ?
  `).run(Date.now() + leaseMs, phase ?? null, progress ?? null, jobId, runToken);
  return result.changes > 0 ? get(jobId) : undefined;
}

function fail({ jobId, runToken, error }) {
  const result = db.prepare(`
    UPDATE content_generation_jobs
    SET status = 'failed', phase = 'failed', error = ?, progress = NULL,
      run_token = '', lease_expires_at_ms = NULL,
      updated_at = STRFTIME('%Y-%m-%d %H:%M:%f', 'now')
    WHERE id = ? AND status = 'running' AND run_token = ?
  `).run(String(error || '创作任务失败').slice(0, 5000), jobId, runToken);
  return result.changes > 0 ? get(jobId) : undefined;
}

const finishSuccessTransaction = db.transaction(({
  jobId,
  runToken,
  verifyContext,
  materialize,
  metadata = {},
}) => {
  const current = getInternal(jobId);
  if (!current || current.status !== 'running' || current.run_token !== runToken) return undefined;
  let verified;
  let contextError = '';
  try {
    verified = verifyContext(current);
  } catch (error) {
    contextError = error.message || '创作上下文已经变化';
  }
  if (contextError || !verified || verified.inputSha256 !== current.input_sha256) {
    db.prepare(`
      UPDATE content_generation_jobs
      SET status = 'superseded', phase = 'superseded', progress = NULL,
        error = ?, run_token = '',
        lease_expires_at_ms = NULL, updated_at = STRFTIME('%Y-%m-%d %H:%M:%f', 'now')
      WHERE id = ? AND status = 'running' AND run_token = ?
    `).run(
      contextError
        ? `创作上下文在生成期间发生变化：${contextError}`.slice(0, 5000)
        : '创作上下文在生成期间发生变化，请基于最新内容重试',
      jobId,
      runToken
    );
    return { job: get(jobId), contextChanged: true };
  }
  const result = materialize(current);
  const updated = db.prepare(`
    UPDATE content_generation_jobs
    SET status = 'completed', phase = 'completed', progress = 100, error = '',
      model = ?, provider = ?, prompt_version = ?, run_token = '', lease_expires_at_ms = NULL,
      result_artifact_id = ?, result_revision_id = ?,
      updated_at = STRFTIME('%Y-%m-%d %H:%M:%f', 'now')
    WHERE id = ? AND status = 'running' AND run_token = ?
  `).run(
    metadata.model || '', metadata.provider || '', metadata.prompt_version || '',
    result?.artifactId ?? null, result?.revisionId ?? null, jobId, runToken
  );
  if (updated.changes === 0) {
    const error = new Error('旧 worker 已失去任务所有权');
    error.code = 'STALE_WORKER';
    throw error;
  }
  return { job: get(jobId), milestone: result?.milestone };
});

function finishSuccess(params) {
  return finishSuccessTransaction(params);
}

function reconcileExpired({ projectId, now = Date.now() }) {
  return db.prepare(`
    UPDATE content_generation_jobs
    SET status = 'failed', phase = 'failed', progress = NULL,
      error = '上次创作任务已中断，可以安全重试', run_token = '', lease_expires_at_ms = NULL,
      updated_at = STRFTIME('%Y-%m-%d %H:%M:%f', 'now')
    WHERE project_id = ? AND status IN ('queued', 'running')
      AND lease_expires_at_ms IS NOT NULL AND lease_expires_at_ms < ?
  `).run(projectId, now).changes;
}

module.exports = {
  ACTIVE_STATUSES,
  acquire,
  claimRun,
  fail,
  finishSuccess,
  get,
  getInternal,
  heartbeat,
  listForProject,
  reconcileExpired,
  toJobDto,
};
