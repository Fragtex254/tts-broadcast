const db = require('../db');

const MILESTONES = {
  source_saved: {
    title: '第一份材料快照已入库',
    description: '用户粘贴材料已独立保存（未自动核验），可以开始定位证据。',
  },
  evidence_selected: {
    title: '第一条证据已确认',
    description: '写作上下文已经有了可回查的依据。',
  },
  outline_saved: {
    title: '第一版提纲草案已保存',
    description: '可追溯的结构草案已经落盘，请审阅后再用于主稿。',
  },
  cited_master_saved: {
    title: '第一版证据主稿草案已保存',
    description: '草案与来源引用已经一起写入不可变版本，等待你的审阅。',
  },
};

function hasHistoricalFact({ projectId, kind, resultId }) {
  if (kind === 'source_saved') {
    return Boolean(db.prepare(`
      SELECT 1 FROM content_project_sources ps
      INNER JOIN content_sources s ON s.id = ps.source_id
      WHERE ps.project_id = ? AND TRIM(s.content) <> '' AND s.id <> ? LIMIT 1
    `).get(projectId, resultId || -1));
  }
  if (kind === 'evidence_selected') {
    return Boolean(db.prepare(`
      SELECT 1 FROM content_evidence_cards
      WHERE project_id = ? AND decision_state = 'selected' AND lifecycle_status = 'active'
        AND id <> ? LIMIT 1
    `).get(projectId, resultId || -1));
  }
  if (kind === 'outline_saved') {
    return Boolean(db.prepare(`
      SELECT 1 FROM content_artifact_revisions r
      INNER JOIN content_artifacts a ON a.id = r.artifact_id
      WHERE a.project_id = ? AND a.kind = 'outline' AND TRIM(r.content) <> '' AND r.id <> ? LIMIT 1
    `).get(projectId, resultId || -1));
  }
  if (kind === 'cited_master_saved') {
    const rows = db.prepare(`
      SELECT r.content FROM content_artifact_revisions r
      INNER JOIN content_artifacts a ON a.id = r.artifact_id
      WHERE a.project_id = ? AND a.kind = 'master' AND TRIM(r.content) <> '' AND r.id <> ?
        AND EXISTS (SELECT 1 FROM content_revision_citations c WHERE c.revision_id = r.id)
    `).all(projectId, resultId || -1);
    return rows.some((row) => row.content.replace(/\[证据#[1-9]\d*\]/g, '').trim());
  }
  return false;
}

function claim({ projectId, kind, resultId = null, hadPriorFact = false }) {
  const definition = MILESTONES[kind];
  if (!definition) throw new Error('未知的创作里程碑');
  const result = db.prepare(`
    INSERT INTO content_project_milestones (project_id, kind, result_id)
    VALUES (?, ?, ?)
    ON CONFLICT(project_id, kind) DO NOTHING
  `).run(projectId, kind, resultId);
  if (result.changes === 0) return undefined;
  if (hadPriorFact || hasHistoricalFact({ projectId, kind, resultId })) return undefined;
  return {
    id: `project:${projectId}:${kind}`,
    kind,
    title: definition.title,
    description: definition.description,
  };
}

module.exports = { claim };
