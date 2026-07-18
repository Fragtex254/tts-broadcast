import React from 'react';
import { ArrowUpRight, GithubLogo } from '@phosphor-icons/react';
import { NavLink } from 'react-router-dom';

const navItems = [
  { path: '/', label: '工作台', shortLabel: '工' },
  { path: '/history', label: '内容库', shortLabel: '库' },
  { path: '/voice-presets', label: '音色库', shortLabel: '音' },
  { path: '/automation', label: '自动化', shortLabel: '自' },
  { path: '/settings', label: '设置', shortLabel: '设' },
];

export const Sidebar: React.FC = () => {
  return (
    <aside className="flex w-[72px] flex-shrink-0 flex-col border-r border-card-border bg-paper-2 lg:w-64">
      <div className="p-4 lg:px-7 lg:py-7 border-b border-card-border text-center lg:text-left">
        <h1 className="font-display text-[20px] lg:text-[28px] font-medium text-ink leading-tight tracking-tight">
          <span className="lg:hidden">AI</span>
          <span className="hidden lg:inline">AI 内容工作台</span>
        </h1>
        <p className="hidden lg:block font-body text-[13px] tracking-[0.08em] text-ink-soft mt-2">
          证据驱动创作
        </p>
      </div>

      <nav className="flex flex-1 flex-col gap-1.5 p-2.5 lg:gap-2 lg:px-4 lg:py-6">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            aria-label={item.label}
            title={item.label}
            className={({ isActive }) =>
              `ui-pressable flex min-h-11 flex-col items-center justify-center rounded-xl border px-2 py-2.5 font-body text-[12px] leading-none lg:min-h-12 lg:flex-row lg:justify-start lg:gap-3 lg:px-4 lg:text-[15px] ${
                isActive
                  ? 'border-card-border bg-white/85 text-ink font-semibold shadow-sm'
                  : 'border-transparent text-ink-soft font-medium hover:border-card-border/70 hover:bg-white/45 hover:text-ink'
              }`
            }
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-card-border bg-white/60 text-[12px] leading-none lg:h-2.5 lg:w-2.5 lg:flex-shrink-0 lg:border-0 lg:bg-lilac">
              <span className="lg:hidden">{item.shortLabel}</span>
            </span>
            <span className="hidden lg:inline">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-card-border p-3 lg:px-5 lg:py-5">
        <a
          href="https://github.com/Fragtex254/tts-broadcast"
          target="_blank"
          rel="noopener noreferrer"
          title="在 GitHub 查看项目"
          aria-label="在 GitHub 查看项目"
          className="ui-external-link ui-pressable grid min-h-10 w-full grid-cols-[18px_14px] items-center justify-center gap-1.5 rounded-xl border border-card-border bg-white/45 px-2 py-2 text-ink-soft/70 hover:border-ink/20 hover:bg-white/75 hover:text-ink lg:grid-cols-[18px_minmax(0,1fr)_16px] lg:justify-stretch lg:gap-2.5 lg:px-3.5"
        >
          <GithubLogo className="shrink-0" aria-hidden="true" size={18} weight="fill" />
          <span className="ui-metadata hidden min-w-0 truncate text-ink-soft/80 lg:block">GitHub · v 3.0.0</span>
          <ArrowUpRight className="ui-external-link-arrow shrink-0" aria-hidden="true" size={14} weight="bold" />
        </a>
      </div>
    </aside>
  );
};
