const contentArtifactStore = require('./contentArtifactStore');
const contentCreationContext = require('./contentCreationContext');
const contentCreationService = require('./contentCreationService');
const contentEvidenceStore = require('./contentEvidenceStore');
const contentGenerationJobStore = require('./contentGenerationJobStore');
const contentWorkspaceService = require('./contentWorkspaceService');
const sseManager = require('./sseManager');
const { createScopedLogger } = require('./logger');

const logger = createScopedLogger('content-generation-runner');
const LEASE_MS = 5 * 60 * 1000;
const subscribers = new Map();

function subscribe(jobId, taskId) {
  if (!taskId) return;
  if (!subscribers.has(jobId)) subscribers.set(jobId, new Set());
  subscribers.get(jobId).add(taskId);
}

function send(jobId, eventType, payload) {
  for (const taskId of subscribers.get(jobId) || []) {
    sseManager.send(taskId, eventType, payload);
  }
}

function clearSubscribers(jobId) {
  subscribers.delete(jobId);
}

async function waitForSseConnections(jobId, timeoutMs = 800) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const taskIds = [...(subscribers.get(jobId) || [])];
    if (taskIds.length === 0 || taskIds.every((taskId) => sseManager.getTaskConnectionCount(taskId) > 0)) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function contextInput(snapshot) {
  return {
    sourceIds: snapshot.request?.source_ids || [],
    evidenceIds: snapshot.request?.evidence_ids || [],
    outlineRevisionId: snapshot.request?.outline_revision_id || undefined,
    creatorInputKeys: snapshot.request?.creator_input_keys || [],
  };
}

function materializeEvidence(job, output) {
  for (const candidate of output.candidates) {
    contentEvidenceStore.create({
      projectId: job.project_id,
      sourceId: candidate.source_id,
      fragmentStart: candidate.start_fragment_index,
      fragmentEnd: candidate.end_fragment_index,
      origin: 'ai',
      aiNote: candidate.ai_note,
      userNote: '',
      generationJobId: job.id,
    });
  }
  return {};
}

function materializeRevision(job, output) {
  // 兼容旧项目可能已有多个同 kind Artifact：固定使用最早 ID，避免 updated_at 改变后漂移。
  const artifact = contentArtifactStore.getCanonicalForKind({
    projectId: job.project_id,
    kind: output.kind,
  });
  const common = {
    projectId: job.project_id,
    content: output.content,
    changeReason: 'ai_generated',
    requestKey: `generation-job:${job.id}`,
    generationJobId: job.id,
    provenance: output.provenance,
  };
  let result;
  if (artifact) {
    result = contentArtifactStore.addRevision({
      ...common,
      artifactId: artifact.id,
      parentRevisionId: artifact.current_revision?.id,
    });
  } else {
    result = contentArtifactStore.create({
      ...common,
      kind: output.kind,
      title: output.kind === 'outline' ? '创作提纲' : '主稿',
      platform: 'general',
      status: 'draft',
      hasContent: true,
    });
  }
  const savedArtifact = result.artifact;
  const revision = result.revision || savedArtifact.current_revision;
  return {
    artifactId: savedArtifact.id,
    revisionId: revision.id,
    milestone: result.milestone,
  };
}

function materialize(job, output) {
  return output.type === 'evidence'
    ? materializeEvidence(job, output)
    : materializeRevision(job, output);
}

async function run(jobId, { generateText } = {}) {
  const claimed = contentGenerationJobStore.claimRun({ jobId, leaseMs: LEASE_MS });
  if (!claimed) return undefined;
  const heartbeatTimer = setInterval(() => {
    contentGenerationJobStore.heartbeat({
      jobId,
      runToken: claimed.run_token,
      leaseMs: LEASE_MS,
    });
  }, 60 * 1000);
  heartbeatTimer.unref?.();
  try {
    send(jobId, 'progress', { job: contentGenerationJobStore.get(jobId) });
    const output = await contentCreationService.generate({
      projectId: claimed.project_id,
      operation: claimed.operation,
      snapshot: claimed.input_snapshot,
      generateText,
      onProgress: ({ phase, progress }) => {
        const job = contentGenerationJobStore.heartbeat({
          jobId,
          runToken: claimed.run_token,
          leaseMs: LEASE_MS,
          phase,
          progress,
        });
        if (job) send(jobId, 'progress', { job });
      },
    });
    const savingJob = contentGenerationJobStore.heartbeat({
      jobId,
      runToken: claimed.run_token,
      leaseMs: LEASE_MS,
      phase: output.type === 'revision' ? 'saving_revision' : 'validating',
      progress: 95,
    });
    if (savingJob) send(jobId, 'progress', { job: savingJob });
    const finished = contentGenerationJobStore.finishSuccess({
      jobId,
      runToken: claimed.run_token,
      metadata: output.metadata,
      verifyContext: (current) => contentCreationContext.build({
        projectId: current.project_id,
        operation: current.operation,
        input: contextInput(current.input_snapshot),
      }),
      materialize: (current) => materialize(current, output),
    });
    if (!finished) return undefined;
    if (finished.contextChanged) {
      send(jobId, 'error', { job: finished.job, error: finished.job.error });
      return finished;
    }
    const workspace = contentWorkspaceService.getWorkspace({ projectId: claimed.project_id });
    send(jobId, 'complete', {
      job: finished.job,
      workspace,
      ...(finished.milestone ? { milestone: finished.milestone } : {}),
    });
    return finished;
  } catch (error) {
    const failed = contentGenerationJobStore.fail({
      jobId,
      runToken: claimed.run_token,
      error: error.message || '创作任务失败',
    });
    logger.error({ err: error, jobId, operation: claimed.operation }, '内容创作任务失败');
    if (failed) send(jobId, 'error', { job: failed, error: failed.error });
    return failed ? { job: failed, error } : undefined;
  } finally {
    clearInterval(heartbeatTimer);
    clearSubscribers(jobId);
  }
}

function start({ job, taskId }) {
  subscribe(job.id, taskId);
  if (job.status === 'queued') {
    setImmediate(() => {
      void waitForSseConnections(job.id).then(() => run(job.id));
    });
  }
}

module.exports = {
  LEASE_MS,
  materialize,
  run,
  start,
  subscribe,
  waitForSseConnections,
};
