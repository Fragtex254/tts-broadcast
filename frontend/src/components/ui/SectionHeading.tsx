import React from 'react';

type SectionAccent = 'pink' | 'lemon' | 'blush' | 'sage' | 'lilac';

interface SectionHeadingProps {
  title: string;
  description?: string;
  accent?: SectionAccent;
  action?: React.ReactNode;
  className?: string;
}

const ACCENT_CLASS: Record<SectionAccent, string> = {
  pink: 'bg-pink',
  lemon: 'bg-lemon',
  blush: 'bg-blush',
  sage: 'bg-sage',
  lilac: 'bg-lilac',
};

export const SectionHeading: React.FC<SectionHeadingProps> = ({ title, description, accent = 'lilac', action, className = '' }) => (
  <div className={`flex flex-wrap items-start justify-between gap-3 ${className}`}>
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${ACCENT_CLASS[accent]}`} aria-hidden="true" />
        <h2 className="ui-section-title">{title}</h2>
      </div>
      {description && <p className="ui-body mt-1 text-ink-soft/75">{description}</p>}
    </div>
    {action}
  </div>
);

export default SectionHeading;
