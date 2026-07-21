import React from 'react';

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({ title, subtitle, actions }) => {
  return (
    <header className="border-b border-rule-soft bg-paper/90 px-5 py-4 sm:px-6 sm:py-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="ui-page-title">
            {title}
          </h2>
          {subtitle && (
            <p className="ui-body mt-1 max-w-[34rem] text-ink-soft/75">
              {subtitle}
            </p>
          )}
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2 sm:gap-3">
          {actions}
        </div>
      </div>
    </header>
  );
};
