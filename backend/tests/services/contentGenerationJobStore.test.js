const db = require('../../src/db');
const store = require('../../src/services/contentGenerationJobStore');

describe('内容创作任务 Store', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM content_revision_citations').run();
    db.prepare('DELETE FROM content_projects').run();
  });

  function projectId() {
    return Number(db.prepare("INSERT INTO content_projects (title) VALUES ('任务项目')").run().lastInsertRowid);
  }

  test('不同 requestKey 的同一事实输入也收敛到同一个 active Job', () => {
    const id = projectId();
    const first = store.acquire({
      projectId: id,
      operation: 'generate_outline',
      requestKey: 'tab-a',
      inputSha256: 'same-input',
      snapshot: { request: {} },
      leaseMs: 10000,
    });
    const second = store.acquire({
      projectId: id,
      operation: 'generate_outline',
      requestKey: 'tab-b',
      inputSha256: 'same-input',
      snapshot: { request: {} },
      leaseMs: 10000,
    });

    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(false);
    expect(second.job.id).toBe(first.job.id);
    expect(db.prepare('SELECT COUNT(*) AS count FROM content_generation_jobs').get().count).toBe(1);
  });

  test('同 requestKey 异输入冲突，旧 token 与变化上下文都不能物化结果', () => {
    const id = projectId();
    const acquired = store.acquire({
      projectId: id,
      operation: 'generate_master',
      requestKey: 'stable-key',
      inputSha256: 'input-a',
      snapshot: { request: {} },
      leaseMs: 10000,
    });
    expect(() => store.acquire({
      projectId: id,
      operation: 'generate_master',
      requestKey: 'stable-key',
      inputSha256: 'input-b',
      snapshot: { request: {} },
      leaseMs: 10000,
    })).toThrow('上下文已经变化');

    const claimed = store.claimRun({ jobId: acquired.job.id, leaseMs: 10000 });
    let materialized = 0;
    expect(store.finishSuccess({
      jobId: acquired.job.id,
      runToken: 'old-worker-token',
      verifyContext: () => ({ inputSha256: 'input-a' }),
      materialize: () => { materialized += 1; return {}; },
    })).toBeUndefined();
    const superseded = store.finishSuccess({
      jobId: acquired.job.id,
      runToken: claimed.run_token,
      verifyContext: () => ({ inputSha256: 'changed-context' }),
      materialize: () => { materialized += 1; return {}; },
    });

    expect(materialized).toBe(0);
    expect(superseded.contextChanged).toBe(true);
    expect(superseded.job.status).toBe('superseded');
    expect(superseded.job.result_revision_id).toBeNull();
  });

  test('失败 key 重试先收敛到另一条同指纹 active Job，不触发唯一索引冲突', () => {
    const id = projectId();
    const failed = store.acquire({
      projectId: id,
      operation: 'generate_outline',
      requestKey: 'failed-tab',
      inputSha256: 'shared-input',
      snapshot: { request: {} },
      leaseMs: 10000,
    });
    const claimed = store.claimRun({ jobId: failed.job.id, leaseMs: 10000 });
    store.fail({ jobId: failed.job.id, runToken: claimed.run_token, error: '临时失败' });
    const active = store.acquire({
      projectId: id,
      operation: 'generate_outline',
      requestKey: 'active-tab',
      inputSha256: 'shared-input',
      snapshot: { request: {} },
      leaseMs: 10000,
    });

    expect(() => store.acquire({
      projectId: id,
      operation: 'generate_outline',
      requestKey: 'failed-tab',
      inputSha256: 'shared-input',
      snapshot: { request: {} },
      leaseMs: 10000,
    })).not.toThrow();
    const retried = store.acquire({
      projectId: id,
      operation: 'generate_outline',
      requestKey: 'failed-tab',
      inputSha256: 'shared-input',
      snapshot: { request: {} },
      leaseMs: 10000,
    });
    expect(retried).toMatchObject({ accepted: false, reused: true });
    expect(retried.job.id).toBe(active.job.id);
    expect(store.get(failed.job.id).status).toBe('failed');
    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM content_generation_jobs
      WHERE project_id = ? AND operation = 'generate_outline' AND input_sha256 = ?
    `).get(id, 'shared-input').count).toBe(2);
  });
});
