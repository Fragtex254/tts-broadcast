import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Header } from '../components/Layout/Header';
import { TranscriptSpeakerPanel } from '../components/Transcribe/TranscriptSpeakerPanel';
import { TranscriptSummaryPanel } from '../components/Transcribe/TranscriptSummaryPanel';
import { TranscriptConversationModal } from '../components/Transcribe/TranscriptConversationModal';
import { TranscriptTurnList } from '../components/Transcribe/TranscriptTurnList';
import { PodcastMetadataEditor } from '../components/Research/PodcastMetadataEditor';
import { TranscriptClaimsPanel } from '../components/Research/TranscriptClaimsPanel';
import useStore from '../store';

export const TranscriptWorkspace: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams();
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
  const [conversationEvidenceIndex, setConversationEvidenceIndex] = useState<number | null>(null);

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

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header title="内容详情" subtitle="阅读、校对并把长音频整理成可复用内容" />
      <main className="flex-1 overflow-y-auto p-5 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <button type="button" onClick={() => navigate('/history?tab=transcriptions')} className="font-body text-[12px] text-ink-soft transition-colors hover:text-ink">← 返回内容库</button>

          {isLoading && (
            <div className="space-y-4 animate-pulse">
              <div className="h-36 rounded-card border border-card-border bg-white/60" />
              <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]"><div className="h-64 rounded-card border border-card-border bg-white/60" /><div className="h-64 rounded-card border border-card-border bg-white/60" /></div>
            </div>
          )}

          {error && <div className="animate-shake rounded-xl border border-pink/30 bg-pink/10 p-3 font-body text-[12px] text-ink">{error}<button type="button" onClick={() => void load()} className="ml-3 underline">重试</button></div>}

          {!isLoading && currentTranscript && (
            <>
              <section className="rounded-card border border-card-border bg-white/80 p-5 shadow-card">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0"><p className="font-body text-[10px] uppercase tracking-wider text-ink-soft/55">播客整理</p><h1 className="mt-1 break-words font-display text-[26px] font-medium text-ink sm:truncate" title={currentTranscript.record.relative_path || currentTranscript.record.file_name}>{currentTranscript.record.relative_path || currentTranscript.record.file_name}</h1><p className="mt-2 font-body text-[11px] text-ink-soft/65">{currentTranscript.record.speaker_count} 位说话人 · {currentTranscript.segments.length} 个原始片段 · {currentTranscript.turns.length} 个阅读轮次</p></div>
                  <span className={`inline-flex rounded-full px-3 py-1.5 font-body text-[9px] font-medium uppercase tracking-wider text-ink ${currentTranscript.record.summary_status === 'completed' ? 'bg-sage/35' : currentTranscript.record.summary_status === 'failed' ? 'bg-pink/20' : 'bg-lemon/35'}`}>{summaryStatusLabel}</span>
                </div>
              </section>

              {shouldWarnSpeaker && (
                <div className="rounded-2xl border border-lemon/50 bg-lemon/15 p-4 font-body text-[12px] leading-relaxed text-ink-soft">
                  <strong className="text-ink">说话人已自动区分，建议确认。</strong> 当前结果包含 mixed scope 或 {currentTranscript.record.diarization_conflicts} 个跨块冲突；重命名只改变显示名称，不会改写原始 ASR 事实。
                </div>
              )}

              {remoteSummaryActive && (
                <div className="flex flex-col gap-2 rounded-2xl border border-lilac/45 bg-lilac/10 p-4 font-body text-[12px] text-ink-soft sm:flex-row sm:items-center sm:justify-between">
                  <span>总结任务正在后台运行。即使离开页面，服务端租约也会阻止重复执行。</span>
                  <button type="button" onClick={() => void load()} className="shrink-0 rounded-full bg-white/70 px-3 py-1.5 text-[10px] text-ink transition hover:bg-white">刷新状态</button>
                </div>
              )}

              <TranscriptSummaryPanel transcript={currentTranscript} isSummarizing={summaryIsActive} progress={remoteSummaryActive ? { phase: 'queued', percent: 0, current: 0, total: 0, message: '后台总结仍在进行' } : summaryProgress} onSummarize={handleSummarize} />
              <PodcastMetadataEditor key={currentTranscript.record.id} record={currentTranscript.record} onSave={async (metadata) => { await updateMetadata(transcriptionId, metadata); }} />
              <TranscriptClaimsPanel
                claims={currentTranscript.claims}
                speakers={currentTranscript.speakers}
                isAnalyzing={isAnalyzingClaims || ['queued', 'running'].includes(currentTranscript.record.claims_status)}
                progress={claimProgress}
                claimsStatus={currentTranscript.record.claims_status}
                claimsError={currentTranscript.record.claims_error}
                onAnalyze={() => void analyzeClaims(transcriptionId).catch((claimError) => setError(claimError instanceof Error ? claimError.message : '无法开始观点分析'))}
                onUpdate={async (claimId, update) => { await updateClaim(claimId, update); }}
                onDelete={deleteClaim}
                onLocate={(evidenceIndex) => { setConversationEvidenceIndex(evidenceIndex); setIsConversationOpen(true); }}
              />
              <div className="grid items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
                <TranscriptSpeakerPanel speakers={currentTranscript.speakers} onRename={handleRename} />
                <TranscriptTurnList turns={currentTranscript.turns} speakers={currentTranscript.speakers} onOpenConversation={() => { setConversationEvidenceIndex(null); setIsConversationOpen(true); }} onCorrect={handleCorrectTurn} />
              </div>
              <TranscriptConversationModal
                key={`${currentTranscript.record.id}-${conversationEvidenceIndex ?? 'browse'}`}
                isOpen={isConversationOpen}
                title={currentTranscript.record.relative_path || currentTranscript.record.file_name}
                turns={currentTranscript.turns}
                speakers={currentTranscript.speakers}
                onClose={() => setIsConversationOpen(false)}
                onCorrect={handleCorrectTurn}
                initialEvidenceSegmentIndex={conversationEvidenceIndex}
              />
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default TranscriptWorkspace;
