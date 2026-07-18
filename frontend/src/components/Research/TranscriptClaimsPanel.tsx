import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BookmarkSimple,
  CaretLeft,
  CaretRight,
  Eye,
  EyeSlash,
} from '@phosphor-icons/react';
import type { TranscriptClaim, TranscriptSpeaker, TranscriptSummaryProgress } from '../../store';
import { formatTranscriptTime } from '../../pages/transcriptWorkspaceModel';
import { sortTranscriptClaims } from './transcriptClaimsModel';
import { EmptyState } from '../ui/EmptyState';
import { TaskProgress } from '../ui/TaskProgress';

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

interface ClaimReadingItemProps {
  claim: TranscriptClaim;
  speakerName?: string;
  isMutating: boolean;
  onOpen: (claim: TranscriptClaim) => void;
  onToggleStar: (claim: TranscriptClaim) => void;
  onToggleHidden: (claim: TranscriptClaim) => void;
}

const ClaimReadingItem: React.FC<ClaimReadingItemProps> = ({
  claim,
  speakerName,
  isMutating,
  onOpen,
  onToggleStar,
  onToggleHidden,
}) => (
  <article className={`border-b border-card-border py-7 first:pt-0 last:border-b-0 last:pb-0 ${claim.is_starred ? 'border-l-2 border-l-lemon pl-4 sm:pl-5' : ''}`}>
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-body text-[11px] text-ink-soft/65">
        <span className="font-semibold text-ink">{speakerName || claim.speaker_name || claim.speaker_key}</span>
        <span className="tabular-nums">{formatTranscriptTime(claim.start_seconds)}–{formatTranscriptTime(claim.end_seconds)}</span>
        {claim.is_starred && <span className="rounded-full bg-lemon/35 px-2 py-1 font-medium text-ink">已收藏</span>}
      </div>
      <span className="shrink-0 font-body text-[11px] tabular-nums text-ink-soft/60">内容价值 {claim.content_value}</span>
    </header>

    <div className="mt-4 max-w-3xl">
      {claim.question && (
        <div>
          <p className="font-body text-[11px] font-medium tracking-wide text-ink-soft/55">讨论问题</p>
          <p className="ui-reading-body mt-1 text-ink-soft/85">{claim.question}</p>
        </div>
      )}

      <div className={claim.question ? 'mt-5' : ''}>
        <p className="font-body text-[11px] font-medium tracking-wide text-ink-soft/55">核心观点</p>
        <h3 className="mt-1.5 break-words font-display text-[20px] font-medium leading-[1.55] text-ink">{claim.claim}</h3>
      </div>

      {claim.reasoning && (
        <div className="mt-5">
          <p className="font-body text-[11px] font-medium tracking-wide text-ink-soft/55">判断依据</p>
          <p className="ui-reading-body mt-1.5 whitespace-pre-wrap text-ink/85">{claim.reasoning}</p>
        </div>
      )}

      {claim.evidence_excerpt && (
        <blockquote className="mt-5 border-l-2 border-blush/65 pl-4">
          <p className="font-body text-[11px] font-medium tracking-wide text-ink-soft/55">原文证据</p>
          <p className="ui-reading-body mt-1.5 whitespace-pre-wrap text-ink-soft/80">{claim.evidence_excerpt}</p>
        </blockquote>
      )}
    </div>

    {claim.topic_tags.length > 0 && (
      <div className="mt-5 flex flex-wrap gap-1.5" aria-label="观点主题">
        {claim.topic_tags.map((tag) => (
          <span key={tag} className="rounded-full bg-lilac/20 px-2.5 py-1 font-body text-[11px] text-ink-soft">{tag}</span>
        ))}
      </div>
    )}

    <footer className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-card-border pt-3">
      <div className="flex items-center gap-1">
        <button
          type="button"
          title={claim.is_starred ? '取消收藏' : '收藏并优先展示'}
          aria-label={claim.is_starred ? '取消收藏' : '收藏并优先展示'}
          disabled={isMutating}
          onClick={() => onToggleStar(claim)}
          className={`ui-pressable flex h-9 w-9 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lilac disabled:cursor-not-allowed disabled:opacity-40 ${claim.is_starred ? 'bg-lemon/45 text-ink' : 'bg-paper text-ink-soft hover:text-ink'}`}
        >
          <BookmarkSimple aria-hidden="true" size={15} weight={claim.is_starred ? 'fill' : 'regular'} />
        </button>
        <button
          type="button"
          title={claim.is_hidden ? '恢复到主要观点' : '移到隐藏观点'}
          aria-label={claim.is_hidden ? '恢复到主要观点' : '移到隐藏观点'}
          disabled={isMutating}
          onClick={() => onToggleHidden(claim)}
          className="ui-pressable flex h-9 w-9 items-center justify-center rounded-full bg-paper text-ink-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lilac disabled:cursor-not-allowed disabled:opacity-40"
        >
          {claim.is_hidden ? <Eye aria-hidden="true" size={15} /> : <EyeSlash aria-hidden="true" size={15} />}
        </button>
      </div>
      <button
        type="button"
        onClick={() => onOpen(claim)}
        aria-label={`打开观点详情：${claim.claim}`}
        className="ui-pressable inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 font-body text-[11px] font-medium text-ink-soft hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lilac"
      >
        查看观点与证据<ArrowUpRight aria-hidden="true" size={12} />
      </button>
    </footer>
  </article>
);

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
    <section className="rounded-card border border-card-border bg-white/80 p-5 shadow-card sm:p-7" aria-labelledby="transcript-claims-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-lemon" aria-hidden="true" />
            <h2 id="transcript-claims-title" className="font-display text-[17px] font-medium text-ink">主要观点</h2>
          </div>
          <p className="mt-1 max-w-2xl font-body text-[12px] leading-relaxed text-ink-soft/70">先读问题与核心判断，再核对依据和原文证据；收藏只改变排序，隐藏不会删除内容。</p>
        </div>
        <button
          type="button"
          disabled={isAnalyzing}
          onClick={onAnalyze}
          className="ui-pressable min-h-10 shrink-0 rounded-xl bg-lemon px-5 py-2.5 font-body text-[11px] font-medium text-ink shadow-btn hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lilac disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isAnalyzing ? '正在分析观点…' : claims.length ? '重新分析观点' : '自动提取观点'}
        </button>
      </div>

      {isAnalyzing && <TaskProgress className="mt-4" label={progress.message || '正在分析观点'} percent={progress.percent} tone="working" />}
      {claimsStatus === 'stale' && <div className="mt-4 rounded-xl border border-lemon/45 bg-lemon/15 p-3 font-body text-[11px] leading-relaxed text-ink">逐字稿已经校对，这些观点尚未反映最新文字。重新分析会更新当前观点，已用于内容项目的旧观点仍会保留。</div>}
      {claimsStatus === 'failed' && claimsError && <div className="mt-4 animate-shake rounded-xl border border-pink/30 bg-pink/10 p-3 font-body text-[11px] leading-relaxed text-ink">{claimsError}</div>}
      {actionError && <div className="mt-4 animate-shake rounded-xl border border-pink/30 bg-pink/10 p-3 font-body text-[11px] leading-relaxed text-ink">{actionError}</div>}

      {claims.length > 0 && (
        <div className="mt-6 grid gap-3 border-y border-card-border py-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.25fr)]" aria-label="观点筛选与排序">
          <label className="min-w-0 font-body text-[11px] font-medium text-ink-soft">
            说话人
            <select aria-label="按说话人筛选" value={speakerFilter} onChange={(event) => { setSpeakerFilter(event.target.value); setPage(0); }} className="mt-1.5 min-h-10 w-full rounded-xl border border-card-border bg-white/70 px-3 py-2 font-body text-[11px] text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lilac">
              <option value="">全部说话人</option>
              {speakers.map((speaker) => <option key={speaker.id} value={speaker.speaker_key}>{speaker.display_name}</option>)}
            </select>
          </label>
          <label className="min-w-0 font-body text-[11px] font-medium text-ink-soft">
            主题
            <select aria-label="按主题筛选" value={topicFilter} onChange={(event) => { setTopicFilter(event.target.value); setPage(0); }} className="mt-1.5 min-h-10 w-full rounded-xl border border-card-border bg-white/70 px-3 py-2 font-body text-[11px] text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lilac">
              <option value="">全部主题</option>
              {topics.map((topic) => <option key={topic} value={topic}>{topic}</option>)}
            </select>
          </label>
          <label className="min-w-0 font-body text-[11px] font-medium text-ink-soft sm:col-span-2 lg:col-span-1">
            排序
            <select aria-label="观点排序" value={sort} onChange={(event) => { setSort(event.target.value === 'time' ? 'time' : 'value'); setPage(0); }} className="mt-1.5 min-h-10 w-full rounded-xl border border-card-border bg-white/70 px-3 py-2 font-body text-[11px] text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lilac">
              <option value="value">收藏与价值优先</option>
              <option value="time">收藏与时间优先</option>
            </select>
          </label>
        </div>
      )}

      {!claims.length && !isAnalyzing && (
        <EmptyState title="还没有可整理的观点" description="完成播客转录后，可从真实 Segment 中自动提取观点；观点会保留说话人与证据范围。" />
      )}

      {claims.length > 0 && visibleClaims.length === 0 && (
        <div className="mt-6 border-y border-dashed border-card-border py-10 text-center">
          <p className="font-display italic text-[15px] text-ink-soft/55">当前筛选下没有主要观点</p>
          <p className="mt-1 font-body text-[11px] leading-relaxed text-ink-soft/60">调整筛选条件，或从下方隐藏观点中恢复。</p>
        </div>
      )}

      {spreadClaims.length > 0 && (
        <div className="mx-auto mt-7 max-w-3xl" aria-label="观点卡片列表">
          <p className="mb-5 font-body text-[11px] text-ink-soft/60" role="status">
            显示 {safePage * CLAIMS_PER_SPREAD + 1}–{Math.min((safePage + 1) * CLAIMS_PER_SPREAD, visibleClaims.length)} 条，共 {visibleClaims.length} 条主要观点
          </p>
          {spreadClaims.map((claim) => (
            <ClaimReadingItem
              key={claim.id}
              claim={claim}
              speakerName={speakerNames.get(claim.speaker_key)}
              isMutating={mutatingClaimId === claim.id}
              onOpen={onOpenClaim}
              onToggleStar={(item) => void updatePreference(item, { isStarred: !item.is_starred })}
              onToggleHidden={(item) => void updatePreference(item, { isHidden: !item.is_hidden })}
            />
          ))}
        </div>
      )}

      {pageCount > 1 && (
        <nav className="mx-auto mt-6 flex max-w-3xl items-center justify-center gap-3 border-t border-card-border pt-4" aria-label="观点分页">
          <button type="button" title="上一页观点" aria-label="上一页观点" disabled={safePage === 0} onClick={() => setPage((value) => Math.max(0, value - 1))} className="ui-pressable flex h-9 w-9 items-center justify-center rounded-full bg-paper text-ink-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lilac disabled:cursor-not-allowed disabled:opacity-30"><CaretLeft aria-hidden="true" size={14} /></button>
          <span className="font-body text-[11px] tabular-nums text-ink-soft/65">第 {safePage + 1} / {pageCount} 页</span>
          <button type="button" title="下一页观点" aria-label="下一页观点" disabled={safePage === pageCount - 1} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} className="ui-pressable flex h-9 w-9 items-center justify-center rounded-full bg-paper text-ink-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lilac disabled:cursor-not-allowed disabled:opacity-30"><CaretRight aria-hidden="true" size={14} /></button>
        </nav>
      )}

      {hiddenClaims.length > 0 && (
        <details className="mt-7 border-t border-card-border pt-5">
          <summary className="cursor-pointer font-body text-[11px] font-medium text-ink-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lilac">已隐藏 {hiddenClaims.length} 条观点</summary>
          <p className="mt-2 font-body text-[11px] leading-relaxed text-ink-soft/60">这些观点仍然保留，只是不占主要阅读路径。</p>
          <div className="mx-auto mt-6 max-w-3xl" aria-label="已隐藏观点列表">
            {hiddenClaims.map((claim) => (
              <ClaimReadingItem
                key={claim.id}
                claim={claim}
                speakerName={speakerNames.get(claim.speaker_key)}
                isMutating={mutatingClaimId === claim.id}
                onOpen={onOpenClaim}
                onToggleStar={(item) => void updatePreference(item, { isStarred: !item.is_starred })}
                onToggleHidden={(item) => void updatePreference(item, { isHidden: false })}
              />
            ))}
          </div>
        </details>
      )}
    </section>
  );
};

export default TranscriptClaimsPanel;
