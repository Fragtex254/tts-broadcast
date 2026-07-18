import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useBlocker, useNavigate, useParams } from 'react-router-dom';
import { Header } from '../components/Layout/Header';
import { ModalShell } from '../components/ModalShell';
import { ProjectBriefForm } from '../components/Projects/ProjectBriefForm';
import { ProjectDraftEditor } from '../components/Projects/ProjectDraftEditor';
import { ProjectOutputGuide } from '../components/Projects/ProjectOutputGuide';
import { ProjectSourcesPanel } from '../components/Projects/ProjectSourcesPanel';
import { ProjectWorkspaceSkeleton } from '../components/Projects/ProjectWorkspaceSkeleton';
import { ActionButton } from '../components/ui/ActionButton';
import type { ContentArtifactRevision, ContentProjectSourceInput, ContentProjectUpdateInput } from '../store';
import useStore from '../store';
import { getAudioScriptPreparationPlan, type AudioScriptPreparationIntent } from './projectAudioScriptModel';

interface DraftSaveInput {
  title: string;
  content: string;
  changeReason: string;
}

const parseProjectId = (value: string | undefined): number | null => {
  if (!value) return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

export const ProjectWorkspace: React.FC = () => {
  const params = useParams();
  const navigate = useNavigate();
  const projectId = parseProjectId(params.id);
  const workspace = useStore((state) => state.projectWorkspace);
  const isLoading = useStore((state) => state.isLoadingProjectWorkspace);
  const loadError = useStore((state) => state.projectWorkspaceError);
  const revisions = useStore((state) => state.projectArtifactRevisions);
  const isLoadingRevisions = useStore((state) => state.isLoadingProjectArtifactRevisions);
  const revisionsError = useStore((state) => state.projectArtifactRevisionsError);
  const fetchWorkspace = useStore((state) => state.fetchProjectWorkspace);
  const clearWorkspace = useStore((state) => state.clearProjectWorkspace);
  const updateProject = useStore((state) => state.updateContentProject);
  const addSource = useStore((state) => state.addProjectWorkspaceSource);
  const createArtifact = useStore((state) => state.createProjectWorkspaceArtifact);
  const saveRevision = useStore((state) => state.saveProjectArtifactRevision);
  const fetchRevisions = useStore((state) => state.fetchProjectArtifactRevisions);
  const updateScript = useStore((state) => state.updateScript);
  const [isPreparingAudioScript, setIsPreparingAudioScript] = useState(false);
  const [audioScriptError, setAudioScriptError] = useState<string | null>(null);
  const [isSavingSource, setIsSavingSource] = useState(false);
  const [sourceSaveError, setSourceSaveError] = useState<string | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [draftSaveError, setDraftSaveError] = useState<string | null>(null);
  const [isBriefDirty, setIsBriefDirty] = useState(false);
  const [isMasterDirty, setIsMasterDirty] = useState(false);
  const hasUnsavedChanges = isBriefDirty || isMasterDirty;
  const navigationBlocker = useBlocker(hasUnsavedChanges);

  useEffect(() => {
    if (!projectId) return;
    void fetchWorkspace(projectId).catch(() => undefined);
    return () => clearWorkspace();
  }, [clearWorkspace, fetchWorkspace, projectId]);

  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  const masterArtifact = useMemo(
    () => workspace?.artifacts.find((artifact) => artifact.kind === 'master') || null,
    [workspace?.artifacts]
  );
  const audioScriptArtifact = useMemo(
    () => workspace?.artifacts.find((artifact) => artifact.kind === 'audio_script') || null,
    [workspace?.artifacts]
  );

  const handleBriefSave = useCallback((data: ContentProjectUpdateInput) => {
    if (!projectId) return Promise.reject(new Error('项目 ID 无效'));
    return updateProject(projectId, data);
  }, [projectId, updateProject]);

  const handleSourceAdd = useCallback(async (data: ContentProjectSourceInput) => {
    if (!projectId) throw new Error('项目 ID 无效');
    setIsSavingSource(true);
    setSourceSaveError(null);
    try {
      return await addSource(projectId, data);
    } catch (error) {
      setSourceSaveError(error instanceof Error ? error.message : '保存来源失败');
      throw error;
    } finally {
      setIsSavingSource(false);
    }
  }, [addSource, projectId]);

  const handleDraftSave = useCallback(async (data: DraftSaveInput) => {
    if (!projectId) throw new Error('项目 ID 无效');
    setIsSavingDraft(true);
    setDraftSaveError(null);
    try {
      if (masterArtifact) {
        await saveRevision(projectId, masterArtifact.id, { content: data.content, changeReason: data.changeReason });
        return;
      }
      await createArtifact(projectId, {
        kind: 'master',
        title: data.title,
        platform: 'general',
        status: 'draft',
        content: data.content,
        changeReason: data.changeReason,
      });
    } catch (error) {
      setDraftSaveError(error instanceof Error ? error.message : '保存主稿版本失败');
      throw error;
    } finally {
      setIsSavingDraft(false);
    }
  }, [createArtifact, masterArtifact, projectId, saveRevision]);

  const handleLoadRevisions = useCallback(async () => {
    if (!projectId || !masterArtifact) return;
    await fetchRevisions(projectId, masterArtifact.id);
  }, [fetchRevisions, masterArtifact, projectId]);

  const handleOpenAudioScript = useCallback(async (intent: AudioScriptPreparationIntent) => {
    const masterRevision = masterArtifact?.current_revision;
    if (!projectId || !masterRevision) return;
    if (hasUnsavedChanges) {
      setAudioScriptError('请先保存 Brief 和主稿修改，再准备输出。');
      return;
    }
    setIsPreparingAudioScript(true);
    setAudioScriptError(null);
    try {
      const plan = getAudioScriptPreparationPlan(masterRevision, audioScriptArtifact, intent);
      let artifactId: number;
      let revision: ContentArtifactRevision;
      if (plan.action === 'create') {
        const artifact = await createArtifact(projectId, {
          kind: 'audio_script',
          title: '口播稿',
          platform: 'general',
          status: 'draft',
          content: plan.content,
          changeReason: plan.changeReason,
        });
        if (!artifact.current_revision) throw new Error('口播稿已经创建，但首个版本尚未返回，请重试。');
        artifactId = artifact.id;
        revision = artifact.current_revision;
      } else if (plan.action === 'reuse') {
        artifactId = plan.artifactId;
        revision = plan.revision;
      } else {
        artifactId = plan.artifactId;
        revision = await saveRevision(projectId, plan.artifactId, {
          content: plan.content,
          changeReason: plan.changeReason,
        });
      }
      updateScript(revision.content);
      navigate(`/editor?projectId=${projectId}&artifactId=${artifactId}&revisionId=${revision.id}`);
    } catch (error) {
      setAudioScriptError(error instanceof Error ? error.message : '准备口播稿失败，请稍后重试。');
    } finally {
      setIsPreparingAudioScript(false);
    }
  }, [audioScriptArtifact, createArtifact, hasUnsavedChanges, masterArtifact, navigate, projectId, saveRevision, updateScript]);

  const retry = useCallback(() => {
    if (projectId) void fetchWorkspace(projectId).catch(() => undefined);
  }, [fetchWorkspace, projectId]);

  const invalidIdError = projectId ? null : '项目地址无效，请从工作台或内容库重新打开。';

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <Header
        title={workspace?.project.title || '内容项目'}
        subtitle="从 Brief 和可靠来源出发，持续沉淀可追溯的主稿版本"
      />
      <main className="flex-1 overflow-y-auto p-5 sm:p-6">
        <div className="mx-auto max-w-6xl">
          {isLoading ? (
            <ProjectWorkspaceSkeleton />
          ) : invalidIdError || loadError ? (
            <div role="alert" className="animate-shake rounded-card border border-pink/30 bg-pink/10 p-6 shadow-card">
              <h2 className="ui-section-title text-ink">无法打开内容项目</h2>
              <p className="ui-body mt-2 text-ink-soft/80">{invalidIdError || loadError}</p>
              {projectId && <ActionButton tone="secondary" className="mt-4" onClick={retry}>重新加载</ActionButton>}
            </div>
          ) : !workspace ? (
            <div className="rounded-card border border-dashed border-card-border bg-white/45 p-8 text-center">
              <h2 className="ui-section-title text-ink-soft">项目工作区尚未就绪</h2>
              <p className="ui-body mt-2 text-ink-soft/70">重新加载后仍为空时，请回到内容库确认项目是否存在。</p>
              <ActionButton tone="secondary" className="mt-4" onClick={retry}>重新加载</ActionButton>
            </div>
          ) : (
            <div className="space-y-4">
              {hasUnsavedChanges && (
                <div role="status" className="sticky top-0 z-10 rounded-2xl border border-lemon/45 bg-lemon/90 p-3 shadow-card backdrop-blur-sm">
                  <p className="ui-control-label text-ink">项目里有尚未保存的修改</p>
                  <p className="ui-body mt-1 text-ink-soft/80">先保存对应区域，再离开页面或准备输出；刷新或关闭页面时浏览器也会提醒。</p>
                </div>
              )}
              <ProjectBriefForm
                key={workspace.project.id}
                project={workspace.project}
                onSave={handleBriefSave}
                onDirtyChange={setIsBriefDirty}
              />
              <ProjectSourcesPanel
                sources={workspace.sources}
                claims={workspace.project.claims}
                isSaving={isSavingSource}
                saveError={sourceSaveError}
                onAdd={handleSourceAdd}
                onContinueResearch={() => navigate(`/history?tab=research&project=${workspace.project.id}`)}
              />
              <ProjectDraftEditor
                key={masterArtifact ? `${masterArtifact.id}:${masterArtifact.current_revision?.id || 'empty'}` : 'new-master'}
                artifact={masterArtifact}
                revisions={revisions}
                isSaving={isSavingDraft}
                saveError={draftSaveError}
                isLoadingRevisions={isLoadingRevisions}
                revisionsError={revisionsError}
                onSave={handleDraftSave}
                onLoadRevisions={handleLoadRevisions}
                onDirtyChange={setIsMasterDirty}
              />
              <ProjectOutputGuide
                hasMasterRevision={Boolean(masterArtifact?.current_revision)}
                masterRevisionNumber={masterArtifact?.current_revision?.revision_number}
                masterContent={masterArtifact?.current_revision?.content}
                fileName={workspace.project.title}
                targetPlatform={workspace.project.target_platform}
                contentFormat={workspace.project.content_format}
                hasAudioScriptRevision={Boolean(audioScriptArtifact?.current_revision)}
                isAudioScriptDifferentFromMaster={Boolean(
                  masterArtifact?.current_revision
                  && audioScriptArtifact?.current_revision
                  && masterArtifact.current_revision.content !== audioScriptArtifact.current_revision.content
                )}
                hasUnsavedChanges={hasUnsavedChanges}
                isPreparing={isPreparingAudioScript}
                error={audioScriptError}
                onContinue={() => void handleOpenAudioScript('continue')}
                onSyncMaster={() => void handleOpenAudioScript('sync-master')}
              />
            </div>
          )}
        </div>
      </main>
      <ModalShell
        isOpen={navigationBlocker.state === 'blocked'}
        title="还有修改没有保存"
        subtitle="离开后，本次在 Brief 或主稿编辑区里的修改不会进入版本记录。"
        accent="lemon"
        size="sm"
        showCloseButton={false}
        closeOnBackdrop={false}
        onClose={() => {
          if (navigationBlocker.state === 'blocked') navigationBlocker.reset();
        }}
        footer={(
          <div className="flex flex-wrap justify-end gap-2">
            <ActionButton
              tone="secondary"
              onClick={() => {
                if (navigationBlocker.state === 'blocked') navigationBlocker.reset();
              }}
            >
              继续编辑
            </ActionButton>
            <ActionButton
              tone="danger"
              onClick={() => {
                if (navigationBlocker.state === 'blocked') navigationBlocker.proceed();
              }}
            >
              放弃修改并离开
            </ActionButton>
          </div>
        )}
      >
        <p className="ui-body text-ink-soft/80">建议先关闭此提示，回到对应区域保存；如果确认不需要这些修改，可以选择放弃并离开。</p>
      </ModalShell>
    </div>
  );
};

export default ProjectWorkspace;
