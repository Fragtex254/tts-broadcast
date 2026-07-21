const db = require('../db');
const contentMilestoneStore = require('./contentMilestoneStore');
const { hashSourceContent } = require('../utils/contentSourceFragments');

function parseObject(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function uniqueIntegers(values) {
  return [...new Set(values.filter(Number.isInteger))];
}

function rowsByIds({ table, columns, ids }) {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  return db.prepare(`SELECT ${columns} FROM ${table} WHERE id IN (${placeholders})`).all(...ids);
}

function listRevisionCitations(revisionId, { hashContent = hashSourceContent } = {}) {
  const rows = db.prepare(`
    SELECT c.*, a.project_id
    FROM content_revision_citations c
    INNER JOIN content_artifact_revisions r ON r.id = c.revision_id
    INNER JOIN content_artifacts a ON a.id = r.artifact_id
    WHERE c.revision_id = ?
    ORDER BY c.citation_order, c.id
  `).all(revisionId);
  if (rows.length === 0) return [];

  const projectId = rows[0].project_id;
  const evidenceIds = uniqueIntegers(rows.map((row) => row.evidence_id));
  const sourceIds = uniqueIntegers(rows.map((row) => row.source_id_snapshot));
  const evidenceById = new Map(rowsByIds({
    table: 'content_evidence_cards',
    columns: `id, project_id, source_id, decision_state, lifecycle_status,
      start_offset, end_offset, start_fragment_index, end_fragment_index, excerpt`,
    ids: evidenceIds,
  }).map((evidence) => [evidence.id, evidence]));
  const sourceIntegrityById = new Map(rowsByIds({
    table: 'content_sources',
    columns: 'id, content, content_sha256',
    ids: sourceIds,
  }).map((source) => [source.id, {
    source,
    // 大 Source 只按唯一 source_id 计算一次，避免重复 Citation 放大同步 CPU。
    actualSha256: hashContent(source.content),
  }]));
  const linkedSourceIds = new Set();
  if (sourceIds.length > 0) {
    const placeholders = sourceIds.map(() => '?').join(',');
    for (const link of db.prepare(`
      SELECT source_id FROM content_project_sources
      WHERE project_id = ? AND source_id IN (${placeholders})
    `).all(projectId, ...sourceIds)) {
      linkedSourceIds.add(link.source_id);
    }
  }
  const integrityByEvidenceId = new Map();

  return rows.map((row) => {
    const evidence = evidenceById.get(row.evidence_id);
    const sourceIntegrity = sourceIntegrityById.get(row.source_id_snapshot);
    const cached = integrityByEvidenceId.get(row.evidence_id);
    const sameSnapshot = cached
      && cached.sourceId === row.source_id_snapshot
      && cached.sourceSha256 === row.source_content_sha256
      && cached.excerpt === row.excerpt_snapshot;
    let integrityValid = sameSnapshot ? cached.integrityValid : false;
    if (!sameSnapshot) {
      const source = sourceIntegrity?.source;
      integrityValid = Boolean(evidence && source
        && evidence.project_id === projectId
        && evidence.source_id === row.source_id_snapshot
        && source.content_sha256 === row.source_content_sha256
        && sourceIntegrity.actualSha256 === row.source_content_sha256
        && source.content.slice(evidence.start_offset, evidence.end_offset) === row.excerpt_snapshot
        && evidence.excerpt === row.excerpt_snapshot);
      integrityByEvidenceId.set(row.evidence_id, {
        sourceId: row.source_id_snapshot,
        sourceSha256: row.source_content_sha256,
        excerpt: row.excerpt_snapshot,
        integrityValid,
      });
    }
    return {
      id: row.id,
      revision_id: row.revision_id,
      evidence_id: row.evidence_id,
      citation_order: Number(row.citation_order),
      marker_start_offset: Number(row.marker_start_offset),
      marker_end_offset: Number(row.marker_end_offset),
      excerpt: row.excerpt_snapshot,
      source_id: row.source_id_snapshot,
      source_title: row.source_title_snapshot,
      source_url: row.source_url_snapshot,
      source_content_sha256: row.source_content_sha256,
      evidence_state: row.evidence_state,
      source_linked: linkedSourceIds.has(row.source_id_snapshot),
      evidence_start_offset: Number(evidence?.start_offset ?? 0),
      evidence_end_offset: Number(evidence?.end_offset ?? 0),
      evidence_start_fragment_index: Number(evidence?.start_fragment_index ?? 0),
      evidence_end_fragment_index: Number(evidence?.end_fragment_index ?? 0),
      current_evidence_excerpt: evidence?.excerpt || '',
      evidence_decision_state: evidence?.decision_state || '',
      evidence_lifecycle_status: evidence?.lifecycle_status || '',
      integrity_valid: integrityValid,
    };
  });
}

function publicCitation(citation) {
  const integrityValid = citation.integrity_valid;
  return {
    id: citation.id,
    revision_id: citation.revision_id,
    evidence_id: citation.evidence_id,
    marker: `[证据#${citation.evidence_id}]`,
    excerpt: citation.excerpt,
    source_id: citation.source_id,
    source_title: citation.source_title,
    source_content_sha256: citation.source_content_sha256,
    start_fragment_index: citation.evidence_start_fragment_index,
    end_fragment_index: citation.evidence_end_fragment_index,
    start_offset: citation.evidence_start_offset,
    end_offset: citation.evidence_end_offset,
    is_stale: !integrityValid,
    source_linked: citation.source_linked,
    evidence_decision_state: citation.evidence_decision_state,
    evidence_lifecycle_status: citation.evidence_lifecycle_status,
    reuse_eligible: integrityValid
      && citation.source_linked
      && citation.evidence_decision_state === 'selected'
      && citation.evidence_lifecycle_status === 'active',
  };
}

function normalizeProvenance(value) {
  const parsed = parseObject(value);
  const blocks = Array.isArray(parsed.blocks) ? parsed.blocks : [];
  const creatorInputs = parsed.creator_inputs && typeof parsed.creator_inputs === 'object'
    && !Array.isArray(parsed.creator_inputs)
    ? Object.fromEntries(Object.entries(parsed.creator_inputs)
      .filter(([key, item]) => ['personal_practice', 'personal_judgment'].includes(key) && typeof item === 'string'))
    : {};
  return {
    blocks: blocks.filter((block) => block && typeof block === 'object').map((block) => ({
      basis: ['evidence', 'creator', 'inference'].includes(block.basis) ? block.basis : 'inference',
      text: typeof block.text === 'string' ? block.text : '',
      evidence_ids: Array.isArray(block.evidence_ids)
        ? block.evidence_ids.filter(Number.isInteger)
        : [],
    })),
    origin: parsed.origin === 'ai' ? 'ai' : 'manual',
    operation: typeof parsed.operation === 'string' ? parsed.operation : 'manual_save',
    prompt_version: typeof parsed.prompt_version === 'string' ? parsed.prompt_version : '',
    model: typeof parsed.model === 'string' ? parsed.model : '',
    provider: typeof parsed.provider === 'string' ? parsed.provider : '',
    input_fingerprint: typeof parsed.input_fingerprint === 'string' ? parsed.input_fingerprint : '',
    creator_input_keys: Array.isArray(parsed.creator_input_keys)
      ? parsed.creator_input_keys.filter((key) => ['personal_practice', 'personal_judgment'].includes(key))
      : [],
    creator_inputs: creatorInputs,
    outline_revision_id: Number.isInteger(parsed.outline_revision_id) ? parsed.outline_revision_id : null,
    evidence_ids: Array.isArray(parsed.evidence_ids) ? parsed.evidence_ids.filter(Number.isInteger) : [],
  };
}

function toRevisionDto(row) {
  if (!row) return null;
  const internalCitations = listRevisionCitations(row.id);
  const citations = internalCitations.map(publicCitation);
  return {
    id: row.id,
    artifact_id: row.artifact_id,
    revision_number: Number(row.revision_number),
    content: row.content,
    change_reason: row.change_reason,
    parent_revision_id: row.parent_revision_id,
    generation_job_id: row.generation_job_id,
    request_key: row.request_key,
    provenance: normalizeProvenance(row.provenance_json),
    citations,
    citation_status: citations.length === 0
      ? 'not_applicable'
      : (citations.every((citation) => !citation.is_stale) ? 'valid' : 'stale'),
    created_at: row.created_at,
  };
}

function getCurrentRevision(artifactId) {
  return toRevisionDto(db.prepare(`
    SELECT id, artifact_id, revision_number, content, change_reason,
      parent_revision_id, generation_job_id, request_key, provenance_json, created_at
    FROM content_artifact_revisions
    WHERE artifact_id = ?
    ORDER BY revision_number DESC
    LIMIT 1
  `).get(artifactId));
}

function parseCitationMarkers(content) {
  const markers = [];
  const pattern = /\[证据#([1-9]\d*)\]/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    markers.push({
      evidenceId: Number(match[1]),
      citationOrder: markers.length,
      markerStartOffset: match.index,
      markerEndOffset: match.index + match[0].length,
    });
    if (markers.length > 200) {
      const error = new Error('单个版本最多引用 200 处证据');
      error.code = 'INVALID_CITATION';
      throw error;
    }
  }
  if (String(content || '').replace(pattern, '').includes('[证据#')) {
    const error = new Error('证据标记格式无效，请使用 [证据#数字ID]');
    error.code = 'INVALID_CITATION';
    throw error;
  }
  return markers;
}

