import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BookmarkSimple,
  CaretLeft,
  CaretRight,
  Eye,
  EyeSlash,
  StackSimple,
} from '@phosphor-icons/react';
import type { TranscriptClaim, TranscriptSpeaker, TranscriptSummaryProgress } from '../../store';
import { formatTranscriptTime } from '../../pages/transcriptWorkspaceModel';
import { sortTranscriptClaims } from './transcriptClaimsModel';

const CLAIMS_PER_SPREAD = 3;

interface TranscriptClaimsPanelProps {
  claims: TranscriptClaim[];
  speakers: TranscriptSpeaker[];
  isAnalyzing: boolean;
  progress: TranscriptSummaryProgress;
  claimsStatus: string;
  claimsError: string;
  onAnalyze: () => void;
  onOpenClaim: (claim: TranscriptClaim) => void;
  onUpdateClaim: (claimId: number, update: { isStarred?: boolean; isHidden?: boolean }) => Promise<TranscriptClaim>;
}

interface ClaimSpreadCardProps {
  claim: TranscriptClaim;
  speakerName?: string;
  isMutating: boolean;
  onOpen: (claim: TranscriptClaim) => void;
  onToggleStar: (claim: TranscriptClaim) => void;
  onToggleHidden: (claim: TranscriptClaim) => void;
}

interface DesktopClaimSpreadProps {
  claims: TranscriptClaim[];
  speakerNames: Map<string, string>;
  isMutatingClaim: (claimId: number) => boolean;
  onOpen: (claim: TranscriptClaim) => void;
  onToggleStar: (claim: TranscriptClaim) => void;
  onToggleHidden: (claim: TranscriptClaim) => void;
}

const ClaimSpreadCard: React.FC<ClaimSpreadCardProps> = ({
  claim,
  speakerName,
  isMutating,
  onOpen,
  onToggleStar,
  onToggleHidden,
}) => (
  <article className={`flex h-[368px] w-[17.5rem] shrink-0 flex-col rounded-2xl border p-5 shadow-card transition-colors duration-150 ${
    claim.is_starred ? 'border-lemon/70 bg-white' : 'border-card-border bg-white/95'
  }`}>
    <div className="flex items-center justify-between gap-2">
      <span className="rounded-full bg-paper px-2.5 py-1 font-body text-[9px] text-ink-soft">
        {speakerName || claim.speaker_name || claim.speaker_key}
      </span>
      <span className="font-display text-[11px] tabular-nums text-ink-soft/55">价值 {claim.content_value}</span>
    </div>

    <button
      type="button"
      onClick={() => onOpen(claim)}
      className="mt-4 min-h-0 flex-1 overflow-hidden text-left outline-none focus-visible:ring-2 focus-visible:ring-lilac/70"
      aria-label={`打开观点详情：${claim.claim}`}
    >
      <span className="line-clamp-2 font-body text-[10px] leading-relaxed text-ink-soft/55">{claim.question}</span>
      <span className="mt-2 line-clamp-4 font-display text-[18px] font-medium leading-[1.45] text-ink">{claim.claim}</span>
      {claim.reasoning && <span className="mt-3 line-clamp-3 font-body text-[10px] leading-[1.65] text-ink-soft/65">{claim.reasoning}</span>}
      <span className="mt-3 block font-body text-[9px] tabular-nums text-ink-soft/45">
        {formatTranscriptTime(claim.start_seconds)}–{formatTranscriptTime(claim.end_seconds)}
      </span>
    </button>

    <div className="mt-3 flex flex-wrap gap-1.5 overflow-hidden">
      {claim.topic_tags.slice(0, 3).map((tag) => <span key={tag} className="rounded-full bg-lilac/20 px-2 py-1 font-body text-[9px] text-ink-soft">{tag}</span>)}
    </div>
    <div className="mt-3 flex items-center justify-between border-t border-card-border pt-3">
      <div className="flex items-center gap-1">
        <button
          type="button"
          title={claim.is_starred ? '取消收藏' : '收藏并优先展示'}
          aria-label={claim.is_starred ? '取消收藏' : '收藏并优先展示'}
          disabled={isMutating}
          onClick={() => onToggleStar(claim)}
          className={`flex h-8 w-8 items-center justify-center rounded-full transition disabled:opacity-40 ${claim.is_starred ? 'bg-lemon/45 text-ink' : 'bg-paper text-ink-soft hover:text-ink'}`}
        >
          <BookmarkSimple aria-hidden="true" size={15} weight={claim.is_starred ? 'fill' : 'regular'} />
        </button>
        <button
          type="button"
          title={claim.is_hidden ? '恢复到主要观点' : '移到隐藏观点'}
          aria-label={claim.is_hidden ? '恢复到主要观点' : '移到隐藏观点'}
          disabled={isMutating}
          onClick={() => onToggleHidden(claim)}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-paper text-ink-soft transition hover:text-ink disabled:opacity-40"
        >
          {claim.is_hidden ? <Eye aria-hidden="true" size={15} /> : <EyeSlash aria-hidden="true" size={15} />}
        </button>
      </div>
      <button type="button" onClick={() => onOpen(claim)} className="inline-flex items-center gap-1 font-body text-[9px] text-ink-soft transition hover:text-ink">
        详情<ArrowUpRight aria-hidden="true" size={11} />
      </button>
    </div>
  </article>
);

