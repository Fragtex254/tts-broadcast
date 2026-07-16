const podcastTranscriptStore = require('./podcastTranscriptStore');
const researchStore = require('./researchStore');
const sseManager = require('./sseManager');
const jobStore = require('./transcriptionClaimJobStore');
const claimService = require('./transcriptionClaimService');
const { createScopedLogger } = require('./logger');

const logger = createScopedLogger('transcription-claim-runner');
const CLAIM_LEASE_MS = 30 * 60 * 1000;

async function run({ transcriptionId, taskId, job }) {
  const timer = setInterval(() => jobStore.heartbeat({ jobId: job.id, leaseMs: CLAIM_LEASE_MS }), 60000);
  timer.unref?.();
  try {
    sseManager.send(taskId, 'claims-start', { transcriptionId, phase: 'starting', percent: 0, timestamp: Date.now() });
    const claims = await claimService.generate({ transcriptionId, onProgress: (progress) => {
      jobStore.heartbeat({ jobId: job.id, leaseMs: CLAIM_LEASE_MS });
      sseManager.sendProgress(taskId, { transcriptionId, ...progress, timestamp: Date.now() });
    } });
    jobStore.finish({ jobId: job.id, status: 'completed' });
    sseManager.sendComplete(taskId, { transcriptionId, phase: 'claims-completed', percent: 100, claims, timestamp: Date.now() });
  } catch (error) {
    jobStore.finish({ jobId: job.id, status: 'failed' });
    logger.error({ err: error, transcriptionId }, '观点分析任务失败');
    sseManager.sendError(taskId, error.message || '观点分析失败');
  } finally { clearInterval(timer); }
}

function start({ transcriptionId, taskId }) {
  const detail = podcastTranscriptStore.getDetail(transcriptionId);
  if (!detail) throw new Error('转录结果不存在');
  if (detail.record.structure_status !== 'ready') throw new Error('当前转录没有可分析的结构化逐字稿');
  const job = jobStore.acquire({ transcriptionId, leaseMs: CLAIM_LEASE_MS });
  if (!job) return { accepted: false };
  researchStore.updateClaimsStatus(transcriptionId, { status: 'queued', model: detail.record.claims_model || '' });
  setImmediate(() => void run({ transcriptionId, taskId, job }));
  return { accepted: true };
}

function reconcile(transcriptionId) {
  const detail = podcastTranscriptStore.getDetail(transcriptionId);
  if (!detail || !['queued', 'running'].includes(detail.record.claims_status)) return;
  if (jobStore.hasActive({ transcriptionId })) return;
  researchStore.updateClaimsStatus(transcriptionId, { status: 'failed', error: '上次观点分析已中断，可以重新分析', model: detail.record.claims_model || '' });
}

module.exports = { reconcile, start };
