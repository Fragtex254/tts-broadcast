import React, { useState } from 'react';
import type { TranscriptSpeaker } from '../../store';

interface TranscriptSpeakerPanelProps {
  speakers: TranscriptSpeaker[];
  onRename: (speakerId: number, displayName: string) => Promise<void>;
}

export const TranscriptSpeakerPanel: React.FC<TranscriptSpeakerPanelProps> = ({ speakers, onRename }) => {
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (speaker: TranscriptSpeaker) => {
    const displayName = (drafts[speaker.id] ?? speaker.display_name).trim();
    if (!displayName || displayName === speaker.display_name) return;
    setSavingId(speaker.id);
    setError(null);
    try {
      await onRename(speaker.id, displayName);
      setDrafts((current) => {
        const next = { ...current };
        delete next[speaker.id];
        return next;
      });
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : '更新说话人名称失败');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section className="bg-white/80 backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border">
      <div className="mb-4 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-blush" />
        <h2 className="font-display italic text-[14px] font-medium text-ink-soft">说话人</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {speakers.map((speaker) => (
          <div key={speaker.id} className="rounded-2xl border border-card-border bg-white/60 p-3">
            <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/55" htmlFor={`speaker-${speaker.id}`}>
              {speaker.speaker_key}
            </label>
            <div className="mt-1.5 flex gap-2">
              <input
                id={`speaker-${speaker.id}`}
                value={drafts[speaker.id] ?? speaker.display_name}
                onChange={(event) => setDrafts((current) => ({ ...current, [speaker.id]: event.target.value }))}
                maxLength={50}
                className="min-w-0 flex-1 bg-white/70 text-ink rounded-xl px-3.5 py-2.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[12px] transition-colors"
              />
              <button
                type="button"
                onClick={() => void handleSave(speaker)}
                disabled={savingId === speaker.id || (drafts[speaker.id] ?? speaker.display_name).trim() === speaker.display_name}
                className="rounded-xl bg-sage px-3 py-2 font-body text-[11px] font-medium text-ink shadow-btn ui-transition duration-fast hover:brightness-105 disabled:opacity-40"
              >
                {savingId === speaker.id ? '保存中' : '保存'}
              </button>
            </div>
          </div>
        ))}
      </div>
      {error && <div className="mt-3 animate-shake rounded-xl border border-pink/30 bg-pink/10 p-3 font-body text-[12px] text-ink">{error}</div>}
    </section>
  );
};

export default TranscriptSpeakerPanel;
