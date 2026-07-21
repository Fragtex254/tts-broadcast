# HCDS Studio Soft Editorial 前端重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 HCDS Studio 前端从 Tailwind dark-mode admin 模板升级为 Soft Editorial 设计风格，含全套动效。

**Architecture:** 先建立 CSS 变量设计系统 + Tailwind 主题 + 字体加载（阶段一），再逐组件完成视觉重做 + 动效（阶段二）。每个组件独立可验证，改完后 `npm run dev` 目视检查即可。

**Tech Stack:** React 19, TypeScript 6, Tailwind CSS v4, Vite 8, Zustand 5

---

## 阶段一：设计系统基础

### Task 1: 清理未使用的文件和旧 CSS 变量

**Files:**
- Modify: `frontend/index.html`
- Modify: `frontend/src/index.css`
- Delete: `frontend/src/assets/hero.png`
- Delete: `frontend/src/assets/react.svg`
- Delete: `frontend/src/assets/vite.svg`

- [ ] **Step 1: 删除未使用的 Vite boilerplate 资源文件**

```bash
rm -f frontend/src/assets/hero.png frontend/src/assets/react.svg frontend/src/assets/vite.svg
```

- [ ] **Step 2: 更新 index.html — 添加 Google Fonts 加载和页面标题**

将 `frontend/index.html` 替换为：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>HCDS Studio</title>
    <!-- Google Fonts: Cormorant Garamond (标题) + Work Sans (正文) + ZCOOL XiaoWei (中文衬线) -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Work+Sans:wght@300;400;500;600&family=ZCOOL+XiaoWei&display=swap" rel="stylesheet">
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: 重写 index.css — 建立 Soft Editorial 设计 token**

将 `frontend/src/index.css` 完整替换为：

```css
@import "tailwindcss";

/* === SOFT EDITORIAL DESIGN TOKENS === */
:root {
  /* 色彩 */
  --color-paper: #F2EEDF;
  --color-paper-2: #ECE6D2;
  --color-ink: #2A241B;
  --color-ink-soft: #5C5345;
  --color-pink: #E1A4C2;
  --color-lemon: #D6DD63;
  --color-blush: #E8C9B6;
  --color-sage: #B7C7A8;
  --color-lilac: #C9BEDC;
  --color-card-fill: rgba(255, 255, 255, 0.55);
  --color-card-border: rgba(42, 36, 27, 0.08);
  --color-rule-soft: rgba(42, 36, 27, 0.12);

  /* 圆角 */
  --radius-card: 24px;
  --radius-pill: 9999px;
  --radius-btn: 12px;
  --radius-input: 12px;

  /* 阴影 */
  --shadow-card: 0 1px 4px rgba(42, 36, 27, 0.04);
  --shadow-card-hover: 0 4px 12px rgba(42, 36, 27, 0.08);
  --shadow-btn: 0 1px 3px rgba(42, 36, 27, 0.06);

  /* 字体 */
  --font-display: 'Cormorant Garamond', 'ZCOOL XiaoWei', 'Noto Serif SC', serif;
  --font-body: 'Work Sans', 'Yozai', 'Noto Sans SC', sans-serif;

  /* 过渡 */
  --transition-fast: 0.15s ease;
  --transition-normal: 0.25s ease;
  --transition-slow: 0.4s ease;
}

/* === GLOBAL STYLES === */
body {
  background-color: var(--color-paper);
  color: var(--color-ink);
  font-family: var(--font-body);
  margin: 0;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* 选中高亮 */
::selection {
  background: rgba(225, 164, 194, 0.3);
  color: var(--color-ink);
}

/* 滚动条 — 浅色主题 */
::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(42, 36, 27, 0.15);
  border-radius: 9999px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(42, 36, 27, 0.25);
}

/* === ANIMATION KEYFRAMES === */
@keyframes fade-in-up {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes fade-in-left {
  from { opacity: 0; transform: translateX(-8px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes breathe {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}

@keyframes scale-bounce {
  0% { transform: scale(1); }
  50% { transform: scale(1.3); }
  100% { transform: scale(1); }
}

@keyframes waveform-pulse {
  0%, 100% { transform: scaleY(1); }
  50% { transform: scaleY(1.05); }
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 4: 验证 — 启动开发服务器确认无报错**

```bash
cd frontend && npm run dev
```

Expected: 页面加载正常，背景变为暖纸色 `#F2EEDF`，所有组件暂时使用旧 Tailwind class 但不报错。

- [ ] **Step 5: 提交**

```bash
git add frontend/index.html frontend/src/index.css
git rm frontend/src/assets/hero.png frontend/src/assets/react.svg frontend/src/assets/vite.svg 2>/dev/null || true
git commit -m "feat(ui): establish Soft Editorial design tokens and fonts"
```

---

### Task 2: 扩展 Tailwind 主题

**Files:**
- Modify: `frontend/tailwind.config.js`

- [ ] **Step 1: 重写 tailwind.config.js — 添加自定义主题**