function validateCitationMarkers({ projectId, content, hashContent = hashSourceContent }) {
  const markers = parseCitationMarkers(content);
  if (markers.length === 0) return [];
  const evidenceIds = uniqueIntegers(markers.map((marker) => marker.evidenceId));
  const evidenceRows = rowsByIds({
    table: 'content_evidence_cards',
    columns: `id, project_id, source_id, source_content_sha256, decision_state, lifecycle_status,
      start_offset, end_offset, excerpt`,
    ids: evidenceIds,
  });
  const evidenceById = new Map(evidenceRows.map((evidence) => [evidence.id, evidence]));
  // 先做廉价的归属/状态白名单校验，再读取并哈希可能很大的 Source。
  // 这样跨项目 Evidence ID 无法被用来放大同步 CPU 工作。
  for (const evidenceId of evidenceIds) {
    const evidence = evidenceById.get(evidenceId);
    if (!evidence) {
      const error = new Error(`证据 #${evidenceId} 不存在`);
      error.code = 'INVALID_CITATION';
      throw error;
    }
    if (evidence.project_id !== projectId) {
      const error = new Error(`证据 #${evidenceId} 不属于当前项目`);
      error.code = 'CITATION_CONFLICT';
      throw error;
    }
    if (evidence.decision_state !== 'selected' || evidence.lifecycle_status !== 'active') {
      const error = new Error(`证据 #${evidenceId} 尚未选择或已经失效`);
      error.code = 'CITATION_CONFLICT';
      throw error;
    }
  }
  const sourceIds = uniqueIntegers(evidenceRows.map((evidence) => evidence.source_id));
  const sourceById = new Map(rowsByIds({
    table: 'content_sources',
    columns: 'id, title, url, content, content_sha256',
    ids: sourceIds,
  }).map((source) => [source.id, {
    ...source,
    actual_sha256: hashContent(source.content),
  }]));
  const linkedSourceIds = new Set();
  if (sourceIds.length > 0) {
    const placeholders = sourceIds.map(() => '?').join(',');
    for (const link of db.prepare(`
      SELECT source_id FROM content_project_sources
      WHERE project_id = ? AND source_id IN (${placeholders})
    `).all(projectId, ...sourceIds)) {
      linkedSourceIds.add(link.source_id);
    }
  }
  const validatedByEvidenceId = new Map();
  for (const evidenceId of evidenceIds) {
    const evidence = evidenceById.get(evidenceId);
    const source = sourceById.get(evidence.source_id);
    if (!linkedSourceIds.has(evidence.source_id) || !source
      || source.content_sha256 !== evidence.source_content_sha256
      || source.actual_sha256 !== evidence.source_content_sha256
      || source.content.slice(evidence.start_offset, evidence.end_offset) !== evidence.excerpt) {
      const error = new Error(`证据 #${evidenceId} 的来源已经变化或移出项目`);
      error.code = 'CITATION_CONFLICT';
      throw error;
    }
    validatedByEvidenceId.set(evidenceId, {
      excerptSnapshot: evidence.excerpt,
      sourceIdSnapshot: evidence.source_id,
      sourceTitleSnapshot: source.title,
      sourceUrlSnapshot: source.url,
      sourceContentSha256: evidence.source_content_sha256,
    });
  }
  return markers.map((marker) => ({
    ...marker,
    ...validatedByEvidenceId.get(marker.evidenceId),
  }));
}

