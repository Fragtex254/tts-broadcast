import React from 'react';
import { ArrowSquareOut, Quotes } from '@phosphor-icons/react';
import type { TranscriptClaim } from '../../store';
import { formatTranscriptTime } from '../../pages/transcriptWorkspaceModel';
import { compactResearchText } from './researchViewModel';

interface ResearchClaimPreviewProps {
  claim: TranscriptClaim | null;
  onOpenDetail: (claim: TranscriptClaim) => void;
  onOpenEvidence: (claim: TranscriptClaim) => Promise<void>;
}

export const ResearchClaimPreview: React.FC<ResearchClaimPreviewProps> = ({ claim, onOpenDetail, onOpenEvidence }) => {
  if (!claim) return <section className="mt-4 rounded-2xl border border-card-border bg-paper/40 p-8 text-center">
    <p className="font-display text-[15px] text-ink-soft/45">从上方选择一个观点</p>
    <p className="mt-1 font-body text-[11px] text-ink-soft/35">这里会显示论证和对应逐字稿证据</p>
  </section>;

  return <section className="mt-4 rounded-2xl border border-card-border bg-white/60 p-5">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="font-body text-[11px] text-ink-soft/55">{claim.podcast_name || '未填写播客'} · {claim.episode_title || '未填写单集'}</p>
        <h3 className="mt-2 font-display text-[19px] font-medium leading-snug text-ink">{compactResearchText(claim.claim, 64)}</h3>
        <p className="mt-2 font-body text-[11px] text-ink-soft/55">{claim.speaker_name || claim.speaker_key} · {formatTranscriptTime(claim.start_seconds)}–{formatTranscriptTime(claim.end_seconds)}</p>
      </div>
      <button type="button" onClick={() => onOpenDetail(claim)} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-lilac px-3.5 py-2.5 font-body text-[11px] text-ink shadow-btn">
        完整详情
        <ArrowSquareOut aria-hidden="true" size={14} />
      </button>
    </div>

    <div className="mt-5 grid gap-3 xl:grid-cols-2">
      <div>
        <h4 className="font-body text-[11px] font-medium text-ink-soft">论证逻辑</h4>
        <p className="mt-2 font-body text-[13px] leading-relaxed text-ink-soft">{compactResearchText(claim.reasoning || '这条观点暂时没有单独整理的论证。', 180)}</p>
      </div>
      <blockquote className="rounded-xl bg-lilac/10 p-4">
        <div className="flex items-center gap-2 font-body text-[11px] font-medium text-ink-soft">
          <Quotes aria-hidden="true" size={16} weight="fill" />
          证据片段
        </div>
        <p className="mt-2 font-body text-[13px] leading-relaxed text-ink-soft">{compactResearchText(claim.evidence_excerpt, 220)}</p>
        <button type="button" onClick={() => void onOpenEvidence(claim)} className="mt-3 inline-flex items-center gap-1.5 font-body text-[11px] font-medium text-ink-soft transition-colors hover:text-ink">
          在逐字稿中查看
          <ArrowSquareOut aria-hidden="true" size={13} />
        </button>
      </blockquote>
    </div>
  </section>;
};

export default ResearchClaimPreview;
