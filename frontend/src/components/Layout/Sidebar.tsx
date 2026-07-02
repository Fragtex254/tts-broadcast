import React from 'react';
import { NavLink } from 'react-router-dom';

const navItems = [
  { path: '/', label: '信源收集', shortLabel: '源' },
  { path: '/editor', label: '口播稿编辑', shortLabel: '稿' },
  { path: '/transcribe', label: '转录', shortLabel: '转' },
  { path: '/history', label: '历史记录', shortLabel: '史' },
  { path: '/settings', label: '设置', shortLabel: '设' },
];

export const Sidebar: React.FC = () => {
  return (
    <aside className="w-20 sm:w-64 bg-paper-2 border-r border-card-border flex flex-col flex-shrink-0">
      <div className="p-4 sm:p-6 sm:pb-5 border-b border-card-border text-center sm:text-left">
        <h1 className="font-display text-[20px] sm:text-[22px] font-medium text-ink leading-tight tracking-tight">
          <span className="sm:hidden">AI</span>
          <span className="hidden sm:inline">AI 简讯播报</span>
        </h1>
        <p className="hidden sm:block font-body text-[10px] uppercase tracking-[0.1em] text-ink-soft mt-1.5">
          每日资讯语音播报
        </p>
      </div>

      <nav className="flex-1 p-3 sm:p-4 flex flex-col gap-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            aria-label={item.label}
            title={item.label}
            className={({ isActive }) =>
              `flex flex-col sm:flex-row items-center justify-center sm:justify-start sm:gap-3 px-2 sm:px-4 py-2.5 rounded-xl text-[13px] font-body transition-all duration-200 ${
                isActive
                  ? 'bg-white/80 text-ink font-medium shadow-card border border-card-border'
                  : 'text-ink-soft hover:text-ink hover:bg-white/50'
              }`
            }
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/60 border border-card-border text-[12px] leading-none sm:h-2 sm:w-2 sm:border-0 sm:bg-lilac">
              <span className="sm:hidden">{item.shortLabel}</span>
            </span>
            <span className="hidden sm:inline">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="hidden sm:block p-4 pt-4 border-t border-card-border">
        <div className="font-display italic text-[13px] text-ink/25 pl-4">
          v 3.0.0
        </div>
      </div>
    </aside>
  );
};
