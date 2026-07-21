jest.mock('../../src/services/contentGenerationRunner', () => ({
  LEASE_MS: 300000,
  start: jest.fn(),
}));

const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/db');
const runner = require('../../src/services/contentGenerationRunner');

describe('内容创作 Job API', () => {
  beforeEach(() => {
    runner.start.mockClear();
    db.prepare('DELETE FROM content_revision_citations').run();
    db.prepare('DELETE FROM content_projects').run();
    db.prepare('DELETE FROM content_sources').run();
  });

  test('不同 task/request key 的相同事实输入复用一个 Job，并隐藏内部快照与 token', async () => {
    const project = await request(app).post('/api/content-projects').send({ title: '并发提取' });
    const source = await request(app)
      .post(`/api/content-projects/${project.body.project.id}/sources`)
      .send({ sourceType: 'manual', title: '来源', content: '原始事实。' });
    const first = await request(app)
      .post(`/api/content-projects/${project.body.project.id}/creation-jobs`)
      .send({
        operation: 'extract_evidence',
        sourceIds: [source.body.source.id],
        requestKey: 'tab-a',
        taskId: 'task-a',
      });
    const second = await request(app)
      .post(`/api/content-projects/${project.body.project.id}/creation-jobs`)
      .send({
        operation: 'extract_evidence',
        sourceIds: [source.body.source.id],
        requestKey: 'tab-b',
        taskId: 'task-b',
      });

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(second.body.job.id).toBe(first.body.job.id);
    expect(first.body.job).toMatchObject({
      operation: 'extract_evidence',
      status: 'queued',
      phase: 'queued',
      progress: null,
    });
    expect(first.body.job).not.toHaveProperty('run_token');
    expect(first.body.job).not.toHaveProperty('input_snapshot');
    expect(runner.start).toHaveBeenCalledTimes(2);

    const workspace = await request(app).get(`/api/content-projects/${project.body.project.id}/workspace`);
    expect(workspace.body.workspace.generation_jobs).toHaveLength(1);
  });

  test('同 requestKey 在 Brief 改变后返回 409，非法 creator key 返回 400', async () => {
    const project = await request(app).post('/api/content-projects').send({ title: '冲突任务' });
    const projectId = project.body.project.id;
    const source = await request(app)
      .post(`/api/content-projects/${projectId}/sources`)
      .send({ sourceType: 'manual', title: '来源', content: '原始事实。' });
    const card = await request(app)
      .post(`/api/content-projects/${projectId}/evidence`)
      .send({
        sourceId: source.body.source.id,
        startFragmentIndex: 0,
        endFragmentIndex: 0,
        decisionState: 'selected',
      });
    const payload = {
      operation: 'generate_outline',
      evidenceIds: [card.body.evidence.id],
      creatorInputKeys: [],
      requestKey: 'outline-stable',
      taskId: 'outline-task',
    };
    expect((await request(app).post(`/api/content-projects/${projectId}/creation-jobs`).send(payload)).status).toBe(202);
    await request(app).patch(`/api/content-projects/${projectId}`).send({ thesis: '变化后的主张' });
    const conflict = await request(app)
      .post(`/api/content-projects/${projectId}/creation-jobs`)
      .send({ ...payload, taskId: 'outline-retry' });
    const invalidCreator = await request(app)
      .post(`/api/content-projects/${projectId}/creation-jobs`)
      .send({ ...payload, requestKey: 'other', taskId: 'other-task', creatorInputKeys: ['private_memory'] });

    expect(conflict.status).toBe(409);
    expect(invalidCreator.status).toBe(400);
  });
});
