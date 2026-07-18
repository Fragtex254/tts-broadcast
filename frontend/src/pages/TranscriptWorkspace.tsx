import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Header } from '../components/Layout/Header';
import { TranscriptSpeakerPanel } from '../components/Transcribe/TranscriptSpeakerPanel';
import { TranscriptSummaryPanel } from '../components/Transcribe/TranscriptSummaryPanel';
import { TranscriptConversationModal } from '../components/Transcribe/TranscriptConversationModal';
import { TranscriptTurnList } from '../components/Transcribe/TranscriptTurnList';
import { PodcastMetadataEditor } from '../components/Research/PodcastMetadataEditor';
import { ClaimDetailModal } from '../components/Research/ClaimDetailModal';
import { TranscriptClaimsPanel } from '../components/Research/TranscriptClaimsPanel';
import type { TranscriptClaim } from '../store';
import useStore from '../store';
import { StatusPill } from '../components/ui/StatusPill';

export const TranscriptWorkspace: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const transcriptionId = Number(params.id);
  const transcript = useStore((state) => state.transcriptDetail);
  const isLoading = useStore((state) => state.isLoadingTranscriptDetail);
  const isSummarizing = useStore((state) => state.isSummarizingTranscript);
  const summaryProgress = useStore((state) => state.transcriptSummaryProgress);
  const fetchDetail = useStore((state) => state.fetchTranscriptDetail);
  const renameSpeaker = useStore((state) => state.renameTranscriptSpeaker);
  const correctTurn = useStore((state) => state.correctTranscriptTurn);
  const summarize = useStore((state) => state.summarizeTranscript);
  const updateMetadata = useStore((state) => state.updateTranscriptMetadata);
  const analyzeClaims = useStore((state) => state.analyzeTranscriptClaims);
  const updateClaim = useStore((state) => state.updateTranscriptClaim);
  const deleteClaim = useStore((state) => state.deleteTranscriptClaim);
  const isAnalyzingClaims = useStore((state) => state.isAnalyzingClaims);
  const claimProgress = useStore((state) => state.transcriptClaimProgress);
  const [error, setError] = useState<string | null>(null);
  const [isConversationOpen, setIsConversationOpen] = useState(false);
  const claimOpenedFromListRef = useRef(false);
  const evidenceOpenedFromDetailRef = useRef(false);
  const hasClaimParam = searchParams.has('claim');
  const requestedClaimId = Number(searchParams.get('claim'));
  const claimId = Number.isInteger(requestedClaimId) && requestedClaimId > 0 ? requestedClaimId : null;
  const isEvidenceMode = searchParams.get('evidence') === '1';

  const load = useCallback(async () => {
    if (!Number.isInteger(transcriptionId) || transcriptionId <= 0) {
      setError('内容 ID 无效');
      return;
    }
    setError(null);
    try {
      await fetchDetail(transcriptionId);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '加载内容详情失败');
    }
  }, [fetchDetail, transcriptionId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const handleRename = async (speakerId: number, displayName: string) => {
    await renameSpeaker(transcriptionId, speakerId, displayName);
  };

  const handleSummarize = () => {
    setError(null);
    void summarize(transcriptionId).catch((summaryError) => {
      setError(summaryError instanceof Error ? summaryError.message : '无法开始总结');
    });
  };

  const handleCorrectTurn = async (turnId: number, correctedText: string) => {
    await correctTurn(transcriptionId, turnId, correctedText);
  };

  const currentTranscript = transcript?.record.id === transcriptionId ? transcript : null;
  const transcriptTitle = currentTranscript
    ? currentTranscript.record.episode_title.trim()
      || currentTranscript.record.relative_path
      || currentTranscript.record.file_name
    : '';
  const sourceLabel = currentTranscript
    ? currentTranscript.record.relative_path || currentTranscript.record.file_name
    : '';
  const selectedClaim = claimId === null ? null : currentTranscript?.claims.find((claim) => claim.id === claimId) || null;
  const shouldWarnSpeaker = currentTranscript
    && (currentTranscript.record.speaker_scope === 'mixed' || currentTranscript.record.diarization_conflicts > 0);
  const remoteSummaryActive = Boolean(currentTranscript
    && ['queued', 'running'].includes(currentTranscript.record.summary_status)
    && !isSummarizing);
  const summaryIsActive = isSummarizing || remoteSummaryActive;
  const summaryStatusLabel = currentTranscript?.record.summary_status === 'completed'
    ? '已总结'
    : currentTranscript?.record.summary_status === 'stale'
      ? '摘要待更新'
      : currentTranscript?.record.summary_status === 'failed'
        ? '总结失败'
        : summaryIsActive
          ? '总结中'
          : '待总结';
  const claimsStatusLabel = currentTranscript?.record.claims_status === 'completed'
    ? `${currentTranscript.claims.length} 条观点`
    : currentTranscript?.record.claims_status === 'stale'
      ? '观点待更新'
      : currentTranscript?.record.claims_status === 'failed'
        ? '观点分析失败'
        : currentTranscript && ['queued', 'running'].includes(currentTranscript.record.claims_status)
          ? '观点分析中'
          : '待分析观点';

  const updateQuery = (updates: { claim?: number | null; evidence?: boolean }, replace = false) => {
    const next = new URLSearchParams(searchParams);
    if (updates.claim === null) next.delete('claim');
    else if (updates.claim !== undefined) next.set('claim', String(updates.claim));
    if (updates.evidence === false) next.delete('evidence');
    else if (updates.evidence === true) next.set('evidence', '1');
    setSearchParams(next, { replace });
  };

  const openClaim = (claim: TranscriptClaim) => {
    claimOpenedFromListRef.current = true;
    updateQuery({ claim: claim.id, evidence: false });
  };
  const closeClaim = () => {
    if (claimOpenedFromListRef.current) {
      claimOpenedFromListRef.current = false;
      navigate(-1);
      return;
    }
    updateQuery({ claim: null, evidence: false }, true);
  };
  const openClaimEvidence = async (claim: TranscriptClaim) => {
    evidenceOpenedFromDetailRef.current = true;
    updateQuery({ claim: claim.id, evidence: true });
  };
  const closeConversation = () => {
    if (!isEvidenceMode) {
      setIsConversationOpen(false);
      return;
    }
    if (evidenceOpenedFromDetailRef.current) {
      evidenceOpenedFromDetailRef.current = false;
      navigate(-1);
      return;
    }
    updateQuery({ evidence: false }, true);
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <Header title="播客工作区" subtitle="从逐字稿中理解内容、校对事实并沉淀可复用观点" />
      <main className="flex-1 overflow-y-auto p-5 sm:p-6">
        <div className="mx-auto max-w-7xl space-y-5">
          <button type="button" onClick={() => navigate('/history?tab=transcriptions')} className="ui-pressable min-h-9 rounded-lg px-2 font-body text-[12px] text-ink-soft hover:bg-white/45 hover:text-ink">← 返回内容库</button>

          {isLoading && (
            <div className="space-y-4 animate-pulse">
              <div className="h-36 rounded-card border border-card-border bg-white/60" />
              <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]"><div className="h-64 rounded-card border border-card-border bg-white/60" /><div className="h-64 rounded-card border border-card-border bg-white/60" /></div>
            </div>
          )}

          {error && <div className="animate-shake rounded-xl border border-pink/30 bg-pink/10 p-3 font-body text-[12px] text-ink">{error}<button type="button" onClick={() => void load()} className="ml-3 underline">重试</button></div>}

          {!isLoading && currentTranscript && (
            <>
              <header className="border-b border-card-border px-1 pb-6 pt-1 sm:px-2">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 max-w-4xl">
                    <p className="font-body text-[11px] font-medium tracking-wide text-ink-soft/65">
                      {currentTranscript.record.podcast_name || '播客内容'} · 阅读工作区
                    </p>
                    <h1 className="mt-2 break-words font-display text-[23px] font-medium leading-[1.42] text-ink sm:text-[26px]" title={transcriptTitle}>
                      {transcriptTitle}
                    </h1>
                    {sourceLabel !== transcriptTitle && (
                      <p className="mt-2 break-words font-body text-[11px] leading-relaxed text-ink-soft/55">来源文件：{sourceLabel}</p>
                    )}
                    <p className="mt-3 font-body text-[12px] leading-relaxed text-ink-soft/75">
                      {currentTranscript.record.speaker_count} 位说话人 · {currentTranscript.segments.length} 个原始片段 · {currentTranscript.turns.length} 个阅读轮次
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2" aria-label="内容处理状态">
                    <StatusPill tone={currentTranscript.record.summary_status === 'completed' ? 'success' : currentTranscript.record.summary_status === 'failed' ? 'error' : summaryIsActive ? 'working' : 'queued'}>摘要 · {summaryStatusLabel}</StatusPill>
                    <StatusPill tone={currentTranscript.record.claims_status === 'completed' ? 'success' : currentTranscript.record.claims_status === 'failed' ? 'error' : ['queued', 'running'].includes(currentTranscript.record.claims_status) ? 'working' : 'queued'}>观点 · {claimsStatusLabel}</StatusPill>
                  </div>
                </div>
              </header>

              <nav aria-label="内容详情分区" className="sticky top-0 z-20 -mx-2 flex gap-1 overflow-x-auto border-y border-card-border bg-paper px-2 py-2 sm:mx-0 sm:rounded-xl sm:border">
                <a href="#summary" className="ui-pressable min-h-9 shrink-0 rounded-full px-3 py-2 font-body text-[11px] font-medium text-ink-soft hover:bg-white/70 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lilac">核心摘要</a>
                <a href="#metadata" className="ui-pressable min-h-9 shrink-0 rounded-full px-3 py-2 font-body text-[11px] font-medium text-ink-soft hover:bg-white/70 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lilac">资料与出处</a>
                <a href="#claims" className="ui-pressable min-h-9 shrink-0 rounded-full px-3 py-2 font-body text-[11px] font-medium text-ink-soft hover:bg-white/70 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lilac">主要观点</a>
                <a href="#speakers" className="ui-pressable min-h-9 shrink-0 rounded-full px-3 py-2 font-body text-[11px] font-medium text-ink-soft hover:bg-white/70 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lilac">说话人</a>
                <a href="#transcript" className="ui-pressable min-h-9 shrink-0 rounded-full px-3 py-2 font-body text-[11px] font-medium text-ink-soft hover:bg-white/70 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lilac">逐字稿</a>
              </nav>

              {shouldWarnSpeaker && (
                <div className="rounded-2xl border border-lemon/50 bg-lemon/15 p-4 font-body text-[12px] leading-relaxed text-ink-soft">
                  <strong className="text-ink">说话人已自动区分，建议确认。</strong> 当前结果包含 mixed scope 或 {currentTranscript.record.diarization_conflicts} 个跨块冲突；重命名只改变显示名称，不会改写原始 ASR 事实。
                </div>
              )}

              {remoteSummaryActive && (
                <div className="flex flex-col gap-2 rounded-2xl border border-lilac/45 bg-lilac/10 p-4 font-body text-[12px] text-ink-soft sm:flex-row sm:items-center sm:justify-between">
                  <span>总结任务正在后台运行。即使离开页面，服务端租约也会阻止重复执行。</span>
                  <button type="button" onClick={() => void load()} className="ui-pressable min-h-9 shrink-0 rounded-full bg-white/70 px-3 py-2 font-body text-[11px] text-ink hover:bg-white">刷新状态</button>
                </div>
              )}

              <TranscriptSummaryPanel transcript={currentTranscript} isSummarizing={summaryIsActive} progress={remoteSummaryActive ? { phase: 'queued', percent: 0, current: 0, total: 0, message: '后台总结仍在进行' } : summaryProgress} onSummarize={handleSummarize} />
              <PodcastMetadataEditor key={currentTranscript.record.id} record={currentTranscript.record} onSave={async (metadata) => { await updateMetadata(transcriptionId, metadata); }} />
              <div id="claims" className="scroll-mt-20"><TranscriptClaimsPanel
                  claims={currentTranscript.claims}
                  speakers={currentTranscript.speakers}
                  isAnalyzing={isAnalyzingClaims || ['queued', 'running'].includes(currentTranscript.record.claims_status)}
                  progress={claimProgress}
                  claimsStatus={currentTranscript.record.claims_status}
                  claimsError={currentTranscript.record.claims_error}
                  onAnalyze={() => void analyzeClaims(transcriptionId).catch((claimError) => setError(claimError instanceof Error ? claimError.message : '无法开始观点分析'))}
                  onOpenClaim={openClaim}
                  onUpdateClaim={updateClaim}
                /></div>
              <div id="speakers" className="scroll-mt-20"><TranscriptSpeakerPanel speakers={currentTranscript.speakers} onRename={handleRename} /></div>
              <div id="transcript" className="scroll-mt-20"><TranscriptTurnList title={transcriptTitle} turns={currentTranscript.turns} speakers={currentTranscript.speakers} onOpenConversation={() => setIsConversationOpen(true)} onCorrect={handleCorrectTurn} /></div>
              <ClaimDetailModal
                key={selectedClaim ? `claim-${selectedClaim.id}` : `missing-${searchParams.get('claim') || 'claim'}`}
                isOpen={hasClaimParam && (!isEvidenceMode || selectedClaim === null)}
                claim={selectedClaim}
                error={claimId === null
                  ? '观点链接无效，请关闭后重新选择。'
                  : !selectedClaim
                    ? '当前转录稿中找不到这条观点，它可能属于其他转录稿、已被重新分析或删除。'
                    : null}
                onClose={closeClaim}
                onUpdate={updateClaim}
                onDelete={async (selectedClaimId) => { await deleteClaim(selectedClaimId); }}
                onOpenEvidence={openClaimEvidence}
              />
              <TranscriptConversationModal
                key={`${currentTranscript.record.id}-${selectedClaim?.evidence_start_index ?? 'browse'}-${selectedClaim?.evidence_end_index ?? 'browse'}-${isEvidenceMode ? 'evidence' : 'closed'}`}
                isOpen={isConversationOpen || (isEvidenceMode && selectedClaim !== null)}
                title={transcriptTitle}
                turns={currentTranscript.turns}
                speakers={currentTranscript.speakers}
                onClose={closeConversation}
                onCorrect={handleCorrectTurn}
                initialEvidenceSegmentIndex={selectedClaim?.evidence_start_index ?? null}
                evidenceEndSegmentIndex={selectedClaim?.evidence_end_index ?? null}
              />
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default TranscriptWorkspace;
