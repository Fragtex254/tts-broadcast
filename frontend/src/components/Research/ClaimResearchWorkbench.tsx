import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import useStore from '../../store';
import type { TranscriptClaim } from '../../store';
import { TranscriptConversationModal } from '../Transcribe/TranscriptConversationModal';
import { ClaimDetailModal } from './ClaimDetailModal';
import { CompactClaimCard } from './CompactClaimCard';
import { ContentProjectWorkspace } from './ContentProjectWorkspace';

const RELATION_LABELS = { support: '相互支持', oppose: '相互反对', complement: '相互补充', different_scope: '条件不同', similar_example: '相似案例', unrelated: '实际无关' } as const;

export const ClaimResearchWorkbench: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const results = useStore((state) => state.claimSearchResults);
  const isSearching = useStore((state) => state.isSearchingClaims);
  const searchClaims = useStore((state) => state.searchClaims);
  const claimDetail = useStore((state) => state.claimDetail);
  const isLoadingClaimDetail = useStore((state) => state.isLoadingClaimDetail);
  const fetchClaimDetail = useStore((state) => state.fetchClaimDetail);
  const clearClaimDetail = useStore((state) => state.clearClaimDetail);
  const updateClaimDetail = useStore((state) => state.updateClaimDetail);
  const deleteClaimDetail = useStore((state) => state.deleteClaimDetail);
  const transcriptDetail = useStore((state) => state.transcriptDetail);
  const fetchTranscriptDetail = useStore((state) => state.fetchTranscriptDetail);
  const correctTranscriptTurn = useStore((state) => state.correctTranscriptTurn);
  const analysis = useStore((state) => state.claimRelationAnalysis);
  const isAnalyzing = useStore((state) => state.isAnalyzingRelations);
  const analyzeRelations = useStore((state) => state.analyzeClaimRelations);
  const projects = useStore((state) => state.contentProjects);
  const currentProject = useStore((state) => state.currentContentProject);
  const fetchProjects = useStore((state) => state.fetchContentProjects);
  const fetchProject = useStore((state) => state.fetchContentProject);
  const createProject = useStore((state) => state.createContentProject);
  const addClaim = useStore((state) => state.addClaimToContentProject);
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [newProjectPlatform, setNewProjectPlatform] = useState<'general' | 'xiaohongshu' | 'wechat' | 'twitter'>('general');
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<{ claimId: number; message: string } | null>(null);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const claimOpenedFromListRef = useRef(false);
  const evidenceOpenedFromDetailRef = useRef(false);
  const hasClaimParam = searchParams.has('claim');
  const isEvidenceMode = searchParams.get('evidence') === '1';
  const requestedClaimId = Number(searchParams.get('claim'));
  const claimId = Number.isInteger(requestedClaimId) && requestedClaimId > 0 ? requestedClaimId : null;
  const detailErrorMessage = detailError?.claimId === claimId ? detailError.message : null;
  const selectedClaim = claimDetail?.id === claimId ? claimDetail : null;
  const evidenceTranscript = selectedClaim && transcriptDetail?.record.id === selectedClaim.transcription_id ? transcriptDetail : null;

  useEffect(() => { void fetchProjects().catch(() => undefined); }, [fetchProjects]);

  useEffect(() => {
    if (claimId === null) {
      clearClaimDetail();
      return;
    }
    let isCurrent = true;
    void fetchClaimDetail(claimId)
      .then(() => {
        if (isCurrent) setDetailError((current) => current?.claimId === claimId ? null : current);
      })
      .catch((loadError) => {
        if (isCurrent) setDetailError({ claimId, message: loadError instanceof Error ? loadError.message : '获取观点详情失败' });
      });
    return () => { isCurrent = false; };
  }, [claimId, clearClaimDetail, fetchClaimDetail]);

  useEffect(() => {
    if (!isEvidenceMode || !selectedClaim || evidenceTranscript) return undefined;
    let isCurrent = true;
    void fetchTranscriptDetail(selectedClaim.transcription_id)
      .then(() => { if (isCurrent) setEvidenceError(null); })
      .catch((loadError) => { if (isCurrent) setEvidenceError(loadError instanceof Error ? loadError.message : '获取逐字稿证据失败'); });
    return () => { isCurrent = false; };
  }, [evidenceTranscript, fetchTranscriptDetail, isEvidenceMode, selectedClaim]);

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try { await action(); } catch (actionError) { setError(actionError instanceof Error ? actionError.message : '操作失败'); }
  };

  const toggle = (id: number) => setSelectedIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else if (next.size < 10) next.add(id);
    return next;
  });

  const openClaim = useCallback((claim: TranscriptClaim) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'research');
    next.set('claim', String(claim.id));
    next.delete('evidence');
    claimOpenedFromListRef.current = true;
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  const closeClaim = useCallback(() => {
    if (claimOpenedFromListRef.current) {
      claimOpenedFromListRef.current = false;
      navigate(-1);
      clearClaimDetail();
      setDetailError(null);
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.delete('claim');
    next.delete('evidence');
    setSearchParams(next, { replace: true });
    clearClaimDetail();
    setDetailError(null);
  }, [clearClaimDetail, navigate, searchParams, setSearchParams]);

  const openEvidence = useCallback(async (claim: TranscriptClaim) => {
    setEvidenceError(null);
    if (transcriptDetail?.record.id !== claim.transcription_id) await fetchTranscriptDetail(claim.transcription_id);
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'research');
    next.set('claim', String(claim.id));
    next.set('evidence', '1');
    evidenceOpenedFromDetailRef.current = true;
    setSearchParams(next);
  }, [fetchTranscriptDetail, searchParams, setSearchParams, transcriptDetail?.record.id]);

  const closeEvidence = useCallback(() => {
    if (evidenceOpenedFromDetailRef.current) {
      evidenceOpenedFromDetailRef.current = false;
      navigate(-1);
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.delete('evidence');
    setSearchParams(next, { replace: true });
  }, [navigate, searchParams, setSearchParams]);

  return <div className="space-y-4">
    <section className="rounded-card border border-card-border bg-white/80 p-5 shadow-card">
      <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-lilac" /><h2 className="font-display italic text-[14px] font-medium text-ink-soft">跨播客观点搜索</h2></div>
      <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); if (query.trim()) void run(() => searchClaims(query.trim())); }}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例如：AI 会不会减少程序员岗位？" className="min-w-0 flex-1 rounded-xl border border-card-border bg-white/70 px-4 py-3 font-body text-[12px] text-ink outline-none focus:border-ink/20" />
        <button type="submit" disabled={isSearching || !query.trim()} className="rounded-full bg-lemon px-6 py-2.5 font-body text-[11px] font-medium text-ink shadow-btn disabled:opacity-40">{isSearching ? '搜索中…' : '搜索观点'}</button>
      </form>
      {error && <p className="mt-3 animate-shake rounded-xl bg-pink/10 p-3 font-body text-[11px] text-ink">{error}</p>}
    </section>

    {results.length > 0 && <section className="rounded-card border border-card-border bg-white/80 p-5 shadow-card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-display italic text-[14px] font-medium text-ink-soft">相关观点</h2><p className="mt-1 font-body text-[10px] text-ink-soft/55">先扫读核心结论；选择 2–10 条候选后分析关系</p></div>
        <button type="button" disabled={selectedIds.size < 2 || isAnalyzing} onClick={() => void run(() => analyzeRelations([...selectedIds]))} className="rounded-xl bg-lilac px-4 py-2.5 font-body text-[11px] text-ink shadow-btn disabled:opacity-40">{isAnalyzing ? '分析中…' : `分析关系（${selectedIds.size}）`}</button>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">{results.map(({ claim, similarity, search_mode }, index) => (
        <CompactClaimCard
          key={claim.id}
          claim={claim}
          contextLabel={`${search_mode === 'embedding' ? '语义' : '关键词'}相似度 ${(similarity * 100).toFixed(0)}% · ${claim.podcast_name || '未填写播客'} · ${claim.speaker_name || claim.speaker_key}`}
          isSelected={selectedIds.has(claim.id)}
          onSelectionChange={toggle}
          onOpen={openClaim}
          animationDelay={index * 0.04}
        />
      ))}</div>
    </section>}

    {analysis && <section className="rounded-card border border-card-border bg-white/80 p-5 shadow-card">
      <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-pink" /><h2 className="font-display italic text-[14px] font-medium text-ink-soft">关系判断</h2></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{analysis.relations.map((relation) => <article key={relation.id} className="rounded-2xl border border-card-border bg-white/60 p-4"><span className="rounded-full bg-pink/15 px-2.5 py-1 font-body text-[9px] text-ink">{RELATION_LABELS[relation.relation_type]}</span><p className="mt-2 font-body text-[11px] leading-relaxed text-ink-soft">{relation.explanation}</p></article>)}</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{Object.entries({ '主要共识': analysis.synthesis.consensus, '主要分歧': analysis.synthesis.disagreements, '条件不同': analysis.synthesis.different_conditions, '值得实践': analysis.synthesis.practical_suggestions, '尚未回答': analysis.synthesis.open_questions }).map(([label, items]) => <div key={label} className="rounded-xl bg-paper/60 p-3"><h3 className="font-display text-[12px] text-ink">{label}</h3>{items.map((item) => <p key={item} className="mt-2 font-body text-[10px] text-ink-soft">· {item}</p>)}</div>)}</div>
    </section>}

    <section className="rounded-card border border-card-border bg-white/80 p-5 shadow-card">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-56 flex-1 font-body text-[10px] text-ink-soft">当前内容项目<select value={currentProject?.id || ''} onChange={(event) => { const id = Number(event.target.value); if (id) void run(() => fetchProject(id)); }} className="mt-1 w-full rounded-full border border-card-border bg-white/70 px-3 py-2.5 font-body text-[11px] text-ink"><option value="">选择项目</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}（{project.claim_count ?? project.claims.length}）</option>)}</select></label>
        <input value={newProjectTitle} onChange={(event) => setNewProjectTitle(event.target.value)} placeholder="新项目标题" className="rounded-xl border border-card-border bg-white/70 px-3.5 py-2.5 font-body text-[11px] text-ink outline-none" />
        <select aria-label="目标平台" value={newProjectPlatform} onChange={(event) => setNewProjectPlatform(event.target.value === 'xiaohongshu' || event.target.value === 'wechat' || event.target.value === 'twitter' ? event.target.value : 'general')} className="rounded-full border border-card-border bg-white/70 px-3 py-2.5 font-body text-[10px] text-ink"><option value="general">通用</option><option value="xiaohongshu">小红书</option><option value="wechat">公众号</option><option value="twitter">Twitter</option></select>
        <button type="button" disabled={!newProjectTitle.trim()} onClick={() => void run(async () => { await createProject({ title: newProjectTitle.trim(), topic: query.trim(), targetPlatform: newProjectPlatform }); setNewProjectTitle(''); })} className="rounded-full bg-sage px-4 py-2.5 font-body text-[10px] text-ink shadow-btn disabled:opacity-40">创建项目</button>
      </div>
    </section>
    <ContentProjectWorkspace key={currentProject?.id || 0} project={currentProject} />

    <ClaimDetailModal
      key={selectedClaim ? `claim-${selectedClaim.id}` : `loading-${searchParams.get('claim') || 'invalid'}`}
      isOpen={hasClaimParam && (!isEvidenceMode || evidenceTranscript === null)}
      claim={selectedClaim}
      isLoading={isLoadingClaimDetail || (claimId !== null && !selectedClaim && !detailErrorMessage)}
      error={claimId === null && hasClaimParam ? '观点链接无效' : detailErrorMessage || evidenceError}
      projectTitle={currentProject?.title}
      onClose={closeClaim}
      onRetry={claimId !== null ? () => {
        void fetchClaimDetail(claimId)
          .then(() => setDetailError((current) => current?.claimId === claimId ? null : current))
          .catch((loadError) => setDetailError({ claimId, message: loadError instanceof Error ? loadError.message : '获取观点详情失败' }));
      } : undefined}
      onUpdate={updateClaimDetail}
      onDelete={async (selectedClaimId) => {
        await deleteClaimDetail(selectedClaimId);
        await fetchProjects().catch(() => undefined);
        setSelectedIds((current) => {
          const next = new Set(current);
          next.delete(selectedClaimId);
          return next;
        });
      }}
      onOpenEvidence={openEvidence}
      onAddToProject={currentProject ? async (selectedClaimId) => { await addClaim(currentProject.id, selectedClaimId); } : undefined}
    />
    {selectedClaim && evidenceTranscript && <TranscriptConversationModal
      key={`${evidenceTranscript.record.id}-${selectedClaim.evidence_start_index}-${selectedClaim.evidence_end_index}-${isEvidenceMode ? 'evidence' : 'closed'}`}
      isOpen={isEvidenceMode}
      title={evidenceTranscript.record.relative_path || evidenceTranscript.record.file_name}
      turns={evidenceTranscript.turns}
      speakers={evidenceTranscript.speakers}
      onClose={closeEvidence}
      onCorrect={async (turnId, correctedText) => { await correctTranscriptTurn(evidenceTranscript.record.id, turnId, correctedText); }}
      initialEvidenceSegmentIndex={selectedClaim.evidence_start_index}
      evidenceEndSegmentIndex={selectedClaim.evidence_end_index}
    />}
  </div>;
};

export default ClaimResearchWorkbench;
