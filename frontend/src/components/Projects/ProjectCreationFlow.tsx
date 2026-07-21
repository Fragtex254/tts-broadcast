import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ContentCreatorInputKey, ContentProjectMilestone, ContentProjectWorkspace } from '../../store';
import useStore from '../../store';
import { ProjectCitationPanel } from './ProjectCitationPanel';
import { ProjectEvidenceWorkbench } from './ProjectEvidenceWorkbench';
import { ProjectMilestoneFeedback } from './ProjectMilestoneFeedback';
import { ProjectOutlineEditor } from './ProjectOutlineEditor';
import { selectCanonicalProjectArtifact } from './projectArtifactModel';

interface ProjectCreationFlowProps {
  workspace: ContentProjectWorkspace;
  onDirtyChange?: (dirty: boolean) => void;
  milestone?: ContentProjectMilestone | null;
  onDismissMilestone?: () => void;
  hasUnsavedBrief?: boolean;
  hasUnsavedMasterDraft?: boolean;
}

export const ProjectCreationFlow: React.FC<ProjectCreationFlowProps> = ({
  workspace,
  onDirtyChange,
  milestone = null,
  onDismissMilestone = () => undefined,
  hasUnsavedBrief = false,
  hasUnsavedMasterDraft = false,
}) => {
  const fragmentsBySource = useStore((state) => state.projectSourceFragments);
  const isLoadingFragments = useStore((state) => state.isLoadingProjectSourceFragments);
  const fragmentsError = useStore((state) => state.projectSourceFragmentsError);
  const activeOperation = useStore((state) => state.activeProjectJobOperation);
  const jobError = useStore((state) => state.projectWorkspaceJobError);
  const workspaceSaveError = useStore((state) => state.projectWorkspaceSaveError);
  const outlineRevisions = useStore((state) => state.projectOutlineRevisions);
  const isLoadingOutlineRevisions = useStore((state) => state.isLoadingProjectOutlineRevisions);
  const outlineRevisionsError = useStore((state) => state.projectOutlineRevisionsError);
  const fetchFragments = useStore((state) => state.fetchProjectSourceFragments);
  const createEvidence = useStore((state) => state.createManualProjectEvidence);
  const updateEvidence = useStore((state) => state.updateProjectEvidence);
  const startJob = useStore((state) => state.startProjectCreationJob);
  const createArtifact = useStore((state) => state.createProjectWorkspaceArtifact);
  const saveRevision = useStore((state) => state.saveProjectArtifactRevision);
  const fetchOutlineRevisions = useStore((state) => state.fetchProjectOutlineRevisions);
  const [isSavingOutline, setIsSavingOutline] = useState(false);
  const [outlineSaveError, setOutlineSaveError] = useState<string | null>(null);
  const [isEvidenceDirty, setIsEvidenceDirty] = useState(false);
  const [isOutlineDirty, setIsOutlineDirty] = useState(false);
  const projectId = workspace.project.id;
  const outlineArtifact = useMemo(
    () => selectCanonicalProjectArtifact(workspace.artifacts, 'outline'),
    [workspace.artifacts]
  );
  const outlineArtifactId = outlineArtifact?.id || null;
  const masterArtifact = useMemo(
    () => selectCanonicalProjectArtifact(workspace.artifacts, 'master'),
    [workspace.artifacts]
  );
  const selectedEvidence = useMemo(() => workspace.evidence.filter((item) => item.decision_state === 'selected'), [workspace.evidence]);
  const activeJob = useMemo(
    () => activeOperation
      ? workspace.generation_jobs.find((job) => job.operation === activeOperation && (job.status === 'queued' || job.status === 'running')) || null
      : null,
    [activeOperation, workspace.generation_jobs]
  );

  useEffect(() => {
    onDirtyChange?.(isEvidenceDirty || isOutlineDirty);
  }, [isEvidenceDirty, isOutlineDirty, onDirtyChange]);

  useEffect(() => {
    if (!outlineArtifactId) return;
    void fetchOutlineRevisions(projectId, outlineArtifactId).catch(() => undefined);
  }, [fetchOutlineRevisions, outlineArtifactId, projectId]);

  const saveOutline = useCallback(async ({ content, changeReason }: { content: string; changeReason: string }) => {
    setIsSavingOutline(true);
    setOutlineSaveError(null);
    try {
      if (outlineArtifact) {
        await saveRevision(projectId, outlineArtifact.id, {
          content,
          changeReason,
          parentRevisionId: outlineArtifact.current_revision?.id ?? null,
        });
      } else {
        await createArtifact(projectId, {
          kind: 'outline', title: '创作提纲', platform: 'general', status: 'draft', content, changeReason,
        });
      }
    } catch (error) {
      setOutlineSaveError(error instanceof Error ? error.message : '保存提纲版本失败');
      throw error;
    } finally {
      setIsSavingOutline(false);
    }
  }, [createArtifact, outlineArtifact, projectId, saveRevision]);

  const generateOutline = useCallback((evidenceIds: number[], creatorInputKeys: ContentCreatorInputKey[]) => (
    startJob(projectId, { operation: 'generate_outline', evidenceIds, creatorInputKeys })
  ), [projectId, startJob]);

  const generateMaster = useCallback((outlineRevisionId: number, evidenceIds: number[], creatorInputKeys: ContentCreatorInputKey[]) => (
    startJob(projectId, { operation: 'generate_master', outlineRevisionId, evidenceIds, creatorInputKeys })
  ), [projectId, startJob]);

  return (
    <div className="space-y-4">
      {jobError && !activeOperation && (
        <div role="alert" className="animate-shake rounded-2xl border border-pink/30 bg-pink/10 p-4">
          <p className="ui-control-label text-ink">创作任务未完成</p>
          <p className="ui-body mt-1 text-ink">{jobError}</p>
          <p className="ui-body mt-1 text-ink-soft/75">已有输入和已保存版本不会丢失；核对当前上下文后，可从对应步骤重新提交。</p>
        </div>
      )}
      <ProjectEvidenceWorkbench
        sources={workspace.sources}
        evidence={workspace.evidence}
        fragmentsBySource={fragmentsBySource}
        isLoadingFragments={isLoadingFragments}
        fragmentsError={fragmentsError}
        activeJob={activeJob}
        activeOperation={activeOperation}
        error={activeOperation === 'extract_evidence' ? jobError : null}
        hasUnsavedBrief={hasUnsavedBrief}
        onFetchFragments={(sourceId) => fetchFragments(projectId, sourceId)}
        onCreateManual={(data) => createEvidence(projectId, data)}
        onUpdate={(evidenceId, data) => updateEvidence(projectId, evidenceId, data)}
        onStartExtraction={(sourceIds) => startJob(projectId, { operation: 'extract_evidence', sourceIds })}
        onDirtyChange={setIsEvidenceDirty}
      />
      {milestone?.kind === 'evidence_selected' && (
        <ProjectMilestoneFeedback milestone={milestone} onDismiss={onDismissMilestone} />
      )}
      <ProjectOutlineEditor
        key={`${outlineArtifact?.id || 'new'}:${outlineArtifact?.current_revision?.id || 'empty'}`}
        project={workspace.project}
        artifact={outlineArtifact}
        revisions={outlineRevisions}
        isLoadingRevisions={isLoadingOutlineRevisions}
        revisionsError={outlineRevisionsError}
        onRetryRevisions={() => outlineArtifact ? fetchOutlineRevisions(projectId, outlineArtifact.id) : Promise.resolve([])}
        selectedEvidence={selectedEvidence}
        activeJob={activeJob}
        activeOperation={activeOperation}
        isSaving={isSavingOutline}
        saveError={outlineSaveError || workspaceSaveError}
        jobError={activeOperation && activeOperation !== 'extract_evidence' ? jobError : null}
        hasUnsavedBrief={hasUnsavedBrief}
        hasUnsavedEvidence={isEvidenceDirty}
        hasUnsavedMasterDraft={hasUnsavedMasterDraft}
        onSave={saveOutline}
        onGenerateOutline={generateOutline}
        onGenerateMaster={generateMaster}
        onDirtyChange={setIsOutlineDirty}
      />
      {milestone?.kind === 'outline_saved' && (
        <ProjectMilestoneFeedback milestone={milestone} onDismiss={onDismissMilestone} />
      )}
      <ProjectCitationPanel
        revision={masterArtifact?.current_revision || null}
        onFetchFragments={(sourceId) => fetchFragments(projectId, sourceId)}
      />
      {milestone?.kind === 'cited_master_saved' && (
        <ProjectMilestoneFeedback milestone={milestone} onDismiss={onDismissMilestone} />
      )}
    </div>
  );
};

export default ProjectCreationFlow;
