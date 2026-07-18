import React from 'react';
import type { TranscriptDetail, TranscriptSummaryItem, TranscriptSummaryProgress } from '../../store';
import { formatTranscriptTime } from '../../pages/transcriptWorkspaceModel';
import { SectionHeading } from '../ui/SectionHeading';
import { TaskProgress } from '../ui/TaskProgress';

interface TranscriptSummaryPanelProps {
  transcript: TranscriptDetail;
  isSummarizing: boolean;
  progress: TranscriptSummaryProgress;
  onSummarize: () => void;
}

interface SummaryReadingGroupProps {
  id: string;
  title: string;
  description: string;
  itemLabel: string;
  accentClassName: string;
  items: TranscriptSummaryItem[];
  speakerNames: Map<string, string>;
}

const SummaryReadingGroup: React.FC<SummaryReadingGroupProps> = ({
  id,
  title,
  description,
  itemLabel,
  accentClassName,
  items,
  speakerNames,
}) => {
  if (items.length === 0) return null;

  return (
    <section id={id} className="scroll-mt-20 border-t border-card-border py-7 first:border-t-0 first:pt-0 sm:py-9">
      <header className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${accentClassName}`} aria-hidden="true" />
            <h2 className="font-display text-[17px] font-medium text-ink">{title}</h2>
          </div>
          <p className="mt-1 font-body text-[12px] leading-relaxed text-ink-soft/70">{description}</p>
        </div>
        <span className="shrink-0 font-body text-[11px] tabular-nums text-ink-soft/60">共 {items.length} 条</span>
      </header>

      <ol className="mx-auto mt-2 max-w-3xl divide-y divide-card-border">
        {items.map((item, index) => {
          const timeRange = `${formatTranscriptTime(item.start_seconds)}–${formatTranscriptTime(item.end_seconds)}`;
          const speakerName = item.item_type === 'speaker_viewpoint'
            ? speakerNames.get(item.speaker_key) || item.speaker_key
            : null;

          return (
            <li key={item.id} className="py-7 first:pt-5 sm:py-8">
              <article aria-labelledby={`${id}-item-${item.id}`}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-body text-[11px] text-ink-soft/65">
                  <span className="font-medium text-ink-soft">{itemLabel} {String(index + 1).padStart(2, '0')}</span>
                  {speakerName && <span>{speakerName}</span>}
                  <span className="tabular-nums">{timeRange}</span>
                </div>
                <h3 id={`${id}-item-${item.id}`} className="mt-2 break-words font-display text-[20px] font-medium leading-[1.45] text-ink">
                  {item.title || `${itemLabel} ${index + 1}`}
                </h3>
                <p className="ui-reading-body mt-3 whitespace-pre-wrap">{item.content}</p>
              </article>
            </li>
          );
        })}
      </ol>
    </section>
  );
};

export const TranscriptSummaryPanel: React.FC<TranscriptSummaryPanelProps> = ({ transcript, isSummarizing, progress, onSummarize }) => {
  const chapters = transcript.summaryItems.filter((item) => item.item_type === 'chapter');
  const viewpoints = transcript.summaryItems.filter((item) => item.item_type === 'speaker_viewpoint');
  const highlights = transcript.summaryItems.filter((item) => item.item_type === 'highlight');
  const speakerNames = new Map(transcript.speakers.map((speaker) => [speaker.speaker_key, speaker.display_name]));
  const isStale = transcript.record.summary_status === 'stale';
  const hasReadingGuide = chapters.length + viewpoints.length + highlights.length > 0;

  return (
    <div className="space-y-4">
      <section id="summary" className="scroll-mt-20 rounded-card border border-card-border bg-white/80 p-5 shadow-card sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <SectionHeading
            title="核心摘要"
            description="先建立完整判断，再沿章节、人物与重点继续阅读"
            accent="lemon"
          />
          <button
            type="button"
            onClick={onSummarize}
            disabled={isSummarizing}
            className="ui-pressable relative min-h-10 shrink-0 overflow-hidden rounded-xl bg-lemon px-5 py-2.5 font-body text-[12px] font-medium text-ink shadow-btn hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lilac disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSummarizing && <span className="absolute inset-y-0 left-0 w-2/3 animate-pulse bg-white/20" />}
            <span className="relative">{isSummarizing ? '总结中…' : isStale ? '更新摘要' : transcript.summary ? '重新总结' : '一键总结'}</span>
          </button>
        </div>

        {transcript.summary ? (
          <article className="mx-auto mt-7 max-w-3xl border-l-2 border-lemon/60 pl-5 sm:pl-7">
            <p className="font-body text-[11px] font-medium tracking-wide text-ink-soft/65">一句话结论</p>
            <h2 className="mt-2 break-words font-display text-[24px] font-medium leading-[1.45] text-ink sm:text-[26px]">
              {transcript.summary.one_liner}
            </h2>
            <p className="ui-reading-body mt-5 whitespace-pre-wrap">{transcript.summary.overview}</p>
            {isStale && (
              <p className="mt-5 rounded-xl border border-lemon/45 bg-lemon/15 px-3.5 py-3 font-body text-[11px] leading-relaxed text-ink-soft">
                逐字稿已经校对，这份摘要仍可参考。更新摘要后，结论才会反映最新文字。
              </p>
            )}
          </article>
        ) : (
          <p className="mx-auto mt-7 max-w-3xl font-body text-[14px] leading-[1.85] text-ink-soft/75">
            逐字稿已准备好。生成摘要后，这里会先给出一句话结论与完整概览，再按章节、说话人观点和重点内容组织阅读路径。
          </p>
        )}

        {(isSummarizing || progress.phase === 'failed') && (
          <TaskProgress className="mt-5" label={progress.message} percent={progress.percent} tone={progress.phase === 'failed' ? 'error' : 'working'} />
        )}
        {!isSummarizing && transcript.record.summary_status === 'failed' && transcript.record.summary_error && (
          <p className="mt-5 rounded-xl border border-pink/30 bg-pink/10 px-3.5 py-3 font-body text-[11px] leading-relaxed text-ink-soft">
            上次总结未完成：{transcript.record.summary_error}
          </p>
        )}
      </section>

      {transcript.summary && hasReadingGuide && (
        <section className="rounded-card border border-card-border bg-white/60 px-5 py-6 sm:px-7 sm:py-7" aria-labelledby="reading-guide-title">
          <div className="mx-auto max-w-3xl">
            <p className="font-body text-[11px] font-medium tracking-wide text-ink-soft/60">结构化导读</p>
            <h2 id="reading-guide-title" className="mt-1 font-display text-[20px] font-medium text-ink">沿着内容脉络继续读</h2>
            <nav aria-label="摘要内容分区" className="mt-4 flex flex-wrap gap-2">
              {chapters.length > 0 && <a href="#summary-chapters" className="ui-pressable rounded-full border border-card-border bg-white/65 px-3 py-2 font-body text-[11px] text-ink-soft hover:border-lilac/55 hover:text-ink">章节 {chapters.length}</a>}
              {viewpoints.length > 0 && <a href="#summary-viewpoints" className="ui-pressable rounded-full border border-card-border bg-white/65 px-3 py-2 font-body text-[11px] text-ink-soft hover:border-blush/60 hover:text-ink">人物观点 {viewpoints.length}</a>}
              {highlights.length > 0 && <a href="#summary-highlights" className="ui-pressable rounded-full border border-card-border bg-white/65 px-3 py-2 font-body text-[11px] text-ink-soft hover:border-sage/60 hover:text-ink">重点内容 {highlights.length}</a>}
            </nav>
          </div>

          <div className="mt-7">
            <SummaryReadingGroup
              id="summary-chapters"
              title="章节"
              description="按时间顺序还原讨论如何展开"
              itemLabel="章节"
              accentClassName="bg-lilac"
              items={chapters}
              speakerNames={speakerNames}
            />
            <SummaryReadingGroup
              id="summary-viewpoints"
              title="人物观点"
              description="把判断放回提出它的人与语境中"
              itemLabel="观点"
              accentClassName="bg-blush"
              items={viewpoints}
              speakerNames={speakerNames}
            />
            <SummaryReadingGroup
              id="summary-highlights"
              title="重点内容"
              description="集中回看值得引用、验证或继续研究的段落"
              itemLabel="重点"
              accentClassName="bg-sage"
              items={highlights}
              speakerNames={speakerNames}
            />
          </div>
        </section>
      )}
    </div>
  );
};

export default TranscriptSummaryPanel;
