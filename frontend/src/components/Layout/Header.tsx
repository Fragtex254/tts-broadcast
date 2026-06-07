import React from 'react';

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({ title, subtitle, actions }) => {
  return (
    <header className="px-6 py-5 border-b border-rule-soft animate-fade-in-up">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="font-display text-[32px] font-medium text-ink leading-[0.95] tracking-tight">
            {title}
          </h2>
          {subtitle && (
            <p className="font-body text-[11px] uppercase tracking-[0.1em] text-ink-soft mt-1.5">
              {subtitle}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {actions}
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-sage/25 text-[11px] font-body font-medium text-ink-soft uppercase tracking-wider">
            <span className="w-1.5 h-1.5 bg-sage rounded-full animate-breathe" />
            系统在线
          </div>
        </div>
      </div>
    </header>
  );
};
