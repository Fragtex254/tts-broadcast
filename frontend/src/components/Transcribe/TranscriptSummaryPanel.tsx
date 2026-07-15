import React from 'react';
import type { TranscriptDetail, TranscriptSummaryProgress } from '../../store';
import { formatTranscriptTime } from '../../pages/transcriptWorkspaceModel';

interface TranscriptSummaryPanelProps {
  transcript: TranscriptDetail;
  isSummarizing: boolean;
  progress: TranscriptSummaryProgress;
  onSummarize: () => void;
}

export const TranscriptSummaryPanel: React.FC<TranscriptSummaryPanelProps> = ({ transcript, isSummarizing, progress, onSummarize }) => {
  const chapters = transcript.summaryItems.filter((item) => item.item_type === 'chapter');
  const viewpoints = transcript.summaryItems.filter((item) => item.item_type === 'speaker_viewpoint');
  const highlights = transcript.summaryItems.filter((item) => item.item_type === 'highlight');
  const speakerNames = new Map(transcript.speakers.map((speaker) => [speaker.speaker_key, speaker.display_name]));
  const isStale = transcript.record.summary_status === 'stale';

  return (
    <div className="space-y-4">
      <section className="bg-white/80 backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-lemon" />
              <h2 className="font-display italic text-[14px] font-medium text-ink-soft">内容概览</h2>
            </div>
            {transcript.summary ? (
              <>
                <p className="mt-4 font-display text-[22px] font-medium leading-snug text-ink">{transcript.summary.one_liner}</p>
                <p className="mt-3 whitespace-pre-wrap font-body text-[13px] leading-[1.9] text-ink-soft/80">{transcript.summary.overview}</p>
                {isStale && <p className="mt-3 rounded-xl border border-lemon/45 bg-lemon/15 px-3 py-2 font-body text-[11px] text-ink-soft">逐字稿已校对，这份摘要仍保留供参考；更新摘要后才会反映最新文字。</p>}
              </>
            ) : (
              <p className="mt-4 font-body text-[13px] leading-relaxed text-ink-soft/65">逐字稿已准备好。点击一次即可生成总览、章节、说话人观点与重点内容。</p>
            )}
          </div>
          <button
            type="button"
            onClick={onSummarize}
            disabled={isSummarizing}
            className="relative shrink-0 overflow-hidden rounded-full bg-lemon px-5 py-2.5 font-body text-[12px] font-medium uppercase tracking-wider text-ink shadow-btn transition-all duration-150 hover:-translate-y-px hover:brightness-105 disabled:opacity-40"
          >
            {isSummarizing && <span className="absolute inset-y-0 left-0 w-2/3 animate-pulse bg-white/20" />}
            <span className="relative">{isSummarizing ? '总结中…' : isStale ? '更新摘要' : transcript.summary ? '重新总结' : '一键总结'}</span>
          </button>
        </div>
        {(isSummarizing || progress.phase === 'failed') && (
          <div className={`mt-4 rounded-2xl border p-4 ${progress.phase === 'failed' ? 'animate-shake border-pink/30 bg-pink/10' : 'border-card-border bg-white/60'}`}>
            <div className="flex items-center justify-between gap-3 font-body text-[11px] text-ink-soft/70">
              <span>{progress.message}</span><span>{Math.round(progress.percent)}%</span>
            </div>
            {progress.phase !== 'failed' && <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/80"><div className="h-full rounded-full bg-lilac transition-all duration-300" style={{ width: `${progress.percent}%` }} /></div>}
          </div>
        )}
        {!isSummarizing && transcript.record.summary_status === 'failed' && transcript.record.summary_error && (
          <p className="mt-4 rounded-xl border border-pink/30 bg-pink/10 px-3 py-2 font-body text-[11px] text-ink-soft">上次总结未完成：{transcript.record.summary_error}</p>
        )}
      </section>

      {transcript.summary && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="bg-white/80 backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border">
            <div className="mb-4 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-lilac" /><h2 className="font-display italic text-[14px] font-medium text-ink-soft">章节</h2></div>
            <div className="space-y-3">{chapters.map((item, index) => <article key={item.id} className="rounded-2xl border border-card-border bg-white/60 p-4"><p className="font-body text-[10px] uppercase tracking-wider text-ink-soft/55">{String(index + 1).padStart(2, '0')} · {formatTranscriptTime(item.start_seconds)}–{formatTranscriptTime(item.end_seconds)}</p><h3 className="mt-1.5 font-display text-[17px] font-medium text-ink">{item.title}</h3><p className="mt-2 font-body text-[12px] leading-[1.8] text-ink-soft/75">{item.content}</p></article>)}</div>
          </section>
          <div className="space-y-4">
            <section className="bg-white/80 backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border"><div className="mb-4 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-blush" /><h2 className="font-display italic text-[14px] font-medium text-ink-soft">说话人观点</h2></div><div className="space-y-3">{viewpoints.map((item) => <article key={item.id} className="rounded-2xl border border-card-border bg-white/60 p-4"><p className="font-body text-[11px] font-medium text-ink">{speakerNames.get(item.speaker_key) || item.speaker_key}</p><p className="mt-1.5 font-body text-[12px] leading-[1.8] text-ink-soft/75">{item.content}</p></article>)}</div></section>
            <section className="bg-white/80 backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border"><div className="mb-4 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-sage" /><h2 className="font-display italic text-[14px] font-medium text-ink-soft">重点内容</h2></div><div className="space-y-3">{highlights.map((item) => <article key={item.id} className="rounded-2xl border border-card-border bg-sage/10 p-4"><h3 className="font-body text-[12px] font-medium text-ink">{item.title}</h3><p className="mt-1.5 font-body text-[12px] leading-[1.8] text-ink-soft/75">{item.content}</p></article>)}</div></section>
          </div>
        </div>
      )}
    </div>
  );
};

export default TranscriptSummaryPanel;