function validateParentRevision({ projectId, artifactId, parentRevisionId }) {
  if (parentRevisionId === undefined || parentRevisionId === null) return null;
  const parent = db.prepare(`
    SELECT r.id FROM content_artifact_revisions r
    INNER JOIN content_artifacts a ON a.id = r.artifact_id
    WHERE r.id = ? AND a.project_id = ? AND a.id = ?
  `).get(parentRevisionId, projectId, artifactId);
  if (!parent) {
    const error = new Error('父稿件版本不存在或不属于当前稿件');
    error.code = 'CITATION_CONFLICT';
    throw error;
  }
  return parent.id;
}

function insertCitations(revisionId, citations) {
  const insert = db.prepare(`
    INSERT INTO content_revision_citations (
      revision_id, evidence_id, citation_order, marker_start_offset, marker_end_offset,
      excerpt_snapshot, source_id_snapshot, source_title_snapshot, source_url_snapshot,
      source_content_sha256
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const citation of citations) {
    insert.run(
      revisionId, citation.evidenceId, citation.citationOrder,
      citation.markerStartOffset, citation.markerEndOffset,
      citation.excerptSnapshot, citation.sourceIdSnapshot,
      citation.sourceTitleSnapshot, citation.sourceUrlSnapshot, citation.sourceContentSha256
    );
  }
}

function milestoneForRevision({ projectId, kind, revisionId, citationCount }) {
  const content = db.prepare('SELECT content FROM content_artifact_revisions WHERE id = ?').get(revisionId)?.content || '';
  if (kind === 'outline' && content.trim()) {
    return contentMilestoneStore.claim({
      projectId,
      kind: 'outline_saved',
      resultId: revisionId,
    });
  }
  const substantiveMaster = content.replace(/\[证据#[1-9]\d*\]/g, '').trim();
  if (kind === 'master' && citationCount > 0 && substantiveMaster) {
    return contentMilestoneStore.claim({
      projectId,
      kind: 'cited_master_saved',
      resultId: revisionId,
    });
  }
  return undefined;
}

function toArtifactDto(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    project_id: row.project_id,
    kind: row.kind,
    title: row.title,
    platform: row.platform,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    current_revision: getCurrentRevision(row.id),
  };
}

function getById({ projectId, artifactId }) {
  const row = db.prepare(`
    SELECT id, project_id, kind, title, platform, status, created_at, updated_at
    FROM content_artifacts
    WHERE project_id = ? AND id = ?
  `).get(projectId, artifactId);
  return toArtifactDto(row);
}

function getCanonicalForKind({ projectId, kind }) {
  const row = db.prepare(`
    SELECT id, project_id, kind, title, platform, status, created_at, updated_at
    FROM content_artifacts
    WHERE project_id = ? AND kind = ?
    ORDER BY id ASC LIMIT 1
  `).get(projectId, kind);
  return toArtifactDto(row);
}

/**
 * 按 Revision ID 读取不可变版本及所属 Artifact 上下文。
 * @param {Object} params
 * @param {number} params.revisionId - 稿件版本 ID
 * @returns {{ revision: Object, artifact: Object }|undefined} Revision 与 Artifact 上下文
 */
function getRevisionContext({ revisionId }) {
  const revisionRow = db.prepare(`
    SELECT id, artifact_id, revision_number, content, change_reason,
      parent_revision_id, generation_job_id, request_key, provenance_json, created_at
    FROM content_artifact_revisions
    WHERE id = ?
  `).get(revisionId);
  if (!revisionRow) return undefined;

  const artifactRow = db.prepare(`
    SELECT id, project_id, kind, title, platform, status, created_at, updated_at
    FROM content_artifacts
    WHERE id = ?
  `).get(revisionRow.artifact_id);
  if (!artifactRow) return undefined;
  return {
    revision: toRevisionDto(revisionRow),
    artifact: toArtifactDto(artifactRow),
  };
}

/**
 * 获取项目中的全部稿件及各自当前版本。
 * @param {Object} params
 * @param {number} params.projectId - 内容项目 ID
 * @returns {Array<Object>} 稿件 DTO 列表
 */
function listForProject({ projectId }) {
  return db.prepare(`
    SELECT id, project_id, kind, title, platform, status, created_at, updated_at
    FROM content_artifacts
    WHERE project_id = ?
    ORDER BY updated_at DESC, id DESC
  `).all(projectId).map(toArtifactDto);
}

const createArtifactTransaction = db.transaction(({
  projectId,
  kind,
  title,
  platform,
  status,
  hasContent,
  content,
  changeReason,
  parentRevisionId,
  generationJobId,
  requestKey = '',
  provenance = {},
}) => {
  const project = db.prepare('SELECT id FROM content_projects WHERE id = ?').get(projectId);
  if (!project) return undefined;

  if (hasContent && requestKey) {
    const existing = db.prepare(`
      SELECT r.id, r.artifact_id, r.content, r.change_reason, r.parent_revision_id, a.kind
      FROM content_artifact_revisions r
      INNER JOIN content_artifacts a ON a.id = r.artifact_id
      WHERE a.project_id = ? AND r.request_key = ?
      LIMIT 1
    `).get(projectId, requestKey);
    if (existing) {
      if (existing.content !== content || existing.kind !== kind
        || existing.change_reason !== changeReason
        || existing.parent_revision_id !== (parentRevisionId ?? null)) {
        const error = new Error('同一请求标识已用于不同稿件内容、父版本或修改原因');
        error.code = 'IDEMPOTENCY_CONFLICT';
        throw error;
      }
      return {
        artifact: getById({ projectId, artifactId: existing.artifact_id }),
        reused: true,
      };
    }
  }

  const citations = hasContent ? validateCitationMarkers({ projectId, content }) : [];

  const result = db.prepare(`
    INSERT INTO content_artifacts (project_id, kind, title, platform, status)
    VALUES (?, ?, ?, ?, ?)
  `).run(projectId, kind, title, platform, status);
  const artifactId = Number(result.lastInsertRowid);
  const currentRevision = db.prepare(`
    SELECT id FROM content_artifact_revisions
    WHERE artifact_id = ? ORDER BY revision_number DESC LIMIT 1
  `).get(artifactId);
  const parentId = parentRevisionId === undefined || parentRevisionId === null
    ? (currentRevision?.id || null)
    : validateParentRevision({ projectId, artifactId, parentRevisionId });

  let revisionId;
  if (hasContent) {
    const revisionResult = db.prepare(`
      INSERT INTO content_artifact_revisions (
        artifact_id, revision_number, content, change_reason, parent_revision_id,
        generation_job_id, request_key, provenance_json
      ) VALUES (?, 1, ?, ?, ?, ?, ?, ?)
    `).run(
      artifactId, content, changeReason, parentId, generationJobId ?? null,
      requestKey, JSON.stringify(provenance || {})
    );
    revisionId = Number(revisionResult.lastInsertRowid);
    insertCitations(revisionId, citations);
  }
  db.prepare(`
    UPDATE content_projects
    SET updated_at = STRFTIME('%Y-%m-%d %H:%M:%f', 'now')
    WHERE id = ?
  `).run(projectId);

  return {
    artifact: getById({ projectId, artifactId }),
    reused: false,
    milestone: revisionId
      ? milestoneForRevision({ projectId, kind, revisionId, citationCount: citations.length })
      : undefined,
  };
});

/**
 * 创建稿件，并可在同一事务中创建首个不可变版本。
 * @param {Object} params
 * @param {number} params.projectId - 内容项目 ID
 * @param {string} params.kind - 稿件类型
 * @param {string} params.title - 稿件标题
 * @param {string} params.platform - 目标平台
 * @param {string} params.status - 稿件状态
 * @param {boolean} params.hasContent - 是否显式提供首版内容
 * @param {string} params.content - 首版正文，原样保存
 * @param {string} params.changeReason - 首版创建原因
 * @returns {Object|undefined} 稿件 DTO
 */
function create(params) {
  return createArtifactTransaction(params);
}

const addRevisionTransaction = db.transaction(({
  projectId,
  artifactId,
  content,
  changeReason,
  parentRevisionId,
  generationJobId,
  requestKey = '',
  provenance = {},
}) => {
  const artifact = db.prepare(`
    SELECT id, kind FROM content_artifacts WHERE project_id = ? AND id = ?
  `).get(projectId, artifactId);
  if (!artifact) return undefined;

  if (requestKey) {
    const existing = db.prepare(`
      SELECT id, content, change_reason, parent_revision_id FROM content_artifact_revisions
      WHERE artifact_id = ? AND request_key = ?
    `).get(artifactId, requestKey);
    if (existing) {
      const explicitParentChanged = parentRevisionId !== undefined
        && existing.parent_revision_id !== parentRevisionId;
      if (existing.content !== content || existing.change_reason !== changeReason || explicitParentChanged) {
        const error = new Error('同一请求标识已用于不同稿件内容、父版本或修改原因');
        error.code = 'IDEMPOTENCY_CONFLICT';
        throw error;
      }
      return {
        revision: toRevisionDto(db.prepare(`
          SELECT id, artifact_id, revision_number, content, change_reason,
            parent_revision_id, generation_job_id, request_key, provenance_json, created_at
          FROM content_artifact_revisions WHERE id = ?
        `).get(existing.id)),
        artifact: getById({ projectId, artifactId }),
        reused: true,
      };
    }
  }

  const latestRevision = db.prepare(`
    SELECT id FROM content_artifact_revisions
    WHERE artifact_id = ? ORDER BY revision_number DESC LIMIT 1
  `).get(artifactId);
  const parentId = parentRevisionId === undefined || parentRevisionId === null
    ? (latestRevision?.id || null)
    : validateParentRevision({ projectId, artifactId, parentRevisionId });
  const citations = validateCitationMarkers({ projectId, content });

  const revisionNumber = Number(db.prepare(`
    SELECT COALESCE(MAX(revision_number), 0) + 1 AS value
    FROM content_artifact_revisions
    WHERE artifact_id = ?
  `).get(artifactId).value);
  const result = db.prepare(`
    INSERT INTO content_artifact_revisions (
      artifact_id, revision_number, content, change_reason, parent_revision_id,
      generation_job_id, request_key, provenance_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    artifactId, revisionNumber, content, changeReason, parentId,
    generationJobId ?? null, requestKey, JSON.stringify(provenance || {})
  );
  const revisionId = Number(result.lastInsertRowid);
  insertCitations(revisionId, citations);
  db.prepare(`
    UPDATE content_artifacts
    SET updated_at = STRFTIME('%Y-%m-%d %H:%M:%f', 'now')
    WHERE id = ?
  `).run(artifactId);
  db.prepare(`
    UPDATE content_projects
    SET updated_at = STRFTIME('%Y-%m-%d %H:%M:%f', 'now')
    WHERE id = ?
  `).run(projectId);

  const revision = toRevisionDto(db.prepare(`
    SELECT id, artifact_id, revision_number, content, change_reason,
      parent_revision_id, generation_job_id, request_key, provenance_json, created_at
    FROM content_artifact_revisions WHERE id = ?
  `).get(revisionId));
  return {
    revision,
    artifact: getById({ projectId, artifactId }),
    reused: false,
    milestone: milestoneForRevision({
      projectId,
      kind: artifact.kind,
      revisionId,
      citationCount: citations.length,
    }),
  };
});

