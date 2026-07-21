const db = require('../db');
const contentMilestoneStore = require('./contentMilestoneStore');
const { hashSourceContent } = require('../utils/contentSourceFragments');

function sourceRequestHash(params) {
  return hashSourceContent(JSON.stringify({
    sourceId: params.sourceId ?? null,
    sourceType: params.sourceType,
    title: params.title,
    content: params.content,
    url: params.url,
    externalRef: params.externalRef,
    metadataJson: params.metadataJson,
    usageNote: params.usageNote,
    sortOrder: params.sortOrder ?? null,
  }));
}

function parseMetadata(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function toSourceDto(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    project_id: row.project_id,
    project_source_id: row.project_source_id,
    source_type: row.source_type,
    title: row.title,
    content: row.content,
    content_sha256: row.content_sha256,
    url: row.url,
    external_ref: row.external_ref,
    metadata: parseMetadata(row.metadata_json),
    usage_note: row.usage_note,
    sort_order: Number(row.sort_order),
    created_at: row.created_at,
    updated_at: row.updated_at,
    linked_at: row.linked_at,
    link_updated_at: row.link_updated_at,
  };
}

function getLinkedSource(projectId, sourceId) {
  const row = db.prepare(`
    SELECT
      s.id, ps.project_id, ps.id AS project_source_id, s.source_type, s.title, s.content, s.content_sha256,
      s.url, s.external_ref, s.metadata_json, ps.usage_note, ps.sort_order,
      s.created_at, s.updated_at, ps.created_at AS linked_at, ps.updated_at AS link_updated_at
    FROM content_project_sources ps
    INNER JOIN content_sources s ON s.id = ps.source_id
    WHERE ps.project_id = ? AND ps.source_id = ?
  `).get(projectId, sourceId);
  return toSourceDto(row);
}

function getForProject({ projectId, sourceId }) {
  return getLinkedSource(projectId, sourceId);
}

function getForProjectOrHistoricalCitation({ projectId, sourceId }) {
  return db.prepare(`
    SELECT s.*
    FROM content_sources s
    WHERE s.id = ? AND (
      EXISTS (
        SELECT 1 FROM content_project_sources ps
        WHERE ps.project_id = ? AND ps.source_id = s.id
      ) OR EXISTS (
        SELECT 1
        FROM content_revision_citations c
        INNER JOIN content_artifact_revisions r ON r.id = c.revision_id
        INNER JOIN content_artifacts a ON a.id = r.artifact_id
        WHERE a.project_id = ? AND c.source_id_snapshot = s.id
      )
    )
  `).get(sourceId, projectId, projectId);
}

/**
 * 获取项目按使用顺序排列的通用来源。
 * @param {Object} params
 * @param {number} params.projectId - 内容项目 ID
 * @returns {Array<Object>} 来源 DTO 列表
 */
function listForProject({ projectId }) {
  return db.prepare(`
    SELECT
      s.id, ps.project_id, ps.id AS project_source_id, s.source_type, s.title, s.content, s.content_sha256,
      s.url, s.external_ref, s.metadata_json, ps.usage_note, ps.sort_order,
      s.created_at, s.updated_at, ps.created_at AS linked_at, ps.updated_at AS link_updated_at
    FROM content_project_sources ps
    INNER JOIN content_sources s ON s.id = ps.source_id
    WHERE ps.project_id = ?
    ORDER BY ps.sort_order, ps.id
  `).all(projectId).map(toSourceDto);
}

