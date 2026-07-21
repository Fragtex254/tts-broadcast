const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/db');
const contextService = require('../../src/services/contentCreationContext');
const evidenceStore = require('../../src/services/contentEvidenceStore');
const jobStore = require('../../src/services/contentGenerationJobStore');
const runner = require('../../src/services/contentGenerationRunner');

async function fixture() {
  const project = await request(app).post('/api/content-projects').send({ title: 'Runner 项目' });
  const projectId = project.body.project.id;
  const source = await request(app)
    .post(`/api/content-projects/${projectId}/sources`)
    .send({ sourceType: 'manual', title: '原始材料', content: '真实用户要求可以回退版本。' });
  const evidence = await request(app)
    .post(`/api/content-projects/${projectId}/evidence`)
    .send({
      sourceId: source.body.source.id,
      startFragmentIndex: 0,
      endFragmentIndex: 0,
      decisionState: 'selected',
    });
  return { projectId, evidenceId: evidence.body.evidence.id };
}

function acquireOutline({ projectId, evidenceId, requestKey }) {
  const context = contextService.build({
    projectId,
    operation: 'generate_outline',
    input: { evidenceIds: [evidenceId], creatorInputKeys: [] },
  });
  return jobStore.acquire({
    projectId,
    operation: 'generate_outline',
    requestKey,
    inputSha256: context.inputSha256,
    snapshot: context.snapshot,
    leaseMs: runner.LEASE_MS,
  });
}

