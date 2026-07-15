const db = require('../../src/db');
const podcastTranscriptStore = require('../../src/services/podcastTranscriptStore');
const jobStore = require('../../src/services/transcriptionSummaryJobStore');

describe('Transcript 总结任务租约', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM transcription_results').run();
  });

  test('同一 Transcript 同时只能取得一个有效租约，过期后允许重试', () => {
    const record = podcastTranscriptStore.create({
      record: { fileName: 'lease.wav', text: '内容', contentMode: 'podcast', structureStatus: 'ready' }
    });

    const first = jobStore.acquire({ transcriptionId: record.id, nowMs: 1000, leaseMs: 500 });
    expect(first).toBeTruthy();
    expect(jobStore.acquire({ transcriptionId: record.id, nowMs: 1200, leaseMs: 500 })).toBeNull();
    expect(jobStore.hasActive({ transcriptionId: record.id, nowMs: 1600 })).toBe(false);

    const retried = jobStore.acquire({ transcriptionId: record.id, nowMs: 1600, leaseMs: 500 });
    expect(retried).toBeTruthy();
    expect(retried.id).not.toBe(first.id);
  });
});
