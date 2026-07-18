import React from 'react';

interface EmptyStateProps {
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ title, description, action, className = '' }) => (
  <div className={`rounded-2xl border border-dashed border-card-border bg-white/25 px-5 py-10 text-center ${className}`}>
    <p className="ui-section-title text-ink-soft/80">{title}</p>
    <p className="ui-body mx-auto mt-2 max-w-md text-ink-soft/70">{description}</p>
    {action && <div className="mt-4 flex justify-center">{action}</div>}
  </div>
);

export default EmptyState;
