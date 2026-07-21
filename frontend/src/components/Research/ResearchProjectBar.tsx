import React, { useRef, useState } from 'react';
import { FolderOpen, Plus } from '@phosphor-icons/react';
import type { ContentProject, ContentTargetPlatform } from '../../store';
import { ModalShell } from '../ModalShell';

interface ResearchProjectBarProps {
  projects: ContentProject[];
  currentProject: ContentProject | null;
  isLoading: boolean;
  loadError?: string | null;
  onRetry?: () => Promise<unknown>;
  onSelect: (projectId: number) => Promise<unknown>;
  onCreate: (data: { title: string; topic?: string; targetPlatform: ContentTargetPlatform }) => Promise<unknown>;
}

const PLATFORM_LABELS: Record<ContentTargetPlatform, string> = {
  general: '通用',
  xiaohongshu: '小红书',
  wechat: '公众号',
  twitter: 'Twitter',
};

const CREATE_PLATFORM_OPTIONS: { value: ContentTargetPlatform; label: string }[] = [
  { value: 'general', label: PLATFORM_LABELS.general },
  { value: 'xiaohongshu', label: PLATFORM_LABELS.xiaohongshu },
  { value: 'wechat', label: PLATFORM_LABELS.wechat },
];

export const ResearchProjectBar: React.FC<ResearchProjectBarProps> = ({
  projects,
  currentProject,
  isLoading,
  loadError,
  onRetry,
  onSelect,
  onCreate,
}) => {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [targetPlatform, setTargetPlatform] = useState<ContentTargetPlatform>('general');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const create = async () => {
    if (!title.trim() || !topic.trim()) return;
    setIsCreating(true);
    setError(null);
    try {
      await onCreate({ title: title.trim(), topic: topic.trim(), targetPlatform });
      setTitle('');
      setTopic('');
      setTargetPlatform('general');
      setIsCreateOpen(false);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '创建项目失败');
    } finally {
      setIsCreating(false);
    }
  };

  const select = async (projectId: number) => {
    setSelectionError(null);
    try { await onSelect(projectId); }
    catch (selectError) { setSelectionError(selectError instanceof Error ? selectError.message : '加载项目失败'); }
  };

  return <>
    <section className="min-w-0 max-w-full rounded-card border border-card-border bg-white/80 p-4 shadow-card">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <label className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blush/20 text-ink-soft">
          <FolderOpen aria-hidden="true" size={20} weight="duotone" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-body text-[11px] text-ink-soft/55">当前项目</span>
          <select
            aria-label="当前内容项目"
            value={currentProject?.id || ''}
            disabled={isLoading}
            onChange={(event) => {
              const id = Number(event.target.value);
              if (id) void select(id);
            }}
            className="mt-0.5 w-full rounded-xl border-0 bg-transparent p-0 font-display text-[17px] font-medium text-ink outline-none disabled:opacity-40"
          >
            <option value="">先选择一个内容项目</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
          </select>
        </span>
      </label>

      {currentProject && <div className="flex items-center gap-2 sm:px-4">
        <span className="rounded-full bg-sage/35 px-3 py-1.5 font-body text-[11px] text-ink">{PLATFORM_LABELS[currentProject.target_platform]}</span>
        <span className="rounded-full bg-lilac/25 px-3 py-1.5 font-body text-[11px] text-ink">{currentProject.status === 'draft' ? '研究中' : currentProject.status}</span>
      </div>}

      <button
        type="button"
        onClick={() => { setError(null); setIsCreateOpen(true); }}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-sage px-5 py-2.5 font-body text-[12px] font-medium text-ink shadow-btn ui-transition duration-fast hover:brightness-105 active:translate-y-0"
      >
        <Plus aria-hidden="true" size={16} />
        新建项目
      </button>
      </div>
      {(loadError || selectionError) && <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-pink/10 p-3">
        <p className="font-body text-[11px] text-ink">{selectionError || loadError}</p>
        {loadError && onRetry && <button type="button" onClick={() => void onRetry()} className="font-body text-[11px] font-medium text-ink-soft hover:text-ink">重试加载</button>}
      </div>}
    </section>

    <ModalShell
      isOpen={isCreateOpen}
      title="新建内容项目"
      subtitle="先明确要研究的问题，再从多个播客里寻找证据"
      accent="sage"
      size="md"
      closeOnEscape={!isCreating}
      initialFocusRef={titleRef}
      onClose={() => { if (!isCreating) setIsCreateOpen(false); }}
    >
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void create(); }}>
        {error && <p role="alert" className="animate-shake rounded-xl bg-pink/10 p-3 font-body text-[12px] text-ink">{error}</p>}
        <label className="block font-body text-[11px] text-ink-soft">
          项目标题
          <input
            ref={titleRef}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例如：AI 会不会取代程序员？"
            className="mt-1 w-full rounded-xl border border-card-border bg-white/70 px-3.5 py-3 font-body text-[13px] text-ink outline-none focus:border-ink/20"
          />
        </label>
        <label className="block font-body text-[11px] text-ink-soft">
          研究问题
          <textarea
            required
            rows={3}
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="你希望通过这些播客讨论回答什么问题？"
            className="mt-1 w-full resize-none rounded-xl border border-card-border bg-white/70 px-3.5 py-3 font-body text-[13px] leading-relaxed text-ink outline-none focus:border-ink/20"
          />
        </label>
        <label className="block font-body text-[11px] text-ink-soft">
          目标平台
          <select
            value={targetPlatform}
            onChange={(event) => {
              const value = event.target.value;
              setTargetPlatform(value === 'xiaohongshu' || value === 'wechat' ? value : 'general');
            }}
            className="mt-1 w-full rounded-full border border-card-border bg-white/70 px-3.5 py-3 font-body text-[12px] text-ink outline-none"
          >
            {CREATE_PLATFORM_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <button
          type="submit"
          disabled={isCreating || !title.trim() || !topic.trim()}
          className="w-full rounded-full bg-sage px-5 py-3 font-body text-[12px] font-medium text-ink shadow-btn ui-transition duration-fast hover:brightness-105 disabled:opacity-40"
        >
          {isCreating ? '创建中…' : '创建并开始研究'}
        </button>
      </form>
    </ModalShell>
  </>;
};

export default ResearchProjectBar;
