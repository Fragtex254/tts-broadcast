import type { ContentArtifact, ContentArtifactRevision } from '../store';

export type AudioScriptPreparationIntent = 'continue' | 'sync-master';

export type AudioScriptPreparationPlan =
  | { action: 'create'; content: string; changeReason: string }
  | { action: 'reuse'; artifactId: number; revision: ContentArtifactRevision }
  | { action: 'revise'; artifactId: number; content: string; changeReason: string };

export function getAudioScriptPreparationPlan(
  masterRevision: ContentArtifactRevision,
  audioScript: ContentArtifact | null,
  intent: AudioScriptPreparationIntent = 'continue'
): AudioScriptPreparationPlan {
  if (!audioScript) {
    return {
      action: 'create',
      content: masterRevision.content,
      changeReason: `从主稿第 ${masterRevision.revision_number} 版创建口播稿`,
    };
  }

  if (audioScript.current_revision && intent === 'continue') {
    return { action: 'reuse', artifactId: audioScript.id, revision: audioScript.current_revision };
  }

  if (audioScript.current_revision?.content === masterRevision.content) {
    return { action: 'reuse', artifactId: audioScript.id, revision: audioScript.current_revision };
  }

  return {
    action: 'revise',
    artifactId: audioScript.id,
    content: masterRevision.content,
    changeReason: audioScript.current_revision
      ? `同步自主稿第 ${masterRevision.revision_number} 版`
      : `从主稿第 ${masterRevision.revision_number} 版建立口播首版`,
  };
}
