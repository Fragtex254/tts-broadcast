import React, { useState } from 'react';
import useStore, { type ContentArtifactRevision, type ProjectEditorContext } from '../../store';
import { hasSelectedVoice, VOICE_REQUIRED_MESSAGE } from '../../store/voiceConfigModel';

interface ScriptPreviewProps {
  projectContext?: ProjectEditorContext | null;
  onProjectRevisionSaved?: (revision: ContentArtifactRevision) => void;
}

export const ScriptPreview: React.FC<ScriptPreviewProps> = ({
  projectContext,
  onProjectRevisionSaved,
}) => {
  const script = useStore((state) => state.script);
  const updateScript = useStore((state) => state.updateScript);
  const settings = useStore((state) => state.settings);
  const splitScriptAction = useStore((state) => state.splitScriptAction);
  const saveProjectArtifactRevision = useStore((state) => state.saveProjectArtifactRevision);
  const isSplitting = useStore((state) => state.isSplitting);
  const currentBroadcast = useStore((state) => state.currentBroadcast);
  const segments = useStore((state) => state.segments);
  const voiceConfig = useStore((state) => state.voiceConfig);

  const [isEditing, setIsEditing] = useState(false);
  const [localScript, setLocalScript] = useState(script);
  const [showSaved, setShowSaved] = useState(false);
  const [isPersisting, setIsPersisting] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);
  const [splitError, setSplitError] = useState<string | null>(null);

  const persistContent = async (content: string, changeReason: string): Promise<boolean> => {
    setPersistError(null);
    if (!projectContext) {
      updateScript(content);
      setLocalScript(content);
      return true;
    }

    setIsPersisting(true);
    try {
      const revision = await saveProjectArtifactRevision(
        projectContext.projectId,
        projectContext.artifactId,
        { content, changeReason, parentRevisionId: projectContext.revision.id }
      );
      updateScript(revision.content);
      setLocalScript(revision.content);
      onProjectRevisionSaved?.(revision);
      return true;
    } catch (error) {
      setPersistError(error instanceof Error ? error.message : '保存口播稿版本失败，请重试。');
      return false;
    } finally {
      setIsPersisting(false);
    }
  };

  const handleSave = async () => {
    const saved = await persistContent(localScript, '人工编辑口播稿');
    if (!saved) return;
    setIsEditing(false);
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 600);
  };

  const handleCancel = () => {
    setLocalScript(script);
    setPersistError(null);
    setIsEditing(false);
  };

  const handleAddOpening = async () => {
    await persistContent(`${settings.opening_script}\n\n${script}`, '添加口播开场白');
  };

  const handleAddClosing = async () => {
    await persistContent(`${script}\n\n${settings.closing_script}`, '添加口播结束语');
  };

  const hasResolvedProjectRevision = !projectContext || script === projectContext.revision.content;
  const canSplit = hasSelectedVoice(voiceConfig)
    && hasResolvedProjectRevision
    && !isPersisting
    && !persistError;

  const handleSplit = async () => {
    if (!script || !canSplit) return;
    if (!hasSelectedVoice(voiceConfig)) {
      setSplitError(VOICE_REQUIRED_MESSAGE);
      return;
    }
    setSplitError(null);
    try {
      await splitScriptAction(script, projectContext?.revision.id);
    } catch (error) {
      setSplitError(error instanceof Error ? error.message : '切分失败，请稍后重试');
    }
  };

  const isAlreadySplit = currentBroadcast?.mode === 'segmented' && segments.length > 0;
  const wordCount = script.length;
  const estimatedDuration = Math.ceil(wordCount / 4);

  return (
    <div className="rounded-card border border-card-border bg-white/80 p-5 shadow-card backdrop-blur-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full bg-pink transition-transform duration-slow ${showSaved ? 'animate-scale-bounce' : ''}`} />
          <h3 className="font-display text-[14px] font-medium italic text-ink-soft">口播稿预览</h3>
        </div>
        {!isEditing && script && (
          <div className="flex items-center gap-2">
            <span className="font-body text-[11px] uppercase tracking-wider text-ink-soft/70">
              {wordCount} 字 · ≈ {estimatedDuration} 秒
            </span>
            <button
              type="button"
              onClick={() => {
                setLocalScript(script);
                setPersistError(null);
                setIsEditing(true);
              }}
              className="font-body text-[12px] text-ink-soft transition-colors hover:text-ink"
            >
              编辑
            </button>
          </div>
        )}
      </div>

      {isEditing ? (
        <div className="animate-fade-in">
          <textarea
            aria-label="口播稿正文"
            value={localScript}
            disabled={isPersisting}
            onChange={(event) => setLocalScript(event.target.value)}
            className="h-64 w-full resize-none rounded-2xl border border-card-border bg-white/60 p-4 font-body text-[13px] leading-[1.9] text-ink transition-colors focus:border-ink/20 focus:outline-none disabled:cursor-wait disabled:opacity-65"
            placeholder="在此编辑口播稿..."
          />
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              disabled={isPersisting}
              onClick={handleCancel}
              className="px-4 py-2 font-body text-[12px] text-ink-soft transition-colors hover:text-ink disabled:opacity-40"
            >
              取消
            </button>
            <button
              type="button"
              disabled={isPersisting}
              onClick={() => void handleSave()}
              className="ui-transition rounded-xl bg-sage px-4 py-2 font-body text-[12px] text-ink shadow-btn duration-fast hover:brightness-105 disabled:opacity-40"
            >
              {isPersisting ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      ) : script ? (
        <div className="max-h-80 min-h-64 overflow-y-auto rounded-2xl border border-card-border bg-white/60 p-4">
          <pre className="whitespace-pre-wrap font-body text-[13px] leading-[1.9] text-ink">{script}</pre>
        </div>
      ) : (
        <div className="flex min-h-64 items-center justify-center rounded-2xl border border-card-border bg-white/40 p-8">
          <p className="font-body text-[12px] text-ink-soft/70">还没有稿件，请从工作台采集资讯或转录音视频素材</p>
        </div>
      )}

      {script && !isEditing && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-card-border pt-4">
          <button
            type="button"
            onClick={() => void handleSplit()}
            disabled={isSplitting || isAlreadySplit || !canSplit}
            className="flex items-center gap-1.5 rounded-full bg-pink/20 px-3 py-1.5 font-body text-[11px] uppercase tracking-wider text-ink-soft transition-colors hover:bg-pink/30 disabled:opacity-40"
          >
            {isSplitting ? '切分中…' : isAlreadySplit ? '✓ 已切分' : !hasSelectedVoice(voiceConfig) ? '先选音色' : '✦ 切分口播稿'}
          </button>
          <button
            type="button"
            disabled={isPersisting}
            onClick={() => void handleAddOpening()}
            className="rounded-full bg-sage/20 px-3 py-1.5 font-body text-[11px] uppercase tracking-wider text-ink-soft transition-colors hover:bg-sage/30 disabled:opacity-40"
          >
            + 添加开场白
          </button>
          <button
            type="button"
            disabled={isPersisting}
            onClick={() => void handleAddClosing()}
            className="rounded-full bg-sage/20 px-3 py-1.5 font-body text-[11px] uppercase tracking-wider text-ink-soft transition-colors hover:bg-sage/30 disabled:opacity-40"
          >
            + 添加结束语
          </button>
        </div>
      )}

      {script && !isEditing && !hasSelectedVoice(voiceConfig) && (
        <div className="mt-2 rounded-xl border border-lemon/45 bg-lemon/15 p-2.5 font-body text-[11px] text-ink-soft">
          选择音色后才能切分并生成口播稿音频。
        </div>
      )}
      {projectContext && !hasResolvedProjectRevision && (
        <div role="alert" className="mt-2 rounded-xl border border-lemon/45 bg-lemon/15 p-2.5 font-body text-[11px] text-ink-soft">
          当前文字还没有对应到已确认的口播版本，保存成功前不能进入 TTS。
        </div>
      )}
      {isPersisting && (
        <div aria-live="polite" className="mt-2 rounded-xl border border-card-border bg-white/55 p-2.5 font-body text-[11px] text-ink-soft">
          正在保存新的口播版本…
        </div>
      )}
      {persistError && (
        <div role="alert" className="mt-2 animate-shake rounded-xl border border-pink/30 bg-pink/10 p-2.5 font-body text-[11px] text-ink">
          {persistError}
        </div>
      )}
      {splitError && (
        <div role="alert" className="mt-2 animate-shake rounded-xl border border-pink/30 bg-pink/10 p-2.5 font-body text-[11px] text-ink">
          {splitError}
        </div>
      )}
    </div>
  );
};

export default ScriptPreview;
