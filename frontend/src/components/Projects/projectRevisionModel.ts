import type { ContentArtifactRevision } from '../../store';

export function isAiGeneratedRevision(revision: ContentArtifactRevision | null | undefined): boolean {
  if (!revision) return false;
  return revision.provenance.origin === 'ai'
    || revision.generation_job_id !== null
    || revision.change_reason === 'ai_generated';
}

export function isRevisionConfirmedForOutput(revision: ContentArtifactRevision | null | undefined): boolean {
  return Boolean(revision) && !isAiGeneratedRevision(revision);
}

export function revisionOriginLabel(revision: ContentArtifactRevision): string {
  return isAiGeneratedRevision(revision) ? 'AI 生成草案' : '人工保存版本';
}
