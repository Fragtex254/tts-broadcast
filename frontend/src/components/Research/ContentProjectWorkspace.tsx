import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CaretDown, CaretUp, Check, CheckCircle, Export, NotePencil, Warning, X } from '@phosphor-icons/react';
import useStore, { type ContentProject, type TranscriptClaim } from '../../store';
import { ModalShell } from '../ModalShell';
import {
  appendRelationToDraft,
  CLAIM_USAGE_TAGS,
  getCompletionChecks,
  parseUsageNote,
  PLATFORM_FIELD_COPY,
  projectToDraft,
  serializeUsageNote,
  type ClaimUsageTag,
  type ContentProjectDraft,
  type RelationDraftAppend,
} from './contentProjectDraft';
import { compactResearchText } from './researchViewModel';

export interface RelationAppendRequest {
  requestId: number;
  projectId: number;
  addition: RelationDraftAppend;
}

interface ContentProjectWorkspaceProps {
  project: ContentProject | null;
  relationAppendRequest?: RelationAppendRequest | null;
  onRelationAppendApplied?: (requestId: number) => void;
  onOpenClaim?: (claim: TranscriptClaim) => void;
  onRequestCreate?: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
}

interface UsageDraft {
  tag: ClaimUsageTag | null;
  note: string;
}

type SaveStatus = 'saving' | 'saved' | 'error';
type ExportPlatform = 'xiaohongshu' | 'wechat';

const EMPTY_DRAFT: ContentProjectDraft = { topic: '', thesis: '', personalPractice: '', personalJudgment: '', discussionQuestion: '' };
const PLATFORM_LABELS = { general: '通用', xiaohongshu: '小红书', wechat: '公众号', twitter: 'Twitter' } as const;

function usageDraftsFor(project: ContentProject | null): Record<number, UsageDraft> {
  return (project?.claims || []).reduce<Record<number, UsageDraft>>((result, item) => {
    result[item.claim_id] = parseUsageNote(item.usage_note);
    return result;
  }, {});
}

