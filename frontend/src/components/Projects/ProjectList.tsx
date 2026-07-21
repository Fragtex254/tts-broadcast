import React from 'react';
import type { ContentProject } from '../../store';
import { ActionButton } from '../ui/ActionButton';
import { EmptyState } from '../ui/EmptyState';

interface ProjectListProps {
  projects: ContentProject[];
  isLoading: boolean;
  error: string | null;
  emptyDescription: string;
  onOpen: (projectId: number) => void;
  onRetry: () => void;
  onCreate?: () => void;
}

const PLATFORM_LABELS: Record<ContentProject['target_platform'], string> = {
  general: '通用内容',
  xiaohongshu: '小红书',
  wechat: '公众号',
  twitter: 'Twitter',
};

export const ProjectList: React.FC<ProjectListProps> = ({
  projects,
  isLoading,
  error,
  emptyDescription,
  onOpen,
  onRetry,
  onCreate,
}) => {
  if (isLoading) {
    return (
      <div aria-label="正在加载内容项目列表" className="space-y-2 animate-pulse">
        {[1, 2, 3].map((item) => (
          <div key={item} className="h-20 rounded-2xl border border-card-border bg-ink/5" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="animate-shake rounded-2xl border border-pink/25 bg-pink/10 p-4">
        <p className="ui-body text-ink">{error}</p>
        <ActionButton tone="secondary" size="sm" className="mt-3" onClick={onRetry}>重新加载项目</ActionButton>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <EmptyState
        title="还没有内容项目"
        description={emptyDescription}
        action={onCreate ? <ActionButton tone="primary" onClick={onCreate}>新建内容项目</ActionButton> : undefined}
      />
    );
  }

  return (
    <ol className="divide-y divide-card-border rounded-2xl border border-card-border bg-white/45">
      {projects.map((project) => (
        <li key={project.id}>
          <button
            type="button"
            onClick={() => onOpen(project.id)}
            className="ui-pressable w-full px-4 py-4 text-left hover:bg-white/55 focus-visible:bg-white/70"
          >
            <span className="flex flex-wrap items-start justify-between gap-2">
              <span className="ui-section-title text-ink">{project.title}</span>
              <span className="rounded-full bg-sage/20 px-2.5 py-1 font-body text-[11px] text-ink">
                {project.status === 'draft' ? '创作中' : project.status}
              </span>
            </span>
            <span className="ui-body mt-1.5 block text-ink-soft/75">{project.topic || project.goal || 'Brief 还待补充'}</span>
            <span className="ui-metadata mt-2 flex flex-wrap gap-2 text-ink-soft/65">
              <span>{PLATFORM_LABELS[project.target_platform]}</span>
              <span aria-hidden="true">·</span>
              <span>更新于 {new Date(project.updated_at).toLocaleString('zh-CN')}</span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
};

export default ProjectList;
