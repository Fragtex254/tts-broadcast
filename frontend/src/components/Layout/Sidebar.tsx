import React from 'react';
import { NavLink } from 'react-router-dom';

const navItems = [
  { path: '/', label: '信源收集', icon: '◉' },
  { path: '/editor', label: '口播稿编辑', icon: '○' },
  { path: '/transcribe', label: '转录', icon: '○' },
  { path: '/history', label: '历史记录', icon: '○' },
  { path: '/settings', label: '设置', icon: '○' },
];

export const Sidebar: React.FC = () => {
  return (
    <aside className="w-64 bg-paper-2/70 border-r border-card-border flex flex-col flex-shrink-0">
      <div className="p-6 pb-5 border-b border-card-border">
        <h1 className="font-display text-[22px] font-medium text-ink leading-tight tracking-tight">
          AI 简讯播报
        </h1>
        <p className="font-body text-[10px] uppercase tracking-[0.1em] text-ink-soft mt-1.5">
          每日资讯语音播报
        </p>
      </div>

      <nav className="flex-1 p-4 flex flex-col gap-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 rounded-xl text-[13px] font-body transition-all duration-200 ${
                isActive
                  ? 'bg-white/60 text-ink font-medium shadow-card'
                  : 'text-ink-soft hover:text-ink hover:bg-white/30'
              }`
            }
          >
            <span className={`text-[15px] leading-none ${item.path === '/' ? 'opacity-80' : 'opacity-40'}`}>
              {item.icon}
            </span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 pt-4 border-t border-card-border">
        <div className="font-display italic text-[13px] text-ink/25 pl-4">
          v 3.0.0
        </div>
      </div>
    </aside>
  );
};
