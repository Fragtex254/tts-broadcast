const db = require('../db');
const researchStore = require('./researchStore');

const TARGET_PLATFORMS = new Set(['xiaohongshu', 'wechat', 'twitter', 'general']);

function list() {
  return db.prepare(`
    SELECT p.*, COUNT(pc.id) AS claim_count
    FROM content_projects p LEFT JOIN content_project_claims pc ON pc.project_id = p.id
    GROUP BY p.id ORDER BY p.updated_at DESC, p.id DESC
  `).all().map((row) => ({ ...row, claim_count: Number(row.claim_count || 0) }));
}

function getById(id) {
  const project = db.prepare('SELECT * FROM content_projects WHERE id = ?').get(id);
  if (!project) return undefined;
  const links = db.prepare(`
    SELECT * FROM content_project_claims WHERE project_id = ? ORDER BY sort_order, id
  `).all(id);
  return {
    ...project,
    claims: links.map((link) => ({ ...link, claim: researchStore.getClaim(link.claim_id) })).filter((item) => item.claim),
  };
}

function create({
  title,
  topic = '',
  targetPlatform = 'general',
  thesis = '',
  audience = '',
  goal = '',
  angle = '',
  tone = '',
  contentFormat = '',
}) {
  if (!TARGET_PLATFORMS.has(targetPlatform)) throw new Error('目标平台无效');
  const result = db.prepare(`
    INSERT INTO content_projects (
      title, topic, target_platform, thesis, audience, goal, angle, tone, content_format
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, topic, targetPlatform, thesis, audience, goal, angle, tone, contentFormat);
  return getById(result.lastInsertRowid);
}

function update(id, values) {
  const current = getById(id);
  if (!current) return undefined;
  const targetPlatform = values.targetPlatform ?? current.target_platform;
  if (!TARGET_PLATFORMS.has(targetPlatform)) throw new Error('目标平台无效');
  db.prepare(`
    UPDATE content_projects SET title = ?, topic = ?, target_platform = ?, thesis = ?,
      audience = ?, goal = ?, angle = ?, tone = ?, content_format = ?,
      personal_practice = ?, personal_judgment = ?, discussion_question = ?, status = ?,
      updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(
    values.title ?? current.title, values.topic ?? current.topic, targetPlatform,
    values.thesis ?? current.thesis, values.audience ?? current.audience,
    values.goal ?? current.goal, values.angle ?? current.angle, values.tone ?? current.tone,
    values.contentFormat ?? current.content_format, values.personalPractice ?? current.personal_practice,
    values.personalJudgment ?? current.personal_judgment,
    values.discussionQuestion ?? current.discussion_question, values.status ?? current.status, id
  );
  return getById(id);
}

const removeTransaction = db.transaction((id) => {
  const project = db.prepare('SELECT id FROM content_projects WHERE id = ?').get(id);
  if (!project) return false;
  // Citation 对 Evidence 使用 RESTRICT 保护；显式删除聚合根时先按依赖顺序清理派生引用。
  db.prepare(`
    DELETE FROM content_revision_citations
    WHERE revision_id IN (
      SELECT r.id
      FROM content_artifact_revisions r
      INNER JOIN content_artifacts a ON a.id = r.artifact_id
      WHERE a.project_id = ?
    )
  `).run(id);
  return db.prepare('DELETE FROM content_projects WHERE id = ?').run(id).changes > 0;
});

function remove(id) {
  return removeTransaction(id);
}

function addClaim(projectId, { claimId, usageNote = '' }) {
  const project = getById(projectId);
  const claim = researchStore.getClaim(claimId);
  if (!project || !claim) return undefined;
  const existingLink = project.claims.some((item) => item.claim_id === claimId);
  if (claim.status !== 'active' && !existingLink) throw new Error('待更新观点不能新加入内容项目');
  const max = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS value FROM content_project_claims WHERE project_id = ?').get(projectId).value;
  db.prepare(`
    INSERT INTO content_project_claims (project_id, claim_id, sort_order, usage_note)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(project_id, claim_id) DO UPDATE SET usage_note = excluded.usage_note, updated_at = CURRENT_TIMESTAMP
  `).run(projectId, claimId, Number(max) + 1, usageNote);
  return getById(projectId);
}

function reorderClaims(projectId, claimIds) {
  const current = getById(projectId);
  if (!current) return undefined;
  const existing = current.claims.map((item) => item.claim_id);
  if (claimIds.length !== existing.length || new Set(claimIds).size !== claimIds.length || claimIds.some((id) => !existing.includes(id))) {
    throw new Error('观点排序必须包含项目中的全部观点且不能重复');
  }
  const updateOrder = db.prepare('UPDATE content_project_claims SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE project_id = ? AND claim_id = ?');
  db.transaction(() => claimIds.forEach((claimId, index) => updateOrder.run(index, projectId, claimId)))();
  return getById(projectId);
}

function removeClaim(projectId, claimId) {
  return db.prepare('DELETE FROM content_project_claims WHERE project_id = ? AND claim_id = ?').run(projectId, claimId).changes > 0;
}

module.exports = { TARGET_PLATFORMS, addClaim, create, getById, list, remove, removeClaim, reorderClaims, update };
