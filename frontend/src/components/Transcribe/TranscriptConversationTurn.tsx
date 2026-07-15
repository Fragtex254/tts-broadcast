import React, { useState } from 'react';
import { Eye, PencilSimple } from '@phosphor-icons/react';
import type { TranscriptTurn } from '../../store';
import { formatTranscriptTime } from '../../pages/transcriptWorkspaceModel';
import type { TranscriptSpeakerTone } from './transcriptConversationModel';

interface TranscriptConversationTurnProps {
  turn: TranscriptTurn;
  speakerName: string;
  tone: TranscriptSpeakerTone;
  isActive: boolean;
  isMuted: boolean;
  onActiveChange: (turnId: number | null) => void;
  onFilterSpeaker: (speakerKey: string) => void;
  onCorrect: (turnId: number, correctedText: string) => Promise<void>;
}

export const TranscriptConversationTurn: React.FC<TranscriptConversationTurnProps> = ({
  turn,
  speakerName,
  tone,
  isActive,
  isMuted,
  onActiveChange,
  onFilterSpeaker,
  onCorrect,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(turn.corrected_text || turn.text);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const displayText = turn.corrected_text || turn.text;

  const handleSave = async () => {
    const correctedText = draft.trim();
    if (!correctedText) return;
    setIsSaving(true);
    setError(null);
    try {
      await onCorrect(turn.id, correctedText);
      setIsEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存校对内容失败');
    } finally {
      setIsSaving(false);
    }
  };

  const startEditing = () => {
    setDraft(displayText);
    setError(null);
    setIsEditing(true);
    onActiveChange(turn.id);
  };

  return (
    <article
      id={`conversation-turn-${turn.id}`}
      tabIndex={0}
      aria-label={`发言 ${turn.turn_index + 1}，${speakerName}，${formatTranscriptTime(turn.start_seconds)} 到 ${formatTranscriptTime(turn.end_seconds)}`}
      onMouseEnter={() => onActiveChange(turn.id)}
      onMouseLeave={() => {
        if (!isEditing) onActiveChange(null);
      }}
      onFocus={() => onActiveChange(turn.id)}
      onBlur={(event) => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
          if (!isEditing) onActiveChange(null);
        }
      }}
      onClick={() => onActiveChange(turn.id)}
      className={`relative rounded-r-2xl border border-l-[3px] px-4 py-4 outline-none transition-all duration-200 sm:px-5 ${tone.border} ${
        isActive || isEditing
          ? `${tone.strongSurface} ${tone.mutedBorder} shadow-card`
          : 'border-transparent hover:border-card-border hover:bg-white/55 focus:border-card-border focus:bg-white/55'
      } ${isMuted && !isEditing ? 'opacity-45' : 'opacity-100'}`}
      style={{ animation: 'fade-in-up 0.3s cubic-bezier(0.22, 1, 0.36, 1) both' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h3 className="font-body text-[13px] font-semibold text-ink">{speakerName}</h3>
          <span className="font-body text-[10px] tabular-nums text-ink-soft/50">
            {formatTranscriptTime(turn.start_seconds)}–{formatTranscriptTime(turn.end_seconds)}
          </span>
        </div>
        {(isActive || isEditing) && (
          <span className={`shrink-0 rounded-full px-2.5 py-1 font-body text-[9px] font-medium tracking-wide text-ink ${tone.badge}`}>
            当前悬浮区域
          </span>
        )}
      </div>

      <div className="mt-3">
        {isEditing ? (
          <div className="space-y-2.5">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={Math.min(10, Math.max(4, Math.ceil(draft.length / 48)))}
              autoFocus
              className="w-full resize-y rounded-xl border border-lilac/55 bg-white/75 px-3.5 py-3 font-body text-[15px] leading-[1.8] text-ink outline-none transition-colors focus:border-ink/20"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={isSaving || !draft.trim()} onClick={() => void handleSave()} className="rounded-xl bg-sage px-4 py-2 font-body text-[11px] font-medium text-ink shadow-btn transition-all hover:-translate-y-px hover:brightness-105 active:translate-y-0 disabled:opacity-40">
                {isSaving ? '保存中…' : '保存校对'}
              </button>
              <button type="button" disabled={isSaving} onClick={() => setIsEditing(false)} className="font-body text-[11px] text-ink-soft transition-colors hover:text-ink">
                取消
              </button>
            </div>
            {error && <p className="animate-shake rounded-xl border border-pink/30 bg-pink/10 p-3 font-body text-[11px] text-ink">{error}</p>}
          </div>
        ) : (
          <>
            <p className="whitespace-pre-wrap font-body text-[15px] leading-[1.85] text-ink">{displayText}</p>
            {(isActive || turn.corrected_text) && (
              <div className="mt-3 flex flex-wrap items-center gap-2.5">
                {isActive && (
                  <>
                    <button type="button" onClick={() => onFilterSpeaker(turn.speaker_key)} className="inline-flex items-center gap-1 rounded-full border border-card-border bg-white/70 px-3 py-1.5 font-body text-[10px] text-ink-soft transition-all hover:-translate-y-px hover:text-ink">
                      <Eye aria-hidden="true" size={12} weight="regular" />只看 {speakerName} 的发言
                    </button>
                    <button type="button" onClick={startEditing} className="inline-flex items-center gap-1 font-body text-[10px] text-ink-soft underline decoration-card-border underline-offset-4 transition-colors hover:text-ink">
                      <PencilSimple aria-hidden="true" size={12} weight="regular" />校对文字
                    </button>
                  </>
                )}
                {turn.corrected_text && <span className="rounded-full bg-sage/35 px-2.5 py-1 font-body text-[9px] text-ink">已校对</span>}
              </div>
            )}
          </>
        )}
      </div>
    </article>
  );
};

export default TranscriptConversationTurn;
