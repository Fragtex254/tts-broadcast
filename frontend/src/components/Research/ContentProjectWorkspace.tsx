import React, { useState } from 'react';
import useStore, { type ContentProject } from '../../store';
import { ModalShell } from '../ModalShell';

interface ContentProjectWorkspaceProps {
  project: ContentProject | null;
}

export const ContentProjectWorkspace: React.FC<ContentProjectWorkspaceProps> = ({ project }) => {
  const updateProject = useStore((state) => state.updateContentProject);
  const reorderClaims = useStore((state) => state.reorderContentProjectClaims);
  const removeClaim = useStore((state) => state.removeClaimFromContentProject);
  const addClaim = useStore((state) => state.addClaimToContentProject);
  const exportProject = useStore((state) => state.exportContentProject);
  const [draft, setDraft] = useState({ thesis: project?.thesis || '', personalPractice: project?.personal_practice || '', personalJudgment: project?.personal_judgment || '', discussionQuestion: project?.discussion_question || '' });
  const [usageNotes, setUsageNotes] = useState<Record<number, string>>(() => Object.fromEntries((project?.claims || []).map((item) => [item.claim_id, item.usage_note])));
  const [markdown, setMarkdown] = useState('');
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!project) return <section className="rounded-card border border-card-border bg-white/80 p-8 text-center shadow-card"><p className="font-display italic text-[16px] text-ink-soft/40">选择或创建内容项目</p><p className="mt-1 font-body text-[11px] text-ink-soft/35">把搜索到的观点组织成自己的内容结构</p></section>;

  const save = async () => {
    setIsSaving(true); setError(null);
    try { await updateProject(project.id, draft); }
    catch (saveError) { setError(saveError instanceof Error ? saveError.message : '保存项目失败'); }
    finally { setIsSaving(false); }
  };

  const move = async (index: number, direction: -1 | 1) => {
    const next = [...project.claims];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    await reorderClaims(project.id, next.map((item) => item.claim_id));
  };

  const openExport = async (platform: 'xiaohongshu' | 'wechat') => {
    setError(null);
    try { setMarkdown(await exportProject(project.id, platform)); setIsExportOpen(true); }
    catch (exportError) { setError(exportError instanceof Error ? exportError.message : '导出失败'); }
  };

  const textareaClass = 'w-full rounded-xl border border-card-border bg-white/70 px-3.5 py-2.5 font-body text-[11px] text-ink outline-none focus:border-ink/20';
  return <>
    <section className="rounded-card border border-card-border bg-white/80 p-5 shadow-card">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-sage" /><h2 className="font-display italic text-[14px] font-medium text-ink-soft">内容项目 · {project.title}</h2></div><p className="mt-1 font-body text-[10px] text-ink-soft/55">{project.claims.length} 条观点 · {project.target_platform}</p></div><div className="flex gap-2"><button type="button" onClick={() => void openExport('xiaohongshu')} className="rounded-xl bg-lilac px-3 py-2 font-body text-[10px] text-ink shadow-btn">导出小红书结构</button><button type="button" onClick={() => void openExport('wechat')} className="rounded-xl bg-sage px-3 py-2 font-body text-[10px] text-ink shadow-btn">导出公众号结构</button></div></div>
      {error && <p className="mb-3 animate-shake rounded-xl bg-pink/10 p-3 font-body text-[11px] text-ink">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2"><label className="font-body text-[10px] text-ink-soft">内容主张<textarea rows={3} className={`${textareaClass} mt-1`} value={draft.thesis} onChange={(event) => setDraft((value) => ({ ...value, thesis: event.target.value }))} /></label><label className="font-body text-[10px] text-ink-soft">个人实践<textarea rows={3} className={`${textareaClass} mt-1`} value={draft.personalPractice} onChange={(event) => setDraft((value) => ({ ...value, personalPractice: event.target.value }))} /></label><label className="font-body text-[10px] text-ink-soft">阶段性判断<textarea rows={3} className={`${textareaClass} mt-1`} value={draft.personalJudgment} onChange={(event) => setDraft((value) => ({ ...value, personalJudgment: event.target.value }))} /></label><label className="font-body text-[10px] text-ink-soft">准备问读者的问题<textarea rows={3} className={`${textareaClass} mt-1`} value={draft.discussionQuestion} onChange={(event) => setDraft((value) => ({ ...value, discussionQuestion: event.target.value }))} /></label></div>
      <button type="button" disabled={isSaving} onClick={() => void save()} className="mt-3 rounded-full bg-lemon px-5 py-2 font-body text-[11px] font-medium text-ink shadow-btn disabled:opacity-40">{isSaving ? '保存中…' : '保存项目判断'}</button>
      <div className="mt-5 space-y-2 border-t border-card-border pt-4">{project.claims.map((item, index) => <article key={item.id} className="rounded-2xl border border-card-border bg-white/60 p-4"><div className="flex items-start gap-3"><span className="font-display text-[18px] text-ink-soft/40">{String(index + 1).padStart(2, '0')}</span><div className="min-w-0 flex-1"><p className="font-body text-[10px] text-ink-soft/55">{item.claim.podcast_name || '未填写播客'} · {item.claim.episode_title}</p><h3 className="mt-1 font-display text-[14px] font-medium text-ink">{item.claim.claim}</h3><textarea aria-label="观点使用备注" rows={2} value={usageNotes[item.claim_id] || ''} onChange={(event) => setUsageNotes((value) => ({ ...value, [item.claim_id]: event.target.value }))} onBlur={() => void addClaim(project.id, item.claim_id, usageNotes[item.claim_id] || '')} placeholder="这条观点准备怎么使用" className={`${textareaClass} mt-2`} /></div><div className="flex flex-col gap-1"><button title="上移" type="button" disabled={index === 0} onClick={() => void move(index, -1)} className="rounded-full px-2 py-1 text-ink-soft disabled:opacity-25">↑</button><button title="下移" type="button" disabled={index === project.claims.length - 1} onClick={() => void move(index, 1)} className="rounded-full px-2 py-1 text-ink-soft disabled:opacity-25">↓</button><button title="移除" type="button" onClick={() => void removeClaim(project.id, item.claim_id)} className="rounded-full px-2 py-1 text-pink">×</button></div></div></article>)}</div>
    </section>
    <ModalShell isOpen={isExportOpen} title="Markdown 导出" subtitle="复制后继续加入你的判断和表达" onClose={() => setIsExportOpen(false)} accent="sage" size="lg"><div className="space-y-3"><textarea readOnly value={markdown} rows={24} className="w-full resize-y rounded-xl border border-card-border bg-paper/60 p-4 font-mono text-[11px] leading-relaxed text-ink outline-none" /><button type="button" onClick={() => void navigator.clipboard.writeText(markdown)} className="rounded-full bg-sage px-5 py-2 font-body text-[11px] font-medium text-ink shadow-btn">复制 Markdown</button></div></ModalShell>
  </>;
};

export default ContentProjectWorkspace;
