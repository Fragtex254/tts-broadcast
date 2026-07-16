import React, { useMemo, useState } from 'react';
import type { TranscriptClaim, TranscriptSpeaker, TranscriptSummaryProgress } from '../../store';
import { formatTranscriptTime } from '../../pages/transcriptWorkspaceModel';

interface TranscriptClaimsPanelProps {
  claims: TranscriptClaim[];
  speakers: TranscriptSpeaker[];
  isAnalyzing: boolean;
  progress: TranscriptSummaryProgress;
  claimsStatus: string;
  claimsError: string;
  onAnalyze: () => void;
  onUpdate: (claimId: number, update: { userNote?: string; isStarred?: boolean }) => Promise<void>;
  onDelete: (claimId: number) => Promise<void>;
  onLocate: (evidenceIndex: number) => void;
}

export const TranscriptClaimsPanel: React.FC<TranscriptClaimsPanelProps> = ({ claims, speakers, isAnalyzing, progress, claimsStatus, claimsError, onAnalyze, onUpdate, onDelete, onLocate }) => {
  const [speakerFilter, setSpeakerFilter] = useState('');
  const [topicFilter, setTopicFilter] = useState('');
  const [sort, setSort] = useState<'value' | 'time'>('value');
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const speakerNames = useMemo(() => new Map(speakers.map((speaker) => [speaker.speaker_key, speaker.display_name])), [speakers]);
  const topics = useMemo(() => [...new Set(claims.flatMap((claim) => claim.topic_tags))], [claims]);
  const displayed = useMemo(() => claims.filter((claim) => (!speakerFilter || claim.speaker_key === speakerFilter) && (!topicFilter || claim.topic_tags.includes(topicFilter))).sort((a, b) => sort === 'value' ? b.content_value - a.content_value : a.start_seconds - b.start_seconds), [claims, sort, speakerFilter, topicFilter]);

  const run = async (action: () => Promise<void>) => {
    setError(null);
    try { await action(); } catch (actionError) { setError(actionError instanceof Error ? actionError.message : '操作失败'); }
  };

  return (
    <section className="rounded-card border border-card-border bg-white/80 p-5 shadow-card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-lemon" /><h2 className="font-display italic text-[14px] font-medium text-ink-soft">观点</h2></div><p className="mt-1 font-body text-[10px] text-ink-soft/55">{claims.length} 条可核验观点卡</p></div>
        <button type="button" disabled={isAnalyzing} onClick={onAnalyze} className="rounded-full bg-lemon px-5 py-2 font-body text-[11px] font-medium text-ink shadow-btn disabled:opacity-40">{isAnalyzing ? `${progress.message} ${progress.percent}%` : claims.length ? '重新分析观点' : '自动提取观点'}</button>
      </div>
      {claimsStatus === 'stale' && <div className="mb-4 rounded-xl border border-pink/30 bg-pink/10 p-3 font-body text-[11px] text-ink">逐字稿已校对，这些观点待更新。重新分析后会原子替换旧观点。</div>}
      {claimsStatus === 'failed' && claimsError && <div className="mb-4 animate-shake rounded-xl bg-pink/10 p-3 font-body text-[11px] text-ink">{claimsError}</div>}
      {error && <div className="mb-4 animate-shake rounded-xl bg-pink/10 p-3 font-body text-[11px] text-ink">{error}</div>}
      {claims.length > 0 && <div className="mb-4 flex flex-wrap gap-2">
        <select aria-label="按说话人筛选" value={speakerFilter} onChange={(event) => setSpeakerFilter(event.target.value)} className="rounded-full border border-card-border bg-white/70 px-3 py-2 font-body text-[10px] text-ink"><option value="">全部 Speaker</option>{speakers.map((speaker) => <option key={speaker.id} value={speaker.speaker_key}>{speaker.display_name}</option>)}</select>
        <select aria-label="按主题筛选" value={topicFilter} onChange={(event) => setTopicFilter(event.target.value)} className="rounded-full border border-card-border bg-white/70 px-3 py-2 font-body text-[10px] text-ink"><option value="">全部主题</option>{topics.map((topic) => <option key={topic} value={topic}>{topic}</option>)}</select>
        <select aria-label="观点排序" value={sort} onChange={(event) => setSort(event.target.value === 'time' ? 'time' : 'value')} className="rounded-full border border-card-border bg-white/70 px-3 py-2 font-body text-[10px] text-ink"><option value="value">内容价值优先</option><option value="time">时间顺序</option></select>
      </div>}
      {!claims.length && !isAnalyzing && <div className="p-10 text-center"><p className="font-display italic text-[16px] text-ink-soft/40">暂无观点卡</p><p className="mt-1 font-body text-[11px] text-ink-soft/35">完成播客转录后，让系统从真实 Segment 中提取观点</p></div>}
      <div className="grid gap-3 lg:grid-cols-2">{displayed.map((claim, index) => <article key={claim.id} className={`rounded-2xl border p-4 ${claim.status === 'stale' ? 'border-pink/30 bg-pink/5' : 'border-card-border bg-white/60'}`} style={{ animation: `fade-in-up 0.3s cubic-bezier(0.22,1,0.36,1) ${index * 0.04}s both` }}>
        <div className="flex items-start justify-between gap-3"><div><p className="font-body text-[10px] text-ink-soft/55">{claim.question}</p><h3 className="mt-1 font-display text-[16px] font-medium leading-snug text-ink">{claim.claim}</h3></div><span className="shrink-0 rounded-full bg-lemon/35 px-2.5 py-1 font-display text-[12px] text-ink">{claim.content_value}</span></div>
        <p className="mt-3 font-body text-[11px] leading-relaxed text-ink-soft">{claim.reasoning || '未单独陈述理由'}</p>
        <div className="mt-3 rounded-xl border border-card-border bg-paper/45 p-3"><p className="font-body text-[10px] leading-relaxed text-ink-soft">“{claim.evidence_excerpt}”</p></div>
        <div className="mt-3 flex flex-wrap items-center gap-2 font-body text-[9px] text-ink-soft/65"><span>{speakerNames.get(claim.speaker_key) || claim.speaker_name || claim.speaker_key}</span><span>{formatTranscriptTime(claim.start_seconds)}–{formatTranscriptTime(claim.end_seconds)}</span>{claim.topic_tags.map((tag) => <span key={tag} className="rounded-full bg-lilac/25 px-2 py-1">{tag}</span>)}</div>
        {editingNoteId === claim.id ? <div className="mt-3"><textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} rows={3} className="w-full rounded-xl border border-card-border bg-white/70 p-3 font-body text-[11px] text-ink outline-none" /><button type="button" onClick={() => void run(async () => { await onUpdate(claim.id, { userNote: noteDraft }); setEditingNoteId(null); })} className="mt-2 rounded-full bg-sage px-3 py-1.5 font-body text-[10px] text-ink">保存笔记</button></div> : claim.user_note && <p className="mt-3 rounded-xl bg-sage/15 p-3 font-body text-[10px] text-ink-soft">我的笔记：{claim.user_note}</p>}
        <div className="mt-3 flex flex-wrap gap-3 border-t border-card-border pt-3"><button type="button" onClick={() => void run(() => onUpdate(claim.id, { isStarred: !claim.is_starred }))} className="font-body text-[10px] text-ink-soft hover:text-ink">{claim.is_starred ? '★ 已收藏' : '☆ 收藏'}</button><button type="button" onClick={() => { setEditingNoteId(claim.id); setNoteDraft(claim.user_note); }} className="font-body text-[10px] text-ink-soft hover:text-ink">写个人笔记</button><button type="button" onClick={() => onLocate(claim.evidence_start_index)} className="font-body text-[10px] text-ink-soft hover:text-ink">查看逐字稿上下文</button><button type="button" disabled={isAnalyzing} onClick={onAnalyze} className="font-body text-[10px] text-ink-soft hover:text-ink disabled:opacity-40">重新生成</button><button type="button" onClick={() => void run(() => onDelete(claim.id))} className="ml-auto font-body text-[10px] text-pink hover:text-ink">删除</button></div>
      </article>)}</div>
    </section>
  );
};

export default TranscriptClaimsPanel;
