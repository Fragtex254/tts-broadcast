import React, { useEffect, useState } from 'react';
import type { ContentProjectMilestone } from '../../store';

interface ProjectMilestoneFeedbackProps {
  milestone: ContentProjectMilestone;
  onDismiss: () => void;
  autoDismissMs?: number;
  prefersReducedMotion?: boolean;
}

const MILESTONE_LABEL = {
  source_saved: '粘贴材料快照已归档',
  evidence_selected: '证据链节点已点亮',
  outline_saved: '可审阅提纲已落盘',
  cited_master_saved: '带引用主稿草案已落盘',
} as const;

const DECORATION_COUNT = 10;

function systemPrefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export const ProjectMilestoneFeedback: React.FC<ProjectMilestoneFeedbackProps> = ({
  milestone,
  onDismiss,
  autoDismissMs = 8000,
  prefersReducedMotion,
}) => {
  const [isReducedMotion, setIsReducedMotion] = useState(
    prefersReducedMotion ?? systemPrefersReducedMotion()
  );

  useEffect(() => {
    if (prefersReducedMotion !== undefined || typeof window.matchMedia !== 'function') return undefined;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = () => setIsReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener?.('change', handleChange);
    return () => mediaQuery.removeEventListener?.('change', handleChange);
  }, [prefersReducedMotion]);

  useEffect(() => {
    if (autoDismissMs <= 0) return undefined;
    const timeoutId = window.setTimeout(onDismiss, autoDismissMs);
    return () => window.clearTimeout(timeoutId);
  }, [autoDismissMs, milestone.id, onDismiss]);

  return (
    <section
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`relative overflow-hidden rounded-2xl border border-sage/60 bg-sage/20 px-4 py-3 pr-12 shadow-card ${isReducedMotion ? '' : 'animate-project-celebration'}`}
    >
      {!isReducedMotion && (
        <div
          data-testid="milestone-decoration"
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 project-milestone-decoration project-milestone-${milestone.kind}`}
        >
          {Array.from({ length: DECORATION_COUNT }, (_, index) => (
            <span key={index} className="project-milestone-particle" />
          ))}
        </div>
      )}
      <div className="relative min-w-0">
        <p className="ui-metadata font-medium text-ink-soft">{MILESTONE_LABEL[milestone.kind]}</p>
        <h2 className="ui-section-title mt-0.5 text-ink">{milestone.title}</h2>
        <p className="ui-body mt-1 text-ink-soft/80">{milestone.description}</p>
      </div>
      <button
        type="button"
        aria-label="关闭创作里程碑提示"
        title="关闭提示"
        onClick={onDismiss}
        className="ui-pressable absolute right-2 top-2 inline-flex min-h-9 min-w-9 items-center justify-center rounded-xl text-[18px] text-ink-soft hover:bg-white/55 hover:text-ink"
      >
        ×
      </button>
    </section>
  );
};

export default ProjectMilestoneFeedback;
