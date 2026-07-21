import React from 'react';
import { ArrowSquareOut, PlayCircle } from '@phosphor-icons/react';
import { formatTranscriptTime } from '../../pages/transcriptWorkspaceModel';
import { buildBilibiliPlayerUrl, type BilibiliVideoReference } from './bilibiliPlayerModel';

interface BilibiliTranscriptPlayerProps {
  video: BilibiliVideoReference;
  sourceUrl: string;
  seekSeconds: number;
  seekRequestId: number;
  variant?: 'embedded' | 'compact' | 'sidebar';
  containerRef?: React.RefObject<HTMLElement | null>;
}

export const BilibiliTranscriptPlayer: React.FC<BilibiliTranscriptPlayerProps> = ({
  video,
  sourceUrl,
  seekSeconds,
  seekRequestId,
  variant = 'embedded',
  containerRef,
}) => {
  const isCompact = variant === 'compact';
  const isSidebar = variant === 'sidebar';
  const playerUrl = buildBilibiliPlayerUrl(video, seekSeconds, seekRequestId > 0);
  const videoLabel = video.idType === 'bvid' ? video.id : `av${video.id}`;

  return (
    <section
      ref={containerRef}
      aria-label="Bilibili 原视频"
      className={isCompact
        ? 'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'
        : isSidebar
          ? 'flex flex-col gap-3'
          : 'border-t border-card-border bg-white/35 p-4 sm:p-5'}
    >
      <div className={isCompact ? 'min-w-0 sm:max-w-xs' : isSidebar ? 'min-w-0' : 'mb-3 flex flex-wrap items-start justify-between gap-3'}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <PlayCircle aria-hidden="true" size={16} weight="fill" className="shrink-0 text-pink" />
            <h3 className="font-display text-[14px] font-medium text-ink">Bilibili 原视频</h3>
          </div>
          <p className="mt-1 font-body text-[11px] leading-relaxed text-ink-soft/70">
            当前定位 {formatTranscriptTime(seekSeconds)} · {videoLabel}{video.page > 1 ? ` · P${video.page}` : ''}
          </p>
          <p className="mt-1 font-body text-[11px] leading-relaxed text-ink-soft/60">双击语块、按 Enter 或点“播放此处”可重新定位。</p>
        </div>
        {!isCompact && !isSidebar && (
          <a href={sourceUrl} target="_blank" rel="noreferrer" className="ui-pressable inline-flex min-h-9 items-center gap-1 rounded-lg px-2 font-body text-[11px] text-ink-soft underline decoration-card-border underline-offset-4 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lilac">
            在 Bilibili 打开 <ArrowSquareOut aria-hidden="true" size={12} />
          </a>
        )}
      </div>
      <div className={`aspect-video w-full overflow-hidden rounded-xl border border-card-border bg-ink/5 ${isCompact ? 'sm:w-[360px] sm:max-w-[48vw]' : isSidebar ? '' : 'mx-auto max-w-3xl'}`}>
        <iframe
          key={`${seekRequestId}-${playerUrl}`}
          src={playerUrl}
          title={`Bilibili 原视频，当前定位 ${formatTranscriptTime(seekSeconds)}`}
          loading="lazy"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="h-full w-full border-0"
        />
      </div>
    </section>
  );
};

export default BilibiliTranscriptPlayer;