将 `frontend/tailwind.config.js` 完整替换为：

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: { DEFAULT: '#F2EEDF', 2: '#ECE6D2' },
        ink: { DEFAULT: '#2A241B', soft: '#5C5345' },
        pink: '#E1A4C2',
        lemon: '#D6DD63',
        blush: '#E8C9B6',
        sage: '#B7C7A8',
        lilac: '#C9BEDC',
      },
      borderRadius: {
        card: '24px',
      },
      boxShadow: {
        card: '0 1px 4px rgba(42, 36, 27, 0.04)',
        'card-hover': '0 4px 12px rgba(42, 36, 27, 0.08)',
        btn: '0 1px 3px rgba(42, 36, 27, 0.06)',
      },
      fontFamily: {
        display: ["'Cormorant Garamond'", "'ZCOOL XiaoWei'", "'Noto Serif SC'", 'serif'],
        body: ["'Work Sans'", "'Yozai'", "'Noto Sans SC'", 'sans-serif'],
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'fade-in-left': 'fade-in-left 0.3s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'fade-in': 'fade-in 0.3s ease forwards',
        'breathe': 'breathe 2.5s ease-in-out infinite',
        'shake': 'shake 0.3s ease-in-out',
        'scale-bounce': 'scale-bounce 0.3s ease',
        'waveform-pulse': 'waveform-pulse 1.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
```

- [ ] **Step 2: 验证 — 开发服务器热更新后确认 Tailwind 自定义 class 生效**

```bash
cd frontend && npm run dev
```

Expected: 使用 `bg-paper`、`text-ink` 等自定义 class 时 Tailwind 能正确生成样式。

- [ ] **Step 3: 提交**

```bash
git add frontend/tailwind.config.js
git commit -m "feat(ui): extend Tailwind theme with Soft Editorial tokens"
```

---

## 阶段二：逐组件重做

### Task 3: App.tsx — 全局容器样式更新

**Files:**
- Modify: `frontend/src/App.tsx:18`

- [ ] **Step 1: 更新 App.tsx 的根容器 class**

将 `frontend/src/App.tsx` 第 18 行：
```tsx
<div className="flex h-screen bg-gray-900 text-gray-100 overflow-hidden">
```
替换为：
```tsx
<div className="flex h-screen bg-paper text-ink overflow-hidden">
```

- [ ] **Step 2: 验证**

页面背景应变为暖纸色，文字变为深墨色。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/App.tsx
git commit -m "feat(ui): apply Soft Editorial base to App shell"
```

---

### Task 4: Sidebar — Soft Editorial 重做

**Files:**
- Modify: `frontend/src/components/Layout/Sidebar.tsx`

- [ ] **Step 1: 完整重写 Sidebar.tsx**

将 `frontend/src/components/Layout/Sidebar.tsx` 完整替换为：

```tsx
import React from 'react';
import { NavLink } from 'react-router-dom';

const navItems = [
  { path: '/', label: '控制台', icon: '◉' },
  { path: '/history', label: '历史记录', icon: '○' },
  { path: '/settings', label: '设置', icon: '○' },
];

export const Sidebar: React.FC = () => {
  return (
    <aside className="w-64 bg-paper-2/70 border-r border-card-border flex flex-col flex-shrink-0">
      <div className="p-6 pb-5 border-b border-card-border">
        <h1 className="font-display text-[22px] font-medium text-ink leading-tight tracking-tight">
          HCDS Studio
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
            <span className={`text-[15px] leading-none ${navItems.indexOf(item) === 0 ? 'opacity-80' : 'opacity-40'}`}>
              {item.icon}
            </span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 pt-4 border-t border-card-border">
        <div className="font-display italic text-[13px] text-ink/25 pl-4">
          v 2.0.0
        </div>
      </div>
    </aside>
  );
};
```

- [ ] **Step 2: 验证**

Sidebar 背景变为半透明暖色，导航项圆角 pill 形，选中态白色半透明 + 阴影。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/Layout/Sidebar.tsx
git commit -m "feat(ui): redesign Sidebar with Soft Editorial style"
```

---

### Task 5: Header — Soft Editorial 重做

**Files:**
- Modify: `frontend/src/components/Layout/Header.tsx`

- [ ] **Step 1: 完整重写 Header.tsx**

将 `frontend/src/components/Layout/Header.tsx` 完整替换为：

```tsx
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
```

- [ ] **Step 2: 验证**

标题使用 Cormorant 衬线体，副标题大写灰色，右侧有鼠尾草色状态 pill + 呼吸动画点。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/Layout/Header.tsx
git commit -m "feat(ui): redesign Header with Soft Editorial typography and status pill"
```

---

### Task 6: Dashboard 页面布局更新

**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx`

- [ ] **Step 1: 更新 Dashboard 布局**

将 `frontend/src/pages/Dashboard.tsx` 第 23-24 行：
```tsx
<main className="flex-1 flex overflow-hidden p-6">
  <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-6 w-full">
```
替换为：
```tsx
<main className="flex-1 overflow-y-auto p-6">
  <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-4 w-full">
```

同时将第 26 行：
```tsx
<div className="w-full lg:w-1/2 flex flex-col overflow-y-auto">
```
替换为：
```tsx
<div className="w-full lg:w-1/2 flex flex-col">
```

将第 31 行：
```tsx
<div className="w-full lg:w-1/2 space-y-6 overflow-y-auto">
```
替换为：
```tsx
<div className="w-full lg:w-1/2 space-y-4">
```

- [ ] **Step 2: 验证**

Dashboard 改为页面整体滚动，两栏间距缩小，容器变窄。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/pages/Dashboard.tsx
git commit -m "feat(ui): adjust Dashboard layout for Soft Editorial"
```

---

### Task 7: QuickGenerate — Soft Editorial 重做 + 动效

**Files:**
- Modify: `frontend/src/components/Dashboard/QuickGenerate.tsx`

- [ ] **Step 1: 完整重写 QuickGenerate.tsx**

将 `frontend/src/components/Dashboard/QuickGenerate.tsx` 完整替换为：

```tsx
import React, { useState } from 'react';
import { useStore } from '../../store';

interface QuickGenerateProps {
  onItemsLoaded?: () => void;
}

export const QuickGenerate: React.FC<QuickGenerateProps> = ({ onItemsLoaded }) => {
  const { todayItems, fetchTodayItems, rewriteScript, isRewriting } = useStore();
  const [category, setCategory] = useState<string>('');
  const [count, setCount] = useState<number>(10);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = [
    { value: '', label: '全部' },
    { value: 'ai-models', label: 'AI 模型' },
    { value: 'ai-products', label: 'AI 产品' },
    { value: 'industry', label: '行业动态' },
    { value: 'paper', label: '论文' },
    { value: 'tip', label: '技巧' },
  ];

  const categoryColors: Record<string, string> = {
    'ai-models': 'bg-lemon/30',
    'ai-products': 'bg-lilac/30',
    'industry': 'bg-blush/40',
    'paper': 'bg-sage/30',
    'tip': 'bg-pink/20',
  };

  const handleFetch = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await fetchTodayItems({
        category: category || undefined,
        take: count,
      });
      onItemsLoaded?.();
    } catch (err) {
      setError('获取资讯失败，请稍后重试');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRewrite = async () => {
    if (todayItems.length === 0) {
      setError('请先获取今日资讯');
      return;
    }
    setError(null);
    try {
      await rewriteScript({ items: todayItems });
    } catch (err) {
      setError('改写口播稿失败，请稍后重试');
      console.error(err);
    }
  };

  return (
    <div className="bg-white/[0.55] backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border animate-fade-in-up">
      {/* 标题 */}
      <div className="flex items-center gap-2 mb-4">
        <span className="w-2 h-2 rounded-full bg-lemon" />
        <h3 className="font-display italic text-[14px] font-medium text-ink-soft">资讯获取</h3>
      </div>

      {/* 配置区 */}
      <div className="flex gap-2 mb-4">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="flex-1 bg-white/70 text-ink rounded-full px-3.5 py-2 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[12px] appearance-none cursor-pointer transition-colors"
        >
          {categories.map((cat) => (
            <option key={cat.value} value={cat.value}>{cat.label}</option>
          ))}
        </select>
        <select
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className="w-20 bg-white/70 text-ink rounded-full px-3 py-2 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[12px] appearance-none cursor-pointer transition-colors"
        >
          {[5, 10, 15, 20].map((n) => (
            <option key={n} value={n}>{n} 条</option>
          ))}
        </select>
        <button
          onClick={handleFetch}
          disabled={isLoading}
          className="bg-lemon hover:brightness-105 disabled:opacity-50 text-ink font-body font-medium text-[12px] rounded-full px-5 py-2 shadow-btn transition-all duration-150 hover:-translate-y-px active:translate-y-0 active:shadow-none uppercase tracking-wider whitespace-nowrap"
        >
          {isLoading ? '加载中...' : '获取'}
        </button>
      </div>

      {/* 资讯列表 */}
      {todayItems.length > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-3">
            <span className="font-body text-[11px] uppercase tracking-wider text-ink-soft/60">
              已加载 {todayItems.length} 条资讯
            </span>
            <button
              onClick={handleRewrite}
              disabled={isRewriting}
              className="bg-pink hover:brightness-105 disabled:opacity-50 text-ink font-body font-medium text-[12px] rounded-full px-5 py-2 shadow-btn transition-all duration-150 hover:-translate-y-px active:translate-y-0 active:shadow-none uppercase tracking-wider"
            >
              {isRewriting ? '改写中...' : '✦ 一键改写口播稿'}
            </button>
          </div>

          <div className="space-y-0">
            {todayItems.map((item, index) => (
              <div
                key={item.id}
                className="flex items-start gap-3 py-2.5 border-b border-card-border last:border-0"
                style={{
                  animation: `fade-in-left 0.3s cubic-bezier(0.22, 1, 0.36, 1) ${index * 0.05}s both`,
                }}
              >
                <span className="font-display italic text-[16px] font-medium text-pink min-w-[26px] leading-snug">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="flex-1 min-w-0">
                  <h4 className="font-body text-[13px] font-medium text-ink leading-snug">
                    {item.title}
                  </h4>
                  {item.category && (
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded-md font-body text-[9px] font-medium uppercase tracking-wider text-ink ${categoryColors[item.category] || 'bg-paper-2'}`}>
                      {categories.find(c => c.value === item.category)?.label || item.category}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 骨架屏加载态 */}
      {isLoading && todayItems.length === 0 && (
        <div className="mt-3 space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-start gap-3 py-2.5 animate-pulse">
              <div className="w-6 h-4 bg-ink/5 rounded" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-ink/5 rounded w-3/4" />
                <div className="h-2 bg-ink/5 rounded w-1/4" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="mt-3 bg-pink/10 border border-pink/30 rounded-xl p-3 text-ink text-[12px] font-body animate-shake">
          {error}
        </div>
      )}
    </div>
  );
};

