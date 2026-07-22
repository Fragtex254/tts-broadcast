const db = require('../db');

const REFERENCED_CLAIM_DELETE_MESSAGE = '该观点已被内容项目引用，请先从内容项目移除观点后再删除';

class TranscriptionClaimInUseError extends Error {
  constructor() {
    super(REFERENCED_CLAIM_DELETE_MESSAGE);
    this.name = 'TranscriptionClaimInUseError';
    this.code = 'TRANSCRIPTION_CLAIM_IN_USE';
  }
}

function parseJson(raw, fallback) {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

function normalizeClaim(row) {
  if (!row) return undefined;
  const parsedEmbedding = parseJson(row.embedding, null);
  return {
    ...row,
    topic_tags: parseJson(row.topic_tags, []),
    embedding: Array.isArray(parsedEmbedding) ? parsedEmbedding : null,
    content_value: Number(row.content_value || 0),
    confidence: Number(row.confidence || 0),
    is_starred: Boolean(row.is_starred),
    is_hidden: Boolean(row.is_hidden),
  };
}

const CLAIM_SELECT = `
  SELECT c.*, r.podcast_name, r.episode_title, r.source_url, r.published_at,
         s.display_name AS speaker_name
  FROM transcription_claims c
  JOIN transcription_results r ON r.id = c.transcription_id
  LEFT JOIN transcription_speakers s
    ON s.transcription_id = c.transcription_id AND s.speaker_key = c.speaker_key
`;

function listClaims({ transcriptionId, status, starred } = {}) {
  const conditions = [];
  const params = [];
  if (transcriptionId) { conditions.push('c.transcription_id = ?'); params.push(transcriptionId); }
  if (status) { conditions.push('c.status = ?'); params.push(status); }
  if (starred !== undefined) { conditions.push('c.is_starred = ?'); params.push(starred ? 1 : 0); }
  const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
  return db.prepare(`${CLAIM_SELECT}${where} ORDER BY c.content_value DESC, c.id DESC`).all(...params).map(normalizeClaim);
}

function getClaim(id) {
  return normalizeClaim(db.prepare(`${CLAIM_SELECT} WHERE c.id = ?`).get(id));
}

/**
 * 批量按 ID 获取观点，避免 N+1 查询。
 * @param {number[]} ids - 观点 ID 列表
 * @returns {Object[]} 命中的观点（不保证顺序）
 */
function listClaimsByIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  return db.prepare(`${CLAIM_SELECT} WHERE c.id IN (${placeholders})`).all(...ids).map(normalizeClaim);
}

/**
 * 一次查询取回一组观点两两之间已缓存的关系，内存中再配对。
 * @param {number[]} ids - 观点 ID 列表
 * @returns {Object[]} 命中的关系记录
 */
function listRelationsAmong(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  return db.prepare(`
    SELECT * FROM claim_relations
    WHERE claim_a_id IN (${placeholders}) AND claim_b_id IN (${placeholders})
  `).all(...ids, ...ids);
}

function updateClaim(id, { userNote, isStarred, isHidden, status } = {}) {
  const current = getClaim(id);
  if (!current) return undefined;
  const nextStatus = status === undefined ? current.status : status;
  const result = db.prepare(`
    UPDATE transcription_claims
    SET user_note = ?, is_starred = ?, is_hidden = ?, status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    userNote === undefined ? current.user_note : userNote,
    isStarred === undefined ? (current.is_starred ? 1 : 0) : (isStarred ? 1 : 0),
    isHidden === undefined ? (current.is_hidden ? 1 : 0) : (isHidden ? 1 : 0),
    nextStatus,
    id
  );
  return result.changes ? getClaim(id) : undefined;
}

const removeClaimTransaction = db.transaction((id) => {
  const reference = db.prepare('SELECT 1 FROM content_project_claims WHERE claim_id = ? LIMIT 1').get(id);
  if (reference) throw new TranscriptionClaimInUseError();
  return db.prepare('DELETE FROM transcription_claims WHERE id = ?').run(id).changes > 0;
});

/**
 * 删除观点。检查项目引用与删除在同一事务内完成。
 * @param {number} id - 观点 ID
 * @returns {boolean} 是否删除成功
 * @throws {TranscriptionClaimInUseError} 观点已被内容项目引用时阻止删除
 */
function removeClaim(id) {
  return removeClaimTransaction(id);
}

function updateClaimsStatus(transcriptionId, { status, error = '', model = '' }) {
  db.prepare(`
    UPDATE transcription_results
    SET claims_status = ?, claims_error = ?, claims_model = ?, claims_updated_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status, error, model, transcriptionId);
}

