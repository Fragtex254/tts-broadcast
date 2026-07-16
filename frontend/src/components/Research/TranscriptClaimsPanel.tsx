import React, { useMemo, useState } from 'react';
import type { TranscriptClaim, TranscriptSpeaker, TranscriptSummaryProgress } from '../../store';
import { CompactClaimCard } from './CompactClaimCard';

interface TranscriptClaimsPanelProps {
  claims: TranscriptClaim[];
  speakers: TranscriptSpeaker[];
  isAnalyzing: boolean;
  progress: TranscriptSummaryProgress;
  claimsStatus: string;
  claimsError: string;
  onAnalyze: () => void;
  onOpenClaim: (claim: TranscriptClaim) => void;
}

export const TranscriptClaimsPanel: React.FC<TranscriptClaimsPanelProps> = ({ claims, speakers, isAnalyzing, progress, claimsStatus, claimsError, onAnalyze, onOpenClaim }) => {
  const [speakerFilter, setSpeakerFilter] = useState('');
  const [topicFilter, setTopicFilter] = useState('');
  const [sort, setSort] = useState<'value' | 'time'>('value');
  const speakerNames = useMemo(() => new Map(speakers.map((speaker) => [speaker.speaker_key, speaker.display_name])), [speakers]);
  const topics = useMemo(() => [...new Set(claims.flatMap((claim) => claim.topic_tags))], [claims]);
  const displayed = useMemo(() => claims.filter((claim) => (!speakerFilter || claim.speaker_key === speakerFilter) && (!topicFilter || claim.topic_tags.includes(topicFilter))).sort((a, b) => sort === 'value' ? b.content_value - a.content_value : a.start_seconds - b.start_seconds), [claims, sort, speakerFilter, topicFilter]);

  return (
    <section className="rounded-card border border-card-border bg-white/80 p-5 shadow-card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-lemon" /><h2 className="font-display italic text-[14px] font-medium text-ink-soft">观点</h2></div><p className="mt-1 font-body text-[10px] text-ink-soft/55">{claims.length} 条可核验观点卡</p></div>
        <button type="button" disabled={isAnalyzing} onClick={onAnalyze} className="rounded-full bg-lemon px-5 py-2 font-body text-[11px] font-medium text-ink shadow-btn disabled:opacity-40">{isAnalyzing ? `${progress.message} ${progress.percent}%` : claims.length ? '重新分析观点' : '自动提取观点'}</button>
      </div>
      {claimsStatus === 'stale' && <div className="mb-4 rounded-xl border border-pink/30 bg-pink/10 p-3 font-body text-[11px] text-ink">逐字稿已校对，这些观点待更新。重新分析后会原子替换旧观点。</div>}
      {claimsStatus === 'failed' && claimsError && <div className="mb-4 animate-shake rounded-xl bg-pink/10 p-3 font-body text-[11px] text-ink">{claimsError}</div>}
      {claims.length > 0 && <div className="mb-4 flex flex-wrap gap-2">
        <select aria-label="按说话人筛选" value={speakerFilter} onChange={(event) => setSpeakerFilter(event.target.value)} className="rounded-full border border-card-border bg-white/70 px-3 py-2 font-body text-[10px] text-ink"><option value="">全部 Speaker</option>{speakers.map((speaker) => <option key={speaker.id} value={speaker.speaker_key}>{speaker.display_name}</option>)}</select>
        <select aria-label="按主题筛选" value={topicFilter} onChange={(event) => setTopicFilter(event.target.value)} className="rounded-full border border-card-border bg-white/70 px-3 py-2 font-body text-[10px] text-ink"><option value="">全部主题</option>{topics.map((topic) => <option key={topic} value={topic}>{topic}</option>)}</select>
        <select aria-label="观点排序" value={sort} onChange={(event) => setSort(event.target.value === 'time' ? 'time' : 'value')} className="rounded-full border border-card-border bg-white/70 px-3 py-2 font-body text-[10px] text-ink"><option value="value">内容价值优先</option><option value="time">时间顺序</option></select>
      </div>}
      {!claims.length && !isAnalyzing && <div className="p-10 text-center"><p className="font-display italic text-[16px] text-ink-soft/40">暂无观点卡</p><p className="mt-1 font-body text-[11px] text-ink-soft/35">完成播客转录后，让系统从真实 Segment 中提取观点</p></div>}
      <div className="grid gap-3 lg:grid-cols-2">{displayed.map((claim, index) => (
        <CompactClaimCard
          key={claim.id}
          claim={claim}
          speakerName={speakerNames.get(claim.speaker_key)}
          onOpen={onOpenClaim}
          animationDelay={index * 0.04}
        />
      ))}</div>
    </section>
  );
};

export default TranscriptClaimsPanel;