export default QuickGenerate;
```

- [ ] **Step 2: 验证**

毛玻璃卡片 + 柠檬绿标题色点 + 玫瑰粉改写按钮 + stagger 入场动画 + 骨架屏。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/Dashboard/QuickGenerate.tsx
git commit -m "feat(ui): redesign QuickGenerate with Soft Editorial + animations"
```

---

### Task 8: ScriptPreview — Soft Editorial 重做

**Files:**
- Modify: `frontend/src/components/Dashboard/ScriptPreview.tsx`

- [ ] **Step 1: 完整重写 ScriptPreview.tsx**

将 `frontend/src/components/Dashboard/ScriptPreview.tsx` 完整替换为：

```tsx
import React, { useState, useEffect } from 'react';
import { useStore } from '../../store';

export const ScriptPreview: React.FC = () => {
  const { script, updateScript, settings } = useStore();
  const [isEditing, setIsEditing] = useState(false);
  const [localScript, setLocalScript] = useState(script);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    setLocalScript(script);
  }, [script]);

  const handleSave = () => {
    updateScript(localScript);
    setIsEditing(false);
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 600);
  };

  const handleCancel = () => {
    setLocalScript(script);
    setIsEditing(false);
  };

  const handleAddOpening = () => {
    const newScript = settings.opening_script + '\n\n' + script;
    updateScript(newScript);
    setLocalScript(newScript);
  };

  const handleAddClosing = () => {
    const newScript = script + '\n\n' + settings.closing_script;
    updateScript(newScript);
    setLocalScript(newScript);
  };

  const wordCount = script.length;
  const estimatedDuration = Math.ceil(wordCount / 4);

  return (
    <div className="bg-white/[0.55] backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border" style={{ animation: 'fade-in-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.08s both' }}>
      {/* 标题 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full bg-pink transition-transform duration-300 ${showSaved ? 'animate-scale-bounce' : ''}`} />
          <h3 className="font-display italic text-[14px] font-medium text-ink-soft">口播稿预览</h3>
        </div>
        <div className="flex items-center gap-2">
          {!isEditing && script && (
            <>
              <span className="font-body text-[10px] uppercase tracking-wider text-ink-soft/40">
                {wordCount} 字 · ≈ {estimatedDuration} 秒
              </span>
              <button
                onClick={() => setIsEditing(true)}
                className="font-body text-[12px] text-ink-soft hover:text-ink transition-colors"
              >
                编辑
              </button>
            </>
          )}
        </div>
      </div>

      {/* 内容区 */}
      {isEditing ? (
        <div className="animate-fade-in">
          <textarea
            value={localScript}
            onChange={(e) => setLocalScript(e.target.value)}
            className="w-full h-64 bg-white/60 text-ink rounded-2xl p-4 border border-card-border focus:border-ink/20 focus:outline-none resize-none font-body text-[13px] leading-[1.9] transition-colors"
            placeholder="在此编辑口播稿..."
          />
          <div className="flex justify-end gap-2 mt-3">
            <button
              onClick={handleCancel}
              className="px-4 py-2 font-body text-[12px] text-ink-soft hover:text-ink transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 font-body text-[12px] bg-sage hover:brightness-105 text-ink rounded-xl shadow-btn transition-all duration-150"
            >
              保存
            </button>
          </div>
        </div>
      ) : (
        <div>
          {script ? (
            <div className="bg-white/60 rounded-2xl p-4 min-h-[16rem] max-h-80 overflow-y-auto border border-card-border">
              <pre className="text-ink font-body text-[13px] leading-[1.9] whitespace-pre-wrap">
                {script}
              </pre>
            </div>
          ) : (
            <div className="bg-white/40 rounded-2xl p-8 min-h-[16rem] flex items-center justify-center border border-card-border">
              <p className="font-body text-[12px] text-ink-soft/50">
                请先获取今日资讯并点击「一键改写口播稿」
              </p>
            </div>
          )}
        </div>
      )}

      {/* 操作栏 */}
      {script && !isEditing && (
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-card-border">
          <button
            onClick={handleAddOpening}
            className="font-body text-[11px] px-3 py-1.5 bg-sage/20 hover:bg-sage/30 text-ink-soft rounded-full transition-colors uppercase tracking-wider"
          >
            + 添加开场白
          </button>
          <button
            onClick={handleAddClosing}
            className="font-body text-[11px] px-3 py-1.5 bg-sage/20 hover:bg-sage/30 text-ink-soft rounded-full transition-colors uppercase tracking-wider"
          >
            + 添加结束语
          </button>
        </div>
      )}
    </div>
  );
};

export default ScriptPreview;
```

- [ ] **Step 2: 验证**

毛玻璃卡片 + 玫瑰粉色点 + 18px 圆角脚本区 + 保存时色点弹跳动画。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/Dashboard/ScriptPreview.tsx
git commit -m "feat(ui): redesign ScriptPreview with Soft Editorial style"
```

---

### Task 9: VoiceGenerator — Soft Editorial 重做

**Files:**
- Modify: `frontend/src/components/Dashboard/VoiceGenerator.tsx`

- [ ] **Step 1: 完整重写 VoiceGenerator.tsx**

将 `frontend/src/components/Dashboard/VoiceGenerator.tsx` 完整替换为：

