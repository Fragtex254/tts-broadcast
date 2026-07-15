const podcastTranscriptStore = require('./podcastTranscriptStore');
const sseManager = require('./sseManager');
const transcriptionSummaryJobStore = require('./transcriptionSummaryJobStore');
const transcriptionSummaryService = require('./transcriptionSummaryService');
const { createScopedLogger } = require('./logger');

const logger = createScopedLogger('transcription-summary-runner');
const SUMMARY_LEASE_MS = 30 * 60 * 1000;

async function run({ transcriptionId, taskId, job }) {
  const heartbeatTimer = setInterval(() => {
    transcriptionSummaryJobStore.heartbeat({ jobId: job.id, leaseMs: SUMMARY_LEASE_MS });
  }, 60 * 1000);
  heartbeatTimer.unref?.();
  try {
    sseManager.send(taskId, 'summary-start', {
      transcriptionId,
      phase: 'starting',
      percent: 0,
      timestamp: Date.now()
    });
    const transcript = await transcriptionSummaryService.generate({
      transcriptionId,
      onProgress: (progress) => {
        transcriptionSummaryJobStore.heartbeat({ jobId: job.id, leaseMs: SUMMARY_LEASE_MS });
        sseManager.sendProgress(taskId, { transcriptionId, ...progress, timestamp: Date.now() });
      }
    });
    transcriptionSummaryJobStore.finish({ jobId: job.id, status: 'completed' });
    sseManager.sendComplete(taskId, {
      transcriptionId,
      phase: 'summary-completed',
      percent: 100,
      transcript,
      timestamp: Date.now()
    });
  } catch (error) {
    transcriptionSummaryJobStore.finish({ jobId: job.id, status: 'failed' });
    logger.error({ err: error, transcriptionId }, 'Transcript 总结任务失败');
    sseManager.sendError(taskId, error.message || '播客总结失败');
  } finally {
    clearInterval(heartbeatTimer);
  }
}

/**
 * 幂等受理 Transcript 总结后台任务。
 * @param {Object} params
 * @param {number} params.transcriptionId - Transcript ID
 * @param {string} params.taskId - SSE task ID
 * @returns {{accepted:boolean}} 是否受理
 */
function start({ transcriptionId, taskId }) {
  const detail = podcastTranscriptStore.getDetail(transcriptionId);
  if (!detail) throw new Error('转录结果不存在');
  if (detail.record.structure_status !== 'ready') throw new Error('当前转录没有可总结的结构化逐字稿');
  const job = transcriptionSummaryJobStore.acquire({ transcriptionId, leaseMs: SUMMARY_LEASE_MS });
  if (!job) return { accepted: false };
  podcastTranscriptStore.updateSummaryStatus(transcriptionId, {
    status: 'queued',
    model: detail.record.summary_model || ''
  });
  setImmediate(() => {
    void run({ transcriptionId, taskId, job });
  });
  return { accepted: true };
}

/**
 * 将进程中断后已失去租约的 running/queued 状态收敛为可重试失败态。
 * @param {number} transcriptionId - Transcript ID
 */
function reconcile(transcriptionId) {
  const detail = podcastTranscriptStore.getDetail(transcriptionId);
  if (!detail) return;
  if (!['queued', 'running'].includes(detail.record.summary_status)) return;
  if (transcriptionSummaryJobStore.hasActive({ transcriptionId })) return;
  podcastTranscriptStore.updateSummaryStatus(transcriptionId, {
    status: 'failed',
    error: '上次总结任务已中断，可以重新总结',
    model: detail.record.summary_model || ''
  });
}

module.exports = { reconcile, start };
