import React, { useState } from 'react';
import { ArrowSquareOut, BookmarkSimple, Quotes } from '@phosphor-icons/react';
import type { TranscriptClaim } from '../../store';
import { formatTranscriptTime } from '../../pages/transcriptWorkspaceModel';
import { ModalShell } from '../ModalShell';

interface ClaimDetailModalProps {
  isOpen: boolean;
  claim: TranscriptClaim | null;
  isLoading?: boolean;
  error?: string | null;
  projectTitle?: string;
  onClose: () => void;
  onRetry?: () => void;
  onUpdate: (claimId: number, update: { userNote?: string; isStarred?: boolean }) => Promise<TranscriptClaim>;
  onDelete: (claimId: number) => Promise<void>;
  onOpenEvidence: (claim: TranscriptClaim) => Promise<void>;
  onAddToProject?: (claimId: number) => Promise<void>;
}

const DetailSkeleton: React.FC = () => (
  <div className="space-y-4 p-1 animate-pulse" aria-label="正在加载观点详情">
    <div className="h-7 w-4/5 rounded bg-ink/5" />
    <div className="h-24 rounded-2xl bg-ink/5" />
    <div className="h-32 rounded-2xl bg-ink/5" />
  </div>
);

export const ClaimDetailModal: React.FC<ClaimDetailModalProps> = ({
  isOpen,
  claim,
  isLoading = false,
  error,
  projectTitle,
  onClose,
  onRetry,
  onUpdate,
  onDelete,
  onOpenEvidence,
  onAddToProject,
}) => {
  const [noteState, setNoteState] = useState({ claimId: claim?.id ?? null, draft: claim?.user_note || '' });
  const [isWorking, setIsWorking] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const noteDraft = noteState.claimId === (claim?.id ?? null) ? noteState.draft : claim?.user_note || '';

  const run = async (action: () => Promise<void>) => {
    setIsWorking(true);
    setActionError(null);
    try { await action(); } catch (runError) { setActionError(runError instanceof Error ? runError.message : '操作失败'); } finally { setIsWorking(false); }
  };

  const subtitle = claim
    ? `${claim.podcast_name || '未填写播客名'} · ${claim.episode_title || '未填写单集标题'} · ${claim.speaker_name || claim.speaker_key}`
    : '从核心结论继续理解论证与原始证据';

  return (
    <ModalShell isOpen={isOpen} title="观点详情" subtitle={subtitle} onClose={onClose} size="lg" accent="lemon" closeOnBackdrop={!isWorking} closeOnEscape={!isWorking}>
      {isLoading && !claim ? <DetailSkeleton /> : error && !claim ? (
        <div className="animate-shake rounded-xl border border-pink/30 bg-pink/10 p-4 font-body text-[12px] text-ink">
          <p>{error}</p>
          {onRetry && <button type="button" onClick={onRetry} className="mt-3 rounded-full bg-pink px-4 py-2 text-[11px] shadow-btn">重试</button>}
        </div>
      ) : claim ? (
        <div className="space-y-5">
          <header>
            <div className="flex flex-wrap items-center gap-2 font-body text-[9px] text-ink-soft/55">
              <span className="rounded-full bg-lemon/35 px-2.5 py-1 text-ink">内容价值 {claim.content_value}</span>
              <span>可信度 {Math.round(claim.confidence * 100)}%</span>
              <span>{formatTranscriptTime(claim.start_seconds)}–{formatTranscriptTime(claim.end_seconds)}</span>
              {claim.status === 'stale' && <span className="rounded-full bg-pink/20 px-2.5 py-1 text-ink">待更新</span>}
            </div>
            <h2 className="mt-3 font-display text-[24px] font-medium leading-snug text-ink">{claim.claim}</h2>
            <div className="mt-3 flex flex-wrap gap-1.5">{claim.topic_tags.map((tag) => <span key={tag} className="rounded-full bg-lilac/25 px-2.5 py-1 font-body text-[9px] text-ink-soft">{tag}</span>)}</div>
          </header>

          <section className="rounded-2xl border border-card-border bg-white/60 p-4">
            <p className="font-body text-[9px] uppercase tracking-wider text-ink-soft/50">这条观点回答的问题</p>
            <p className="mt-2 font-display text-[15px] font-medium leading-relaxed text-ink">{claim.question}</p>
            <p className="mt-4 font-body text-[9px] uppercase tracking-wider text-ink-soft/50">论证与理由</p>
            <p className="mt-2 whitespace-pre-wrap font-body text-[13px] leading-[1.8] text-ink-soft">{claim.reasoning || '原发言没有单独展开理由，建议结合下方证据核验语境。'}</p>
          </section>

          <section className="rounded-2xl border border-lemon/40 bg-lemon/10 p-4">
            <div className="flex items-center gap-2"><Quotes aria-hidden="true" size={18} /><h3 className="font-display italic text-[14px] font-medium text-ink">证据摘录</h3></div>
            <blockquote className="mt-3 whitespace-pre-wrap font-body text-[13px] leading-[1.85] text-ink-soft">“{claim.evidence_excerpt}”</blockquote>
            <button type="button" disabled={isWorking} onClick={() => void run(() => onOpenEvidence(claim))} className="mt-4 inline-flex items-center gap-1 rounded-xl bg-lemon px-4 py-2.5 font-body text-[11px] font-medium text-ink shadow-btn transition-ui hover:-translate-y-px hover:brightness-105 disabled:opacity-40">
              打开对应逐字稿片段 <ArrowSquareOut aria-hidden="true" size={14} />
            </button>
          </section>

          <section>
            <label htmlFor={`claim-note-${claim.id}`} className="font-display italic text-[14px] font-medium text-ink-soft">我的笔记</label>
            <textarea id={`claim-note-${claim.id}`} value={noteDraft} onChange={(event) => setNoteState({ claimId: claim.id, draft: event.target.value })} rows={4} placeholder="记录你认同、质疑或准备如何使用这条观点" className="mt-2 w-full resize-y rounded-xl border border-card-border bg-white/70 px-3.5 py-3 font-body text-[12px] leading-relaxed text-ink outline-none transition-colors focus:border-ink/20" />
            <button type="button" disabled={isWorking || noteDraft === claim.user_note} onClick={() => void run(async () => { await onUpdate(claim.id, { userNote: noteDraft }); })} className="mt-2 rounded-xl bg-sage px-4 py-2 font-body text-[10px] text-ink shadow-btn disabled:opacity-40">保存笔记</button>
          </section>

          {claim.source_url && <a href={claim.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-body text-[10px] text-ink-soft underline decoration-card-border underline-offset-4 hover:text-ink">查看播客来源 <ArrowSquareOut aria-hidden="true" size={12} /></a>}
          {(error || actionError) && <p className="animate-shake rounded-xl border border-pink/30 bg-pink/10 p-3 font-body text-[11px] text-ink">{actionError || error}</p>}

          <footer className="flex flex-wrap items-center gap-2 border-t border-card-border pt-4">
            <button type="button" disabled={isWorking} onClick={() => void run(async () => { await onUpdate(claim.id, { isStarred: !claim.is_starred }); })} className="inline-flex items-center gap-1 rounded-xl bg-lilac px-3.5 py-2 font-body text-[10px] text-ink shadow-btn disabled:opacity-40"><BookmarkSimple aria-hidden="true" size={13} weight={claim.is_starred ? 'fill' : 'regular'} />{claim.is_starred ? '取消收藏' : '收藏观点'}</button>
            {onAddToProject && <button type="button" disabled={isWorking} onClick={() => void run(() => onAddToProject(claim.id))} className="rounded-xl bg-sage px-3.5 py-2 font-body text-[10px] text-ink shadow-btn disabled:opacity-40">加入「{projectTitle}」</button>}
            {!isConfirmingDelete ? <button type="button" disabled={isWorking} onClick={() => setIsConfirmingDelete(true)} className="ml-auto font-body text-[10px] text-pink hover:text-ink disabled:opacity-40">删除观点</button> : <div className="ml-auto flex items-center gap-2" role="group" aria-label="确认删除观点"><span className="font-body text-[10px] text-ink-soft">确定永久删除？</span><button type="button" disabled={isWorking} onClick={() => void run(async () => { await onDelete(claim.id); onClose(); })} className="rounded-full bg-pink px-3 py-1.5 font-body text-[10px] text-ink shadow-btn disabled:opacity-40">确认删除</button><button type="button" disabled={isWorking} onClick={() => setIsConfirmingDelete(false)} className="font-body text-[10px] text-ink-soft hover:text-ink">取消</button></div>}
          </footer>
        </div>
      ) : null}
    </ModalShell>
  );
};

export default ClaimDetailModal;
