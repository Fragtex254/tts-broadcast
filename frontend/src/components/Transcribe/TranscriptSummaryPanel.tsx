import React, { useState } from 'react';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import type { TranscriptDetail, TranscriptSummaryItem, TranscriptSummaryProgress } from '../../store';
import { formatTranscriptTime } from '../../pages/transcriptWorkspaceModel';

interface TranscriptSummaryPanelProps {
  transcript: TranscriptDetail;
  isSummarizing: boolean;
  progress: TranscriptSummaryProgress;
  onSummarize: () => void;
}

interface SummaryReadingSpaceProps {
  title: string;
  description: string;
  accentClassName: string;
  items: TranscriptSummaryItem[];
  speakerNames: Map<string, string>;
}

const SummaryReadingSpace: React.FC<SummaryReadingSpaceProps> = ({
  title,
  description,
  accentClassName,
  items,
  speakerNames,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  if (items.length === 0) return null;

  const safeIndex = Math.min(activeIndex, items.length - 1);
  const activeItem = items[safeIndex];
  const isSpeakerViewpoint = activeItem.item_type === 'speaker_viewpoint';
  const kicker = isSpeakerViewpoint
    ? speakerNames.get(activeItem.speaker_key) || activeItem.speaker_key
    : `${formatTranscriptTime(activeItem.start_seconds)}–${formatTranscriptTime(activeItem.end_seconds)}`;

  return (
    <section className="bg-white/80 backdrop-blur-sm rounded-card p-5 sm:p-6 shadow-card border border-card-border">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${accentClassName}`} />
            <h2 className="font-display italic text-[14px] font-medium text-ink-soft">{title}</h2>
          </div>
          <p className="mt-1 font-body text-[10px] text-ink-soft/55">{description}</p>
        </div>
        <span className="font-display text-[12px] tabular-nums text-ink-soft/55">
          {String(safeIndex + 1).padStart(2, '0')} / {String(items.length).padStart(2, '0')}
        </span>
      </div>

      <div className="mt-5 flex gap-2 overflow-x-auto pb-2" aria-label={`${title}导航`}>
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveIndex(index)}
            className={`shrink-0 rounded-full border px-3 py-1.5 font-body text-[10px] transition-all duration-150 ${
              index === safeIndex
                ? 'border-ink/15 bg-ink text-paper shadow-btn'
                : 'border-card-border bg-white/60 text-ink-soft hover:border-ink/15 hover:text-ink'
            }`}
            aria-pressed={index === safeIndex}
          >
            {String(index + 1).padStart(2, '0')}
          </button>
        ))}
      </div>

      <article
        key={activeItem.id}
        className="mt-3 flex min-h-56 flex-col justify-between rounded-2xl border border-card-border bg-white/60 p-5 sm:p-7 animate-fade-in"
      >
        <div className="mx-auto w-full max-w-3xl">
          <p className="font-body text-[10px] uppercase tracking-wider text-ink-soft/55">{kicker}</p>
          {activeItem.title && <h3 className="mt-2 font-display text-[22px] font-medium leading-snug text-ink">{activeItem.title}</h3>}
          <p className="mt-4 whitespace-pre-wrap font-body text-[14px] leading-[2] text-ink-soft/85">{activeItem.content}</p>
        </div>
        <div className="mx-auto mt-7 flex w-full max-w-3xl items-center justify-between border-t border-card-border pt-4">
          <button
            type="button"
            disabled={safeIndex === 0}
            onClick={() => setActiveIndex((index) => Math.max(0, index - 1))}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 font-body text-[10px] text-ink-soft transition hover:bg-paper disabled:opacity-30"
          >
            <CaretLeft aria-hidden="true" size={13} />上一条
          </button>
          <button
            type="button"
            disabled={safeIndex === items.length - 1}
            onClick={() => setActiveIndex((index) => Math.min(items.length - 1, index + 1))}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 font-body text-[10px] text-ink-soft transition hover:bg-paper disabled:opacity-30"
          >
            下一条<CaretRight aria-hidden="true" size={13} />
          </button>
        </div>
      </article>
    </section>
  );
};

export const TranscriptSummaryPanel: React.FC<TranscriptSummaryPanelProps> = ({ transcript, isSummarizing, progress, onSummarize }) => {
  const chapters = transcript.summaryItems.filter((item) => item.item_type === 'chapter');
  const viewpoints = transcript.summaryItems.filter((item) => item.item_type === 'speaker_viewpoint');
  const highlights = transcript.summaryItems.filter((item) => item.item_type === 'highlight');
  const speakerNames = new Map(transcript.speakers.map((speaker) => [speaker.speaker_key, speaker.display_name]));
  const isStale = transcript.record.summary_status === 'stale';

  return (
    <div className="space-y-4">
      <section className="bg-white/80 backdrop-blur-sm rounded-card p-5 sm:p-6 shadow-card border border-card-border">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-lemon" />
              <h2 className="font-display italic text-[14px] font-medium text-ink-soft">内容概览</h2>
            </div>
            {transcript.summary ? (
              <div className="mx-auto mt-5 max-w-3xl">
                <p className="font-display text-[24px] font-medium leading-snug text-ink">{transcript.summary.one_liner}</p>
                <p className="mt-4 whitespace-pre-wrap font-body text-[14px] leading-[2] text-ink-soft/85">{transcript.summary.overview}</p>
                {isStale && <p className="mt-4 rounded-xl border border-lemon/45 bg-lemon/15 px-3 py-2 font-body text-[11px] text-ink-soft">逐字稿已校对，这份摘要仍保留供参考；更新摘要后才会反映最新文字。</p>}
              </div>
            ) : (
              <p className="mx-auto mt-5 max-w-3xl font-body text-[13px] leading-relaxed text-ink-soft/65">逐字稿已准备好。点击一次即可生成总览、章节、说话人观点与重点内容。</p>
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
        <>
          <SummaryReadingSpace title="章节阅读" description="一次只读一章，让长内容有稳定的阅读宽度" accentClassName="bg-lilac" items={chapters} speakerNames={speakerNames} />
          <SummaryReadingSpace title="说话人观点" description="按人物逐条阅读，不和章节高度互相牵制" accentClassName="bg-blush" items={viewpoints} speakerNames={speakerNames} />
          <SummaryReadingSpace title="重点内容" description="把值得回看的内容单独放进自己的空间" accentClassName="bg-sage" items={highlights} speakerNames={speakerNames} />
        </>
      )}
    </div>
  );
};

export default TranscriptSummaryPanel;