const DesktopClaimSpread: React.FC<DesktopClaimSpreadProps> = ({ claims, speakerNames, isMutatingClaim, onOpen, onToggleStar, onToggleHidden }) => {
  const [hasExpanded, setHasExpanded] = useState(false);
  const [frontClaimId, setFrontClaimId] = useState<number | null>(null);
  const center = (claims.length - 1) / 2;

  return (
    <div>
      <div className="mb-3 hidden items-center justify-between lg:flex">
        <p className="font-body text-[10px] text-ink-soft/55">{hasExpanded ? '卡片已保持展开；悬停或聚焦任一观点可将它置于最前' : '首次移入或聚焦卡片区域后展开，并保持展开状态'}</p>
        {hasExpanded ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sage/45 bg-sage/15 px-3 py-1.5 font-body text-[10px] text-ink-soft">
            <StackSimple aria-hidden="true" size={13} />已固定展开
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setHasExpanded(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-card-border bg-white/60 px-3 py-1.5 font-body text-[10px] text-ink-soft transition hover:text-ink"
          >
            <StackSimple aria-hidden="true" size={13} />展开卡片
          </button>
        )}
      </div>
      <div
        className="relative hidden h-[400px] overflow-hidden rounded-2xl border border-card-border bg-paper/45 lg:block"
        onMouseEnter={() => setHasExpanded(true)}
        onFocusCapture={() => setHasExpanded(true)}
        aria-label="观点卡片展开区"
      >
        {claims.map((claim, index) => {
          const distance = index - center;
          const offset = distance * (hasExpanded ? 246 : 24);
          const rotation = hasExpanded ? 0 : distance * 1.4;
          const isFront = frontClaimId === claim.id;
          return (
            <div
              key={claim.id}
              data-testid={`claim-spread-${claim.id}`}
              className="absolute left-1/2 top-4 transition-transform duration-300 ease-out"
              onMouseEnter={() => setFrontClaimId(claim.id)}
              onMouseLeave={() => setFrontClaimId(null)}
              onFocusCapture={() => setFrontClaimId(claim.id)}
              onBlurCapture={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFrontClaimId(null);
              }}
              style={{
                zIndex: isFront ? 100 : claims.length - index,
                transform: `translateX(calc(-50% + ${offset}px)) rotate(${rotation}deg) ${isFront ? 'scale(1.025)' : 'scale(1)'}`,
              }}
            >
              <ClaimSpreadCard
                claim={claim}
                speakerName={speakerNames.get(claim.speaker_key)}
                isMutating={isMutatingClaim(claim.id)}
                onOpen={onOpen}
                onToggleStar={onToggleStar}
                onToggleHidden={onToggleHidden}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const TranscriptClaimsPanel: React.FC<TranscriptClaimsPanelProps> = ({
  claims,
  speakers,
  isAnalyzing,
  progress,
  claimsStatus,
  claimsError,
  onAnalyze,
  onOpenClaim,
  onUpdateClaim,
}) => {
  const [speakerFilter, setSpeakerFilter] = useState('');
  const [topicFilter, setTopicFilter] = useState('');
  const [sort, setSort] = useState<'value' | 'time'>('value');
  const [page, setPage] = useState(0);
  const [mutatingClaimId, setMutatingClaimId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const speakerNames = useMemo(() => new Map(speakers.map((speaker) => [speaker.speaker_key, speaker.display_name])), [speakers]);
  const topics = useMemo(() => [...new Set(claims.flatMap((claim) => claim.topic_tags))], [claims]);
  const visibleClaims = useMemo(() => sortTranscriptClaims(claims.filter((claim) => (
    !claim.is_hidden
    && (!speakerFilter || claim.speaker_key === speakerFilter)
    && (!topicFilter || claim.topic_tags.includes(topicFilter))
  )), sort), [claims, sort, speakerFilter, topicFilter]);
  const hiddenClaims = useMemo(() => sortTranscriptClaims(claims.filter((claim) => claim.is_hidden), sort), [claims, sort]);
  const pageCount = Math.max(1, Math.ceil(visibleClaims.length / CLAIMS_PER_SPREAD));
  const safePage = Math.min(page, pageCount - 1);
  const spreadClaims = visibleClaims.slice(safePage * CLAIMS_PER_SPREAD, (safePage + 1) * CLAIMS_PER_SPREAD);

  const updatePreference = async (claim: TranscriptClaim, update: { isStarred?: boolean; isHidden?: boolean }) => {
    setMutatingClaimId(claim.id);
    setActionError(null);
    try {
      await onUpdateClaim(claim.id, update);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '更新观点偏好失败');
    } finally {
      setMutatingClaimId(null);
    }
  };

  return (
    <section className="rounded-card border border-card-border bg-white/80 p-5 sm:p-6 shadow-card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-lemon" /><h2 className="font-display italic text-[14px] font-medium text-ink-soft">观点卡片</h2></div>
          <p className="mt-1 font-body text-[10px] text-ink-soft/55">收藏优先展示，隐藏收进次级区域；都不会删除观点</p>
        </div>
        <button type="button" disabled={isAnalyzing} onClick={onAnalyze} className="rounded-full bg-lemon px-5 py-2 font-body text-[11px] font-medium text-ink shadow-btn disabled:opacity-40">{isAnalyzing ? `${progress.message} ${progress.percent}%` : claims.length ? '重新分析观点' : '自动提取观点'}</button>
      </div>
      {claimsStatus === 'stale' && <div className="mb-4 rounded-xl border border-pink/30 bg-pink/10 p-3 font-body text-[11px] text-ink">逐字稿已校对，这些观点待更新。重新分析后会原子替换旧观点。</div>}
      {claimsStatus === 'failed' && claimsError && <div className="mb-4 animate-shake rounded-xl bg-pink/10 p-3 font-body text-[11px] text-ink">{claimsError}</div>}
      {actionError && <div className="mb-4 animate-shake rounded-xl border border-pink/30 bg-pink/10 p-3 font-body text-[11px] text-ink">{actionError}</div>}
      {claims.length > 0 && <div className="mb-5 flex flex-wrap gap-2">
        <select aria-label="按说话人筛选" value={speakerFilter} onChange={(event) => { setSpeakerFilter(event.target.value); setPage(0); }} className="rounded-full border border-card-border bg-white/70 px-3 py-2 font-body text-[10px] text-ink"><option value="">全部 Speaker</option>{speakers.map((speaker) => <option key={speaker.id} value={speaker.speaker_key}>{speaker.display_name}</option>)}</select>
        <select aria-label="按主题筛选" value={topicFilter} onChange={(event) => { setTopicFilter(event.target.value); setPage(0); }} className="rounded-full border border-card-border bg-white/70 px-3 py-2 font-body text-[10px] text-ink"><option value="">全部主题</option>{topics.map((topic) => <option key={topic} value={topic}>{topic}</option>)}</select>
        <select aria-label="观点排序" value={sort} onChange={(event) => { setSort(event.target.value === 'time' ? 'time' : 'value'); setPage(0); }} className="rounded-full border border-card-border bg-white/70 px-3 py-2 font-body text-[10px] text-ink"><option value="value">收藏与价值优先</option><option value="time">收藏与时间优先</option></select>
      </div>}
      {!claims.length && !isAnalyzing && <div className="p-10 text-center"><p className="font-display italic text-[16px] text-ink-soft/40">暂无观点卡</p><p className="mt-1 font-body text-[11px] text-ink-soft/35">完成播客转录后，让系统从真实 Segment 中提取观点</p></div>}

      {claims.length > 0 && visibleClaims.length === 0 && <div className="rounded-2xl border border-dashed border-card-border p-8 text-center"><p className="font-display italic text-[15px] text-ink-soft/45">当前筛选下没有主要观点</p><p className="mt-1 font-body text-[10px] text-ink-soft/40">可以调整筛选，或从下方隐藏观点中恢复</p></div>}
      {spreadClaims.length > 0 && (
        <>
          <DesktopClaimSpread
            claims={spreadClaims}
            speakerNames={speakerNames}
            isMutatingClaim={(claimId) => mutatingClaimId === claimId}
            onOpen={onOpenClaim}
            onToggleStar={(claim) => void updatePreference(claim, { isStarred: !claim.is_starred })}
            onToggleHidden={(claim) => void updatePreference(claim, { isHidden: !claim.is_hidden })}
          />
          <div className="flex snap-x gap-3 overflow-x-auto pb-3 lg:hidden" aria-label="观点卡片横向列表">
            {spreadClaims.map((claim) => <div key={claim.id} className="snap-center"><ClaimSpreadCard claim={claim} speakerName={speakerNames.get(claim.speaker_key)} isMutating={mutatingClaimId === claim.id} onOpen={onOpenClaim} onToggleStar={(item) => void updatePreference(item, { isStarred: !item.is_starred })} onToggleHidden={(item) => void updatePreference(item, { isHidden: !item.is_hidden })} /></div>)}
          </div>
        </>
      )}

      {pageCount > 1 && <div className="mt-4 flex items-center justify-center gap-3 border-t border-card-border pt-4">
        <button type="button" title="上一组观点" disabled={safePage === 0} onClick={() => setPage((value) => Math.max(0, value - 1))} className="flex h-8 w-8 items-center justify-center rounded-full bg-paper text-ink-soft disabled:opacity-30"><CaretLeft aria-hidden="true" size={14} /></button>
        <span className="font-body text-[10px] tabular-nums text-ink-soft/55">第 {safePage + 1} / {pageCount} 组</span>
        <button type="button" title="下一组观点" disabled={safePage === pageCount - 1} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} className="flex h-8 w-8 items-center justify-center rounded-full bg-paper text-ink-soft disabled:opacity-30"><CaretRight aria-hidden="true" size={14} /></button>
      </div>}

      {hiddenClaims.length > 0 && (
        <details className="mt-5 rounded-2xl border border-card-border bg-paper/40 p-4">
          <summary className="cursor-pointer font-body text-[11px] text-ink-soft">已隐藏 {hiddenClaims.length} 条观点</summary>
          <p className="mt-2 font-body text-[10px] text-ink-soft/45">这些观点仍然保留，只是不占主要阅读空间。</p>
          <div className="mt-4 flex snap-x gap-3 overflow-x-auto pb-2" aria-label="已隐藏观点横向列表">
            {hiddenClaims.map((claim) => <div key={claim.id} className="snap-center"><ClaimSpreadCard claim={claim} speakerName={speakerNames.get(claim.speaker_key)} isMutating={mutatingClaimId === claim.id} onOpen={onOpenClaim} onToggleStar={(item) => void updatePreference(item, { isStarred: !item.is_starred })} onToggleHidden={(item) => void updatePreference(item, { isHidden: false })} /></div>)}
          </div>
        </details>
      )}
    </section>
  );
};

export default TranscriptClaimsPanel;
