import React, { useState } from 'react';
import { CaretDown, CaretUp, CheckCircle, Export, NotePencil, X } from '@phosphor-icons/react';
import useStore, { type ContentProject, type TranscriptClaim } from '../../store';
import { ModalShell } from '../ModalShell';
import { ActionButton } from '../UI';
import { compactResearchText } from './researchViewModel';

interface ContentProjectWorkspaceProps {
  project: ContentProject | null;
  onOpenClaim?: (claim: TranscriptClaim) => void;
  onRequestCreate?: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
}

const PLATFORM_LABELS = { general: '通用', xiaohongshu: '小红书', wechat: '公众号', twitter: 'Twitter' } as const;

export const ContentProjectWorkspace: React.FC<ContentProjectWorkspaceProps> = ({ project, onOpenClaim, onRequestCreate, onDirtyChange }) => {
  const updateProject = useStore((state) => state.updateContentProject);
  const reorderClaims = useStore((state) => state.reorderContentProjectClaims);
  const removeClaim = useStore((state) => state.removeClaimFromContentProject);
  const addClaim = useStore((state) => state.addClaimToContentProject);
  const exportProject = useStore((state) => state.exportContentProject);
  const [draft, setDraft] = useState({
    topic: project?.topic || '',
    thesis: project?.thesis || '',
    personalPractice: project?.personal_practice || '',
    personalJudgment: project?.personal_judgment || '',
    discussionQuestion: project?.discussion_question || '',
  });
  const [markdown, setMarkdown] = useState('');
  const [usageNotes, setUsageNotes] = useState<Record<number, string>>(() => Object.fromEntries((project?.claims || []).map((item) => [item.claim_id, item.usage_note])));
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [mutatingClaimId, setMutatingClaimId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!project) return <aside className="order-first min-w-0 max-w-full rounded-card border border-card-border bg-white/80 p-8 text-center shadow-card lg:order-none lg:sticky lg:top-0">
    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sage/25 text-ink-soft"><NotePencil aria-hidden="true" size={24} weight="duotone" /></div>
    <h2 className="mt-4 font-display text-[17px] font-medium text-ink">先建立你的洞察项目</h2>
    <p className="mx-auto mt-2 max-w-xs font-body text-[12px] leading-relaxed text-ink-soft/60">明确要回答的问题后，再从多个播客中收集支持、反例与证据。</p>
    {onRequestCreate && <ActionButton variant="confirm" shape="pill" onClick={onRequestCreate} className="mt-5">新建内容项目</ActionButton>}
  </aside>;

  const save = async () => {
    setIsSaving(true);
    setError(null);
    try { await updateProject(project.id, draft); onDirtyChange?.(false); }
    catch (saveError) { setError(saveError instanceof Error ? saveError.message : '保存项目失败'); }
    finally { setIsSaving(false); }
  };

  const move = async (index: number, direction: -1 | 1) => {
    const next = [...project.claims];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setMutatingClaimId(project.claims[index].claim_id);
    setError(null);
    try { await reorderClaims(project.id, next.map((item) => item.claim_id)); }
    catch (moveError) { setError(moveError instanceof Error ? moveError.message : '调整观点顺序失败'); }
    finally { setMutatingClaimId(null); }
  };

  const remove = async (claimId: number) => {
    setMutatingClaimId(claimId);
    setError(null);
    try { await removeClaim(project.id, claimId); }
    catch (removeError) { setError(removeError instanceof Error ? removeError.message : '移出观点失败'); }
    finally { setMutatingClaimId(null); }
  };

  const saveUsageNote = async (claimId: number) => {
    setMutatingClaimId(claimId);
    setError(null);
    try { await addClaim(project.id, claimId, usageNotes[claimId] || ''); }
    catch (usageError) { setError(usageError instanceof Error ? usageError.message : '保存观点用途失败'); }
    finally { setMutatingClaimId(null); }
  };

  const openExport = async (platform: 'xiaohongshu' | 'wechat') => {
    setError(null);
    try {
      setMarkdown(await exportProject(project.id, platform));
      setIsExportOpen(true);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : '导出失败');
    }
  };

  const textareaClass = 'mt-1 w-full resize-none rounded-xl border border-card-border bg-white/70 px-3.5 py-2.5 font-body text-[12px] leading-relaxed text-ink outline-none focus:border-ink/20';
  const updateDraft = (field: keyof typeof draft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    onDirtyChange?.(true);
  };

  return <>
    <aside className="order-first min-w-0 max-w-full rounded-card border border-card-border bg-white/80 p-5 shadow-card lg:order-none lg:sticky lg:top-0">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-sage" />
        <h2 className="font-display text-[15px] font-medium text-ink-soft">我的洞察项目</h2>
      </div>
      <div className="mt-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-[22px] font-medium leading-tight text-ink">{project.title}</h3>
          <p className="mt-1 font-body text-[10px] text-ink-soft/55">{PLATFORM_LABELS[project.target_platform]} · {project.status === 'draft' ? '研究中' : project.status}</p>
        </div>
        <CheckCircle aria-hidden="true" size={22} className="shrink-0 text-ink-soft/45" />
      </div>

      {error && <p role="alert" className="mt-3 animate-shake rounded-xl bg-pink/10 p-3 font-body text-[11px] text-ink">{error}</p>}

      <label className="mt-5 block font-body text-[11px] font-medium text-ink-soft">
        研究问题
        <textarea rows={2} value={draft.topic} onChange={(event) => updateDraft('topic', event.target.value)} placeholder="这个项目要回答什么问题？" className={`${textareaClass} bg-lilac/10`} />
      </label>

      <div className="mt-4 flex items-center justify-between rounded-xl bg-paper/45 px-3 py-2.5 font-body text-[11px] text-ink-soft">
        <span>项目资料</span>
        <span className="rounded-full bg-lilac/25 px-2.5 py-1 text-[10px] text-ink">已收集 {project.claims.length} 条观点</span>
      </div>

      <div className="mt-5">
        <h4 className="font-body text-[11px] font-medium text-ink-soft">已选观点</h4>
        {project.claims.length === 0 ? <div className="mt-2 rounded-xl border border-dashed border-card-border p-5 text-center"><p className="font-body text-[11px] text-ink-soft/45">从左侧候选观点加入项目</p></div> : <ol className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-card-border bg-white/55">
          {project.claims.map((item, index) => <li key={item.id} className="border-b border-card-border p-3 last:border-b-0">
            <div className="flex items-start gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-lilac/20 font-display text-[10px] text-ink-soft">{index + 1}</span>
              <button type="button" onClick={() => onOpenClaim?.(item.claim)} className="min-w-0 flex-1 text-left">
                <span className="font-body text-[12px] font-medium leading-relaxed text-ink">{compactResearchText(item.claim.claim, 72)}</span>
                <span className="mt-1 block truncate font-body text-[9px] text-ink-soft/50">{item.claim.podcast_name || item.claim.episode_title || '未填写播客'} · {item.claim.speaker_name || item.claim.speaker_key}</span>
              </button>
              <span className="flex shrink-0 flex-col">
                <button title="上移" type="button" disabled={index === 0 || mutatingClaimId !== null} onClick={() => void move(index, -1)} className="rounded-full p-1 text-ink-soft disabled:opacity-20"><CaretUp aria-hidden="true" size={13} /></button>
                <button title="下移" type="button" disabled={index === project.claims.length - 1 || mutatingClaimId !== null} onClick={() => void move(index, 1)} className="rounded-full p-1 text-ink-soft disabled:opacity-20"><CaretDown aria-hidden="true" size={13} /></button>
                <button title="移出项目" type="button" disabled={mutatingClaimId !== null} onClick={() => void remove(item.claim_id)} className="rounded-full p-1 text-pink disabled:opacity-30"><X aria-hidden="true" size={13} /></button>
              </span>
            </div>
            <textarea
              aria-label={`观点用途：${item.claim.claim}`}
              rows={2}
              value={usageNotes[item.claim_id] || ''}
              onChange={(event) => setUsageNotes((current) => ({ ...current, [item.claim_id]: event.target.value }))}
              onBlur={() => void saveUsageNote(item.claim_id)}
              placeholder="这条观点准备用作论据、反例还是案例？"
              className="mt-2 w-full resize-none rounded-xl border border-card-border bg-paper/45 px-3 py-2 font-body text-[10px] leading-relaxed text-ink outline-none focus:border-ink/20"
            />
          </li>)}
        </ol>}
      </div>

      <label className="mt-5 block font-body text-[11px] font-medium text-ink-soft">
        我的判断
        <textarea rows={5} value={draft.personalJudgment} onChange={(event) => updateDraft('personalJudgment', event.target.value)} placeholder="结合这些观点和证据，写下你目前的判断…" className={textareaClass} />
      </label>

      <details className="mt-3 rounded-xl border border-card-border bg-paper/35 p-3">
        <summary className="cursor-pointer font-body text-[11px] text-ink-soft">补充内容结构</summary>
        <div className="mt-3 space-y-3">
          <label className="block font-body text-[10px] text-ink-soft">核心主张<textarea rows={2} value={draft.thesis} onChange={(event) => updateDraft('thesis', event.target.value)} className={textareaClass} /></label>
          <label className="block font-body text-[10px] text-ink-soft">个人实践<textarea rows={2} value={draft.personalPractice} onChange={(event) => updateDraft('personalPractice', event.target.value)} className={textareaClass} /></label>
          <label className="block font-body text-[10px] text-ink-soft">留给读者的问题<textarea rows={2} value={draft.discussionQuestion} onChange={(event) => updateDraft('discussionQuestion', event.target.value)} className={textareaClass} /></label>
        </div>
      </details>

      <ActionButton variant="confirm" shape="pill" size="lg" isLoading={isSaving} loadingLabel="保存中…" onClick={() => void save()} className="mt-4 w-full">保存项目判断</ActionButton>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <ActionButton variant="edit" size="xs" disabled={project.claims.length === 0} onClick={() => void openExport('xiaohongshu')}><Export aria-hidden="true" size={13} />小红书结构</ActionButton>
        <ActionButton variant="primary" size="xs" disabled={project.claims.length === 0} onClick={() => void openExport('wechat')}><Export aria-hidden="true" size={13} />公众号结构</ActionButton>
      </div>
    </aside>

    <ModalShell isOpen={isExportOpen} title="Markdown 导出" subtitle="复制后继续加入你的判断和表达" onClose={() => setIsExportOpen(false)} accent="sage" size="lg">
      <div className="space-y-3">
        <textarea readOnly value={markdown} rows={24} className="w-full resize-y rounded-xl border border-card-border bg-paper/60 p-4 font-mono text-[11px] leading-relaxed text-ink outline-none" />
        <ActionButton variant="confirm" shape="pill" size="sm" onClick={() => void navigator.clipboard.writeText(markdown)}>复制 Markdown</ActionButton>
      </div>
    </ModalShell>
  </>;
};

export default ContentProjectWorkspace;
