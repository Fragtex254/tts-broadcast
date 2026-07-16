import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { CaretLeft, CaretRight, Check, MicrophoneStage, Plus } from '@phosphor-icons/react';
import type { ClaimSearchResult, TranscriptClaim } from '../../store';
import { compactResearchText } from './researchViewModel';

const CANDIDATE_CARD_STEP = 290;

interface ResearchCandidateShelfProps {
  results: ClaimSearchResult[];
  activeClaimId: number | null;
  selectedIds: Set<number>;
  projectClaimIds: Set<number>;
  hasProject: boolean;
  onPreview: (claim: TranscriptClaim) => void;
  onToggleSelection: (claimId: number) => void;
  onAddToProject: (claimId: number) => Promise<unknown>;
}

export const ResearchCandidateShelf: React.FC<ResearchCandidateShelfProps> = ({
  results,
  activeClaimId,
  selectedIds,
  projectClaimIds,
  hasProject,
  onPreview,
  onToggleSelection,
  onAddToProject,
}) => {
  const shelfRef = useRef<HTMLDivElement>(null);
  const [addingClaimId, setAddingClaimId] = useState<number | null>(null);
  const [errorClaimId, setErrorClaimId] = useState<number | null>(null);
  const [visibleRange, setVisibleRange] = useState({ start: 1, end: Math.min(1, results.length), canScrollLeft: false, canScrollRight: results.length > 1 });

  const updateScrollState = useCallback(() => {
    const shelf = shelfRef.current;
    if (!shelf) return;
    const startIndex = Math.min(results.length - 1, Math.max(0, Math.round(shelf.scrollLeft / CANDIDATE_CARD_STEP)));
    const visibleCount = Math.max(1, Math.floor((shelf.clientWidth + 12) / CANDIDATE_CARD_STEP));
    setVisibleRange({
      start: results.length === 0 ? 0 : startIndex + 1,
      end: Math.min(results.length, startIndex + visibleCount),
      canScrollLeft: shelf.scrollLeft > 2,
      canScrollRight: shelf.scrollLeft + shelf.clientWidth < shelf.scrollWidth - 2,
    });
  }, [results.length]);

  useLayoutEffect(() => {
    updateScrollState();
    window.addEventListener('resize', updateScrollState);
    return () => window.removeEventListener('resize', updateScrollState);
  }, [updateScrollState]);

  const scroll = (direction: -1 | 1) => {
    shelfRef.current?.scrollBy({ left: direction * CANDIDATE_CARD_STEP, behavior: 'smooth' });
  };

  const add = async (claimId: number) => {
    setAddingClaimId(claimId);
    setErrorClaimId(null);
    try {
      await onAddToProject(claimId);
    } catch {
      setErrorClaimId(claimId);
    } finally {
      setAddingClaimId(null);
    }
  };

  return <section aria-label="相关观点" className="mt-5">
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h3 className="font-display text-[14px] font-medium text-ink">相关观点</h3>
        <p className="mt-1 font-body text-[11px] text-ink-soft/55">横向浏览候选，点击卡片在下方查看证据</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-body text-[10px] tabular-nums text-ink-soft/55">{visibleRange.start}–{visibleRange.end} / {results.length}</span>
        <button title="向左浏览" type="button" disabled={!visibleRange.canScrollLeft} onClick={() => scroll(-1)} className="flex h-9 w-9 items-center justify-center rounded-full border border-card-border bg-white/70 text-ink-soft transition-colors hover:bg-lilac/20 disabled:opacity-30">
          <CaretLeft aria-hidden="true" size={16} />
        </button>
        <button title="向右浏览" type="button" disabled={!visibleRange.canScrollRight} onClick={() => scroll(1)} className="flex h-9 w-9 items-center justify-center rounded-full border border-card-border bg-white/70 text-ink-soft transition-colors hover:bg-lilac/20 disabled:opacity-30">
          <CaretRight aria-hidden="true" size={16} />
        </button>
      </div>
    </div>

    <div ref={shelfRef} role="list" tabIndex={0} onScroll={updateScrollState} aria-label="候选观点横向列表" className="flex max-w-full snap-x snap-mandatory gap-3 overflow-x-auto pb-3 outline-none focus-visible:ring-2 focus-visible:ring-lilac/70">
      {results.map(({ claim, similarity, search_mode }, index) => {
        const isActive = activeClaimId === claim.id;
        const isAdded = projectClaimIds.has(claim.id);
        const isSelected = selectedIds.has(claim.id);
        return <article
          key={claim.id}
          role="listitem"
          className={`flex h-[228px] w-[278px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border p-4 transition-all duration-150 ${isActive ? 'border-ink-soft bg-lilac/10 shadow-card' : 'border-card-border bg-white/70 hover:-translate-y-px hover:shadow-card'}`}
          style={index < 4 ? { animation: `fade-in-up 0.3s cubic-bezier(0.22,1,0.36,1) ${index * 0.04}s both` } : undefined}
        >
          <button type="button" onClick={() => onPreview(claim)} aria-label={`预览观点：${claim.claim}`} className="min-h-0 flex-1 overflow-hidden text-left outline-none focus-visible:ring-2 focus-visible:ring-lilac/70">
            <span className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-lilac/25 text-ink-soft">
                <MicrophoneStage aria-hidden="true" size={22} weight="duotone" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-display text-[13px] font-medium text-ink">{claim.podcast_name || claim.episode_title || '未填写播客'}</span>
                <span className="mt-1 block truncate font-body text-[10px] text-ink-soft/55">{claim.speaker_name || claim.speaker_key}</span>
              </span>
            </span>
            <span className="mt-4 block font-display text-[15px] font-medium leading-relaxed text-ink">{compactResearchText(claim.claim, 34)}</span>
            <span className="mt-3 block font-body text-[10px] text-ink-soft/50">{search_mode === 'embedding' ? `语义相似度 ${(similarity * 100).toFixed(0)}%` : '关键词命中'}</span>
          </button>

          <div className="mt-3 flex items-center gap-2 border-t border-card-border pt-3">
            <label className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl transition-colors hover:bg-lilac/20" title="选择用于关系分析">
              <input aria-label={`选择观点：${claim.claim}`} type="checkbox" checked={isSelected} onChange={() => onToggleSelection(claim.id)} className="h-4 w-4 accent-current" />
            </label>
            <button
              type="button"
              disabled={!hasProject || isAdded || addingClaimId !== null}
              onClick={() => void add(claim.id)}
              className="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border border-sage bg-white/70 px-3 py-2 font-body text-[11px] text-ink transition-colors hover:bg-sage/20 disabled:opacity-45"
            >
              {isAdded ? <Check aria-hidden="true" size={14} /> : <Plus aria-hidden="true" size={14} />}
              <span aria-live="polite">{isAdded ? '已加入项目' : addingClaimId === claim.id ? '加入中…' : hasProject ? '加入项目' : '先选择项目'}</span>
            </button>
          </div>
          {errorClaimId === claim.id && <p role="alert" className="mt-2 font-body text-[10px] text-pink">加入失败，请重试</p>}
        </article>;
      })}
    </div>
  </section>;
};

export default ResearchCandidateShelf;
