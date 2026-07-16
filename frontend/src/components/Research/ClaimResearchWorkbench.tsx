import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import useStore from '../../store';
import type { TranscriptClaim } from '../../store';
import { ConfirmDialog } from '../ConfirmDialog';
import { TranscriptConversationModal } from '../Transcribe/TranscriptConversationModal';
import { ClaimDetailModal } from './ClaimDetailModal';
import { ContentProjectWorkspace } from './ContentProjectWorkspace';
import { ResearchCandidateShelf } from './ResearchCandidateShelf';
import { ResearchClaimPreview } from './ResearchClaimPreview';
import { ResearchProjectBar } from './ResearchProjectBar';

const RELATION_LABELS = { support: '相互支持', oppose: '相互反对', complement: '相互补充', different_scope: '条件不同', similar_example: '相似案例', unrelated: '实际无关' } as const;

export const ClaimResearchWorkbench: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const results = useStore((state) => state.claimSearchResults);
  const isSearching = useStore((state) => state.isSearchingClaims);
  const searchClaims = useStore((state) => state.searchClaims);
  const clearResearchContext = useStore((state) => state.clearResearchContext);
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
  const isLoadingProjects = useStore((state) => state.isLoadingContentProjects);
  const fetchProjects = useStore((state) => state.fetchContentProjects);
  const fetchProject = useStore((state) => state.fetchContentProject);
  const createProject = useStore((state) => state.createContentProject);
  const addClaim = useStore((state) => state.addClaimToContentProject);
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [previewClaimId, setPreviewClaimId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [isProjectDraftDirty, setIsProjectDraftDirty] = useState(false);
  const [pendingProjectId, setPendingProjectId] = useState<number | null>(null);
  const [detailError, setDetailError] = useState<{ claimId: number; message: string } | null>(null);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const claimOpenedFromListRef = useRef(false);
  const evidenceOpenedFromDetailRef = useRef(false);
  const previousProjectIdRef = useRef<number | null>(null);
  const projectSelectionSequenceRef = useRef(0);
  const hasClaimParam = searchParams.has('claim');
  const isEvidenceMode = searchParams.get('evidence') === '1';
  const requestedClaimId = Number(searchParams.get('claim'));
  const requestedProjectIdValue = Number(searchParams.get('project'));
  const requestedProjectId = Number.isInteger(requestedProjectIdValue) && requestedProjectIdValue > 0 ? requestedProjectIdValue : null;
  const invalidProjectLink = requestedProjectId !== null && projects.length > 0 && !projects.some((project) => project.id === requestedProjectId);
  const claimId = Number.isInteger(requestedClaimId) && requestedClaimId > 0 ? requestedClaimId : null;
  const detailErrorMessage = detailError?.claimId === claimId ? detailError.message : null;
  const selectedClaim = claimDetail?.id === claimId ? claimDetail : null;
  const evidenceTranscript = selectedClaim && transcriptDetail?.record.id === selectedClaim.transcription_id ? transcriptDetail : null;
  const previewClaim = useMemo(() => results.find((item) => item.claim.id === previewClaimId)?.claim || results[0]?.claim || null, [previewClaimId, results]);
  const projectClaimIds = useMemo(() => new Set(currentProject?.claims.map((item) => item.claim_id) || []), [currentProject]);

  useEffect(() => {
    let isCurrent = true;
    void fetchProjects().catch((loadError) => {
      if (isCurrent) setProjectError(loadError instanceof Error ? loadError.message : '获取内容项目失败');
    });
    return () => { isCurrent = false; };
  }, [fetchProjects]);

  useEffect(() => {
    if (requestedProjectId === null || currentProject?.id === requestedProjectId || projects.length === 0) return undefined;
    if (invalidProjectLink) return undefined;
    let isCurrent = true;
    void fetchProject(requestedProjectId)
      .then(() => { if (isCurrent) setProjectError(null); })
      .catch((loadError) => { if (isCurrent) setProjectError(loadError instanceof Error ? loadError.message : '获取内容项目失败'); });
    return () => { isCurrent = false; };
  }, [currentProject?.id, fetchProject, invalidProjectLink, projects.length, requestedProjectId]);

  useEffect(() => {
    if (!currentProject || previousProjectIdRef.current === currentProject.id) return;
    previousProjectIdRef.current = currentProject.id;
    clearResearchContext();
    setQuery(currentProject.topic || '');
    setPreviewClaimId(null);
    setSelectedIds(new Set());
  }, [clearResearchContext, currentProject]);

  useEffect(() => {
    if (claimId === null) {
      clearClaimDetail();
      return;
    }
    let isCurrent = true;
    void fetchClaimDetail(claimId)
      .then(() => { if (isCurrent) setDetailError((current) => current?.claimId === claimId ? null : current); })
      .catch((loadError) => { if (isCurrent) setDetailError({ claimId, message: loadError instanceof Error ? loadError.message : '获取观点详情失败' }); });
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
    try { await action(); }
    catch (actionError) { setError(actionError instanceof Error ? actionError.message : '操作失败'); }
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

  const submitSearch = async () => {
    if (!query.trim() || !currentProject || isSearching) return;
    setError(null);
    setSelectedIds(new Set());
    setPreviewClaimId(null);
    try {
      const found = await searchClaims(query.trim());
      setPreviewClaimId(found[0]?.claim.id || null);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : '搜索观点失败');
    }
  };

  const updateProjectParam = (projectId: number) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'research');
    next.set('project', String(projectId));
    next.delete('claim');
    next.delete('evidence');
    setSearchParams(next, { replace: true });
  };

  const selectProject = async (projectId: number) => {
    const requestSequence = ++projectSelectionSequenceRef.current;
    setProjectError(null);
    clearResearchContext();
    setSelectedIds(new Set());
    setPreviewClaimId(null);
    try {
      await fetchProject(projectId);
      if (requestSequence === projectSelectionSequenceRef.current) updateProjectParam(projectId);
    } catch (selectError) {
      if (requestSequence === projectSelectionSequenceRef.current) setProjectError(selectError instanceof Error ? selectError.message : '获取内容项目失败');
      throw selectError;
    }
  };

  const requestProjectSelection = async (projectId: number) => {
    if (currentProject && currentProject.id !== projectId && isProjectDraftDirty) {
      setPendingProjectId(projectId);
      return;
    }
    await selectProject(projectId);
  };

  const createAndSelectProject: typeof createProject = async (data) => {
    if (isProjectDraftDirty) throw new Error('当前项目有未保存内容，请先保存后再新建项目');
    const project = await createProject(data);
    clearResearchContext();
    setSelectedIds(new Set());
    setPreviewClaimId(null);
    updateProjectParam(project.id);
    return project;
  };

  const retryProjects = async () => {
    setProjectError(null);
    try { await fetchProjects(); }
    catch (loadError) {
      setProjectError(loadError instanceof Error ? loadError.message : '获取内容项目失败');
    }
  };

  return <div className="min-w-0 max-w-full space-y-4">
    <ResearchProjectBar
      projects={projects}
      currentProject={currentProject}
      isLoading={isLoadingProjects}
      loadError={invalidProjectLink ? '链接中的内容项目不存在' : projectError}
      onRetry={retryProjects}
      onSelect={requestProjectSelection}
      onCreate={createAndSelectProject}
    />

    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(340px,0.9fr)]">
      <section className="min-w-0 max-w-full overflow-hidden rounded-card border border-card-border bg-white/80 p-5 shadow-card" style={{ animation: 'fade-in-up 0.4s cubic-bezier(0.22,1,0.36,1) both' }}>
        <div className="flex items-center gap-2">
          <MagnifyingGlass aria-hidden="true" size={19} className="text-ink-soft" />
          <h2 className="font-display text-[16px] font-medium text-ink">研究候选</h2>
          <span className="font-body text-[11px] text-ink-soft/50">跨播客搜索观点与证据</span>
        </div>

        <form className="mt-5 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void submitSearch(); }}>
          <label className="relative min-w-0 flex-1">
            <MagnifyingGlass aria-hidden="true" size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft/45" />
            <input
              value={query}
              disabled={!currentProject}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={currentProject ? '搜索关键词或问题，例如：AI 编程、生产力、岗位影响…' : '选择项目后开始跨播客搜索'}
              className="w-full rounded-full border border-card-border bg-white/70 py-3 pl-11 pr-4 font-body text-[12px] text-ink outline-none focus:border-ink/20 disabled:opacity-45"
            />
          </label>
          <button type="submit" disabled={!currentProject || isSearching || !query.trim()} className="rounded-full bg-lemon px-6 py-2.5 font-body text-[12px] font-medium text-ink shadow-btn transition-all duration-150 hover:-translate-y-px hover:brightness-105 disabled:opacity-40">{isSearching ? '搜索中…' : '搜索观点'}</button>
        </form>

        {error && <p role="alert" className="mt-3 animate-shake rounded-xl bg-pink/10 p-3 font-body text-[11px] text-ink">{error}</p>}

        {isSearching && <div role="status" aria-label="正在搜索观点" className="mt-5 flex gap-3 overflow-hidden">{[1, 2, 3].map((item) => <div key={item} className="h-[228px] w-[278px] shrink-0 animate-pulse rounded-2xl bg-ink/5" />)}</div>}

        {!isSearching && results.length > 0 && <ResearchCandidateShelf
          results={results}
          activeClaimId={previewClaim?.id || null}
          selectedIds={selectedIds}
          projectClaimIds={projectClaimIds}
          hasProject={Boolean(currentProject)}
          onPreview={(claim) => setPreviewClaimId(claim.id)}
          onToggleSelection={toggle}
          onAddToProject={async (selectedClaimId) => {
            if (!currentProject) throw new Error('请先选择项目');
            await addClaim(currentProject.id, selectedClaimId);
          }}
        />}

        {!isSearching && currentProject && results.length === 0 && <div className="mt-5 rounded-2xl border border-card-border bg-paper/35 p-8 text-center">
          <p className="font-display text-[15px] text-ink-soft/55">围绕项目问题搜索观点</p>
          <p className="mt-1 font-body text-[11px] text-ink-soft/40">搜索结果会在有限区域内横向排列，不再把项目推到页面底部。</p>
        </div>}

        {!isSearching && results.length > 0 && <ResearchClaimPreview claim={previewClaim} onOpenDetail={openClaim} onOpenEvidence={openEvidence} />}

        {results.length > 0 && <section className="mt-4 rounded-2xl border border-card-border bg-paper/35 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="font-display text-[13px] font-medium text-ink">比较候选观点</h3><p className="mt-1 font-body text-[10px] text-ink-soft/50">勾选 2–10 条观点，判断共识、分歧和补充关系</p></div>
            <button type="button" disabled={selectedIds.size < 2 || isAnalyzing} onClick={() => void run(() => analyzeRelations([...selectedIds]))} className="rounded-xl bg-lilac px-4 py-2.5 font-body text-[11px] text-ink shadow-btn disabled:opacity-40">{isAnalyzing ? '分析中…' : `分析关系（${selectedIds.size}）`}</button>
          </div>
          {analysis && <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {analysis.relations.map((relation) => <article key={relation.id} className="rounded-xl bg-white/65 p-3"><span className="rounded-full bg-pink/15 px-2.5 py-1 font-body text-[9px] text-ink">{RELATION_LABELS[relation.relation_type]}</span><p className="mt-2 font-body text-[11px] leading-relaxed text-ink-soft">{relation.explanation}</p></article>)}
          </div>}
          {analysis && <details className="mt-3 rounded-xl border border-card-border bg-white/55 p-3">
            <summary className="cursor-pointer font-body text-[11px] font-medium text-ink-soft">查看综合判断</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {Object.entries({ '主要共识': analysis.synthesis.consensus, '主要分歧': analysis.synthesis.disagreements, '条件不同': analysis.synthesis.different_conditions, '值得实践': analysis.synthesis.practical_suggestions, '尚未回答': analysis.synthesis.open_questions }).map(([label, items]) => <div key={label} className="rounded-xl bg-paper/45 p-3"><h4 className="font-display text-[12px] font-medium text-ink">{label}</h4>{items.length === 0 ? <p className="mt-2 font-body text-[10px] text-ink-soft/40">暂无</p> : items.map((item) => <p key={item} className="mt-2 font-body text-[10px] leading-relaxed text-ink-soft">· {item}</p>)}</div>)}
            </div>
          </details>}
        </section>}
      </section>

      <ContentProjectWorkspace key={currentProject?.id || 0} project={currentProject} onOpenClaim={openClaim} onDirtyChange={setIsProjectDraftDirty} />
    </div>

    <ConfirmDialog
      isOpen={pendingProjectId !== null}
      title="切换内容项目？"
      message="当前项目有尚未保存的研究问题或判断。"
      warningMessage="继续切换会放弃这些未保存内容。"
      confirmText="放弃并切换"
      onCancel={() => setPendingProjectId(null)}
      onConfirm={() => {
        const projectId = pendingProjectId;
        setPendingProjectId(null);
        setIsProjectDraftDirty(false);
        if (projectId !== null) void selectProject(projectId);
      }}
    />

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