describe('内容创作 Runner', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM content_revision_citations').run();
    db.prepare('DELETE FROM content_projects').run();
    db.prepare('DELETE FROM content_sources').run();
  });

  test('AI 草案原子落为单一 outline Artifact 的不可变 Revision，并链接版本 ancestry', async () => {
    const item = await fixture();
    const firstJob = acquireOutline({ ...item, requestKey: 'outline-1' });
    const first = await runner.run(firstJob.job.id, {
      generateText: async () => JSON.stringify({
        blocks: [{ basis: 'evidence', text: '第一版结构', evidence_ids: [item.evidenceId] }],
      }),
    });
    await request(app).patch(`/api/content-projects/${item.projectId}`).send({ thesis: '新的主张' });
    const secondJob = acquireOutline({ ...item, requestKey: 'outline-2' });
    const second = await runner.run(secondJob.job.id, {
      generateText: async () => JSON.stringify({
        blocks: [{ basis: 'evidence', text: '第二版结构', evidence_ids: [item.evidenceId] }],
      }),
    });

    expect(first.job.status).toBe('completed');
    expect(first.milestone).toMatchObject({ kind: 'outline_saved' });
    expect(second.job.status).toBe('completed');
    expect(second.milestone).toBeUndefined();
    const artifacts = db.prepare("SELECT id FROM content_artifacts WHERE project_id = ? AND kind = 'outline'").all(item.projectId);
    const revisions = await request(app)
      .get(`/api/content-projects/${item.projectId}/artifacts/${artifacts[0].id}/revisions`);
    expect(artifacts).toHaveLength(1);
    expect(revisions.body.revisions).toHaveLength(2);
    expect(revisions.body.revisions[0]).toMatchObject({
      revision_number: 2,
      parent_revision_id: revisions.body.revisions[1].id,
      change_reason: 'ai_generated',
      citation_status: 'valid',
      provenance: expect.objectContaining({
        origin: 'ai',
        operation: 'generate_outline',
        input_fingerprint: expect.any(String),
        evidence_ids: [item.evidenceId],
      }),
    });
  });

  test('从用户明确选择的 outline Revision 原子生成带合法 Citation 的 master 草案', async () => {
    const item = await fixture();
    const outline = await request(app)
      .post(`/api/content-projects/${item.projectId}/artifacts`)
      .send({ kind: 'outline', title: '确认提纲', content: '先呈现来源原文，再给出待核对推断。' });
    const outlineRevisionId = outline.body.artifact.current_revision.id;
    const context = contextService.build({
      projectId: item.projectId,
      operation: 'generate_master',
      input: {
        evidenceIds: [item.evidenceId],
        outlineRevisionId,
        creatorInputKeys: [],
      },
    });
    const acquired = jobStore.acquire({
      projectId: item.projectId,
      operation: 'generate_master',
      requestKey: 'master-from-exact-outline',
      inputSha256: context.inputSha256,
      snapshot: context.snapshot,
      leaseMs: runner.LEASE_MS,
    });

    const result = await runner.run(acquired.job.id, {
      generateText: async () => JSON.stringify({
        blocks: [
          { basis: 'evidence', evidence_ids: [item.evidenceId] },
          { basis: 'inference', text: '这说明可回退能力可能影响信任。', evidence_ids: [item.evidenceId] },
        ],
      }),
    });

    expect(result.job.status).toBe('completed');
    expect(result.milestone).toMatchObject({ kind: 'cited_master_saved' });
    const master = db.prepare("SELECT id FROM content_artifacts WHERE project_id = ? AND kind = 'master'").get(item.projectId);
    const revisions = await request(app)
      .get(`/api/content-projects/${item.projectId}/artifacts/${master.id}/revisions`);
    expect(revisions.body.revisions).toHaveLength(1);
    expect(revisions.body.revisions[0]).toMatchObject({
      id: result.job.result_revision_id,
      generation_job_id: result.job.id,
      citation_status: 'valid',
      provenance: expect.objectContaining({
        origin: 'ai',
        operation: 'generate_master',
        outline_revision_id: outlineRevisionId,
        evidence_ids: [item.evidenceId],
      }),
      citations: [expect.objectContaining({
        evidence_id: item.evidenceId,
        is_stale: false,
        reuse_eligible: true,
      })],
    });
    expect(revisions.body.revisions[0].content).toContain(`真实用户要求可以回退版本。[证据#${item.evidenceId}]`);
    expect(revisions.body.revisions[0].content).toContain('【AI 推断，待核对】这说明可回退能力可能影响信任。');
  });

  test('运行中取消采用证据会 supersede Job，模型成功也不会写入 Revision', async () => {
    const item = await fixture();
    const acquired = acquireOutline({ ...item, requestKey: 'context-change' });
    const result = await runner.run(acquired.job.id, {
      generateText: async () => {
        evidenceStore.update({ projectId: item.projectId, evidenceId: item.evidenceId, state: 'rejected' });
        return JSON.stringify({
          blocks: [{ basis: 'evidence', text: '已过时的草案', evidence_ids: [item.evidenceId] }],
        });
      },
    });

    expect(result.contextChanged).toBe(true);
    expect(result.job.status).toBe('superseded');
    expect(db.prepare('SELECT COUNT(*) AS count FROM content_artifact_revisions').get().count).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS count FROM content_artifacts').get().count).toBe(0);
  });

  test('严格 JSON 校验失败时只标记 Job failed，不覆盖任何有效产物', async () => {
    const item = await fixture();
    const acquired = acquireOutline({ ...item, requestKey: 'invalid-json' });
    const result = await runner.run(acquired.job.id, { generateText: async () => '```json\n{}\n```' });
    expect(result.job.status).toBe('failed');
    expect(result.job.error).toContain('严格 JSON');
    expect(db.prepare('SELECT COUNT(*) AS count FROM content_artifact_revisions').get().count).toBe(0);
  });

  test('旧项目已有多个 outline Artifact 时固定选择最早 ID，不随 updated_at 漂移', async () => {
    const item = await fixture();
    const earliest = await request(app)
      .post(`/api/content-projects/${item.projectId}/artifacts`)
      .send({ kind: 'outline', title: '早期提纲', content: '早期版本' });
    const later = await request(app)
      .post(`/api/content-projects/${item.projectId}/artifacts`)
      .send({ kind: 'outline', title: '后来的提纲', content: '后来版本' });
    await request(app)
      .post(`/api/content-projects/${item.projectId}/artifacts/${later.body.artifact.id}/revisions`)
      .send({ content: '让后来稿件 updated_at 更新' });
    const acquired = acquireOutline({ ...item, requestKey: 'canonical-outline' });
    await runner.run(acquired.job.id, {
      generateText: async () => JSON.stringify({
        blocks: [{ basis: 'evidence', evidence_ids: [item.evidenceId] }],
      }),
    });

    expect(db.prepare('SELECT COUNT(*) AS count FROM content_artifact_revisions WHERE artifact_id = ?').get(earliest.body.artifact.id).count).toBe(2);
    expect(db.prepare('SELECT COUNT(*) AS count FROM content_artifact_revisions WHERE artifact_id = ?').get(later.body.artifact.id).count).toBe(2);
  });
});