```tsx
import React, { useState } from 'react';
import { useStore } from '../../store';

interface VoiceGeneratorProps {
  script: string;
}

const VOICE_OPTIONS = [
  { value: 'mimo_default', label: 'MiMo-默认', description: '默认音色' },
  { value: '冰糖', label: '冰糖', description: '中文女声' },
  { value: '茉莉', label: '茉莉', description: '中文女声' },
  { value: '苏打', label: '苏打', description: '中文男声' },
  { value: '白桦', label: '白桦', description: '中文男声' },
  { value: 'Mia', label: 'Mia', description: '英文女声' },
  { value: 'Chloe', label: 'Chloe', description: '英文女声' },
  { value: 'Milo', label: 'Milo', description: '英文男声' },
  { value: 'Dean', label: 'Dean', description: '英文男声' },
];

const VOICE_TYPES = [
  { value: 'preset', label: '预设音色' },
  { value: 'clone', label: '声音克隆' },
  { value: 'design', label: '音色设计' },
];

export const VoiceGenerator: React.FC<VoiceGeneratorProps> = ({ script }) => {
  const { generateBroadcast, splitScript, isGenerating, isSplitting, settings } = useStore();
  const [voiceType, setVoiceType] = useState('preset');
  const [selectedVoice, setSelectedVoice] = useState(settings.default_voice || '冰糖');
  const [voiceClone, setVoiceClone] = useState('');
  const [voiceDesign, setVoiceDesign] = useState('');
  const [stylePrompt, setStylePrompt] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSplitAndGenerate = async () => {
    if (!script) {
      setError('请先生成口播稿');
      return;
    }
    setError(null);
    try {
      const result = await generateBroadcast({
        text: script,
        voice: voiceType === 'preset' ? selectedVoice : undefined,
        voiceType,
        voiceDesign: voiceType === 'design' ? voiceDesign : undefined,
        voiceClone: voiceType === 'clone' ? voiceClone : undefined,
        stylePrompt: stylePrompt || undefined,
        mode: 'segmented',
      });
      await splitScript(result.broadcast.id);
    } catch (err) {
      setError('操作失败，请检查 API Key 或稍后重试');
      console.error(err);
    }
  };

  const isBusy = isGenerating || isSplitting;

  return (
    <div className="bg-white/[0.55] backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border" style={{ animation: 'fade-in-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.04s both' }}>
      {/* 标题 */}
      <div className="flex items-center gap-2 mb-4">
        <span className="w-2 h-2 rounded-full bg-blush" />
        <h3 className="font-display italic text-[14px] font-medium text-ink-soft">语音生成</h3>
      </div>

      {/* 音色类型选择 */}
      <div className="mb-4">
        <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/60 mb-2 block">音色类型</label>
        <div className="flex gap-2">
          {VOICE_TYPES.map((type) => (
            <button
              key={type.value}
              onClick={() => setVoiceType(type.value)}
              className={`px-4 py-2 rounded-xl font-body text-[12px] font-medium transition-all duration-150 ${
                voiceType === type.value
                  ? 'bg-white/60 text-ink shadow-card border border-card-border'
                  : 'text-ink-soft hover:text-ink hover:bg-white/30'
              }`}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {/* 预设音色网格 */}
      {voiceType === 'preset' && (
        <div className="mb-4 animate-fade-in">
          <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/60 mb-2 block">选择音色</label>
          <div className="grid grid-cols-3 gap-2">
            {VOICE_OPTIONS.map((voice) => (
              <button
                key={voice.value}
                onClick={() => setSelectedVoice(voice.value)}
                className={`p-2.5 rounded-2xl text-center transition-all duration-150 ${
                  selectedVoice === voice.value
                    ? 'bg-lemon/25 border border-ink/15 shadow-card'
                    : 'bg-white/50 border border-card-border hover:border-ink/10'
                }`}
              >
                <span className="font-display text-[15px] font-medium text-ink block">{voice.label}</span>
                <span className="font-body text-[9px] uppercase tracking-wider text-ink-soft/40 mt-0.5 block">{voice.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 声音克隆 */}
      {voiceType === 'clone' && (
        <div className="mb-4 animate-fade-in">
          <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/60 mb-2 block">克隆声音 ID</label>
          <input
            type="text"
            value={voiceClone}
            onChange={(e) => setVoiceClone(e.target.value)}
            placeholder="输入已克隆的声音 ID"
            className="w-full bg-white/70 text-ink rounded-xl px-3.5 py-2.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[12px] transition-colors"
          />
        </div>
      )}

      {/* 音色设计 */}
      {voiceType === 'design' && (
        <div className="mb-4 animate-fade-in">
          <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/60 mb-2 block">音色设计描述</label>
          <textarea
            value={voiceDesign}
            onChange={(e) => setVoiceDesign(e.target.value)}
            placeholder="描述你想要的音色，例如：年轻女性，声音甜美，语速适中..."
            className="w-full h-20 bg-white/70 text-ink rounded-xl px-3.5 py-2.5 border border-card-border focus:border-ink/20 focus:outline-none resize-none font-body text-[12px] transition-colors"
          />
        </div>
      )}

      {/* 风格提示词 */}
      <div className="mb-4">
        <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/60 mb-2 block">
          风格提示词 <span className="normal-case tracking-normal text-ink-soft/40">(可选)</span>
        </label>
        <input
          type="text"
          value={stylePrompt}
          onChange={(e) => setStylePrompt(e.target.value)}
          placeholder="例如：语速稍快，情绪饱满，专业播报风格"
          className="w-full bg-white/70 text-ink rounded-xl px-3.5 py-2.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[12px] transition-colors"
        />
      </div>

      {/* 生成按钮 */}
      <button
        onClick={handleSplitAndGenerate}
        disabled={isBusy || !script}
        className="w-full bg-lilac hover:brightness-105 disabled:opacity-40 text-ink font-body font-medium text-[12px] rounded-xl px-4 py-3 shadow-btn transition-all duration-150 hover:-translate-y-px active:translate-y-0 active:shadow-none uppercase tracking-wider flex items-center justify-center gap-2"
      >
        {isBusy ? (
          <>
            <span className="w-4 h-1 bg-ink/20 rounded-full overflow-hidden">
              <span className="block h-full bg-ink/50 rounded-full animate-pulse" style={{ width: '60%' }} />
            </span>
            {isSplitting ? 'AI 切分中...' : '创建中...'}
          </>
        ) : (
          '切分并生成语音'
        )}
      </button>

      {/* 错误提示 */}
      {error && (
        <div className="mt-3 bg-pink/10 border border-pink/30 rounded-xl p-3 text-ink text-[12px] font-body animate-shake">
          {error}
        </div>
      )}
    </div>
  );
};

export default VoiceGenerator;
```

- [ ] **Step 2: 验证**

毛玻璃卡片 + 蜜桃色点 + 柠檬绿选中音色 + 丁香紫生成按钮 + 内容 crossfade。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/Dashboard/VoiceGenerator.tsx
git commit -m "feat(ui): redesign VoiceGenerator with Soft Editorial style"
```

---

### Task 10: AudioPlayer — Soft Editorial 重做 + 波形动画

**Files:**
- Modify: `frontend/src/components/Dashboard/AudioPlayer.tsx`

- [ ] **Step 1: 完整重写 AudioPlayer.tsx**

将 `frontend/src/components/Dashboard/AudioPlayer.tsx` 完整替换为：

```tsx
import React, { useRef, useState, useEffect, useCallback } from 'react';

interface AudioPlayerProps {
  audioUrl: string | null;
  title?: string;
  broadcastId?: number;
  isSaved?: boolean;
  onSave?: (id: number) => void;
  mode?: string | null;
}

// 生成固定数量的随机波形条高度
const generateWaveformBars = (count: number) => {
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    bars.push(8 + Math.random() * 20);
  }
  return bars;
};