/**
 * 给稿件追加一个不可变版本。
 * @param {Object} params
 * @param {number} params.projectId - 内容项目 ID
 * @param {number} params.artifactId - 稿件 ID
 * @param {string} params.content - 新版本正文，原样保存
 * @param {string} params.changeReason - 修改原因
 * @returns {{ revision: Object, artifact: Object }|undefined} 新版本与稿件 DTO
 */
function addRevision(params) {
  return addRevisionTransaction(params);
}

/**
 * 获取指定项目稿件的全部历史版本。
 * @param {Object} params
 * @param {number} params.projectId - 内容项目 ID
 * @param {number} params.artifactId - 稿件 ID
 * @returns {Array<Object>|undefined} 按版本号倒序排列的历史版本
 */
function listRevisions({ projectId, artifactId }) {
  const artifact = db.prepare(`
    SELECT id FROM content_artifacts WHERE project_id = ? AND id = ?
  `).get(projectId, artifactId);
  if (!artifact) return undefined;
  return db.prepare(`
    SELECT id, artifact_id, revision_number, content, change_reason,
      parent_revision_id, generation_job_id, request_key, provenance_json, created_at
    FROM content_artifact_revisions
    WHERE artifact_id = ?
    ORDER BY revision_number DESC
  `).all(artifactId).map(toRevisionDto);
}

module.exports = {
  addRevision,
  create,
  getById,
  getCanonicalForKind,
  getRevisionContext,
  listForProject,
  listRevisionCitations,
  listRevisions,
  parseCitationMarkers,
  validateCitationMarkers,
};
