const db = require('../db');
const contentMilestoneStore = require('./contentMilestoneStore');
const { createSourceFragments, hashSourceContent } = require('../utils/contentSourceFragments');

const USER_STATES = new Set(['candidate', 'selected', 'rejected']);

function toEvidenceDto(row) {
  if (!row) return undefined;
  const decisionState = row.decision_state || (
    ['candidate', 'selected', 'rejected'].includes(row.state) ? row.state : 'candidate'
  );
  const lifecycleStatus = row.lifecycle_status || (
    ['stale', 'superseded'].includes(row.state) ? row.state : 'active'
  );
  const sourceIntegrityValid = !row.current_source_sha256
    || (row.current_source_sha256 === row.source_content_sha256
      && hashSourceContent(row.current_source_content || '') === row.source_content_sha256);
  const sourceLinked = row.source_linked === undefined ? true : Boolean(row.source_linked);
  const reuseEligible = decisionState === 'selected'
    && lifecycleStatus === 'active'
    && sourceLinked
    && sourceIntegrityValid;
  return {
    id: row.id,
    project_id: row.project_id,
    source_id: row.source_id,
    source_title: row.source_title || '',
    source_content_sha256: row.source_content_sha256,
    start_fragment_index: Number(row.start_fragment_index),
    end_fragment_index: Number(row.end_fragment_index),
    start_offset: Number(row.start_offset),
    end_offset: Number(row.end_offset),
    excerpt: row.excerpt,
    origin: row.origin,
    // `state` 暂保留为用户决策维度，避免旧客户端把技术失效误当成用户驳回。
    state: decisionState,
    decision_state: decisionState,
    lifecycle_status: lifecycleStatus,
    source_linked: sourceLinked,
    source_snapshot_intact: sourceIntegrityValid,
    reuse_eligible: reuseEligible,
    unavailable_reason: reuseEligible
      ? ''
      : (!sourceIntegrityValid
        ? 'source_changed'
        : (!sourceLinked
          ? 'source_unlinked'
          : (lifecycleStatus !== 'active' ? lifecycleStatus : 'not_selected'))),
    ai_note: row.ai_note,
    user_note: row.user_note,
    supersedes_id: row.supersedes_id,
    generation_job_id: row.generation_job_id,
    sort_order: Number(row.sort_order),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function getForProject({ projectId, evidenceId }) {
  return toEvidenceDto(db.prepare(`
    SELECT e.*, s.title AS source_title, s.content AS current_source_content,
      s.content_sha256 AS current_source_sha256,
      CASE WHEN ps.id IS NULL THEN 0 ELSE 1 END AS source_linked
    FROM content_evidence_cards e
    INNER JOIN content_sources s ON s.id = e.source_id
    LEFT JOIN content_project_sources ps
      ON ps.project_id = e.project_id AND ps.source_id = e.source_id
    WHERE e.project_id = ? AND e.id = ?
  `).get(projectId, evidenceId));
}

function listForProject({ projectId }) {
  return db.prepare(`
    SELECT e.*, s.title AS source_title, s.content AS current_source_content,
      s.content_sha256 AS current_source_sha256,
      CASE WHEN ps.id IS NULL THEN 0 ELSE 1 END AS source_linked
    FROM content_evidence_cards e
    INNER JOIN content_sources s ON s.id = e.source_id
    LEFT JOIN content_project_sources ps
      ON ps.project_id = e.project_id AND ps.source_id = e.source_id
    WHERE e.project_id = ?
    ORDER BY e.sort_order, e.id
  `).all(projectId).map(toEvidenceDto);
}

function requireFragmentRange(source, fragmentStart, fragmentEnd) {
  if (!Number.isInteger(fragmentStart) || !Number.isInteger(fragmentEnd)
    || fragmentStart < 0 || fragmentEnd < fragmentStart || fragmentEnd - fragmentStart > 50) {
    const error = new Error('证据 fragment 范围无效');
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  const fragments = createSourceFragments(source.content);
  const selected = [];
  for (let index = fragmentStart; index <= fragmentEnd; index++) {
    const fragment = fragments[index];
    if (!fragment || fragment.index !== index) {
      const error = new Error('证据引用了不存在的来源 fragment');
      error.code = 'VALIDATION_ERROR';
      throw error;
    }
    selected.push(fragment);
  }
  if (selected.length === 0) {
    const error = new Error('证据 fragment 范围不能为空');
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  const startOffset = selected[0].start_offset;
  const endOffset = selected[selected.length - 1].end_offset;
  return {
    startOffset,
    endOffset,
    excerpt: source.content.slice(startOffset, endOffset),
  };
}

const createTransaction = db.transaction(({
  projectId,
  sourceId,
  fragmentStart,
  fragmentEnd,
  origin,
  aiNote,
  userNote,
  supersedesEvidenceId,
  generationJobId,
  requestKey = '',
  decisionState = 'candidate',
}) => {
  const source = db.prepare(`
    SELECT s.* FROM content_sources s
    INNER JOIN content_project_sources ps ON ps.source_id = s.id
    WHERE ps.project_id = ? AND s.id = ?
  `).get(projectId, sourceId);
  if (!source) return undefined;
  const actualHash = hashSourceContent(source.content);
  if (source.content_sha256 !== actualHash) {
    const error = new Error('来源正文已变化，请重新打开后再定位证据');
    error.code = 'CONTEXT_CHANGED';
    throw error;
  }
  const range = requireFragmentRange(source, fragmentStart, fragmentEnd);
  const hadPriorSelectedEvidence = decisionState === 'selected' && Boolean(db.prepare(`
    SELECT 1 FROM content_evidence_cards
    WHERE project_id = ? AND decision_state = 'selected' AND lifecycle_status = 'active'
    LIMIT 1
  `).get(projectId));
  const inputSha256 = hashSourceContent(JSON.stringify({
    sourceId,
    sourceContentSha256: actualHash,
    fragmentStart,
    fragmentEnd,
    origin,
    aiNote,
    userNote,
    supersedesEvidenceId: supersedesEvidenceId ?? null,
    decisionState,
  }));
  if (requestKey) {
    const prior = db.prepare(`
      SELECT id, input_sha256 FROM content_evidence_cards
      WHERE project_id = ? AND request_key = ?
    `).get(projectId, requestKey);
    if (prior) {
      if (prior.input_sha256 !== inputSha256) {
        const error = new Error('同一请求标识已用于不同证据内容');
        error.code = 'IDEMPOTENCY_CONFLICT';
        throw error;
      }
      return {
        evidence: getForProject({ projectId, evidenceId: prior.id }),
        reused: true,
      };
    }
  }

  let superseded;
  if (supersedesEvidenceId !== undefined && supersedesEvidenceId !== null) {
    superseded = db.prepare(`
      SELECT * FROM content_evidence_cards
      WHERE id = ? AND project_id = ? AND source_id = ?
    `).get(supersedesEvidenceId, projectId, sourceId);
    if (!superseded) {
      const error = new Error('待修正证据不存在或不属于当前来源');
      error.code = 'NOT_FOUND';
      throw error;
    }
    if (superseded.lifecycle_status !== 'active') {
      const error = new Error('待修正证据已被修正或失效，请基于最新证据重新定位');
      error.code = 'CONTEXT_CHANGED';
      throw error;
    }
    const claimed = db.prepare(`
      UPDATE content_evidence_cards
      SET lifecycle_status = 'superseded', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND project_id = ? AND source_id = ? AND lifecycle_status = 'active'
    `).run(superseded.id, projectId, sourceId);
    if (claimed.changes === 0) {
      const error = new Error('待修正证据已被其他请求修正，请刷新后重试');
      error.code = 'CONTEXT_CHANGED';
      throw error;
    }
  }

  const sortOrder = Number(db.prepare(`
    SELECT COALESCE(MAX(sort_order), -1) + 1 AS value
    FROM content_evidence_cards WHERE project_id = ?
  `).get(projectId).value);
  const result = db.prepare(`
    INSERT INTO content_evidence_cards (
      project_id, source_id, source_content_sha256,
      start_fragment_index, end_fragment_index, start_offset, end_offset, excerpt,
      origin, state, decision_state, lifecycle_status, ai_note, user_note,
      supersedes_id, generation_job_id, request_key, input_sha256, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)
  `).run(
    projectId, sourceId, actualHash,
    fragmentStart, fragmentEnd, range.startOffset, range.endOffset, range.excerpt,
    origin, decisionState, decisionState, aiNote, userNote, superseded?.id || null,
    generationJobId || null, requestKey, inputSha256, sortOrder
  );
  db.prepare(`
    UPDATE content_projects SET updated_at = STRFTIME('%Y-%m-%d %H:%M:%f', 'now') WHERE id = ?
  `).run(projectId);
  const evidenceId = Number(result.lastInsertRowid);
  return {
    evidence: getForProject({ projectId, evidenceId }),
    reused: false,
    milestone: decisionState === 'selected'
      ? contentMilestoneStore.claim({
        projectId,
        kind: 'evidence_selected',
        resultId: evidenceId,
        hadPriorFact: hadPriorSelectedEvidence,
      })
      : undefined,
  };
});

/**
 * 从项目内不可变 Source fragment 创建证据卡，摘录始终由后端派生。
 * @param {Object} params - 证据创建参数
 * @returns {Object|undefined} 新证据卡
 */
function create(params) {
  if (!['ai', 'user'].includes(params.origin)) throw new Error('证据来源类型无效');
  if (!['candidate', 'selected'].includes(params.decisionState || 'candidate')) {
    throw new Error('新建证据只能是候选或立即采用状态');
  }
  if (params.origin === 'ai' && (params.decisionState || 'candidate') !== 'candidate') {
    throw new Error('AI 候选证据不能自动替用户采用');
  }
  if (typeof params.aiNote !== 'string' || params.aiNote.length > 5000) throw new Error('AI 证据说明无效或过长');
  if (typeof params.userNote !== 'string' || params.userNote.length > 5000) throw new Error('证据用户笔记无效或过长');
  return createTransaction(params);
}

const updateTransaction = db.transaction(({ projectId, evidenceId, state, userNote }) => {
  const current = db.prepare(`
    SELECT * FROM content_evidence_cards WHERE project_id = ? AND id = ?
  `).get(projectId, evidenceId);
  if (!current) return undefined;
  if (current.lifecycle_status !== 'active') {
    const error = new Error('失效或已被修正的证据不能重新选择');
    error.code = 'CONTEXT_CHANGED';
    throw error;
  }
  const nextState = state === undefined ? current.decision_state : state;
  const hadPriorSelectedEvidence = nextState === 'selected' && Boolean(db.prepare(`
    SELECT 1 FROM content_evidence_cards
    WHERE project_id = ? AND decision_state = 'selected' AND lifecycle_status = 'active'
    LIMIT 1
  `).get(projectId));
  if (!USER_STATES.has(nextState)) {
    const error = new Error('证据选择状态无效');
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  if (nextState === 'selected') {
    const linkedSource = db.prepare(`
      SELECT s.content, s.content_sha256
      FROM content_sources s
      INNER JOIN content_project_sources ps ON ps.source_id = s.id
      WHERE ps.project_id = ? AND s.id = ?
    `).get(projectId, current.source_id);
    if (!linkedSource || linkedSource.content_sha256 !== current.source_content_sha256
      || hashSourceContent(linkedSource.content) !== current.source_content_sha256) {
      db.prepare(`
        UPDATE content_evidence_cards SET lifecycle_status = 'stale', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND project_id = ?
      `).run(evidenceId, projectId);
      return { contextChanged: true };
    }
  }
  db.prepare(`
    UPDATE content_evidence_cards
    SET state = ?, decision_state = ?, user_note = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND project_id = ?
  `).run(nextState, nextState, userNote === undefined ? current.user_note : userNote, evidenceId, projectId);
  db.prepare(`
    UPDATE content_projects SET updated_at = STRFTIME('%Y-%m-%d %H:%M:%f', 'now') WHERE id = ?
  `).run(projectId);
  return {
    evidence: getForProject({ projectId, evidenceId }),
    milestone: nextState === 'selected'
      ? contentMilestoneStore.claim({
        projectId,
        kind: 'evidence_selected',
        resultId: evidenceId,
        hadPriorFact: hadPriorSelectedEvidence,
      })
      : undefined,
  };
});

function update(params) {
  const result = updateTransaction(params);
  if (result?.contextChanged) {
    const error = new Error('证据来源已变化或已移出项目，请重新定位');
    error.code = 'CONTEXT_CHANGED';
    throw error;
  }
  return result;
}

const unlinkSourceTransaction = db.transaction(({ projectId, sourceId }) => {
  const source = db.prepare(`
    SELECT s.id, s.title, s.content, s.content_sha256, s.source_type, s.url
    FROM content_sources s
    INNER JOIN content_project_sources ps ON ps.source_id = s.id
    WHERE ps.project_id = ? AND s.id = ?
  `).get(projectId, sourceId);
  if (!source) return undefined;
  db.prepare(`
    UPDATE content_evidence_cards
    SET lifecycle_status = 'stale', updated_at = CURRENT_TIMESTAMP
    WHERE project_id = ? AND source_id = ? AND lifecycle_status <> 'superseded'
  `).run(projectId, sourceId);
  db.prepare(`
    DELETE FROM content_project_sources WHERE project_id = ? AND source_id = ?
  `).run(projectId, sourceId);
  db.prepare(`
    UPDATE content_projects SET updated_at = STRFTIME('%Y-%m-%d %H:%M:%f', 'now') WHERE id = ?
  `).run(projectId);
  return source;
});

function unlinkSource(params) {
  return unlinkSourceTransaction(params);
}

module.exports = {
  USER_STATES,
  create,
  getForProject,
  listForProject,
  requireFragmentRange,
  unlinkSource,
  update,
};
