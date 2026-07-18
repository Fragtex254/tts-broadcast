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
  isEvidence?: boolean;
  isSearchTarget?: boolean;
  isEditing: boolean;
  editingDraft: string;
  positionInSet?: number;
  setSize?: number;
  onActiveChange: (turnId: number | null) => void;
  onEditingDraftChange: (value: string) => void;
  onFinishEditing: () => void;
  onFilterSpeaker: (speakerKey: string) => void;
  onNavigate: (direction: -1 | 1) => void;
  onStartEditing: (turnId: number, value: string) => void;
  onCorrect: (turnId: number, correctedText: string) => Promise<void>;
}

export const TranscriptConversationTurn: React.FC<TranscriptConversationTurnProps> = ({
  turn,
  speakerName,
  tone,
  isActive,
  isMuted,
  isEvidence = false,
  isSearchTarget = false,
  isEditing,
  editingDraft,
  positionInSet,
  setSize,
  onActiveChange,
  onEditingDraftChange,
  onFinishEditing,
  onFilterSpeaker,
  onNavigate,
  onStartEditing,
  onCorrect,
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const displayText = turn.corrected_text || turn.text;

  const handleSave = async () => {
    const correctedText = editingDraft.trim();
    if (!correctedText) return;
    setIsSaving(true);
    setError(null);
    try {
      await onCorrect(turn.id, correctedText);
      onFinishEditing();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存校对内容失败');
    } finally {
      setIsSaving(false);
    }
  };

  const startEditing = () => {
    setError(null);
    onStartEditing(turn.id, displayText);
    onActiveChange(turn.id);
  };

  return (
    <article
      id={`conversation-turn-${turn.id}`}
      tabIndex={0}
      aria-current={isSearchTarget ? 'true' : undefined}
      aria-posinset={positionInSet}
      aria-setsize={setSize}
      aria-keyshortcuts="ArrowUp ArrowDown"
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
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          onNavigate(event.key === 'ArrowUp' ? -1 : 1);
        }
      }}
      className={`relative rounded-r-xl border-b border-l-[3px] border-b-card-border px-4 py-5 outline-none transition-[color,background-color,border-color,opacity] duration-fast focus-visible:ring-2 focus-visible:ring-lilac/70 focus-visible:ring-offset-2 focus-visible:ring-offset-paper sm:px-5 ${tone.border} ${
        isActive || isEditing
          ? tone.strongSurface
          : isEvidence
            ? 'bg-lemon/10'
            : 'bg-transparent hover:bg-white/45 focus:bg-white/45'
      } ${isSearchTarget ? 'ring-2 ring-lilac/70 ring-offset-2 ring-offset-paper' : isEvidence ? 'ring-2 ring-lemon/60 ring-offset-2 ring-offset-paper' : ''} ${isMuted && !isEditing ? 'opacity-70' : 'opacity-100'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h3 className="font-body text-[14px] font-semibold text-ink">{speakerName}</h3>
          <span className="font-body text-[11px] tabular-nums text-ink-soft/60">
            {formatTranscriptTime(turn.start_seconds)}–{formatTranscriptTime(turn.end_seconds)}
          </span>
        </div>
        {(isActive || isEditing || isEvidence) && (
          <span className={`shrink-0 rounded-full px-2.5 py-1 font-body text-[11px] font-medium tracking-wide text-ink ${tone.badge}`}>
            {isEvidence ? '观点证据' : '当前发言'}
          </span>
        )}
      </div>

      <div className="mt-3">
        {isEditing ? (
          <div className="space-y-2.5">
            <textarea
              aria-label={`校对 ${speakerName} 的发言`}
              value={editingDraft}
              onChange={(event) => onEditingDraftChange(event.target.value)}
              rows={Math.min(10, Math.max(4, Math.ceil(editingDraft.length / 48)))}
              autoFocus
              className="ui-reading-body w-full resize-y rounded-xl border border-lilac/55 bg-white/75 px-3.5 py-3 text-ink outline-none transition-colors focus:border-ink/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lilac"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={isSaving || !editingDraft.trim()} onClick={() => void handleSave()} className="ui-pressable min-h-9 rounded-xl bg-sage px-4 py-2 font-body text-[11px] font-medium text-ink shadow-btn hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lilac disabled:cursor-not-allowed disabled:opacity-40">
                {isSaving ? '保存中…' : '保存校对'}
              </button>
              <button type="button" disabled={isSaving} onClick={onFinishEditing} className="ui-pressable min-h-9 rounded-lg px-2 font-body text-[11px] text-ink-soft transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lilac">
                取消
              </button>
            </div>
            {error && <p className="animate-shake rounded-xl border border-pink/30 bg-pink/10 p-3 font-body text-[11px] text-ink">{error}</p>}
          </div>
        ) : (
          <>
            <p className="ui-reading-body whitespace-pre-wrap text-ink">{displayText}</p>
            <div className="mt-4 flex min-h-9 flex-wrap items-center gap-2.5">
              <span className={`contents ${isActive ? '' : 'opacity-70'}`}>
                <button type="button" onClick={() => onFilterSpeaker(turn.speaker_key)} className="ui-pressable inline-flex min-h-9 items-center gap-1 rounded-full border border-card-border bg-white/60 px-3 py-1.5 font-body text-[11px] text-ink-soft hover:bg-white/80 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lilac">
                  <Eye aria-hidden="true" size={12} weight="regular" />只看 {speakerName} 的发言
                </button>
                <button type="button" onClick={startEditing} className="ui-pressable inline-flex min-h-9 items-center gap-1 rounded-lg px-2 font-body text-[11px] text-ink-soft underline decoration-card-border underline-offset-4 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lilac">
                  <PencilSimple aria-hidden="true" size={12} weight="regular" />校对文字
                </button>
              </span>
              {turn.corrected_text && <span className="rounded-full bg-sage/35 px-2.5 py-1 font-body text-[11px] text-ink">已校对</span>}
            </div>
          </>
        )}
      </div>
    </article>
  );
};

export default TranscriptConversationTurn;
