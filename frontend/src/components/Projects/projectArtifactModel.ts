import type { ContentArtifact } from '../../store';

/**
 * 旧项目可能已有多个同 kind Artifact。与后端 Creation Runner 一致，
 * 固定选择最早 ID，避免 UI 因 updated_at 排序变化而漂移到另一条稿件线。
 */
export function selectCanonicalProjectArtifact(
  artifacts: ContentArtifact[],
  kind: string
): ContentArtifact | null {
  return artifacts.reduce<ContentArtifact | null>((selected, artifact) => {
    if (artifact.kind !== kind) return selected;
    if (!selected || artifact.id < selected.id) return artifact;
    return selected;
  }, null);
}