const createAndLinkTransaction = db.transaction(({
  projectId,
  sourceId,
  sourceType,
  title,
  content,
  url,
  externalRef,
  metadataJson,
  usageNote,
  sortOrder,
  requestKey = '',
}) => {
  const project = db.prepare('SELECT id FROM content_projects WHERE id = ?').get(projectId);
  if (!project) return undefined;
  const hadPriorFact = Boolean(db.prepare(`
    SELECT 1 FROM content_project_sources ps
    INNER JOIN content_sources s ON s.id = ps.source_id
    WHERE ps.project_id = ? AND TRIM(s.content) <> '' LIMIT 1
  `).get(projectId));
  const inputSha256 = sourceRequestHash({
    sourceId, sourceType, title, content, url, externalRef, metadataJson, usageNote, sortOrder,
  });
  if (requestKey) {
    const prior = db.prepare(`
      SELECT source_id, input_sha256 FROM content_source_requests
      WHERE project_id = ? AND request_key = ?
    `).get(projectId, requestKey);
    if (prior) {
      if (prior.input_sha256 !== inputSha256) {
        const error = new Error('同一请求标识已用于不同来源内容');
        error.code = 'IDEMPOTENCY_CONFLICT';
        throw error;
      }
      const source = getLinkedSource(projectId, prior.source_id);
      if (!source) {
        const error = new Error('原请求的来源已被移出项目，幂等重放不会自动恢复关联');
        error.code = 'IDEMPOTENCY_CONFLICT';
        throw error;
      }
      return {
        source,
        reused: true,
      };
    }
  }
  let resolvedSourceId = sourceId;
  let resolvedSourceContent = content;
  if (resolvedSourceId) {
    const source = db.prepare('SELECT id, content FROM content_sources WHERE id = ?').get(resolvedSourceId);
    if (!source) return undefined;
    resolvedSourceContent = source.content;
  } else {
    const result = db.prepare(`
      INSERT INTO content_sources (
        source_type, title, content, content_sha256, url, external_ref, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(sourceType, title, content, hashSourceContent(content), url, externalRef, metadataJson);
    resolvedSourceId = Number(result.lastInsertRowid);
  }

  const existingLink = db.prepare(`
    SELECT sort_order FROM content_project_sources WHERE project_id = ? AND source_id = ?
  `).get(projectId, resolvedSourceId);
  const nextSortOrder = sortOrder ?? existingLink?.sort_order ?? Number(db.prepare(`
    SELECT COALESCE(MAX(sort_order), -1) + 1 AS value
    FROM content_project_sources WHERE project_id = ?
  `).get(projectId).value);

  db.prepare(`
    INSERT INTO content_project_sources (
      project_id, source_id, usage_note, sort_order, request_key, input_sha256
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id, source_id) DO UPDATE SET
      usage_note = excluded.usage_note,
      sort_order = excluded.sort_order,
      updated_at = CURRENT_TIMESTAMP
  `).run(projectId, resolvedSourceId, usageNote, nextSortOrder, requestKey, inputSha256);
  if (requestKey) {
    db.prepare(`
      INSERT INTO content_source_requests (project_id, request_key, input_sha256, source_id)
      VALUES (?, ?, ?, ?)
    `).run(projectId, requestKey, inputSha256, resolvedSourceId);
  }
  db.prepare(`
    UPDATE content_projects
    SET updated_at = STRFTIME('%Y-%m-%d %H:%M:%f', 'now')
    WHERE id = ?
  `).run(projectId);

  return {
    source: getLinkedSource(projectId, resolvedSourceId),
    reused: false,
    milestone: resolvedSourceContent.trim()
      ? contentMilestoneStore.claim({
        projectId,
        kind: 'source_saved',
        resultId: resolvedSourceId,
        hadPriorFact,
      })
      : undefined,
  };
});

/**
 * 新建来源并关联项目，或把已有来源关联到项目。
 * @param {Object} params
 * @param {number} params.projectId - 内容项目 ID
 * @param {number|undefined} params.sourceId - 可选的已有来源 ID
 * @param {string} params.sourceType - 来源类型
 * @param {string} params.title - 来源标题
 * @param {string} params.content - 来源正文，原样保存
 * @param {string} params.url - 来源 URL
 * @param {string} params.externalRef - 外部来源标识
 * @param {string} params.metadataJson - 规范化后的 JSON 字符串
 * @param {string} params.usageNote - 在当前项目中的用途说明
 * @param {number|undefined} params.sortOrder - 可选排序位置
 * @returns {{source:Object,milestone?:Object}|undefined} 已关联来源与可选里程碑
 */
function createAndLink(params) {
  return createAndLinkTransaction(params);
}

module.exports = {
  createAndLink,
  getForProject,
  getForProjectOrHistoricalCitation,
  listForProject,
};
