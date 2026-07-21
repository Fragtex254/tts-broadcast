import React from 'react';
import { Sparkle } from '@phosphor-icons/react';
import type { TranscriptSummaryItem, TranscriptTurn } from '../../store';
import { formatTranscriptTime } from '../../pages/transcriptWorkspaceModel';
import { BilibiliTranscriptPlayer } from './BilibiliTranscriptPlayer';
import type { BilibiliVideoReference } from './bilibiliPlayerModel';
import { findTranscriptViewpointsForTurn } from './transcriptConversationModel';

interface TranscriptContextSidebarProps {
  currentTurn: TranscriptTurn | null;
  totalTurns: number;
  summaryItems: TranscriptSummaryItem[];
  speakerNames: Map<string, string>;
  isSummaryStale: boolean;
  bilibiliVideo: BilibiliVideoReference | null;
  sourceUrl: string;
  videoSeekSeconds: number;
  videoSeekRequestId: number;
}

export const TranscriptContextSidebar: React.FC<TranscriptContextSidebarProps> = ({
  currentTurn,
  totalTurns,
  summaryItems,
  speakerNames,
  isSummaryStale,
  bilibiliVideo,
  sourceUrl,
  videoSeekSeconds,
  videoSeekRequestId,
}) => {
  const viewpoints = findTranscriptViewpointsForTurn(summaryItems, currentTurn);
  const hasViewpoints = summaryItems.some((item) => item.item_type === 'speaker_viewpoint');
  const currentSpeakerName = currentTurn
    ? speakerNames.get(currentTurn.speaker_key) || currentTurn.speaker_key
    : '';

  return (
    <aside className="hidden min-h-0 border-l border-card-border bg-white/30 2xl:flex 2xl:flex-col" aria-label="逐字稿辅助信息">
      <section className="min-h-0 flex-1 overflow-y-auto p-4" aria-labelledby="transcript-viewpoint-title">
        <div className="flex items-center gap-2">
          <Sparkle aria-hidden="true" size={15} weight="fill" className="text-lemon" />
          <h2 id="transcript-viewpoint-title" className="font-display text-[14px] font-medium text-ink">AI 核心观点</h2>
        </div>
        <p className="mt-1 font-body text-[11px] leading-relaxed text-ink-soft/65">按当前语块时间匹配，仅供回看与核对</p>

        {currentTurn && (
          <div data-testid="active-turn-context" className="mt-4 border-l-2 border-lilac py-1 pl-3">
            <p className="font-body text-[12px] font-semibold text-ink">{currentSpeakerName}</p>
            <p className="mt-1 font-body text-[11px] tabular-nums text-ink-soft/70">
              {formatTranscriptTime(currentTurn.start_seconds)}–{formatTranscriptTime(currentTurn.end_seconds)}
            </p>
            <p className="mt-1 font-body text-[11px] text-ink-soft/65">发言 {currentTurn.turn_index + 1} / {totalTurns}</p>
          </div>
        )}

        {isSummaryStale && (
          <p className="mt-4 rounded-xl border border-lemon/45 bg-lemon/15 p-3 font-body text-[11px] leading-relaxed text-ink-soft">
            逐字稿已校对，这些 AI 观点尚未反映最新文字。
          </p>
        )}

        {viewpoints.length > 0 ? (
          <div className="mt-4 space-y-3" aria-live="polite">
            {viewpoints.map((item) => (
              <article key={item.id} className="rounded-xl border border-card-border bg-white/65 p-3.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-body text-[11px] text-ink-soft/65">
                  <span>{speakerNames.get(item.speaker_key) || item.speaker_key || '综合观点'}</span>
                  <span className="tabular-nums">{formatTranscriptTime(item.start_seconds)}–{formatTranscriptTime(item.end_seconds)}</span>
                </div>
                <h3 className="mt-2 font-display text-[15px] font-medium leading-snug text-ink">{item.title || '核心观点'}</h3>
                <p className="mt-2 whitespace-pre-wrap font-body text-[12px] leading-[1.75] text-ink-soft/85">{item.content}</p>
                <p className="mt-3 font-body text-[11px] text-ink-soft/55">AI 总结，需结合左侧逐字稿核对</p>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-4 border-y border-card-border py-5" aria-live="polite">
            <p className="font-display italic text-[13px] text-ink-soft/65">
              {hasViewpoints ? '当前语块暂无对应核心观点' : '尚未生成核心观点'}
            </p>
            <p className="mt-2 font-body text-[11px] leading-relaxed text-ink-soft/60">
              {hasViewpoints ? '继续滚动逐字稿，匹配到观点证据时间后会自动切换。' : '完成一键总结后，人物观点会显示在这里。'}
            </p>
          </div>
        )}
      </section>

      {bilibiliVideo && sourceUrl && (
        <div className="shrink-0 border-t border-card-border bg-paper/70 p-3.5">
          <BilibiliTranscriptPlayer
            video={bilibiliVideo}
            sourceUrl={sourceUrl}
            seekSeconds={videoSeekSeconds}
            seekRequestId={videoSeekRequestId}
            variant="sidebar"
          />
        </div>
      )}
    </aside>
  );
};

export default TranscriptContextSidebar;
