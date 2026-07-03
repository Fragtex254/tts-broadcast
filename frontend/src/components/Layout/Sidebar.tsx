import React from 'react';
import { NavLink } from 'react-router-dom';

const navItems = [
  { path: '/', label: '信源收集', shortLabel: '源' },
  { path: '/editor', label: '口播稿编辑', shortLabel: '稿' },
  { path: '/voice-presets', label: '音色预设', shortLabel: '音' },
  { path: '/transcribe', label: '转录', shortLabel: '转' },
  { path: '/history', label: '历史记录', shortLabel: '史' },
  { path: '/settings', label: '设置', shortLabel: '设' },
];

export const Sidebar: React.FC = () => {
  return (
    <aside className="w-20 sm:w-72 bg-paper-2 border-r border-card-border flex flex-col flex-shrink-0">
      <div className="p-4 sm:px-7 sm:py-7 border-b border-card-border text-center sm:text-left">
        <h1 className="font-display text-[20px] sm:text-[28px] font-medium text-ink leading-tight tracking-tight">
          <span className="sm:hidden">AI</span>
          <span className="hidden sm:inline">AI 简讯播报</span>
        </h1>
        <p className="hidden sm:block font-body text-[13px] tracking-[0.08em] text-ink-soft mt-2">
          每日资讯语音播报
        </p>
      </div>

      <nav className="flex-1 p-3 sm:px-5 sm:py-7 flex flex-col gap-1.5 sm:gap-2.5">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            aria-label={item.label}
            title={item.label}
            className={({ isActive }) =>
              `flex flex-col sm:flex-row items-center justify-center sm:justify-start sm:gap-4 px-2 sm:px-5 py-2.5 sm:py-[18px] rounded-xl sm:rounded-2xl text-[13px] sm:text-[20px] font-body leading-none transition-all duration-200 ${
                isActive
                  ? 'bg-white/85 text-ink font-semibold shadow-card border border-card-border'
                  : 'text-ink-soft font-medium hover:text-ink hover:bg-white/50'
              }`
            }
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/60 border border-card-border text-[12px] leading-none sm:h-3 sm:w-3 sm:border-0 sm:bg-lilac sm:flex-shrink-0">
              <span className="sm:hidden">{item.shortLabel}</span>
            </span>
            <span className="hidden sm:inline">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="hidden sm:block px-5 py-5 border-t border-card-border">
        <div className="font-display italic text-[15px] text-ink/30 pl-5">
          v 3.0.0
        </div>
      </div>
    </aside>
  );
};
