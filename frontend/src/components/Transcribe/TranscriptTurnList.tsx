import React, { useState } from 'react';
import type { TranscriptSpeaker, TranscriptTurn } from '../../store';
import { formatTranscriptTime } from '../../pages/transcriptWorkspaceModel';
import { ActionButton } from '../UI';

const TURN_PAGE_SIZE = 60;

interface TranscriptTurnListProps {
  turns: TranscriptTurn[];
  speakers: TranscriptSpeaker[];
  onOpenConversation: () => void;
  onCorrect: (turnId: number, correctedText: string) => Promise<void>;
}

export const TranscriptTurnList: React.FC<TranscriptTurnListProps> = ({ turns, speakers, onOpenConversation, onCorrect }) => {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(TURN_PAGE_SIZE);
  const names = new Map(speakers.map((speaker) => [speaker.speaker_key, speaker.display_name]));
  const visibleTurns = turns.slice(0, visibleCount);

  const startEditing = (turn: TranscriptTurn) => {
    setEditingId(turn.id);
    setDraft(turn.corrected_text || turn.text);
    setError(null);
  };

  const saveCorrection = async () => {
    if (editingId === null || !draft.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onCorrect(editingId, draft.trim());
      setEditingId(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存校对内容失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-white/80 backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-pink" /><h2 className="font-display italic text-[14px] font-medium text-ink-soft">逐字稿</h2></div>
        <div className="flex items-center gap-2">
          <span className="font-body text-[10px] uppercase tracking-wider text-ink-soft/55">{turns.length} 个发言轮次</span>
          <ActionButton variant="edit" size="sm" onClick={onOpenConversation}>
            打开对话视图
          </ActionButton>
        </div>
      </div>
      <div className="space-y-2">
        {visibleTurns.map((turn) => {
          const isEditing = editingId === turn.id;
          const displayText = turn.corrected_text || turn.text;
          return (
            <article key={turn.id} className="grid gap-2 rounded-2xl border border-card-border bg-white/60 p-4 sm:grid-cols-[120px_minmax(0,1fr)]">
              <div>
                <p className="font-body text-[11px] font-medium text-ink">{names.get(turn.speaker_key) || turn.speaker_key}</p>
                <p className="mt-1 font-body text-[10px] tabular-nums text-ink-soft/55">{formatTranscriptTime(turn.start_seconds)}–{formatTranscriptTime(turn.end_seconds)}</p>
              </div>
              <div className="min-w-0">
                {isEditing ? (
                  <div className="space-y-2">
                    <textarea
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      rows={Math.min(8, Math.max(3, Math.ceil(draft.length / 56)))}
                      autoFocus
                      className="w-full resize-y rounded-xl border border-pink/30 bg-paper/50 px-3 py-2 font-body text-[13px] leading-[1.8] text-ink outline-none transition focus:border-pink/60 focus:ring-2 focus:ring-pink/15"
                    />
                    <div className="flex items-center gap-2">
                      <button type="button" disabled={saving || !draft.trim()} onClick={() => void saveCorrection()} className="rounded-full bg-ink px-3 py-1.5 font-body text-[10px] text-paper transition hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-45">{saving ? '保存中…' : '保存校对'}</button>
                      <button type="button" disabled={saving} onClick={() => setEditingId(null)} className="rounded-full px-3 py-1.5 font-body text-[10px] text-ink-soft transition hover:bg-blush/50">取消</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap font-body text-[13px] leading-[1.9] text-ink-soft/85">{displayText}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <button type="button" onClick={() => startEditing(turn)} className="font-body text-[10px] text-ink-soft/55 underline decoration-card-border underline-offset-4 transition hover:text-ink">校对文字</button>
                      {turn.corrected_text && <span className="rounded-full bg-sage/25 px-2 py-0.5 font-body text-[9px] text-ink-soft">已校对</span>}
                    </div>
                  </>
                )}
                {isEditing && error && <p className="mt-2 font-body text-[10px] text-pink">{error}</p>}
              </div>
            </article>
          );
        })}
      </div>
      {visibleCount < turns.length && (
        <div className="mt-4 flex flex-col items-center gap-2 border-t border-card-border pt-4">
          <p className="font-body text-[10px] text-ink-soft/55">已显示 {visibleCount} / {turns.length} 个发言轮次</p>
          <button type="button" onClick={() => setVisibleCount((count) => Math.min(count + TURN_PAGE_SIZE, turns.length))} className="rounded-full border border-card-border bg-paper/60 px-4 py-2 font-body text-[11px] text-ink-soft transition hover:border-pink/30 hover:text-ink">继续显示 {Math.min(TURN_PAGE_SIZE, turns.length - visibleCount)} 个</button>
        </div>
      )}
    </section>
  );
};

export default TranscriptTurnList;
