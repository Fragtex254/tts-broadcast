const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/db');
const contentArtifactStore = require('../../src/services/contentArtifactStore');
const { hashSourceContent } = require('../../src/utils/contentSourceFragments');

describe('内容稿件证据引用', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM content_revision_citations').run();
    db.prepare('DELETE FROM content_projects').run();
    db.prepare('DELETE FROM content_sources').run();
  });

  test('人工主稿保存合法引用并以 requestKey 幂等返回同一 Revision', async () => {
    const project = await request(app).post('/api/content-projects').send({ title: '人工主稿' });
    const projectId = project.body.project.id;
    const source = await request(app)
      .post(`/api/content-projects/${projectId}/sources`)
      .send({ sourceType: 'manual', title: '原始来源', content: '这是可核对的原始证据。' });
    const card = await request(app)
      .post(`/api/content-projects/${projectId}/evidence`)
      .send({ sourceId: source.body.source.id, fragmentStart: 0, fragmentEnd: 0 });
    await request(app)
      .patch(`/api/content-projects/${projectId}/evidence/${card.body.evidence.id}`)
      .send({ state: 'selected' });

    const payload = {
      kind: 'master',
      title: '主稿',
      content: `这句话有来源支持。[证据#${card.body.evidence.id}]`,
      changeReason: 'manual',
      requestKey: 'manual-master-1',
    };
    const first = await request(app).post(`/api/content-projects/${projectId}/artifacts`).send(payload);
    const retried = await request(app).post(`/api/content-projects/${projectId}/artifacts`).send(payload);
    const changedReason = await request(app)
      .post(`/api/content-projects/${projectId}/artifacts`)
      .send({ ...payload, changeReason: '不同的显式保存原因' });

    expect(first.status).toBe(201);
    expect(first.body.artifact.current_revision).toMatchObject({
      request_key: 'manual-master-1',
      citation_status: 'valid',
      provenance: { blocks: [] },
      citations: [expect.objectContaining({ evidence_id: card.body.evidence.id })],
    });
    expect(first.body.milestone).toMatchObject({ kind: 'cited_master_saved' });
    expect(retried.status).toBe(200);
    expect(retried.body.artifact.id).toBe(first.body.artifact.id);
    expect(retried.body.artifact.current_revision.id).toBe(first.body.artifact.current_revision.id);
    expect(retried.body.milestone).toBeUndefined();
    expect(changedReason.status).toBe(409);
  });

  test('拒绝跨项目、未选择和失效证据，但保留已有 Revision 的引用快照', async () => {
    const firstProject = await request(app).post('/api/content-projects').send({ title: '项目 A' });
    const secondProject = await request(app).post('/api/content-projects').send({ title: '项目 B' });
    const firstProjectId = firstProject.body.project.id;
    const secondProjectId = secondProject.body.project.id;
    const source = await request(app)
      .post(`/api/content-projects/${firstProjectId}/sources`)
      .send({ sourceType: 'manual', title: 'A 的来源', content: '只属于项目 A 的原文。' });
    const card = await request(app)
      .post(`/api/content-projects/${firstProjectId}/evidence`)
      .send({ sourceId: source.body.source.id, startFragmentIndex: 0, endFragmentIndex: 0 });

    const unselected = await request(app)
      .post(`/api/content-projects/${firstProjectId}/artifacts`)
      .send({ kind: 'master', content: `错误引用。[证据#${card.body.evidence.id}]` });
    const crossProject = await request(app)
      .post(`/api/content-projects/${secondProjectId}/artifacts`)
      .send({ kind: 'master', content: `越权引用。[证据#${card.body.evidence.id}]` });

    expect(unselected.status).toBe(409);
    expect(crossProject.status).toBe(409);

    await request(app)
      .patch(`/api/content-projects/${firstProjectId}/evidence/${card.body.evidence.id}`)
      .send({ state: 'selected' });
    const saved = await request(app)
      .post(`/api/content-projects/${firstProjectId}/artifacts`)
      .send({
        kind: 'master',
        content: `合法引用。[证据#${card.body.evidence.id}]`,
        requestKey: 'stale-snapshot',
      });
    await request(app)
      .delete(`/api/content-projects/${firstProjectId}/sources/${source.body.source.id}`);
    const revisions = await request(app)
      .get(`/api/content-projects/${firstProjectId}/artifacts/${saved.body.artifact.id}/revisions`);

    expect(revisions.status).toBe(200);
    expect(revisions.body.revisions[0]).toMatchObject({
      citation_status: 'valid',
      citations: [expect.objectContaining({
        evidence_id: card.body.evidence.id,
        excerpt: '只属于项目 A 的原文。',
        source_title: 'A 的来源',
        is_stale: false,
        source_linked: false,
        reuse_eligible: false,
      })],
    });

    const historicalFragments = await request(app)
      .get(`/api/content-projects/${firstProjectId}/sources/${source.body.source.id}/fragments`);
    const forbiddenFragments = await request(app)
      .get(`/api/content-projects/${secondProjectId}/sources/${source.body.source.id}/fragments`);
    expect(historicalFragments.status).toBe(200);
    expect(historicalFragments.body.fragments[0].content).toBe('只属于项目 A 的原文。');
    expect(forbiddenFragments.status).toBe(404);
  });

  test('父版本必须属于同一 Artifact，不能伪造跨稿件 ancestry', async () => {
    const project = await request(app).post('/api/content-projects').send({ title: '版本血缘' });
    const projectId = project.body.project.id;
    const firstArtifact = await request(app)
      .post(`/api/content-projects/${projectId}/artifacts`)
      .send({ kind: 'outline', content: '提纲一' });
    const secondArtifact = await request(app)
      .post(`/api/content-projects/${projectId}/artifacts`)
      .send({
        kind: 'master',
        content: '主稿一',
        parentRevisionId: firstArtifact.body.artifact.current_revision.id,
      });

    expect(secondArtifact.status).toBe(409);
    expect(db.prepare('SELECT COUNT(*) AS count FROM content_artifacts WHERE project_id = ?').get(projectId).count).toBe(1);
  });

  test('手工 Revision 幂等重放同时核对父版本和修改原因，不同 key 仍可显式保存同正文', async () => {
    const project = await request(app).post('/api/content-projects').send({ title: '严格版本幂等' });
    const projectId = project.body.project.id;
    const artifact = await request(app)
      .post(`/api/content-projects/${projectId}/artifacts`)
      .send({ kind: 'master', content: '第一版', changeReason: '初稿' });
    const artifactId = artifact.body.artifact.id;
    const parentRevisionId = artifact.body.artifact.current_revision.id;
    const payload = {
      content: '相同正文也可能是一次新的显式保存',
      changeReason: '第一次明确保存',
      parentRevisionId,
      requestKey: 'manual-revision-strict-key',
    };
    const first = await request(app)
      .post(`/api/content-projects/${projectId}/artifacts/${artifactId}/revisions`)
      .send(payload);
    const replay = await request(app)
      .post(`/api/content-projects/${projectId}/artifacts/${artifactId}/revisions`)
      .send(payload);
    const changedReason = await request(app)
      .post(`/api/content-projects/${projectId}/artifacts/${artifactId}/revisions`)
      .send({ ...payload, changeReason: '不同修改原因' });
    const changedParent = await request(app)
      .post(`/api/content-projects/${projectId}/artifacts/${artifactId}/revisions`)
      .send({ ...payload, parentRevisionId: first.body.revision.id });
    const newExplicitSave = await request(app)
      .post(`/api/content-projects/${projectId}/artifacts/${artifactId}/revisions`)
      .send({
        ...payload,
        parentRevisionId: first.body.revision.id,
        requestKey: 'manual-revision-next-key',
      });

    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    expect(replay.body.revision.id).toBe(first.body.revision.id);
    expect(changedReason.status).toBe(409);
    expect(changedParent.status).toBe(409);
    expect(newExplicitSave.status).toBe(201);
    expect(newExplicitSave.body.revision.content).toBe(first.body.revision.content);
    expect(newExplicitSave.body.revision.revision_number).toBe(3);
  });

  test('重复引用只按唯一 Source 加载并计算一次完整性哈希', async () => {
    const project = await request(app).post('/api/content-projects').send({ title: '引用读取性能' });
    const projectId = project.body.project.id;
    const source = await request(app)
      .post(`/api/content-projects/${projectId}/sources`)
      .send({ sourceType: 'manual', title: '大来源', content: `${'长原文'.repeat(20000)}。` });
    const evidence = await request(app)
      .post(`/api/content-projects/${projectId}/evidence`)
      .send({
        sourceId: source.body.source.id,
        startFragmentIndex: 0,
        endFragmentIndex: 0,
        decisionState: 'selected',
      });
    const marker = `[证据#${evidence.body.evidence.id}]`;
    const content = `开头。${Array.from({ length: 200 }, () => marker).join(' ')}`;
    const createHasher = jest.fn(hashSourceContent);
    const citations = contentArtifactStore.validateCitationMarkers({
      projectId,
      content,
      hashContent: createHasher,
    });
    expect(citations).toHaveLength(200);
    expect(createHasher).toHaveBeenCalledTimes(1);

    const unrelatedProject = await request(app)
      .post('/api/content-projects')
      .send({ title: '不得放大他人来源的项目' });
    const forbiddenHasher = jest.fn(hashSourceContent);
    expect(() => contentArtifactStore.validateCitationMarkers({
      projectId: unrelatedProject.body.project.id,
      content: marker,
      hashContent: forbiddenHasher,
    })).toThrow('不属于当前项目');
    expect(forbiddenHasher).not.toHaveBeenCalled();

    const saved = await request(app)
      .post(`/api/content-projects/${projectId}/artifacts`)
      .send({ kind: 'master', content });
    const readHasher = jest.fn(hashSourceContent);
    const listed = contentArtifactStore.listRevisionCitations(
      saved.body.artifact.current_revision.id,
      { hashContent: readHasher }
    );
    expect(listed).toHaveLength(200);
    expect(readHasher).toHaveBeenCalledTimes(1);
  });

  test('显式删除项目按依赖顺序清理派生行，同时保留 Source 本体与历史音频 Render', async () => {
    const project = await request(app).post('/api/content-projects').send({ title: '可删除聚合根' });
    const projectId = project.body.project.id;
    const source = await request(app)
      .post(`/api/content-projects/${projectId}/sources`)
      .send({
        sourceType: 'manual',
        title: '资产来源',
        content: '不可随项目删除的原文。',
        requestKey: 'source-ledger-project-delete',
      });
    const evidence = await request(app)
      .post(`/api/content-projects/${projectId}/evidence`)
      .send({
        sourceId: source.body.source.id,
        startFragmentIndex: 0,
        endFragmentIndex: 0,
        decisionState: 'selected',
      });
    const artifact = await request(app)
      .post(`/api/content-projects/${projectId}/artifacts`)
      .send({ kind: 'master', content: `有依据的正文。[证据#${evidence.body.evidence.id}]` });
    const revisionId = artifact.body.artifact.current_revision.id;
    const broadcastId = Number(db.prepare(`
      INSERT INTO broadcasts (title, content, audio_path, status, artifact_revision_id)
      VALUES ('历史音频', '有依据的正文。', '/audio/existing.mp3', 'completed', ?)
    `).run(revisionId).lastInsertRowid);
    db.prepare(`
      INSERT INTO content_generation_jobs (
        project_id, operation, request_key, input_sha256, status, phase
      ) VALUES (?, 'generate_master', 'old-job', 'old-input', 'failed', 'failed')
    `).run(projectId);
    expect(db.prepare('SELECT COUNT(*) AS count FROM content_source_requests WHERE project_id = ?').get(projectId).count).toBe(1);

    const deleted = await request(app).delete(`/api/content-projects/${projectId}`);

    expect(deleted.status).toBe(200);
    expect(db.prepare('SELECT id FROM content_projects WHERE id = ?').get(projectId)).toBeUndefined();
    expect(db.prepare('SELECT id FROM content_sources WHERE id = ?').get(source.body.source.id)).toBeDefined();
    expect(db.prepare('SELECT COUNT(*) AS count FROM content_revision_citations').get().count).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS count FROM content_generation_jobs WHERE project_id = ?').get(projectId).count).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS count FROM content_source_requests WHERE project_id = ?').get(projectId).count).toBe(0);
    expect(db.prepare('SELECT id, audio_path, artifact_revision_id FROM broadcasts WHERE id = ?').get(broadcastId))
      .toMatchObject({ audio_path: '/audio/existing.mp3', artifact_revision_id: null });
  });

  test('空提纲和只有 Citation marker 的主稿不会触发虚假里程碑', async () => {
    const project = await request(app).post('/api/content-projects').send({ title: '里程碑真实性' });
    const projectId = project.body.project.id;
    const emptyOutline = await request(app)
      .post(`/api/content-projects/${projectId}/artifacts`)
      .send({ kind: 'outline', content: '' });
    const source = await request(app)
      .post(`/api/content-projects/${projectId}/sources`)
      .send({ sourceType: 'manual', title: '材料', content: '实质证据。' });
    const evidence = await request(app)
      .post(`/api/content-projects/${projectId}/evidence`)
      .send({
        sourceId: source.body.source.id,
        startFragmentIndex: 0,
        endFragmentIndex: 0,
        decisionState: 'selected',
      });
    const markerOnly = await request(app)
      .post(`/api/content-projects/${projectId}/artifacts`)
      .send({ kind: 'master', content: `[证据#${evidence.body.evidence.id}]` });
    const substantive = await request(app)
      .post(`/api/content-projects/${projectId}/artifacts`)
      .send({ kind: 'master', content: `有实质正文。[证据#${evidence.body.evidence.id}]` });

    expect(emptyOutline.body.milestone).toBeUndefined();
    expect(markerOnly.body.milestone).toBeUndefined();
    expect(substantive.body.milestone).toMatchObject({ kind: 'cited_master_saved' });
  });
});
