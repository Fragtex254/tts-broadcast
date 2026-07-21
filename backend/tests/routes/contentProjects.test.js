const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/db');
const podcastTranscriptStore = require('../../src/services/podcastTranscriptStore');
const researchStore = require('../../src/services/researchStore');

describe('内容项目 API', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM content_projects').run();
    db.prepare('DELETE FROM content_sources').run();
    db.prepare('DELETE FROM transcription_results').run();
  });

  test('创建并更新 Brief 字段，空工作区返回空来源和空稿件', async () => {
    const created = await request(app).post('/api/content-projects').send({
      title: '证据驱动创作',
      audience: '独立开发者',
      goal: '帮助读者建立判断标准',
      angle: '从反常识案例切入',
      tone: '克制、具体',
      contentFormat: 'deep_article',
    });

    expect(created.status).toBe(201);
    expect(created.body.project).toMatchObject({
      audience: '独立开发者',
      goal: '帮助读者建立判断标准',
      angle: '从反常识案例切入',
      tone: '克制、具体',
      content_format: 'deep_article',
    });

    const updated = await request(app)
      .patch(`/api/content-projects/${created.body.project.id}`)
      .send({ tone: '友好但不夸张', goal: '帮助读者做出可行动的选择' });
    expect(updated.status).toBe(200);
    expect(updated.body.project).toMatchObject({
      tone: '友好但不夸张',
      goal: '帮助读者做出可行动的选择',
      audience: '独立开发者',
    });

    const workspace = await request(app).get(`/api/content-projects/${created.body.project.id}/workspace`);
    expect(workspace.status).toBe(200);
    expect(workspace.body.workspace.project).toMatchObject({
      id: created.body.project.id,
      tone: '友好但不夸张',
      content_format: 'deep_article',
    });
    expect(workspace.body.workspace.sources).toEqual([]);
    expect(workspace.body.workspace.artifacts).toEqual([]);
  });

  test('在项目下创建并关联手写来源', async () => {
    const created = await request(app).post('/api/content-projects').send({ title: '手写素材项目' });
    const sourceContent = '\n用户真正抱怨的不是生成慢，而是修改后无法回退。\n';

    const added = await request(app)
      .post(`/api/content-projects/${created.body.project.id}/sources`)
      .send({
        sourceType: 'manual',
        title: '现场观察',
        content: sourceContent,
        url: 'https://example.com/notes/1',
        externalRef: 'manual-note-1',
        metadata: { author: '我', observedAt: '2026-07-18' },
        usageNote: '用作开头场景',
      });

    expect(added.status).toBe(201);
    expect(added.body.source).toMatchObject({
      source_type: 'manual',
      title: '现场观察',
      usage_note: '用作开头场景',
      sort_order: 0,
      metadata: { author: '我', observedAt: '2026-07-18' },
      content: sourceContent,
    });

    db.prepare("UPDATE content_sources SET metadata_json = '{损坏 JSON' WHERE id = ?").run(added.body.source.id);
    const workspace = await request(app).get(`/api/content-projects/${created.body.project.id}/workspace`);
    expect(workspace.body.workspace.sources).toHaveLength(1);
    expect(workspace.body.workspace.sources[0]).toMatchObject({
      id: added.body.source.id,
      project_source_id: added.body.source.project_source_id,
      content: sourceContent,
      metadata: {},
    });

    const secondProject = await request(app).post('/api/content-projects').send({ title: '复用素材的项目' });
    const linked = await request(app)
      .post(`/api/content-projects/${secondProject.body.project.id}/sources`)
      .send({ sourceId: added.body.source.id, usageNote: '在第二篇里作为反例' });
    expect(linked.status).toBe(201);
    expect(linked.body.source).toMatchObject({
      id: added.body.source.id,
      project_id: secondProject.body.project.id,
      usage_note: '在第二篇里作为反例',
      metadata: {},
    });
  });

  test('创建稿件首版并以新增版本的方式保存后续修改', async () => {
    const created = await request(app).post('/api/content-projects').send({ title: '版本化稿件' });
    const projectId = created.body.project.id;
    const firstContent = '\n第一版正文\n';

    const artifactCreated = await request(app)
      .post(`/api/content-projects/${projectId}/artifacts`)
      .send({ kind: 'master', title: '主稿', platform: 'general', status: 'draft', content: firstContent, changeReason: 'initial' });

    expect(artifactCreated.status).toBe(201);
    expect(artifactCreated.body.artifact).toMatchObject({
      project_id: projectId,
      kind: 'master',
      current_revision: { revision_number: 1, content: firstContent, change_reason: 'initial' },
    });

    const artifactId = artifactCreated.body.artifact.id;
    const revised = await request(app)
      .post(`/api/content-projects/${projectId}/artifacts/${artifactId}/revisions`)
      .send({ content: '第二版正文', changeReason: '补充反方观点' });

    expect(revised.status).toBe(201);
    expect(revised.body.revision).toMatchObject({
      artifact_id: artifactId,
      revision_number: 2,
      content: '第二版正文',
      change_reason: '补充反方观点',
    });
    expect(revised.body.artifact.current_revision).toMatchObject({ revision_number: 2, content: '第二版正文' });

    const cleared = await request(app)
      .post(`/api/content-projects/${projectId}/artifacts/${artifactId}/revisions`)
      .send({ content: '', changeReason: '用户显式清空' });
    expect(cleared.status).toBe(201);
    expect(cleared.body.revision).toMatchObject({ revision_number: 3, content: '', change_reason: '用户显式清空' });

    const history = await request(app).get(`/api/content-projects/${projectId}/artifacts/${artifactId}/revisions`);
    expect(history.status).toBe(200);
    expect(history.body.revisions.map((revision) => ({ number: revision.revision_number, content: revision.content }))).toEqual([
      { number: 3, content: '' },
      { number: 2, content: '第二版正文' },
      { number: 1, content: firstContent },
    ]);

    const workspace = await request(app).get(`/api/content-projects/${projectId}/workspace`);
    expect(workspace.body.workspace.artifacts[0].current_revision).toMatchObject({
      revision_number: 3,
      content: '',
    });
  });

  test('关联来源、创建稿件和保存版本都会刷新项目最近活动时间', async () => {
    const created = await request(app).post('/api/content-projects').send({ title: '最近活动项目' });
    const projectId = created.body.project.id;
    const staleTimestamp = '2000-01-01 00:00:00';

    db.prepare('UPDATE content_projects SET updated_at = ? WHERE id = ?').run(staleTimestamp, projectId);
    const source = await request(app)
      .post(`/api/content-projects/${projectId}/sources`)
      .send({ sourceType: 'manual', title: '新来源', content: '可核验的新来源原文。' });
    expect(source.status).toBe(201);
    expect(db.prepare('SELECT updated_at FROM content_projects WHERE id = ?').get(projectId).updated_at).not.toBe(staleTimestamp);

    db.prepare('UPDATE content_projects SET updated_at = ? WHERE id = ?').run(staleTimestamp, projectId);
    const artifact = await request(app)
      .post(`/api/content-projects/${projectId}/artifacts`)
      .send({ kind: 'master', title: '主稿', content: '第一版' });
    expect(artifact.status).toBe(201);
    expect(db.prepare('SELECT updated_at FROM content_projects WHERE id = ?').get(projectId).updated_at).not.toBe(staleTimestamp);

    db.prepare('UPDATE content_projects SET updated_at = ? WHERE id = ?').run(staleTimestamp, projectId);
    const revision = await request(app)
      .post(`/api/content-projects/${projectId}/artifacts/${artifact.body.artifact.id}/revisions`)
      .send({ content: '第二版', changeReason: '补充证据' });
    expect(revision.status).toBe(201);
    expect(db.prepare('SELECT updated_at FROM content_projects WHERE id = ?').get(projectId).updated_at).not.toBe(staleTimestamp);
  });

  test('复用已有来源到另一个项目也会刷新目标项目最近活动时间和列表顺序', async () => {
    const targetProject = await request(app).post('/api/content-projects').send({ title: '目标项目' });
    const sourceProject = await request(app).post('/api/content-projects').send({ title: '来源项目' });
    const source = await request(app)
      .post(`/api/content-projects/${sourceProject.body.project.id}/sources`)
      .send({ sourceType: 'manual', title: '可复用来源', content: '可复用的原始内容。' });
    db.prepare(`UPDATE content_projects SET updated_at = STRFTIME('%Y-%m-%d %H:%M:%S', 'now') WHERE id IN (?, ?)`)
      .run(targetProject.body.project.id, sourceProject.body.project.id);

    const linked = await request(app)
      .post(`/api/content-projects/${targetProject.body.project.id}/sources`)
      .send({ sourceId: source.body.source.id, usageNote: '用于目标项目' });

    expect(linked.status).toBe(201);
    const listed = await request(app).get('/api/content-projects');
    expect(listed.body.projects[0].id).toBe(targetProject.body.project.id);
  });

  test('拒绝通过其他项目访问稿件版本', async () => {
    const first = await request(app).post('/api/content-projects').send({ title: '项目甲' });
    const second = await request(app).post('/api/content-projects').send({ title: '项目乙' });
    const artifact = await request(app)
      .post(`/api/content-projects/${first.body.project.id}/artifacts`)
      .send({ kind: 'outline', title: '甲的大纲', content: '只属于甲' });

    const crossProjectRead = await request(app)
      .get(`/api/content-projects/${second.body.project.id}/artifacts/${artifact.body.artifact.id}/revisions`);
    const crossProjectWrite = await request(app)
      .post(`/api/content-projects/${second.body.project.id}/artifacts/${artifact.body.artifact.id}/revisions`)
      .send({ content: '越权修改' });

    expect(crossProjectRead.status).toBe(404);
    expect(crossProjectRead.body).toEqual({ error: '内容稿件不存在' });
    expect(crossProjectWrite.status).toBe(404);
    expect(crossProjectWrite.body).toEqual({ error: '内容稿件不存在' });
  });

  test('把观点加入项目并导出带完整来源的 Markdown', async () => {
    const record = podcastTranscriptStore.create({
      record: { fileName: 'episode.wav', text: '真实证据', contentMode: 'podcast', structureStatus: 'ready' },
      transcript: { speakers: [{ speakerKey: 'speaker-0001', displayName: '嘉宾甲', sortOrder: 0 }], segments: [{ segmentIndex: 0, speakerKey: 'speaker-0001', startSeconds: 65, endSeconds: 70, text: '真实证据' }], turns: [{ turnIndex: 0, speakerKey: 'speaker-0001', startSeconds: 65, endSeconds: 70, text: '真实证据', evidenceSegmentIndexes: [0] }] },
    });
    require('../../src/services/transcriptionResultStore').updateMetadata(record.id, { podcastName: '研究播客', episodeTitle: 'AI 单集', guestNames: ['嘉宾甲'], sourceUrl: 'https://example.com/ai', publishedAt: '2026-07-16', topicTags: ['AI'] });
    const claim = researchStore.replaceClaims(record.id, { model: 'test', claims: [{ speakerKey: 'speaker-0001', question: '问题', claim: '明确观点', reasoning: '理由', evidenceExcerpt: '真实证据', evidenceStartIndex: 0, evidenceEndIndex: 0, startSeconds: 65, endSeconds: 70, topicTags: ['AI'], contentValue: 90, confidence: 0.9 }] })[0];

    const created = await request(app).post('/api/content-projects').send({ title: 'AI 争议', targetPlatform: 'wechat' });
    const added = await request(app).post(`/api/content-projects/${created.body.project.id}/claims`).send({ claimId: claim.id, usageNote: '作为核心论据' });
    const exported = await request(app).post(`/api/content-projects/${created.body.project.id}/export`).send({ platform: 'wechat' });

    expect(added.status).toBe(201);
    expect(exported.status).toBe(200);
    expect(exported.body.markdown).toContain('研究播客｜AI 单集｜嘉宾甲｜1:05–1:10｜https://example.com/ai');
    expect(exported.body.markdown).toContain('主要分歧、成立条件与阶段性判断');
    expect(exported.body.markdown).toContain('AI 整理理由（待核对）：理由');
    expect(exported.body.markdown).not.toContain('   - 理由：');

    researchStore.replaceClaims(record.id, { model: 'new-model', claims: [{ speakerKey: 'speaker-0001', question: '新问题', claim: '新观点', reasoning: '新理由', evidenceExcerpt: '真实证据', evidenceStartIndex: 0, evidenceEndIndex: 0, startSeconds: 65, endSeconds: 70, topicTags: ['AI'], contentValue: 91, confidence: 0.95 }] });
    const projectAfterReanalysis = await request(app).get(`/api/content-projects/${created.body.project.id}`);
    expect(projectAfterReanalysis.body.project.claims[0].claim).toMatchObject({ id: claim.id, status: 'stale', claim: '明确观点' });
  });

  test('内容不完整时仍可导出带占位提示的草稿', async () => {
    const created = await request(app).post('/api/content-projects').send({ title: '待补充项目', targetPlatform: 'xiaohongshu' });
    const exported = await request(app).post(`/api/content-projects/${created.body.project.id}/export`).send({ platform: 'xiaohongshu' });

    expect(exported.status).toBe(200);
    expect(exported.body.markdown).toContain('（尚未选择观点，可稍后补充）');
    expect(exported.body.markdown).toContain('（尚未补充播客来源）');
    expect(exported.body.markdown).toContain('（请补充个人判断）');
  });
});
