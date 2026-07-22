import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AudioPlayer } from '../components/Dashboard/AudioPlayer';
import { ScriptPreview } from '../components/Dashboard/ScriptPreview';
import { SegmentEditor } from '../components/Dashboard/SegmentEditor';
import { VoiceGenerator } from '../components/Dashboard/VoiceGenerator';
import { Header } from '../components/Layout/Header';
import { ActionButton } from '../components/ui/ActionButton';
import useStore, { type ContentArtifactRevision } from '../store';

function parseBroadcastId(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export const ScriptEditor: React.FC = () => {
  const { broadcastId: broadcastIdParam } = useParams<{ broadcastId: string }>();
  const navigate = useNavigate();
  const broadcastId = useMemo(() => parseBroadcastId(broadcastIdParam), [broadcastIdParam]);
  const currentBroadcast = useStore((state) => state.currentBroadcast);
  const segments = useStore((state) => state.segments);
  const saveBroadcast = useStore((state) => state.saveBroadcast);
  const projectEditorContext = useStore((state) => state.projectEditorContext);
  const isLoading = useStore((state) => state.isLoadingEditorBroadcast);
  const loadError = useStore((state) => state.editorBroadcastError);
  const loadEditorBroadcast = useStore((state) => state.loadEditorBroadcast);
  const cancelEditorBroadcastLoad = useStore((state) => state.cancelEditorBroadcastLoad);
  const clearEditorBroadcast = useStore((state) => state.clearEditorBroadcast);
  const createEditorDraft = useStore((state) => state.createEditorDraft);
  const cancelEditorDraftCreation = useStore((state) => state.cancelEditorDraftCreation);
  const [loadedBroadcastId, setLoadedBroadcastId] = useState<number | null>(null);
  const loadCompletionSequence = useRef(0);

  useEffect(() => {
    const completionSequence = ++loadCompletionSequence.current;
    if (!broadcastId) {
      clearEditorBroadcast();
      return undefined;
    }
    let isCurrent = true;
    void loadEditorBroadcast(broadcastId)
      .then(() => {
        if (isCurrent && completionSequence === loadCompletionSequence.current) {
          setLoadedBroadcastId(broadcastId);
        }
      })
      .catch(() => undefined);
    return () => {
      isCurrent = false;
      loadCompletionSequence.current += 1;
      cancelEditorBroadcastLoad();
    };
  }, [broadcastId, cancelEditorBroadcastLoad, clearEditorBroadcast, loadEditorBroadcast]);

  useEffect(() => cancelEditorDraftCreation, [cancelEditorDraftCreation]);

  const isCurrentBroadcast = Boolean(
    broadcastId
    && loadedBroadcastId === broadcastId
    && currentBroadcast?.id === broadcastId
  );
  const projectContext = isCurrentBroadcast ? projectEditorContext : null;
  const retry = () => {
    if (!broadcastId) return;
    const completionSequence = ++loadCompletionSequence.current;
    void loadEditorBroadcast(broadcastId)
      .then(() => {
        if (completionSequence === loadCompletionSequence.current) {
          setLoadedBroadcastId(broadcastId);
        }
      })
      .catch(() => undefined);
  };
  const handleProjectRevisionSaved = async (revision: ContentArtifactRevision) => {
    if (!projectContext) return;
    const draft = await createEditorDraft({
      text: revision.content,
      artifactRevisionId: revision.id,
    });
    navigate(`/editor/${draft.id}`, { replace: true });
  };

  const audioUrl = isCurrentBroadcast && currentBroadcast && (
    currentBroadcast.audio_path || (currentBroadcast.mode === 'segmented' && currentBroadcast.status === 'generated')
  )
    ? `/api/broadcast/${currentBroadcast.id}/audio?t=${encodeURIComponent(currentBroadcast.updated_at)}`
    : null;
  const isSegmented = isCurrentBroadcast && currentBroadcast?.mode === 'segmented';
  const invalidAddress = !broadcastId;
  const showLoading = !invalidAddress && (isLoading || (!isCurrentBroadcast && !loadError));

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-paper">
      <div className="flex min-h-0 flex-1 flex-col">
        <Header
          title="口播稿编辑"
          subtitle={projectContext ? '编辑会保存为独立版本，再以确切版本进入分段与 TTS' : '当前草稿已持久化，可刷新或通过地址继续编辑'}
        />

        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-5xl space-y-4">
            {invalidAddress ? (
              <div role="alert" className="rounded-card border border-pink/30 bg-pink/10 p-6 shadow-card">
                <h2 className="ui-section-title text-ink">口播稿地址无效</h2>
                <p className="ui-body mt-2 text-ink-soft/80">
                  {broadcastIdParam ? '地址中的播报 ID 不是有效正整数。' : '地址缺少播报 ID，请从工作台或内容库重新打开。'}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <ActionButton tone="secondary" onClick={() => navigate('/')}>返回工作台</ActionButton>
                  <ActionButton tone="ghost" onClick={() => navigate('/history')}>打开内容库</ActionButton>
                </div>
              </div>
            ) : showLoading ? (
              <div aria-label="正在加载口播稿" className="space-y-4 animate-pulse">
                <div className="h-8 w-44 rounded-xl bg-blush/25" />
                <div className="h-72 rounded-card border border-card-border bg-white/55" />
                <div className="h-40 rounded-card border border-card-border bg-white/45" />
              </div>
            ) : !isCurrentBroadcast ? (
              <div role="alert" className="rounded-card border border-pink/30 bg-pink/10 p-6 shadow-card">
                <h2 className="ui-section-title text-ink">无法打开口播稿</h2>
                <p className="ui-body mt-2 text-ink-soft/80">
                  {loadError || '指定播报不存在或暂时无法读取。'}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <ActionButton tone="secondary" onClick={retry}>重新加载</ActionButton>
                  <ActionButton tone="ghost" onClick={() => navigate('/history')}>返回内容库</ActionButton>
                </div>
              </div>
            ) : currentBroadcast ? (
              <React.Fragment key={currentBroadcast.id}>
                {projectContext && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-card-border bg-white/55 px-4 py-3">
                    <span className="font-body text-[12px] font-medium text-ink">
                      内容项目口播稿 · 第 {projectContext.revision.revision_number} 版
                    </span>
                    <button
                      type="button"
                      onClick={() => navigate(`/projects/${projectContext.projectId}`)}
                      className="font-body text-[11px] text-ink-soft transition-colors hover:text-ink"
                    >
                      返回内容项目
                    </button>
                  </div>
                )}

                <ScriptPreview
                  projectContext={projectContext}
                  onProjectRevisionSaved={handleProjectRevisionSaved}
                />
                <VoiceGenerator onManagePresets={() => navigate('/voice-presets')} />

                {isSegmented && segments.length > 0 && (
                  <SegmentEditor broadcastId={currentBroadcast.id} />
                )}

                <AudioPlayer
                  audioUrl={audioUrl}
                  title={currentBroadcast.title}
                  broadcastId={currentBroadcast.id}
                  isSaved={currentBroadcast.saved === 1}
                  onSave={saveBroadcast}
                  mode={currentBroadcast.mode}
                />
              </React.Fragment>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
};

export default ScriptEditor;
