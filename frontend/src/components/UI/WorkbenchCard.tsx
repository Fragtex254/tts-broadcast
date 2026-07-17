import React from 'react';

type WorkbenchCardAccent = 'pink' | 'lemon' | 'blush' | 'sage' | 'lilac';

interface WorkbenchCardProps extends React.ComponentPropsWithoutRef<'section'> {
  heading?: React.ReactNode;
  accent?: WorkbenchCardAccent;
  headerActions?: React.ReactNode;
}

const ACCENT_CLASS: Record<WorkbenchCardAccent, string> = {
  pink: 'bg-pink',
  lemon: 'bg-lemon',
  blush: 'bg-blush',
  sage: 'bg-sage',
  lilac: 'bg-lilac',
};

export const WorkbenchCard: React.FC<WorkbenchCardProps> = ({
  heading,
  accent = 'lilac',
  headerActions,
  className,
  children,
  ...sectionProps
}) => (
  <section
    {...sectionProps}
    className={`rounded-card border border-card-border bg-white/80 p-5 shadow-card backdrop-blur-sm${className ? ` ${className}` : ''}`}
  >
    {heading !== undefined && (
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${ACCENT_CLASS[accent]}`} />
          <h3 className="truncate font-display text-[14px] font-medium italic text-ink-soft">{heading}</h3>
        </div>
        {headerActions}
      </div>
    )}
    {children}
  </section>
);

export default WorkbenchCard;