export const ContentProjectWorkspace: React.FC<ContentProjectWorkspaceProps> = ({
  project,
  relationAppendRequest,
  onRelationAppendApplied,
  onOpenClaim,
  onRequestCreate,
  onDirtyChange,
}) => {
  const updateProject = useStore((state) => state.updateContentProject);
  const reorderClaims = useStore((state) => state.reorderContentProjectClaims);
  const removeClaim = useStore((state) => state.removeClaimFromContentProject);
  const addClaim = useStore((state) => state.addClaimToContentProject);
  const exportProject = useStore((state) => state.exportContentProject);
  const initialDraft = project ? projectToDraft(project) : EMPTY_DRAFT;
  const [draft, setDraft] = useState<ContentProjectDraft>(initialDraft);
  const [usageDrafts, setUsageDrafts] = useState<Record<number, UsageDraft>>(() => usageDraftsFor(project));
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [markdown, setMarkdown] = useState('');
  const [pendingExportPlatform, setPendingExportPlatform] = useState<ExportPlatform | null>(null);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [mutatingClaimId, setMutatingClaimId] = useState<number | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const draftRef = useRef(initialDraft);
  const revisionRef = useRef(0);
  const savedRevisionRef = useRef(0);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSaveRef = useRef<{ revision: number; promise: Promise<boolean> } | null>(null);
  const isMountedRef = useRef(true);
  const processedRelationRequestRef = useRef<number | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, []);

  const saveDraft = useCallback((snapshot = draftRef.current, revision = revisionRef.current): Promise<boolean> => {
    if (!project) return Promise.resolve(false);
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    if (savedRevisionRef.current === revision && saveStatus === 'saved') return Promise.resolve(true);
    if (activeSaveRef.current?.revision === revision) return activeSaveRef.current.promise;

    const projectId = project.id;
    setSaveStatus('saving');
    setSaveError(null);
    const promise = updateProject(projectId, snapshot)
      .then(() => {
        if (isMountedRef.current && revision === revisionRef.current) {
          savedRevisionRef.current = revision;
          setSaveStatus('saved');
          setSaveError(null);
          onDirtyChange?.(false);
        }
        return true;
      })
      .catch((error: unknown) => {
        if (isMountedRef.current && revision === revisionRef.current) {
          setSaveStatus('error');
          setSaveError(error instanceof Error ? error.message : '保存项目失败');
          onDirtyChange?.(true);
        }
        return false;
      })
      .finally(() => {
        if (activeSaveRef.current?.promise === promise) activeSaveRef.current = null;
      });
    activeSaveRef.current = { revision, promise };
    return promise;
  }, [onDirtyChange, project, saveStatus, updateProject]);

  const updateDraft = useCallback((field: keyof ContentProjectDraft, value: string) => {
    const next = { ...draftRef.current, [field]: value };
    const revision = revisionRef.current + 1;
    draftRef.current = next;
    revisionRef.current = revision;
    setDraft(next);
    setSaveStatus('saving');
    setSaveError(null);
    onDirtyChange?.(true);
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => { void saveDraft(next, revision); }, 1000);
  }, [onDirtyChange, saveDraft]);

  useEffect(() => {
    if (!project || !relationAppendRequest || relationAppendRequest.projectId !== project.id) return;
    if (processedRelationRequestRef.current === relationAppendRequest.requestId) return;
    processedRelationRequestRef.current = relationAppendRequest.requestId;
    const next = appendRelationToDraft(draftRef.current, relationAppendRequest.addition);
    const revision = revisionRef.current + 1;
    draftRef.current = next;
    revisionRef.current = revision;
    setDraft(next);
    setSaveStatus('saving');
    onDirtyChange?.(true);
    void saveDraft(next, revision).finally(() => onRelationAppendApplied?.(relationAppendRequest.requestId));
  }, [onDirtyChange, onRelationAppendApplied, project, relationAppendRequest, saveDraft]);

  const move = async (index: number, direction: -1 | 1) => {
    if (!project) return;
    const next = [...project.claims];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setMutatingClaimId(project.claims[index].claim_id);
    setClaimError(null);
    try { await reorderClaims(project.id, next.map((item) => item.claim_id)); }
    catch (error) { setClaimError(error instanceof Error ? error.message : '调整观点顺序失败'); }
    finally { setMutatingClaimId(null); }
  };

  const remove = async (claimId: number) => {
    if (!project) return;
    setMutatingClaimId(claimId);
    setClaimError(null);
    try {
      await removeClaim(project.id, claimId);
      setUsageDrafts((current) => {
        const next = { ...current };
        delete next[claimId];
        return next;
      });
    }
    catch (error) { setClaimError(error instanceof Error ? error.message : '移出观点失败'); }
    finally { setMutatingClaimId(null); }
  };

  const saveUsage = async (claimId: number, nextUsage?: UsageDraft) => {
    if (!project) return;
    const usage = nextUsage || usageDrafts[claimId] || { tag: null, note: '' };
    setMutatingClaimId(claimId);
    setClaimError(null);
    try { await addClaim(project.id, claimId, serializeUsageNote(usage.tag, usage.note)); }
    catch (error) { setClaimError(error instanceof Error ? error.message : '保存观点用途失败'); }
    finally { setMutatingClaimId(null); }
  };

  const chooseUsageTag = (claimId: number, tag: ClaimUsageTag) => {
    const nextUsage = { ...(usageDrafts[claimId] || { note: '' }), tag };
    setUsageDrafts((current) => ({ ...current, [claimId]: nextUsage }));
    void saveUsage(claimId, nextUsage);
  };

  const continueExport = async () => {
    if (!project || !pendingExportPlatform) return;
    setIsExporting(true);
    setSaveError(null);
    const saved = await saveDraft();
    if (!saved) {
      setIsExporting(false);
      return;
    }
    try {
      setMarkdown(await exportProject(project.id, pendingExportPlatform));
      setPendingExportPlatform(null);
      setIsExportOpen(true);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '导出失败');
    } finally {
      setIsExporting(false);
    }
  };

  const completionChecks = useMemo(() => project ? getCompletionChecks(project, draft) : [], [draft, project]);

  if (!project) return <aside className="order-first min-w-0 max-w-full rounded-card border border-card-border bg-white/80 p-8 text-center shadow-card lg:order-none lg:sticky lg:top-0">
    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sage/25 text-ink-soft"><NotePencil aria-hidden="true" size={24} weight="duotone" /></div>
    <h2 className="mt-4 font-display text-[17px] font-medium text-ink">先建立你的洞察项目</h2>
    <p className="mx-auto mt-2 max-w-xs font-body text-[12px] leading-relaxed text-ink-soft/60">明确要回答的问题后，再从多个播客中收集支持、反例与证据。</p>
    {onRequestCreate && <button type="button" onClick={onRequestCreate} className="mt-5 rounded-full bg-sage px-5 py-2.5 font-body text-[12px] font-medium text-ink shadow-btn">新建内容项目</button>}
  </aside>;

  const fieldCopy = PLATFORM_FIELD_COPY[project.target_platform];
  const textareaClass = 'mt-1 w-full resize-none rounded-xl border border-card-border bg-white/70 px-3.5 py-2.5 font-body text-[12px] leading-relaxed text-ink outline-none focus:border-ink/20';

  return <>
    <aside className="order-first min-w-0 max-w-full rounded-card border border-card-border bg-white/80 p-5 shadow-card lg:order-none lg:sticky lg:top-0" style={{ animation: 'fade-in-up 0.4s cubic-bezier(0.22,1,0.36,1) 0.06s both' }}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-sage" /><h2 className="font-display text-[15px] font-medium text-ink-soft">我的洞察项目</h2></div>
        <div className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-body text-[9px] text-ink ${saveStatus === 'error' ? 'bg-pink/20' : saveStatus === 'saving' ? 'bg-lemon/35' : 'bg-sage/35'}`} role="status">
          {saveStatus === 'error' ? <Warning aria-hidden="true" size={11} /> : <Check aria-hidden="true" size={11} />}
          {saveStatus === 'error' ? '保存失败' : saveStatus === 'saving' ? '保存中…' : '已保存'}
        </div>
      </div>
      <div className="mt-4 flex items-start justify-between gap-3">
        <div className="min-w-0"><h3 className="font-display text-[22px] font-medium leading-tight text-ink">{project.title}</h3><p className="mt-1 font-body text-[10px] text-ink-soft/55">{PLATFORM_LABELS[project.target_platform]} · {project.status === 'draft' ? '研究中' : project.status}</p></div>
        <CheckCircle aria-hidden="true" size={22} className="shrink-0 text-ink-soft/45" />
      </div>

      {saveError && <div role="alert" className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-pink/10 p-3 font-body text-[11px] text-ink animate-shake"><span>{saveError}</span>{saveStatus === 'error' && <button type="button" onClick={() => void saveDraft()} className="shrink-0 rounded-full bg-pink px-3 py-1.5 font-medium shadow-btn">重试</button>}</div>}
      {claimError && <p role="alert" className="mt-3 animate-shake rounded-xl bg-pink/10 p-3 font-body text-[11px] text-ink">{claimError}</p>}

      <label className="mt-5 block font-body text-[11px] font-medium text-ink-soft">研究问题<textarea rows={2} value={draft.topic} onChange={(event) => updateDraft('topic', event.target.value)} onBlur={() => void saveDraft()} placeholder="这个项目要回答什么问题？" className={`${textareaClass} bg-lilac/10`} /></label>

      <div className="mt-4 rounded-xl bg-paper/45 px-3 py-3">
        <p className="font-body text-[10px] font-medium text-ink-soft">{PLATFORM_LABELS[project.target_platform]}内容重点</p>
        <div className="mt-2 flex flex-wrap gap-1.5">{fieldCopy.focus.map((item) => <span key={item} className="rounded-full bg-lilac/20 px-2.5 py-1 font-body text-[9px] text-ink-soft">{item}</span>)}</div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl bg-paper/45 px-3 py-2.5 font-body text-[11px] text-ink-soft"><span>项目资料</span><span className="rounded-full bg-lilac/25 px-2.5 py-1 text-[10px] text-ink">已收集 {project.claims.length} 条观点</span></div>

      <div className="mt-5">
        <h4 className="font-body text-[11px] font-medium text-ink-soft">已选观点</h4>
        {project.claims.length === 0 ? <div className="mt-2 rounded-xl border border-dashed border-card-border p-5 text-center"><p className="font-body text-[11px] text-ink-soft/45">从左侧候选观点加入项目</p></div> : <ol className="mt-2 max-h-80 overflow-y-auto rounded-xl border border-card-border bg-white/55">
          {project.claims.map((item, index) => {
            const usage = usageDrafts[item.claim_id] || { tag: null, note: '' };
            return <li key={item.id} className="border-b border-card-border p-3 last:border-b-0">
              <div className="flex items-start gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-lilac/20 font-display text-[10px] text-ink-soft">{index + 1}</span>
                <button type="button" onClick={() => onOpenClaim?.(item.claim)} className="min-w-0 flex-1 text-left"><span className="font-body text-[12px] font-medium leading-relaxed text-ink">{compactResearchText(item.claim.claim, 72)}</span><span className="mt-1 block truncate font-body text-[9px] text-ink-soft/50">{item.claim.podcast_name || item.claim.episode_title || '未填写播客'} · {item.claim.speaker_name || item.claim.speaker_key}</span></button>
                <span className="flex shrink-0 flex-col">
                  <button title="上移" type="button" disabled={index === 0 || mutatingClaimId !== null} onClick={() => void move(index, -1)} className="rounded-full p-1 text-ink-soft disabled:opacity-20"><CaretUp aria-hidden="true" size={13} /></button>
                  <button title="下移" type="button" disabled={index === project.claims.length - 1 || mutatingClaimId !== null} onClick={() => void move(index, 1)} className="rounded-full p-1 text-ink-soft disabled:opacity-20"><CaretDown aria-hidden="true" size={13} /></button>
                  <button title="移出项目" type="button" disabled={mutatingClaimId !== null} onClick={() => void remove(item.claim_id)} className="rounded-full p-1 text-pink disabled:opacity-30"><X aria-hidden="true" size={13} /></button>
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">{CLAIM_USAGE_TAGS.map((tag) => <button key={tag} type="button" disabled={mutatingClaimId !== null} onClick={() => chooseUsageTag(item.claim_id, tag)} className={`rounded-full px-2 py-1 font-body text-[9px] transition-colors disabled:opacity-40 ${usage.tag === tag ? 'bg-sage text-ink' : 'bg-paper text-ink-soft hover:bg-sage/25'}`}>{tag}</button>)}</div>
              <textarea aria-label={`观点用途备注：${item.claim.claim}`} rows={2} value={usage.note} onChange={(event) => setUsageDrafts((current) => ({ ...current, [item.claim_id]: { ...usage, note: event.target.value } }))} onBlur={() => void saveUsage(item.claim_id)} placeholder="补充自由文本备注（可选）" className="mt-2 w-full resize-none rounded-xl border border-card-border bg-paper/45 px-3 py-2 font-body text-[10px] leading-relaxed text-ink outline-none focus:border-ink/20" />
            </li>;
          })}
        </ol>}
      </div>

      <div className="mt-5 space-y-3">{fieldCopy.fields.map((field) => <label key={field.key} className="block font-body text-[11px] font-medium text-ink-soft">{field.label}<textarea rows={field.rows} value={draft[field.key]} onChange={(event) => updateDraft(field.key, event.target.value)} onBlur={() => void saveDraft()} placeholder={field.placeholder} className={textareaClass} /></label>)}</div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setPendingExportPlatform('xiaohongshu')} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-lilac px-3 py-2.5 font-body text-[10px] text-ink"><Export aria-hidden="true" size={13} />小红书结构</button>
        <button type="button" onClick={() => setPendingExportPlatform('wechat')} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-lemon px-3 py-2.5 font-body text-[10px] text-ink"><Export aria-hidden="true" size={13} />公众号结构</button>
      </div>
    </aside>

    <ModalShell isOpen={pendingExportPlatform !== null} title="导出前检查" subtitle="缺少内容也可以继续导出，稍后再补齐" onClose={() => setPendingExportPlatform(null)} accent="lemon" size="sm" footer={<><button type="button" onClick={() => setPendingExportPlatform(null)} className="text-ink-soft hover:text-ink font-body text-[12px]">返回补充</button><button type="button" disabled={isExporting} onClick={() => void continueExport()} className="rounded-full bg-lemon px-5 py-2 font-body text-[11px] font-medium text-ink shadow-btn disabled:opacity-40">{isExporting ? '导出中…' : '仍然继续导出'}</button></>}>
      <div className="space-y-3">
        {saveError && <p role="alert" className="animate-shake rounded-xl bg-pink/10 p-3 font-body text-[11px] text-ink">{saveError}，可再次点击继续导出重试。</p>}
        <ul className="space-y-2">{completionChecks.map((item) => <li key={item.key} className={`flex items-center gap-2 rounded-xl px-3 py-2.5 font-body text-[11px] text-ink ${item.isComplete ? 'bg-sage/20' : 'bg-pink/10'}`}>{item.isComplete ? <Check aria-hidden="true" size={14} /> : <Warning aria-hidden="true" size={14} />}<span>{item.label}</span></li>)}</ul>
      </div>
    </ModalShell>

    <ModalShell isOpen={isExportOpen} title="Markdown 导出" subtitle="复制后继续加入你的判断和表达" onClose={() => setIsExportOpen(false)} accent="sage" size="lg">
      <div className="space-y-3"><textarea readOnly value={markdown} rows={24} className="w-full resize-y rounded-xl border border-card-border bg-paper/60 p-4 font-mono text-[11px] leading-relaxed text-ink outline-none" /><button type="button" onClick={() => void navigator.clipboard.writeText(markdown)} className="rounded-full bg-sage px-5 py-2 font-body text-[11px] font-medium text-ink shadow-btn">复制 Markdown</button></div>
    </ModalShell>
  </>;
};

export default ContentProjectWorkspace;