const WAVEFORM_BARS = generateWaveformBars(32);

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  audioUrl,
  title = '语音播报',
  broadcastId,
  isSaved,
  onSave,
  mode,
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [audioUrl]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying, audioUrl]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const time = Number(e.target.value);
    audio.currentTime = time;
    setCurrentTime(time);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const vol = Number(e.target.value);
    audio.volume = vol;
    setVolume(vol);
  };

  const formatTime = (seconds: number): string => {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleDownload = () => {
    if (!audioUrl) return;
    const a = document.createElement('a');
    a.href = audioUrl;
    a.download = `${title}.mp3`;
    a.click();
  };

  const progress = duration > 0 ? currentTime / duration : 0;

  // 空状态
  if (!audioUrl) {
    return (
      <div className="bg-white/[0.55] backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border" style={{ animation: 'fade-in-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.2s both' }}>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full bg-sage" />
          <h3 className="font-display italic text-[14px] font-medium text-ink-soft">播放器</h3>
        </div>
        <div className="bg-white/40 rounded-2xl p-8 flex items-center justify-center border border-card-border">
          <p className="font-body text-[12px] text-ink-soft/40 animate-fade-in">
            {mode === 'segmented' ? '请先合并所有句子音频' : '生成语音后在此播放'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/[0.55] backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border" style={{ animation: 'fade-in-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.2s both' }}>
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-sage" />
          <h3 className="font-display italic text-[14px] font-medium text-ink-soft">播放器</h3>
        </div>
        <div className="flex items-center gap-3">
          {broadcastId && onSave && (
            <button
              onClick={() => onSave(broadcastId)}
              className={`font-body text-[11px] transition-colors flex items-center gap-1 uppercase tracking-wider ${
                isSaved ? 'text-lemon' : 'text-ink-soft/40 hover:text-lemon'
              }`}
              title={isSaved ? '取消保存' : '保存此播报'}
            >
              <svg className="w-3.5 h-3.5" fill={isSaved ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </button>
          )}
          <button
            onClick={handleDownload}
            className="font-body text-[11px] text-ink-soft/40 hover:text-ink transition-colors flex items-center gap-1 uppercase tracking-wider"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </button>
        </div>
      </div>

      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      {/* 播放器主体 — pill 形 */}
      <div className="bg-white/50 rounded-full px-4 py-3 flex items-center gap-3 border border-card-border">
        {/* 播放按钮 */}
        <button
          onClick={togglePlay}
          className="w-9 h-9 bg-pink/25 hover:bg-pink/35 rounded-full flex items-center justify-center transition-colors flex-shrink-0 border border-card-border"
        >
          {isPlaying ? (
            <svg className="w-4 h-4 text-ink" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-ink ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* 波形可视化 */}
        <div className="flex-1 flex items-center gap-[2px] h-7 overflow-hidden">
          {WAVEFORM_BARS.map((height, i) => {
            const barProgress = i / WAVEFORM_BARS.length;
            const isPlayed = barProgress <= progress;
            return (
              <div
                key={i}
                className={`w-[3px] rounded-full transition-all duration-100 ${
                  isPlayed ? 'bg-pink' : 'bg-ink/10'
                }`}
                style={{
                  height: `${height}px`,
                  ...(isPlaying && isPlayed ? { animation: `waveform-pulse 1.5s ease-in-out ${i * 0.05}s infinite` } : {}),
                }}
              />
            );
          })}
        </div>

        {/* 时间 */}
        <span className="font-body text-[11px] text-ink-soft/50 min-w-[72px] text-right tabular-nums">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>

      {/* 隐藏的 seek range（点击波形区域可跳转） */}
      <input
        type="range"
        min={0}
        max={duration || 0}
        value={currentTime}
        onChange={handleSeek}
        className="w-full h-0 opacity-0 -mt-3 relative z-10 cursor-pointer"
      />
    </div>
  );
};

export default AudioPlayer;
```

- [ ] **Step 2: 验证**

pill 形播放器 + 玫瑰粉波形条 + 播放中脉动动画 + 空状态柔和提示。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/Dashboard/AudioPlayer.tsx
git commit -m "feat(ui): redesign AudioPlayer with waveform visualization"
```

---

### Task 11: SegmentEditor — Soft Editorial 重做

**Files:**
- Modify: `frontend/src/components/Dashboard/SegmentEditor.tsx`

- [ ] **Step 1: 完整重写 SegmentEditor.tsx**

将 `frontend/src/components/Dashboard/SegmentEditor.tsx` 完整替换为：

```tsx
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useStore } from '../../store';
import type { Segment } from '../../store';

// ============ StatusBadge ============

interface StatusBadgeProps {
  status: Segment['status'];
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const styles: Record<string, string> = {
    pending: 'bg-lemon/25 text-ink',
    generating: 'bg-lilac/25 text-ink',
    generated: 'bg-sage/30 text-ink',
    failed: 'bg-pink/20 text-ink',
  };
  const labels: Record<string, string> = {
    pending: '◌ 等待中',
    generating: '⟳ 生成中',
    generated: '✓ 就绪',
    failed: '✕ 失败',
  };
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] px-2.5 py-1 rounded-full font-body font-medium uppercase tracking-wider ${styles[status] || ''}`}>
      {labels[status] || status}
    </span>
  );
};

// ============ SegmentAudio ============

interface SegmentAudioProps {
  audioUrl: string;
}

const SegmentAudio: React.FC<SegmentAudioProps> = ({ audioUrl }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [audioUrl]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) { audio.pause(); } else { audio.play(); }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const formatTime = (s: number) => {
    if (isNaN(s)) return '0:00';
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-2">
      <audio ref={audioRef} src={audioUrl} preload="metadata" />
      <button
        onClick={togglePlay}
        className="w-7 h-7 bg-pink/25 hover:bg-pink/35 rounded-full flex items-center justify-center transition-colors flex-shrink-0 border border-card-border"
      >
        {isPlaying ? (
          <svg className="w-3 h-3 text-ink" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
        ) : (
          <svg className="w-3 h-3 text-ink ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
        )}
      </button>
      <span className="font-body text-[10px] text-ink-soft/50">{formatTime(duration)}</span>
    </div>
  );
};

// ============ 主组件 ============

interface SegmentEditorProps {
  broadcastId: number;
  onMerged?: () => void;
}

