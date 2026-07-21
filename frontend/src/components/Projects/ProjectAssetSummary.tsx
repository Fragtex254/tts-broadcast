import React from 'react';
import type { ContentProjectWorkspace } from '../../store';
import { selectCanonicalProjectArtifact } from './projectArtifactModel';

interface ProjectAssetSummaryProps {
  workspace: ContentProjectWorkspace;
}

export const ProjectAssetSummary: React.FC<ProjectAssetSummaryProps> = ({ workspace }) => {
  const outline = selectCanonicalProjectArtifact(workspace.artifacts, 'outline')?.current_revision;
  const master = selectCanonicalProjectArtifact(workspace.artifacts, 'master')?.current_revision;
  const usableEvidence = workspace.evidence.filter((item) => item.reuse_eligible).length;

  return (
    <section aria-label="项目创作资产概览" className="rounded-2xl border border-card-border bg-white/55 px-4 py-3">
      <dl className="flex flex-wrap gap-x-5 gap-y-2 ui-control-label text-ink-soft">
        <div><dt className="sr-only">原始来源</dt><dd>{workspace.sources.length} 份原始来源</dd></div>
        <div><dt className="sr-only">可用证据</dt><dd>{usableEvidence} 条可用证据</dd></div>
        <div><dt className="sr-only">提纲版本</dt><dd>{outline ? `提纲 v${outline.revision_number}` : '提纲未保存'}</dd></div>
        <div><dt className="sr-only">主稿版本</dt><dd>{master ? `主稿 v${master.revision_number}` : '主稿未保存'}</dd></div>
      </dl>
    </section>
  );
};

export default ProjectAssetSummary;
