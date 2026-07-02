import React from 'react';

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({ title, subtitle, actions }) => {
  return (
    <header className="px-5 py-5 sm:px-6 border-b border-rule-soft bg-paper/75 animate-fade-in-up">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[30px] sm:text-[32px] font-medium text-ink leading-[0.95] tracking-tight">
            {title}
          </h2>
          {subtitle && (
            <p className="font-body text-[11px] uppercase tracking-[0.1em] text-ink-soft mt-1.5 max-w-[18rem] sm:max-w-none">
              {subtitle}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
          {actions}
          <div className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-sage/45 text-[11px] font-body font-medium text-ink-soft uppercase tracking-wider">
            <span className="w-1.5 h-1.5 bg-sage rounded-full animate-breathe" />
            系统在线
          </div>
        </div>
      </div>
    </header>
  );
};