export const SegmentEditor: React.FC<SegmentEditorProps> = ({ broadcastId, onMerged }) => {
  const {
    segments, isSplitting, isMerging,
    fetchSegments, updateSegmentText, regenerateSegment,
    batchGenerateSegments, deleteSegment, mergeSegments,
  } = useStore();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSegments(broadcastId).catch(() => setError('加载句子列表失败'));
  }, [broadcastId, fetchSegments]);

  if (!segments.length && !isSplitting) return null;

  const hasPendingOrFailed = segments.some((s) => s.status === 'pending' || s.status === 'failed');
  const allGenerated = segments.length > 0 && segments.every((s) => s.status === 'generated');

  const handleStartEdit = (seg: Segment) => { setEditingId(seg.id); setEditText(seg.text); };
  const handleCancelEdit = () => { setEditingId(null); setEditText(''); };
  const handleSaveEdit = async (segId: number) => {
    if (!editText.trim()) return;
    setError(null);
    try { await updateSegmentText(broadcastId, segId, editText.trim()); setEditingId(null); setEditText(''); }
    catch { setError('保存编辑失败'); }
  };
  const handleRegenerate = async (segId: number) => { setError(null); try { await regenerateSegment(broadcastId, segId); } catch { setError('重新生成失败'); } };
  const handleDelete = async (segId: number) => { setError(null); try { await deleteSegment(broadcastId, segId); } catch { setError('删除失败'); } };
  const handleBatchGenerate = async () => { setError(null); try { await batchGenerateSegments(broadcastId); } catch { setError('批量生成失败'); } };
  const handleMerge = async () => { setError(null); try { await mergeSegments(broadcastId); onMerged?.(); } catch { setError('合并失败'); } };

  // Splitting 加载态
  if (isSplitting) {
    return (
      <div className="bg-white/[0.55] backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border">
        <div className="flex items-center justify-center gap-3 py-8">
          <div className="w-4 h-1 bg-ink/10 rounded-full overflow-hidden">
            <div className="h-full bg-lilac rounded-full animate-pulse" style={{ width: '60%' }} />
          </div>
          <span className="font-body text-[12px] text-ink-soft">正在切分句子...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/[0.55] backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border" style={{ animation: 'fade-in-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.12s both' }}>
      <div className="flex items-center gap-2 mb-4">
        <span className="w-2 h-2 rounded-full bg-lilac" />
        <h3 className="font-display italic text-[14px] font-medium text-ink-soft">段落编辑器</h3>
      </div>

      {/* Segment 列表 */}
      <div className="space-y-2 mb-4">
        {segments.map((seg, index) => (
          <div
            key={seg.id}
            className="bg-white/45 rounded-2xl p-3 border border-card-border flex items-center gap-3"
            style={{ animation: `fade-in-up 0.3s cubic-bezier(0.22, 1, 0.36, 1) ${index * 0.05}s both` }}
          >
            <span className="font-display italic text-[18px] font-medium text-lilac min-w-[22px]">
              {String(seg.index + 1).padStart(2, '0')}
            </span>

            <div className="flex-1 min-w-0">
              {editingId === seg.id ? (
                <div className="animate-fade-in">
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="w-full h-16 bg-white/60 text-ink rounded-xl px-3 py-2 border border-ink/15 focus:border-ink/25 focus:outline-none resize-none font-body text-[12px]"
                    autoFocus
                  />
                  <div className="flex gap-2 mt-1.5">
                    <button onClick={() => handleSaveEdit(seg.id)} className="px-3 py-1 bg-sage text-ink text-[11px] font-body rounded-lg shadow-btn">保存</button>
                    <button onClick={handleCancelEdit} className="px-3 py-1 text-ink-soft text-[11px] font-body">取消</button>
                  </div>
                </div>
              ) : (
                <p className="font-body text-[12px] text-ink leading-relaxed truncate">{seg.text}</p>
              )}
            </div>

            <StatusBadge status={seg.status} />

            <div className="flex items-center gap-0.5">
              <button onClick={() => handleStartEdit(seg)} disabled={seg.status === 'generating' || editingId === seg.id} className="p-1.5 rounded-lg text-ink-soft/40 hover:text-ink hover:bg-white/50 transition-colors disabled:opacity-30" title="编辑">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              </button>
              <button onClick={() => handleRegenerate(seg.id)} disabled={seg.status === 'generating'} className="p-1.5 rounded-lg text-ink-soft/40 hover:text-ink hover:bg-white/50 transition-colors disabled:opacity-30" title="重新生成">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              </button>
              <button onClick={() => handleDelete(seg.id)} disabled={seg.status === 'generating'} className="p-1.5 rounded-lg text-ink-soft/40 hover:text-pink hover:bg-white/50 transition-colors disabled:opacity-30" title="删除">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mb-3 bg-pink/10 border border-pink/30 rounded-xl p-3 text-ink text-[12px] font-body animate-shake">{error}</div>
      )}

      {/* 底部操作栏 */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleBatchGenerate}
          disabled={!hasPendingOrFailed}
          className="flex-1 bg-sage hover:brightness-105 disabled:opacity-40 text-ink font-body font-medium text-[12px] rounded-xl px-4 py-2.5 shadow-btn transition-all duration-150 uppercase tracking-wider"
        >
          全部生成
        </button>
        <button
          onClick={handleMerge}
          disabled={!allGenerated || isMerging}
          className="flex-1 bg-lilac hover:brightness-105 disabled:opacity-40 text-ink font-body font-medium text-[12px] rounded-xl px-4 py-2.5 shadow-btn transition-all duration-150 uppercase tracking-wider flex items-center justify-center gap-2"
        >
          {isMerging ? (
            <>
              <div className="w-3 h-1 bg-ink/20 rounded-full overflow-hidden"><div className="h-full bg-ink/50 rounded-full animate-pulse" style={{ width: '60%' }} /></div>
              合并中...
            </>
          ) : '合并音频'}
        </button>
      </div>
    </div>
  );
};

export default SegmentEditor;
```

- [ ] **Step 2: 验证**

丁香紫色点 + stagger 入场 + 彩色状态 pill + 鼠尾草/丁香紫操作按钮。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/Dashboard/SegmentEditor.tsx
git commit -m "feat(ui): redesign SegmentEditor with Soft Editorial style"
```

---

### Task 12: History 页面 — Soft Editorial 重做

**Files:**
- Modify: `frontend/src/pages/History.tsx`

- [ ] **Step 1: 完整重写 History.tsx**

将 `frontend/src/pages/History.tsx` 完整替换为：

```tsx
import React, { useEffect, useState } from 'react';
import { Header } from '../components/Layout/Header';
import { AudioPlayer } from '../components/Dashboard/AudioPlayer';
import useStore from '../store';
import type { Broadcast } from '../store';

const formatDuration = (seconds: number | null): string => {
  if (seconds === null || seconds === undefined) return '--:--';
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
};

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays < 7) return `${diffDays} 天前`;
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const getStatusBadge = (status: string) => {
  const styles: Record<string, string> = {
    completed: 'bg-sage/30 text-ink',
    generating: 'bg-lemon/25 text-ink',
    failed: 'bg-pink/20 text-ink',
  };
  const labels: Record<string, string> = { completed: '✓ 已完成', generating: '◌ 生成中', failed: '✕ 失败' };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[9px] font-body font-medium uppercase tracking-wider ${styles[status] || 'bg-paper-2 text-ink-soft'}`}>
      {labels[status] || status}
    </span>
  );
};

export const History: React.FC = () => {
  const { broadcasts, fetchBroadcasts, currentBroadcast, setCurrentBroadcast, saveBroadcast } = useStore();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const loadBroadcasts = async (pageNum: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchBroadcasts({ page: pageNum, limit });
      setTotal(result.pagination.total);
    } catch (err) {
      setError('加载播报历史失败，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadBroadcasts(page); }, [page]);

  const handleSelectBroadcast = (broadcast: Broadcast) => setCurrentBroadcast(broadcast);
  const getAudioUrl = (broadcast: Broadcast): string | null => broadcast.audio_path ? `/api/broadcast/${broadcast.id}/audio` : null;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header title="播报历史" subtitle={`共 ${total} 条播报记录`} />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto space-y-4">
          {/* 列表 */}
          <div className="bg-white/[0.55] backdrop-blur-sm rounded-card shadow-card border border-card-border overflow-hidden">
            {/* 加载骨架屏 */}
            {isLoading && (
              <div className="p-6 space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-4 animate-pulse" style={{ animationDelay: `${i * 0.05}s` }}>
                    <div className="h-4 bg-ink/5 rounded w-2/5" />
                    <div className="h-3 bg-ink/5 rounded w-1/6" />
                    <div className="h-3 bg-ink/5 rounded w-1/12" />
                    <div className="h-5 bg-ink/5 rounded-full w-16" />
                  </div>
                ))}
              </div>
            )}

            {/* 错误 */}
            {error && !isLoading && (
              <div className="p-12 text-center">
                <p className="font-body text-[13px] text-pink mb-3">{error}</p>
                <button onClick={() => loadBroadcasts(page)} className="font-body text-[12px] text-ink-soft hover:text-ink transition-colors">重新加载</button>
              </div>
            )}

            {/* 空状态 */}
            {!isLoading && !error && broadcasts.length === 0 && (
              <div className="p-12 text-center animate-fade-in">
                <p className="font-display italic text-[16px] text-ink-soft/40 mb-1">暂无播报记录</p>
                <p className="font-body text-[12px] text-ink-soft/30">前往控制台生成第一条播报</p>
              </div>
            )}

            {/* 列表内容 */}
            {!isLoading && !error && broadcasts.map((broadcast, index) => {
              const isSelected = currentBroadcast?.id === broadcast.id;
              return (
                <div
                  key={broadcast.id}
                  onClick={() => handleSelectBroadcast(broadcast)}
                  className={`flex items-center gap-4 px-5 py-3.5 border-b border-card-border cursor-pointer transition-all duration-200 ${
                    isSelected ? 'bg-sage/10' : 'hover:bg-white/30'
                  }`}
                  style={{ animation: `fade-in-up 0.3s cubic-bezier(0.22, 1, 0.36, 1) ${index * 0.03}s both` }}
                >
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <p className={`font-display text-[15px] font-medium truncate ${isSelected ? 'text-ink' : 'text-ink/80'}`}>
                      {broadcast.title}
                    </p>
                    {broadcast.saved === 1 && (
                      <svg className="w-3 h-3 text-lemon flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                      </svg>
                    )}
                  </div>
                  <span className="font-body text-[12px] text-ink-soft/60 min-w-[80px]">{formatDate(broadcast.created_at)}</span>
                  <span className="font-body text-[12px] text-ink-soft/60 min-w-[50px]">{formatDuration(broadcast.duration)}</span>
                  {getStatusBadge(broadcast.status)}
                </div>
              );
            })}
          </div>

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="font-body text-[11px] text-ink-soft/50 uppercase tracking-wider">
                第 {page} / {totalPages} 页，共 {total} 条
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-4 py-1.5 font-body text-[12px] bg-white/50 text-ink-soft rounded-full border border-card-border hover:bg-white/70 disabled:opacity-40 transition-colors">上一页</button>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-4 py-1.5 font-body text-[12px] bg-white/50 text-ink-soft rounded-full border border-card-border hover:bg-white/70 disabled:opacity-40 transition-colors">下一页</button>
              </div>
            </div>
          )}

          {/* 口播稿预览 */}
          {currentBroadcast?.content && (
            <div className="bg-white/[0.55] backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border animate-fade-in">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-pink" />
                <h3 className="font-display italic text-[14px] font-medium text-ink-soft">口播稿预览</h3>
                <span className="font-body text-[10px] uppercase tracking-wider text-ink-soft/40 ml-auto">
                  {currentBroadcast.content.length} 字 · ≈ {Math.ceil(currentBroadcast.content.length / 4)} 秒
                </span>
              </div>
              <div className="bg-white/60 rounded-2xl p-4 border border-card-border">
                <pre className="text-ink font-body text-[13px] leading-[1.9] whitespace-pre-wrap">{currentBroadcast.content}</pre>
              </div>
            </div>
          )}

          {/* 音频播放器 */}
          <AudioPlayer
            audioUrl={currentBroadcast ? getAudioUrl(currentBroadcast) : null}
            title={currentBroadcast?.title || '选择一条播报记录播放'}
            broadcastId={currentBroadcast?.id}
            isSaved={currentBroadcast?.saved === 1}
            onSave={saveBroadcast}
          />
        </div>
      </main>
    </div>
  );
};

