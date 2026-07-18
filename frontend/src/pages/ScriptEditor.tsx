import React, { useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AudioPlayer } from '../components/Dashboard/AudioPlayer';
import { ScriptPreview } from '../components/Dashboard/ScriptPreview';
import { SegmentEditor } from '../components/Dashboard/SegmentEditor';
import { VoiceGenerator } from '../components/Dashboard/VoiceGenerator';
import { Header } from '../components/Layout/Header';
import { ActionButton } from '../components/ui/ActionButton';
import useStore, { type ContentArtifactRevision } from '../store';
import { getProjectEditorUrl, parseProjectEditorContext } from './projectEditorContext';

export const ScriptEditor: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const parsedContext = useMemo(
    () => parseProjectEditorContext(new URLSearchParams(location.search)),
    [location.search]
  );
  const currentBroadcast = useStore((state) => state.currentBroadcast);
  const script = useStore((state) => state.script);
  const segments = useStore((state) => state.segments);
  const saveBroadcast = useStore((state) => state.saveBroadcast);
  const projectEditorContext = useStore((state) => state.projectEditorContext);
  const isLoadingProjectRevision = useStore((state) => state.isLoadingProjectEditorRevision);
  const projectRevisionError = useStore((state) => state.projectEditorRevisionError);
  const loadProjectEditorRevision = useStore((state) => state.loadProjectEditorRevision);
  const adoptProjectEditorRevision = useStore((state) => state.adoptProjectEditorRevision);
  const clearProjectEditorContext = useStore((state) => state.clearProjectEditorContext);

  const hasExactProjectContext = parsedContext.kind === 'project'
    && projectEditorContext?.projectId === parsedContext.projectId
    && projectEditorContext.artifactId === parsedContext.artifactId
    && projectEditorContext.revision.id === parsedContext.revisionId;
  const recoverableProjectContext = parsedContext.kind === 'legacy'
    && projectEditorContext
    && script === projectEditorContext.revision.content
    ? projectEditorContext
    : null;

  useEffect(() => {
    if (recoverableProjectContext) {
      navigate(getProjectEditorUrl(recoverableProjectContext), { replace: true });
      return;
    }
    if (parsedContext.kind !== 'project') {
      clearProjectEditorContext();
      return;
    }
    if (hasExactProjectContext) return;
    void loadProjectEditorRevision(
      parsedContext.projectId,
      parsedContext.artifactId,
      parsedContext.revisionId
    ).catch(() => undefined);
  }, [clearProjectEditorContext, hasExactProjectContext, loadProjectEditorRevision, navigate, parsedContext, recoverableProjectContext]);

  const retryProjectRevision = () => {
    if (parsedContext.kind !== 'project') return;
    void loadProjectEditorRevision(
      parsedContext.projectId,
      parsedContext.artifactId,
      parsedContext.revisionId
    ).catch(() => undefined);
  };

  const handleProjectRevisionSaved = (revision: ContentArtifactRevision) => {
    if (parsedContext.kind !== 'project') return;
    adoptProjectEditorRevision(revision);
    navigate(getProjectEditorUrl({
      projectId: parsedContext.projectId,
      artifactId: parsedContext.artifactId,
      revision,
    }), { replace: true });
  };

  const audioUrl = currentBroadcast && (
    currentBroadcast.audio_path || (currentBroadcast.mode === 'segmented' && currentBroadcast.status === 'generated')
  )
    ? `/api/broadcast/${currentBroadcast.id}/audio?t=${encodeURIComponent(currentBroadcast.updated_at)}`
    : null;
  const isSegmented = currentBroadcast?.mode === 'segmented';
  const showProjectLoading = Boolean(recoverableProjectContext) || (
    parsedContext.kind === 'project'
      && !hasExactProjectContext
      && (isLoadingProjectRevision || !projectRevisionError)
  );

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-paper">
      <div className="flex min-h-0 flex-1 flex-col">
        <Header
          title="口播稿编辑"
          subtitle={hasExactProjectContext ? '编辑会保存为独立版本，再以确切版本进入分段与 TTS' : '先完成内容，再选择音色并生成语音'}
        />

        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-5xl space-y-4">
            {parsedContext.kind === 'invalid' ? (
              <div role="alert" className="rounded-card border border-pink/30 bg-pink/10 p-6 shadow-card">
                <h2 className="ui-section-title text-ink">口播稿地址不完整</h2>
                <p className="ui-body mt-2 text-ink-soft/80">
                  项目、稿件或版本参数缺失，已停止加载，避免误用旧编辑器里的内存稿件。
                </p>
                <ActionButton className="mt-4" tone="secondary" onClick={() => navigate('/')}>
                  返回工作台
                </ActionButton>
              </div>
            ) : showProjectLoading ? (
              <div aria-label="正在加载项目口播稿" className="space-y-4 animate-pulse">
                <div className="h-8 w-44 rounded-xl bg-blush/25" />
                <div className="h-72 rounded-card border border-card-border bg-white/55" />
                <div className="h-40 rounded-card border border-card-border bg-white/45" />
              </div>
            ) : parsedContext.kind === 'project' && !hasExactProjectContext ? (
              <div role="alert" className="rounded-card border border-pink/30 bg-pink/10 p-6 shadow-card">
                <h2 className="ui-section-title text-ink">无法确认口播稿版本</h2>
                <p className="ui-body mt-2 text-ink-soft/80">
                  {projectRevisionError || '指定版本暂时无法读取，请重试。'}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <ActionButton tone="secondary" onClick={retryProjectRevision}>重新加载</ActionButton>
                  <ActionButton tone="ghost" onClick={() => navigate(`/projects/${parsedContext.projectId}`)}>
                    返回内容项目
                  </ActionButton>
                </div>
              </div>
            ) : (
              <>
                {hasExactProjectContext && projectEditorContext && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-card-border bg-white/55 px-4 py-3">
                    <span className="font-body text-[12px] font-medium text-ink">
                      内容项目口播稿 · 第 {projectEditorContext.revision.revision_number} 版
                    </span>
                    <button
                      type="button"
                      onClick={() => navigate(`/projects/${projectEditorContext.projectId}`)}
                      className="font-body text-[11px] text-ink-soft transition-colors hover:text-ink"
                    >
                      返回内容项目
                    </button>
                  </div>
                )}

                <ScriptPreview
                  projectContext={hasExactProjectContext ? projectEditorContext : null}
                  onProjectRevisionSaved={handleProjectRevisionSaved}
                />
                <VoiceGenerator onManagePresets={() => navigate('/voice-presets')} />

                {isSegmented && segments.length > 0 && currentBroadcast && (
                  <SegmentEditor broadcastId={currentBroadcast.id} />
                )}

                <AudioPlayer
                  audioUrl={audioUrl}
                  title={currentBroadcast?.title}
                  broadcastId={currentBroadcast?.id}
                  isSaved={currentBroadcast?.saved === 1}
                  onSave={saveBroadcast}
                  mode={currentBroadcast?.mode}
                />
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default ScriptEditor;
