import React from 'react';

interface TaskProgressProps {
  label: string;
  percent?: number;
  tone?: 'working' | 'error';
  className?: string;
}

export const TaskProgress: React.FC<TaskProgressProps> = ({ label, percent, tone = 'working', className = '' }) => {
  const safePercent = percent === undefined ? null : Math.min(100, Math.max(0, percent));
  return (
    <div
      className={`rounded-2xl border p-4 ${tone === 'error' ? 'border-pink/35 bg-pink/10' : 'border-lilac/40 bg-lilac/10'} ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="ui-body flex items-center justify-between gap-3 text-ink-soft">
        <span className="font-medium">{label}</span>
        {safePercent !== null && <span className="ui-metadata shrink-0 tabular-nums text-ink-soft/75">{Math.round(safePercent)}%</span>}
      </div>
      {tone !== 'error' && safePercent !== null && (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/80" aria-hidden="true">
          <div className="h-full rounded-full bg-lilac transition-[width] duration-normal" style={{ width: `${safePercent}%` }} />
        </div>
      )}
    </div>
  );
};

export default TaskProgress;
