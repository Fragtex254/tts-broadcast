import React from 'react';
import { NavLink } from 'react-router-dom';

const navItems = [
  { path: '/', label: '控制台', icon: '📊' },
  { path: '/history', label: '历史记录', icon: '📚' },
  { path: '/settings', label: '设置', icon: '⚙️' },
];

export const Sidebar: React.FC = () => {
  return (
    <aside className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
      <div className="p-6 border-b border-gray-700">
        <h1 className="text-xl font-bold text-white">AI 简讯播报</h1>
        <p className="text-sm text-gray-400 mt-1">每日 AI 资讯语音播报</p>
      </div>

      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {navItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-gray-700'
                  }`
                }
              >
                <span className="text-lg">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="p-4 border-t border-gray-700">
        <div className="text-xs text-gray-500">
          v1.0.0
        </div>
      </div>
    </aside>
  );
};