function markClaimsStale(transcriptionId) {
  db.prepare(`UPDATE transcription_claims SET status = 'stale', updated_at = CURRENT_TIMESTAMP WHERE transcription_id = ?`).run(transcriptionId);
  db.prepare(`
    UPDATE transcription_results
    SET claims_status = CASE WHEN claims_status = 'completed' THEN 'stale' ELSE claims_status END,
        claims_error = '', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(transcriptionId);
}

function replaceClaims(transcriptionId, { claims, model }) {
  const run = db.transaction(() => {
    db.prepare(`UPDATE transcription_claims SET status = 'stale', updated_at = CURRENT_TIMESTAMP WHERE transcription_id = ?`).run(transcriptionId);
    db.prepare(`
      DELETE FROM transcription_claims
      WHERE transcription_id = ?
        AND NOT EXISTS (SELECT 1 FROM content_project_claims pc WHERE pc.claim_id = transcription_claims.id)
    `).run(transcriptionId);
    const insert = db.prepare(`
      INSERT INTO transcription_claims (
        transcription_id, speaker_key, question, claim, reasoning, evidence_excerpt,
        evidence_start_index, evidence_end_index, start_seconds, end_seconds, topic_tags,
        content_value, confidence, status, analysis_model, embedding
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `);
    for (const claim of claims) {
      insert.run(
        transcriptionId, claim.speakerKey, claim.question, claim.claim, claim.reasoning,
        claim.evidenceExcerpt, claim.evidenceStartIndex, claim.evidenceEndIndex,
        claim.startSeconds, claim.endSeconds, JSON.stringify(claim.topicTags),
        claim.contentValue, claim.confidence, model, claim.embedding ? JSON.stringify(claim.embedding) : ''
      );
    }
    updateClaimsStatus(transcriptionId, { status: 'completed', model });
  });
  run();
  return listClaims({ transcriptionId });
}

function setClaimEmbedding(id, embedding) {
  db.prepare(`UPDATE transcription_claims SET embedding = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(JSON.stringify(embedding), id);
  return getClaim(id);
}

function getRelation(claimAId, claimBId) {
  const [a, b] = claimAId < claimBId ? [claimAId, claimBId] : [claimBId, claimAId];
  return db.prepare('SELECT * FROM claim_relations WHERE claim_a_id = ? AND claim_b_id = ?').get(a, b);
}

function upsertRelation({ claimAId, claimBId, relationType, explanation, confidence, analysisModel }) {
  const [a, b] = claimAId < claimBId ? [claimAId, claimBId] : [claimBId, claimAId];
  db.prepare(`
    INSERT INTO claim_relations (claim_a_id, claim_b_id, relation_type, explanation, confidence, analysis_model)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(claim_a_id, claim_b_id) DO UPDATE SET
      relation_type = excluded.relation_type, explanation = excluded.explanation,
      confidence = excluded.confidence, analysis_model = excluded.analysis_model,
      updated_at = CURRENT_TIMESTAMP
  `).run(a, b, relationType, explanation, confidence, analysisModel);
  return getRelation(a, b);
}

module.exports = {
  REFERENCED_CLAIM_DELETE_MESSAGE, TranscriptionClaimInUseError,
  getClaim, getRelation, listClaims, listClaimsByIds, listRelationsAmong,
  markClaimsStale, removeClaim, replaceClaims,
  setClaimEmbedding, updateClaim, updateClaimsStatus, upsertRelation,
};
