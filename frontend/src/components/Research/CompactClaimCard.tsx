import React from 'react';
import { ArrowUpRight } from '@phosphor-icons/react';
import type { TranscriptClaim } from '../../store';
import { formatTranscriptTime } from '../../pages/transcriptWorkspaceModel';

interface CompactClaimCardProps {
  claim: TranscriptClaim;
  speakerName?: string;
  contextLabel?: string;
  isSelected?: boolean;
  onSelectionChange?: (claimId: number) => void;
  onOpen: (claim: TranscriptClaim) => void;
  animationDelay?: number;
}

export const CompactClaimCard: React.FC<CompactClaimCardProps> = ({
  claim,
  speakerName,
  contextLabel,
  isSelected = false,
  onSelectionChange,
  onOpen,
}) => (
  <article
    className={`group flex min-h-32 gap-3 rounded-2xl border p-4 ui-transition duration-fast hover:shadow-card ${
      isSelected
        ? 'border-lilac bg-lilac/10'
        : claim.status === 'stale'
          ? 'border-pink/30 bg-pink/5'
          : 'border-card-border bg-white/70'
    }`}

  >
    {onSelectionChange && (
      <label className="-m-1 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl transition-colors hover:bg-lilac/20">
        <input
          type="checkbox"
          aria-label={`选择观点：${claim.claim}`}
          checked={isSelected}
          onChange={() => onSelectionChange(claim.id)}
          className="h-4 w-4 accent-current"
        />
      </label>
    )}
    <button
      type="button"
      onClick={() => onOpen(claim)}
      className="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-lilac/70 focus-visible:ring-offset-4 focus-visible:ring-offset-paper"
      aria-label={`打开观点详情：${claim.claim}`}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate font-body text-[11px] text-ink-soft/55">
            {contextLabel || `${speakerName || claim.speaker_name || claim.speaker_key} · ${formatTranscriptTime(claim.start_seconds)}–${formatTranscriptTime(claim.end_seconds)}`}
          </span>
          <span className="mt-2 line-clamp-2 font-display text-[16px] font-medium leading-snug text-ink">
            {claim.claim}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-lemon/35 px-2.5 py-1 font-display text-[11px] text-ink">
          {claim.content_value}
          <ArrowUpRight aria-hidden="true" size={11} />
        </span>
      </span>
      <span className="mt-3 flex flex-wrap items-center gap-1.5">
        {claim.topic_tags.slice(0, 3).map((tag) => (
          <span key={tag} className="rounded-full bg-lilac/25 px-2 py-1 font-body text-[11px] text-ink-soft">{tag}</span>
        ))}
        {claim.topic_tags.length > 3 && <span className="font-body text-[11px] text-ink-soft/45">+{claim.topic_tags.length - 3}</span>}
        {claim.is_starred && <span className="ml-auto font-body text-[11px] text-ink-soft/65">★ 已收藏</span>}
      </span>
    </button>
  </article>
);

export default CompactClaimCard;
