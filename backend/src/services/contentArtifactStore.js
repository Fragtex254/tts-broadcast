const db = require('../db');

function toRevisionDto(row) {
  if (!row) return null;
  return {
    id: row.id,
    artifact_id: row.artifact_id,
    revision_number: Number(row.revision_number),
    content: row.content,
    change_reason: row.change_reason,
    created_at: row.created_at,
  };
}

function getCurrentRevision(artifactId) {
  return toRevisionDto(db.prepare(`
    SELECT id, artifact_id, revision_number, content, change_reason, created_at
    FROM content_artifact_revisions
    WHERE artifact_id = ?
    ORDER BY revision_number DESC
    LIMIT 1
  `).get(artifactId));
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

/**
 * 按 Revision ID 读取不可变版本及所属 Artifact 上下文。
 * @param {Object} params
 * @param {number} params.revisionId - 稿件版本 ID
 * @returns {{ revision: Object, artifact: Object }|undefined} Revision 与 Artifact 上下文
 */
function getRevisionContext({ revisionId }) {
  const revisionRow = db.prepare(`
    SELECT id, artifact_id, revision_number, content, change_reason, created_at
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
}) => {
  const project = db.prepare('SELECT id FROM content_projects WHERE id = ?').get(projectId);
  if (!project) return undefined;

  const result = db.prepare(`
    INSERT INTO content_artifacts (project_id, kind, title, platform, status)
    VALUES (?, ?, ?, ?, ?)
  `).run(projectId, kind, title, platform, status);
  const artifactId = Number(result.lastInsertRowid);

  if (hasContent) {
    db.prepare(`
      INSERT INTO content_artifact_revisions (artifact_id, revision_number, content, change_reason)
      VALUES (?, 1, ?, ?)
    `).run(artifactId, content, changeReason);
  }
  db.prepare(`
    UPDATE content_projects
    SET updated_at = STRFTIME('%Y-%m-%d %H:%M:%f', 'now')
    WHERE id = ?
  `).run(projectId);

  return getById({ projectId, artifactId });
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

const addRevisionTransaction = db.transaction(({ projectId, artifactId, content, changeReason }) => {
  const artifact = db.prepare(`
    SELECT id FROM content_artifacts WHERE project_id = ? AND id = ?
  `).get(projectId, artifactId);
  if (!artifact) return undefined;

  const revisionNumber = Number(db.prepare(`
    SELECT COALESCE(MAX(revision_number), 0) + 1 AS value
    FROM content_artifact_revisions
    WHERE artifact_id = ?
  `).get(artifactId).value);
  const result = db.prepare(`
    INSERT INTO content_artifact_revisions (artifact_id, revision_number, content, change_reason)
    VALUES (?, ?, ?, ?)
  `).run(artifactId, revisionNumber, content, changeReason);
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
    SELECT id, artifact_id, revision_number, content, change_reason, created_at
    FROM content_artifact_revisions WHERE id = ?
  `).get(result.lastInsertRowid));
  return { revision, artifact: getById({ projectId, artifactId }) };
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
    SELECT id, artifact_id, revision_number, content, change_reason, created_at
    FROM content_artifact_revisions
    WHERE artifact_id = ?
    ORDER BY revision_number DESC
  `).all(artifactId).map(toRevisionDto);
}

module.exports = { addRevision, create, getById, getRevisionContext, listForProject, listRevisions };
