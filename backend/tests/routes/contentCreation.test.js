const crypto = require('crypto');
const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/db');

describe('证据驱动创作 API', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM content_projects').run();
    db.prepare('DELETE FROM content_sources').run();
  });

  test('粘贴来源保存内容 hash，并能读取由原文 offset 派生的 fragments', async () => {
    const project = await request(app).post('/api/content-projects').send({ title: '证据项目' });
    const projectId = project.body.project.id;
    const content = '第一条可核对材料。\n第二条材料用于验证引用。';

    const added = await request(app)
      .post(`/api/content-projects/${projectId}/sources`)
      .send({ sourceType: 'user_paste', title: '用户粘贴材料', content });

    expect(added.status).toBe(201);
    expect(added.body.source).toMatchObject({
      source_type: 'user_paste',
      content,
      content_sha256: crypto.createHash('sha256').update(content, 'utf8').digest('hex'),
    });
    expect(added.body.milestone).toMatchObject({ kind: 'source_saved' });

    const fragments = await request(app)
      .get(`/api/content-projects/${projectId}/sources/${added.body.source.id}/fragments`);

    expect(fragments.status).toBe(200);
    expect(fragments.body.fragments).toEqual(expect.arrayContaining([
      expect.objectContaining({ index: 0, content: expect.any(String), start_offset: 0 }),
    ]));
    for (const fragment of fragments.body.fragments) {
      expect(content.slice(fragment.start_offset, fragment.end_offset)).toBe(fragment.content);
    }
  });

  test('人工证据忽略客户端伪造摘录，只保存来源 fragment 派生正文', async () => {
    const project = await request(app).post('/api/content-projects').send({ title: '人工证据项目' });
    const projectId = project.body.project.id;
    const content = '真实原文第一句。\n真实原文第二句。';
    const source = await request(app)
      .post(`/api/content-projects/${projectId}/sources`)
      .send({ sourceType: 'manual', title: '原始笔记', content });

    const created = await request(app)
      .post(`/api/content-projects/${projectId}/evidence`)
      .send({
        sourceId: source.body.source.id,
        startFragmentIndex: 0,
        endFragmentIndex: 0,
        excerpt: '客户端伪造的摘录',
        userNote: '作为开头证据',
      });

    expect(created.status).toBe(201);
    expect(created.body.evidence).toMatchObject({
      project_id: projectId,
      source_id: source.body.source.id,
      source_title: '原始笔记',
      origin: 'user',
      state: 'candidate',
      excerpt: content,
      user_note: '作为开头证据',
      start_fragment_index: 0,
      end_fragment_index: 0,
      generation_job_id: null,
    });
    expect(created.body.evidence.excerpt).not.toContain('伪造');
  });

  test('第一条由用户选择的证据只发出一次持久里程碑', async () => {
    const project = await request(app).post('/api/content-projects').send({ title: '选择证据项目' });
    const projectId = project.body.project.id;
    const source = await request(app)
      .post(`/api/content-projects/${projectId}/sources`)
      .send({ sourceType: 'manual', title: '材料', content: '可核对的原文。' });
    const card = await request(app)
      .post(`/api/content-projects/${projectId}/evidence`)
      .send({ sourceId: source.body.source.id, fragmentStart: 0, fragmentEnd: 0 });

    const selected = await request(app)
      .patch(`/api/content-projects/${projectId}/evidence/${card.body.evidence.id}`)
      .send({ state: 'selected', userNote: '用于核心论证' });
    const repeated = await request(app)
      .patch(`/api/content-projects/${projectId}/evidence/${card.body.evidence.id}`)
      .send({ state: 'selected' });

    expect(selected.status).toBe(200);
    expect(selected.body.evidence).toMatchObject({ state: 'selected', user_note: '用于核心论证' });
    expect(selected.body.milestone).toMatchObject({ kind: 'evidence_selected' });
    expect(repeated.status).toBe(200);
    expect(repeated.body.milestone).toBeUndefined();
  });

  test('手工证据可在同一事务保存并采用，requestKey 重试不会留下重复或半状态', async () => {
    const project = await request(app).post('/api/content-projects').send({ title: '原子采用证据' });
    const projectId = project.body.project.id;
    const source = await request(app)
      .post(`/api/content-projects/${projectId}/sources`)
      .send({ sourceType: 'manual', title: '材料', content: '可核验的原文。' });
    const payload = {
      sourceId: source.body.source.id,
      startFragmentIndex: 0,
      endFragmentIndex: 0,
      decisionState: 'selected',
      userNote: '  保留用户原始空格  ',
      requestKey: 'manual-evidence-atomic',
    };
    const first = await request(app).post(`/api/content-projects/${projectId}/evidence`).send(payload);
    const retried = await request(app).post(`/api/content-projects/${projectId}/evidence`).send(payload);
    const conflict = await request(app)
      .post(`/api/content-projects/${projectId}/evidence`)
      .send({ ...payload, userNote: '不同判断' });

    expect(first.status).toBe(201);
    expect(first.body.evidence).toMatchObject({
      decision_state: 'selected',
      lifecycle_status: 'active',
      user_note: '  保留用户原始空格  ',
    });
    expect(first.body.milestone).toMatchObject({ kind: 'evidence_selected' });
    expect(retried.status).toBe(200);
    expect(retried.body.evidence.id).toBe(first.body.evidence.id);
    expect(retried.body.milestone).toBeUndefined();
    expect(conflict.status).toBe(409);
    expect(db.prepare('SELECT COUNT(*) AS count FROM content_evidence_cards WHERE project_id = ?').get(projectId).count).toBe(1);
  });

  test('超长用户证据笔记显式拒绝，不静默截断资产', async () => {
    const project = await request(app).post('/api/content-projects').send({ title: '长笔记' });
    const projectId = project.body.project.id;
    const source = await request(app)
      .post(`/api/content-projects/${projectId}/sources`)
      .send({ sourceType: 'manual', title: '材料', content: '可核验原文。' });
    const rejected = await request(app)
      .post(`/api/content-projects/${projectId}/evidence`)
      .send({
        sourceId: source.body.source.id,
        startFragmentIndex: 0,
        endFragmentIndex: 0,
        userNote: '判'.repeat(5001),
      });
    expect(rejected.status).toBe(400);
    expect(db.prepare('SELECT COUNT(*) AS count FROM content_evidence_cards WHERE project_id = ?').get(projectId).count).toBe(0);
  });

  test('修正证据会新增卡片，来源移出项目后只把可用证据标为 stale', async () => {
    const project = await request(app).post('/api/content-projects').send({ title: '证据修正项目' });
    const projectId = project.body.project.id;
    const content = `${'甲'.repeat(790)}。${'乙'.repeat(30)}`;
    const source = await request(app)
      .post(`/api/content-projects/${projectId}/sources`)
      .send({ sourceType: 'manual', title: '长材料', content });
    const original = await request(app)
      .post(`/api/content-projects/${projectId}/evidence`)
      .send({ sourceId: source.body.source.id, fragmentStart: 0, fragmentEnd: 0 });
    const corrected = await request(app)
      .post(`/api/content-projects/${projectId}/evidence`)
      .send({
        sourceId: source.body.source.id,
        fragmentStart: 1,
        fragmentEnd: 1,
        supersedesEvidenceId: original.body.evidence.id,
      });
    const conflictingCorrection = await request(app)
      .post(`/api/content-projects/${projectId}/evidence`)
      .send({
        sourceId: source.body.source.id,
        fragmentStart: 1,
        fragmentEnd: 1,
        supersedesEvidenceId: original.body.evidence.id,
        requestKey: 'second-correction-of-same-card',
      });

    expect(corrected.status).toBe(201);
    expect(corrected.body.evidence).toMatchObject({
      supersedes_id: original.body.evidence.id,
      state: 'candidate',
      excerpt: '乙'.repeat(30),
    });
    expect(conflictingCorrection.status).toBe(409);
    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM content_evidence_cards
      WHERE project_id = ? AND supersedes_id = ? AND lifecycle_status = 'active'
    `).get(projectId, original.body.evidence.id).count).toBe(1);

    const unlinked = await request(app)
      .delete(`/api/content-projects/${projectId}/sources/${source.body.source.id}`);
    const workspace = await request(app).get(`/api/content-projects/${projectId}/workspace`);

    expect(unlinked.status).toBe(200);
    expect(workspace.body.workspace.sources).toEqual([]);
    expect(workspace.body.workspace.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: original.body.evidence.id,
        state: 'candidate',
        decision_state: 'candidate',
        lifecycle_status: 'superseded',
      }),
      expect.objectContaining({
        id: corrected.body.evidence.id,
        state: 'candidate',
        lifecycle_status: 'stale',
        source_linked: false,
        unavailable_reason: 'source_unlinked',
      }),
    ]));
  });

  test('来源保存 requestKey 真正幂等，异输入冲突且空正文不会伪装成已采集', async () => {
    const project = await request(app).post('/api/content-projects').send({ title: '来源幂等项目' });
    const projectId = project.body.project.id;
    const payload = {
      sourceType: 'user_paste',
      title: '一手材料',
      content: '可核验原文',
      requestKey: 'source-save-1',
    };

    const first = await request(app).post(`/api/content-projects/${projectId}/sources`).send(payload);
    const retried = await request(app).post(`/api/content-projects/${projectId}/sources`).send(payload);
    const conflict = await request(app)
      .post(`/api/content-projects/${projectId}/sources`)
      .send({ ...payload, content: '被替换的内容' });
    const urlOnly = await request(app)
      .post(`/api/content-projects/${projectId}/sources`)
      .send({ sourceType: 'manual', title: '只有链接', url: 'https://example.com', requestKey: 'empty' });

    expect(first.status).toBe(201);
    expect(first.body.milestone).toMatchObject({ kind: 'source_saved' });
    expect(retried.status).toBe(200);
    expect(retried.body.source.id).toBe(first.body.source.id);
    expect(retried.body.milestone).toBeUndefined();
    expect(conflict.status).toBe(409);
    expect(urlOnly.status).toBe(400);
    expect(db.prepare('SELECT COUNT(*) AS count FROM content_sources').get().count).toBe(1);
  });

  test('来源请求账本不会被后续关联请求覆盖，旧 key 重放不创建重复 Source', async () => {
    const project = await request(app).post('/api/content-projects').send({ title: '来源请求账本' });
    const projectId = project.body.project.id;
    const firstPayload = {
      sourceType: 'user_paste',
      title: '不可重复的原始材料',
      content: '同一份原文快照。',
      requestKey: 'source-ledger-k1',
    };
    const first = await request(app)
      .post(`/api/content-projects/${projectId}/sources`)
      .send(firstPayload);
    const secondKey = await request(app)
      .post(`/api/content-projects/${projectId}/sources`)
      .send({
        sourceId: first.body.source.id,
        usageNote: '后续只更新项目用途',
        requestKey: 'source-ledger-k2',
      });
    const replayedFirst = await request(app)
      .post(`/api/content-projects/${projectId}/sources`)
      .send(firstPayload);

    expect(secondKey.status).toBe(201);
    expect(replayedFirst.status).toBe(200);
    expect(replayedFirst.body.source.id).toBe(first.body.source.id);
    expect(replayedFirst.body.source.usage_note).toBe('后续只更新项目用途');
    expect(db.prepare('SELECT COUNT(*) AS count FROM content_sources').get().count).toBe(1);
    expect(db.prepare(`
      SELECT request_key, source_id FROM content_source_requests
      WHERE project_id = ? ORDER BY request_key
    `).all(projectId)).toEqual([
      { request_key: 'source-ledger-k1', source_id: first.body.source.id },
      { request_key: 'source-ledger-k2', source_id: first.body.source.id },
    ]);
  });

  test('已移出来源的旧 key 重放稳定冲突，不恢复关联也不复制 Source', async () => {
    const project = await request(app).post('/api/content-projects').send({ title: '来源重放不得复活' });
    const projectId = project.body.project.id;
    const payload = {
      sourceType: 'user_paste',
      title: '会被移出的材料',
      content: '原文本体仍应保留。',
      requestKey: 'source-before-unlink',
    };
    const created = await request(app)
      .post(`/api/content-projects/${projectId}/sources`)
      .send(payload);
    await request(app)
      .delete(`/api/content-projects/${projectId}/sources/${created.body.source.id}`);
    const replay = await request(app)
      .post(`/api/content-projects/${projectId}/sources`)
      .send(payload);

    expect(replay.status).toBe(409);
    expect(replay.body.error).toContain('已被移出项目');
    expect(db.prepare('SELECT COUNT(*) AS count FROM content_sources').get().count).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS count FROM content_project_sources WHERE project_id = ?').get(projectId).count).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS count FROM content_source_requests WHERE project_id = ?').get(projectId).count).toBe(1);
  });
});
