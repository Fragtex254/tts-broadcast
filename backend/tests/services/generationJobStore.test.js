const db = require('../../src/db');
const broadcastStore = require('../../src/services/broadcastStore');
const generationJobStore = require('../../src/services/generationJobStore');

describe('generationJobStore', () => {
  let broadcastId;

  beforeEach(() => {
    generationJobStore.clear();
    db.prepare('DELETE FROM broadcasts').run();
    const broadcast = broadcastStore.create({
      title: '测试播报',
      content: '测试内容',
      voiceType: 'preset',
      voiceConfig: '{"voice":"冰糖"}',
      status: 'pending',
      mode: 'segmented',
    });
    broadcastId = broadcast.id;
  });

  test('同一播报同一任务类型只能获取一个有效 lease', () => {
    const first = generationJobStore.acquire({ broadcastId, nowMs: 1000, leaseMs: 60000 });
    const second = generationJobStore.acquire({ broadcastId, nowMs: 2000, leaseMs: 60000 });

    expect(first).toEqual(expect.objectContaining({
      broadcast_id: broadcastId,
      job_type: generationJobStore.JOB_TYPE_SEGMENT_BATCH_TTS,
      status: 'running',
    }));
    expect(second).toBeNull();
  });

  test('lease 过期后允许重新获取并把旧任务标记为 expired', () => {
    const first = generationJobStore.acquire({ broadcastId, nowMs: 1000, leaseMs: 1000 });
    const second = generationJobStore.acquire({ broadcastId, nowMs: 2500, leaseMs: 1000 });

    expect(first.id).not.toBe(second.id);
    const oldJob = db.prepare('SELECT status FROM generation_jobs WHERE id = ?').get(first.id);
    expect(oldJob.status).toBe('expired');
  });

  test('heartbeat 延长 lease，finish 释放任务', () => {
    const job = generationJobStore.acquire({ broadcastId, nowMs: 1000, leaseMs: 1000 });
    generationJobStore.heartbeat({ jobId: job.id, nowMs: 1500, leaseMs: 3000 });

    const active = generationJobStore.getActive({ broadcastId, nowMs: 3000 });
    expect(active.id).toBe(job.id);
    expect(active.lease_expires_at_ms).toBe(4500);

    generationJobStore.finish({ jobId: job.id, status: 'completed' });
    expect(generationJobStore.getActive({ broadcastId, nowMs: 3001 })).toBeUndefined();
  });
});