export default History;
```

- [ ] **Step 2: 验证**

毛玻璃卡片列表 + stagger 入场 + 骨架屏加载 + 彩色状态 pill + pill 形分页按钮。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/pages/History.tsx
git commit -m "feat(ui): redesign History page with Soft Editorial style"
```

---

### Task 13: Settings 页面 — Soft Editorial 重做

**Files:**
- Modify: `frontend/src/pages/Settings.tsx`

- [ ] **Step 1: 完整重写 Settings.tsx**

将 `frontend/src/pages/Settings.tsx` 完整替换为：

```tsx
import React, { useEffect, useState } from 'react';
import { Header } from '../components/Layout/Header';
import useStore from '../store';

const voiceOptions = [
  { value: '冰糖', label: '冰糖' },
  { value: '蜜糖', label: '蜜糖' },
  { value: '清风', label: '清风' },
  { value: '墨鱼', label: '墨鱼' },
  { value: '楠楠', label: '楠楠' },
];

const cronExamples = [
  { label: '每天早上 8:00', value: '0 8 * * *' },
  { label: '每天中午 12:00', value: '0 12 * * *' },
  { label: '每天下午 18:00', value: '0 18 * * *' },
  { label: '工作日早上 9:00', value: '0 9 * * 1-5' },
  { label: '每周一早上 10:00', value: '0 10 * * 1' },
];

export const Settings: React.FC = () => {
  const {
    settings, isLoadingSettings, fetchSettings, updateSettings, testApiKey,
    schedules, fetchSchedules, createSchedule, deleteSchedule, toggleSchedule,
  } = useStore();

  const [formData, setFormData] = useState(settings);
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingKey, setIsTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<{ valid: boolean; error?: string } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [scheduleForm, setScheduleForm] = useState({ name: '', cron_expression: '', content_types: '' });
  const [isCreatingSchedule, setIsCreatingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  useEffect(() => { fetchSettings(); fetchSchedules(); }, []);
  useEffect(() => { setFormData(settings); }, [settings]);

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try { await updateSettings(formData); setSaveSuccess(true); setTimeout(() => setSaveSuccess(false), 3000); }
    catch (e) { console.error('保存设置失败:', e); }
    finally { setIsSaving(false); }
  };

  const handleTestKey = async () => {
    setIsTestingKey(true);
    setTestResult(null);
    try { setTestResult(await testApiKey()); }
    catch (e) { setTestResult({ valid: false, error: (e as Error).message }); }
    finally { setIsTestingKey(false); }
  };

  const handleCreateSchedule = async () => {
    if (!scheduleForm.name || !scheduleForm.cron_expression) { setScheduleError('请填写任务名称和执行时间'); return; }
    setIsCreatingSchedule(true); setScheduleError(null);
    try { await createSchedule(scheduleForm); setScheduleForm({ name: '', cron_expression: '', content_types: '' }); }
    catch { setScheduleError('创建定时任务失败'); }
    finally { setIsCreatingSchedule(false); }
  };

  const handleDeleteSchedule = async (id: number) => {
    if (!window.confirm('确定要删除此定时任务吗？')) return;
    try { await deleteSchedule(id); } catch (e) { console.error(e); }
  };

  const handleToggleSchedule = async (id: number) => {
    try { await toggleSchedule(id); } catch (e) { console.error(e); }
  };

  const formatCronExpression = (cron: string) => cronExamples.find((e) => e.value === cron)?.label || cron;

  // Section card wrapper
  const SectionCard: React.FC<{
    dotColor: string;
    title: string;
    index: number;
    children: React.ReactNode;
  }> = ({ dotColor, title, index, children }) => (
    <section
      className="bg-white/[0.55] backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border"
      style={{ animation: `fade-in-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) ${index * 0.1}s both` }}
    >
      <div className="flex items-center gap-2 mb-4">
        <span className={`w-2 h-2 rounded-full ${dotColor}`} />
        <h3 className="font-display italic text-[14px] font-medium text-ink-soft">{title}</h3>
      </div>
      {children}
    </section>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header title="系统设置" subtitle="配置 TTS 播报系统参数" />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {/* 加载骨架屏 */}
          {isLoadingSettings && (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white/[0.55] rounded-card p-5 animate-pulse">
                  <div className="h-3 bg-ink/5 rounded w-24 mb-4" />
                  <div className="h-8 bg-ink/5 rounded w-full" />
                </div>
              ))}
            </div>
          )}

          {/* API Key */}
          {!isLoadingSettings && (
            <SectionCard dotColor="bg-pink" title="API Key 设置" index={0}>
              <div>
                <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/60 mb-2 block">MiMo API Key</label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={formData.mimo_api_key}
                    onChange={(e) => handleChange('mimo_api_key', e.target.value)}
                    placeholder="请输入 MiMo API Key"
                    className="flex-1 px-4 py-2.5 bg-white/70 border border-card-border rounded-xl text-ink placeholder-ink-soft/30 focus:outline-none focus:border-ink/20 font-body text-[12px] transition-colors"
                  />
                  <button
                    onClick={handleTestKey}
                    disabled={isTestingKey || !formData.mimo_api_key}
                    className="px-4 py-2.5 bg-sage hover:brightness-105 disabled:opacity-40 text-ink rounded-xl font-body text-[12px] shadow-btn transition-all duration-150 flex items-center gap-2 whitespace-nowrap"
                  >
                    {isTestingKey ? (
                      <><div className="w-3 h-1 bg-ink/20 rounded-full overflow-hidden"><div className="h-full bg-ink/50 rounded-full animate-pulse" style={{ width: '60%' }} /></div>测试中...</>
                    ) : '测试连接'}
                  </button>
                </div>
                {testResult && (
                  <div className={`mt-3 p-3 rounded-xl font-body text-[12px] animate-fade-in ${testResult.valid ? 'bg-sage/15 text-ink' : 'bg-pink/10 text-ink'}`}>
                    {testResult.valid ? '✓ API Key 验证成功！' : `✕ 验证失败: ${testResult.error}`}
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {/* 音色设置 */}
          {!isLoadingSettings && (
            <SectionCard dotColor="bg-blush" title="音色设置" index={1}>
              <div>
                <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/60 mb-2 block">默认音色</label>
                <select
                  value={formData.default_voice}
                  onChange={(e) => handleChange('default_voice', e.target.value)}
                  className="w-full px-4 py-2.5 bg-white/70 border border-card-border rounded-xl text-ink focus:outline-none focus:border-ink/20 font-body text-[12px] appearance-none cursor-pointer transition-colors"
                >
                  {voiceOptions.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
                </select>
                <p className="mt-2 font-body text-[11px] text-ink-soft/40">选择播报时使用的默认语音音色</p>
              </div>
            </SectionCard>
          )}

          {/* 播报设置 */}
          {!isLoadingSettings && (
            <SectionCard dotColor="bg-sage" title="播报设置" index={2}>
              <div className="space-y-4">
                <div>
                  <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/60 mb-2 block">开场白</label>
                  <textarea
                    value={formData.opening_script}
                    onChange={(e) => handleChange('opening_script', e.target.value)}
                    rows={3}
                    placeholder="请输入播报开场白"
                    className="w-full px-4 py-2.5 bg-white/70 border border-card-border rounded-xl text-ink placeholder-ink-soft/30 focus:outline-none focus:border-ink/20 font-body text-[12px] resize-none transition-colors"
                  />
                </div>
                <div>
                  <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/60 mb-2 block">结束语</label>
                  <textarea
                    value={formData.closing_script}
                    onChange={(e) => handleChange('closing_script', e.target.value)}
                    rows={3}
                    placeholder="请输入播报结束语"
                    className="w-full px-4 py-2.5 bg-white/70 border border-card-border rounded-xl text-ink placeholder-ink-soft/30 focus:outline-none focus:border-ink/20 font-body text-[12px] resize-none transition-colors"
                  />
                </div>
              </div>
            </SectionCard>
          )}

          {/* 保存按钮 */}
          {!isLoadingSettings && (
            <div className="flex items-center justify-between" style={{ animation: 'fade-in-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.3s both' }}>
              {saveSuccess && (
                <span className="font-body text-[12px] text-sage flex items-center gap-1.5 animate-fade-in">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  设置已保存
                </span>
              )}
              <div className="flex-1" />
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-6 py-2.5 bg-sage hover:brightness-105 disabled:opacity-40 text-ink rounded-xl font-body font-medium text-[12px] shadow-btn transition-all duration-150 hover:-translate-y-px active:translate-y-0 flex items-center gap-2 uppercase tracking-wider"
              >
                {isSaving ? (
                  <><div className="w-3 h-1 bg-ink/20 rounded-full overflow-hidden"><div className="h-full bg-ink/50 rounded-full animate-pulse" style={{ width: '60%' }} /></div>保存中...</>
                ) : '保存设置'}
              </button>
            </div>
          )}

          {/* 定时任务 */}
          <SectionCard dotColor="bg-lemon" title="定时任务" index={4}>
            {/* 添加任务表单 */}
            <div className="bg-white/30 rounded-2xl p-4 mb-4 border border-card-border">
              <h4 className="font-body text-[12px] font-medium text-ink mb-3">添加新任务</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="font-body text-[10px] uppercase tracking-wider text-ink-soft/50 mb-1 block">任务名称</label>
                  <input type="text" value={scheduleForm.name} onChange={(e) => setScheduleForm((p) => ({ ...p, name: e.target.value }))} placeholder="例如：每日早报" className="w-full px-3 py-2 bg-white/70 border border-card-border rounded-xl text-ink text-[12px] font-body placeholder-ink-soft/30 focus:outline-none focus:border-ink/20" />
                </div>
                <div>
                  <label className="font-body text-[10px] uppercase tracking-wider text-ink-soft/50 mb-1 block">执行时间</label>
                  <select value={scheduleForm.cron_expression} onChange={(e) => setScheduleForm((p) => ({ ...p, cron_expression: e.target.value }))} className="w-full px-3 py-2 bg-white/70 border border-card-border rounded-xl text-ink text-[12px] font-body focus:outline-none focus:border-ink/20 appearance-none cursor-pointer">
                    <option value="">选择执行时间</option>
                    {cronExamples.map((ex) => <option key={ex.value} value={ex.value}>{ex.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="font-body text-[10px] uppercase tracking-wider text-ink-soft/50 mb-1 block">内容类型（可选）</label>
                  <input type="text" value={scheduleForm.content_types} onChange={(e) => setScheduleForm((p) => ({ ...p, content_types: e.target.value }))} placeholder="留空则使用默认" className="w-full px-3 py-2 bg-white/70 border border-card-border rounded-xl text-ink text-[12px] font-body placeholder-ink-soft/30 focus:outline-none focus:border-ink/20" />
                </div>
              </div>
              {scheduleError && <p className="mt-2 font-body text-[11px] text-pink">{scheduleError}</p>}
              <div className="mt-3 flex justify-end">
                <button onClick={handleCreateSchedule} disabled={isCreatingSchedule} className="px-4 py-2 bg-lemon hover:brightness-105 disabled:opacity-40 text-ink text-[12px] font-body font-medium rounded-xl shadow-btn transition-all duration-150">
                  {isCreatingSchedule ? '创建中...' : '添加任务'}
                </button>
              </div>
            </div>

            {/* 任务列表 */}
            {schedules.length === 0 ? (
              <div className="text-center py-8 animate-fade-in">
                <p className="font-display italic text-[14px] text-ink-soft/30">暂无定时任务</p>
                <p className="font-body text-[11px] text-ink-soft/20 mt-1">添加定时任务可自动生成播报</p>
              </div>
            ) : (
              <div className="space-y-2">
                {schedules.map((schedule, index) => (
                  <div
                    key={schedule.id}
                    className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${schedule.is_active ? 'bg-white/40 border-card-border' : 'bg-white/20 border-card-border opacity-50'}`}
                    style={{ animation: `fade-in-up 0.3s cubic-bezier(0.22, 1, 0.36, 1) ${index * 0.05}s both` }}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleToggleSchedule(schedule.id)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${schedule.is_active ? 'bg-sage' : 'bg-ink/10'}`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${schedule.is_active ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
                      </button>
                      <div>
                        <p className="font-body text-[13px] font-medium text-ink">{schedule.name}</p>
                        <p className="font-body text-[10px] text-ink-soft/50 mt-0.5">{formatCronExpression(schedule.cron_expression)}</p>
                        {schedule.last_run_at && (
                          <p className="font-body text-[10px] text-ink-soft/30 mt-0.5">上次运行: {new Date(schedule.last_run_at).toLocaleString('zh-CN')}</p>
                        )}
                      </div>
                    </div>
                    <button onClick={() => handleDeleteSchedule(schedule.id)} className="p-1.5 text-ink-soft/30 hover:text-pink transition-colors rounded-lg" title="删除任务">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </main>
    </div>
  );
};

export default Settings;
```

