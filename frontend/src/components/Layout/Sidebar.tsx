import React from 'react';
import { GithubLogo } from '@phosphor-icons/react';
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
    <aside className="w-20 lg:w-64 bg-paper-2 border-r border-card-border flex flex-col flex-shrink-0">
      <div className="p-4 lg:px-7 lg:py-7 border-b border-card-border text-center lg:text-left">
        <h1 className="font-display text-[20px] lg:text-[28px] font-medium text-ink leading-tight tracking-tight">
          <span className="lg:hidden">AI</span>
          <span className="hidden lg:inline">AI 简讯播报</span>
        </h1>
        <p className="hidden lg:block font-body text-[13px] tracking-[0.08em] text-ink-soft mt-2">
          内容生产工作台
        </p>
      </div>

      <nav className="flex-1 p-3 lg:px-5 lg:py-7 flex flex-col gap-1.5 lg:gap-2.5">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            aria-label={item.label}
            title={item.label}
            className={({ isActive }) =>
              `flex flex-col lg:flex-row items-center justify-center lg:justify-start lg:gap-4 px-2 lg:px-5 py-2.5 lg:py-[18px] rounded-xl lg:rounded-2xl text-[13px] lg:text-[18px] font-body leading-none transition-all duration-200 ${
                isActive
                  ? 'bg-white/85 text-ink font-semibold shadow-card border border-card-border'
                  : 'text-ink-soft font-medium hover:text-ink hover:bg-white/50'
              }`
            }
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/60 border border-card-border text-[12px] leading-none lg:h-3 lg:w-3 lg:border-0 lg:bg-lilac lg:flex-shrink-0">
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
          rel="noreferrer"
          title="在 GitHub 查看项目"
          aria-label="在 GitHub 查看项目"
          className="flex items-center justify-center gap-2 rounded-xl px-2 py-2 font-body text-[11px] text-ink-soft/55 transition-colors hover:bg-white/50 hover:text-ink lg:justify-start lg:px-5"
        >
          <GithubLogo aria-hidden="true" size={18} weight="fill" />
          <span className="hidden lg:inline">GitHub · v 3.0.0</span>
        </a>
      </div>
    </aside>
  );
};