- [ ] **Step 2: 验证**

分区独立毛玻璃卡片 + 彩色色点 + pill 形开关 + stagger 入场 + 骨架屏。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/pages/Settings.tsx
git commit -m "feat(ui): redesign Settings page with Soft Editorial style"
```

---

### Task 14: 最终验证

**Files:** 无文件修改

- [ ] **Step 1: 启动开发服务器，逐页验证**

```bash
cd frontend && npm run dev
```

依次访问三个页面，检查：
- [ ] Dashboard: 毛玻璃卡片、粉彩色按钮、stagger 入场动画、骨架屏
- [ ] History: 卡片列表、stagger 入场、状态 pill、分页 pill 按钮
- [ ] Settings: 分区卡片、色点标题、pill 开关、stagger 入场
- [ ] Sidebar: 半透明暖色背景、衬线标题、pill 导航项
- [ ] Header: Cormorant 标题、状态呼吸灯

- [ ] **Step 2: 检查响应式**

缩小浏览器窗口到移动端宽度，确认单栏布局正常。

- [ ] **Step 3: 检查中文排版**

确认中文内容行高舒适（1.7-1.9），无标点挤压。

- [ ] **Step 4: 最终提交**

```bash
git add -A
git commit -m "feat(ui): complete Soft Editorial frontend redesign with full animations"
```
