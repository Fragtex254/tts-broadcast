---
name: frontend-component
description: 新增或修改 React 组件、页面时使用。涵盖组件文件组织顺序、单一职责拆分（超300行）、props 下传 events 上抛、不在组件内直接调 API、具名+默认双导出、interface {Name}Props、入场动画交错延迟、加载骨架屏（不用 spinner）、错误 animate-shake、空状态、路由懒加载、TypeScript 严格规则、命名规范、错误边界、无障碍、lint/build/test。触发场景：加组件、加页面、改组件、新 tsx、卡片、按钮交互、骨架屏、错误状态、加路由、ErrorBoundary。
---

# 前端组件与页面开发

## 何时用 / 不用

- **用**：在 `frontend/src/pages/` 或 `components/` 新增/修改组件、页面、路由。
- **不用**：纯调样式/套设计系统（→ `frontend-styling`）；改 store/数据流/API（→ `frontend-state-data`）。
- **常配合**：组件视觉模板（卡片/按钮/输入框）见 `frontend-styling`；组件读 store 的 selector 规则见 `frontend-state-data`。

## 核心铁则

1. 卡片基类固定：`bg-white/[0.55] backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border`。
2. 加载用骨架屏（`animate-pulse` + `bg-ink/5`），**不用 spinner**；错误用 `animate-shake` + `bg-pink/10`；空状态用斜体衬线。
3. 组件单一职责，超 **300 行**考虑拆分；props 下传、events 上抛；**不在组件内直接调 API**（走 store action）。
4. 同时提供 `export const` 具名导出和 `export default`；props 用 `interface {Component}Props`。
5. 不用 `any`、不用 `as`（除非充分理由 + 注释）；不在组件文件定义全局共享 interface（放 `store/types.ts`）。
6. 二级界面、确认弹窗、全屏编辑面板统一用 `components/ModalShell.tsx`；不要在业务组件里重复写 `fixed inset-0`、`role="dialog"`、Esc 关闭和 backdrop 关闭逻辑。
7. 音频播放条统一用 `components/Dashboard/AudioPlaybackBar.tsx`，整篇/历史播放器走 `AudioPlayer`，试听小播放器走 `MiniAudioPlayer`；不要在业务组件里重复维护 `<audio>`、播放状态、时长、seek 或倍速逻辑。
8. MiMo 方括号标签编辑统一用 `components/Dashboard/AudioTagTextEditor.tsx`；设计/克隆试听和口播分段编辑都走这个复杂标签面板，不再新增只覆盖少量标签的局部插入器。
9. 非首屏页面用 `React.lazy()` + `Suspense`；新增页面三步：建组件 → `App.tsx` 加 `<Route>` → `Sidebar` 加导航项，并确认 `NotFound` 兜底仍在。
10. 新增/改完跑 `npm run lint && npm run build && npm run test`。
11. 转录过程与普通结果使用 `components/Transcribe/LiveTranscriptionPreview.tsx` 和 `TranscriptionPreviewModal.tsx` 的只读视图；播客完成结果进入 `TranscriptConversationModal`。业务页面不得再用可编辑 `<textarea>` 冒充实时结果或文稿阅读器。

## 模式与模板

### 组件文件组织

每个组件文件内部按以下顺序排列：

```tsx
// 1. 导入
import React, { useState } from 'react';
import { useStore } from '../../store';

// 2. 接口/类型
interface MyComponentProps {
  title: string;
  onAction?: () => void;
}

// 3. 子组件（如有）
const SubPart: React.FC<{ label: string }> = ({ label }) => ( ... );

// 4. 常量
const OPTIONS = [ ... ];

// 5. 主组件
export const MyComponent: React.FC<MyComponentProps> = ({ title, onAction }) => {
  // hooks
  // handlers
  // render
};

// 6. 默认导出
export default MyComponent;
```

### 组件类型

| 类型 | 位置 | 特征 | 示例 |
|------|------|------|------|
| 页面组件 | `pages/` | 负责数据获取编排，组合子组件 | `SourceCollection.tsx` |
| 布局组件 | `components/Layout/` | 跨页面复用的布局骨架 | `Sidebar.tsx`, `Header.tsx` |
| 功能组件 | `components/{Feature}/` | 独立功能单元，通过 props 接收数据 | `QuickGenerate.tsx` |

### 组件设计原则

1. **单一职责** — 一个组件做一件事。如果一个组件超过 300 行，考虑拆分。
2. **Props 下传，Events 上抛** — 子组件通过 props 接收数据，通过回调函数通知父组件。
3. **不要在组件内直接调 API** — 通过 store action 间接调用。
4. **共享交互模块优先** — 弹窗用 `ModalShell`，播放条用 `AudioPlaybackBar` / `AudioPlayer` / `MiniAudioPlayer`，MiMo 方括号标签编辑用 `AudioTagTextEditor`；需要新增变体时先扩展共享模块的清晰 props，而不是在调用处复制实现。
5. **转录结果只读** — 实时预览复用 `LiveTranscriptionPreview`，展开文稿复用 `TranscriptionPreviewModal`，播客结构化完成后复用 `TranscriptConversationModal`；不要回退到双 textarea 排版弹窗。
6. **导出方式** — 同时提供具名导出和默认导出：
   ```tsx
   export const MyComponent: React.FC<Props> = (props) => { ... };
   export default MyComponent;
   ```

### 入场动画

每个卡片/区块使用 `style` 内联动画实现交错入场：

```tsx
<div
  className="bg-white/[0.55] backdrop-blur-sm rounded-card ..."
  style={{ animation: 'fade-in-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.08s both' }}
>
```

**延迟分配：**
- 第 1 个卡片：`0s` 或不设置
- 第 2 个卡片：`0.04s`
- 第 3 个卡片：`0.08s`
- 第 4 个卡片：`0.12s`
- 列表项 stagger：`index * 0.03s` ~ `index * 0.05s`

### 加载状态

**不要使用 spinner。** 使用以下替代方案：

| 场景 | 方案 |
|------|------|
| 页面/卡片加载 | 骨架屏（`animate-pulse` + `bg-ink/5` 占位块） |
| 按钮加载 | 进度条动画（内嵌 `animate-pulse` 的宽度条） |
| 状态点 | `animate-breathe` 呼吸动画 |

骨架屏示例：
```tsx
{isLoading && (
  <div className="space-y-3">
    {[1, 2, 3].map((i) => (
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
```

### 错误状态

```tsx
{error && (
  <div className="mt-3 bg-pink/10 border border-pink/30 rounded-xl p-3 text-ink text-[12px] font-body animate-shake">
    {error}
  </div>
)}
```

### 空状态

```tsx
<div className="p-12 text-center animate-fade-in">
  <p className="font-display italic text-[16px] text-ink-soft/40 mb-1">暂无数据</p>
  <p className="font-body text-[12px] text-ink-soft/30">提示文案</p>
</div>
```

### 路由

**当前路由：**

| 路径 | 组件 | 说明 |
|------|------|------|
| `/` | `SourceCollection` | 内容工作台（默认页） |
| `/editor` | `ScriptEditor` | 口播稿编辑 |
| `/transcribe` | `Transcribe` | 音视频上传转录 |
| `/history` | `ContentLibrary` | 内容库（播报 / 转录稿） |
| `/history/transcriptions/:id` | `TranscriptWorkspace` | 播客阅读、校对与一键总结上下文页 |
| `/automation` | `Automation` | 自动化任务 |
| `/voice-presets` | `VoicePresets` | 音色库 |
| `/settings` | `Settings` | 系统设置 |
| `*` | `NotFound` | 404 兜底 |

**规则：**

1. 路由定义在 `App.tsx` 的 `<Routes>` 内。
2. `Sidebar` 在 `<Routes>` 外部，跨页面持久渲染。
3. 首屏路由 `SourceCollection` 直接导入；非首屏页面使用 `React.lazy()` + `Suspense` 懒加载。
4. 所有路由页面位于 `<ErrorBoundary>` 内；新增可能独立崩溃的功能区可再加局部 Error Boundary。
5. 新增页面：在 `pages/` 创建组件 → 在 `App.tsx` 添加 `<Route>` → 在 `Sidebar` 添加导航项。
6. 新增用户可访问路径时，确认 `NotFound` 兜底仍存在。
7. 导航使用 `<NavLink>`（不是 `<Link>`），以支持 `isActive` 高亮。
8. 顶级导航只展示工作台、内容库、音色库、自动化和设置；编辑器与转录页由任务入口进入，不在 Sidebar 重复展示。
9. 播客时间码当前只读展示，不挂载音频播放、seek 或“回到现场”交互；未来接入时仍必须复用统一 `AudioPlaybackBar`。

### TypeScript

1. **严格模式** — `tsconfig.json` 已启用 `strict: true`。
2. **组件 Props** — 使用 `interface`（不用 `type`），命名 `{Component}Props`：
   ```tsx
   interface AudioPlayerProps {
     audioUrl: string | null;
     title?: string;
   }
   ```
3. **事件处理** — 明确事件类型：
   ```tsx
   const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => { ... };
   const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => { ... };
   ```
4. **Ref** — 明确泛型：
   ```tsx
   const audioRef = useRef<HTMLAudioElement>(null);
   ```
5. **Store 类型** — 接口统一定义在 `store/types.ts`，通过 `export` 供引用：
   ```tsx
   import type { Segment } from '../../store';
   ```

**避免：**

- 不使用 `any`（除非第三方库强制要求）
- 不使用 `as` 类型断言（除非有充分理由并加注释）
- 不在组件文件中定义全局共享 interface（应在 store/types.ts 或单独 types 文件）。组件内部自用的子组件 props interface 允许在文件内定义。

### 命名规范

完整的文件/组件/Hook/常量/CSS 变量/接口/布尔状态命名规则见 `frontend/FRONTEND_CONVENTIONS.md`「命名规范」（背景文档，单一归属，不在此重复）。组件层面记住要点：

- 组件文件与组件名 PascalCase（`QuickGenerate.tsx` → `QuickGenerate`）
- props interface 命名 `{Component}Props`，接口无 `I` 前缀
- 布尔状态用 `is` / `has` 前缀（`isLoading`、`hasError`）

### 错误边界

所有路由页面已被 `<ErrorBoundary>` 包裹（`App.tsx`）。对于新增的关键功能组件，如果可能抛出异常（如 SSE 解析、音频处理等），应在组件层面考虑添加局部 Error Boundary。

### 无障碍

1. **`prefers-reduced-motion`** — 已在 `index.css` 全局处理。
2. **语义 HTML** — 使用 `<nav>`, `<main>`, `<header>`, `<aside>`, `<section>` 等语义标签。
3. **`title` 属性** — 图标按钮必须有 `title` 描述：
   ```tsx
   <button title="编辑">✎</button>
   ```
4. **键盘导航** — `<NavLink>` 和 `<button>` 天然支持 Tab 聚焦和 Enter 触发。
5. **`lang` 属性** — `index.html` 已设置 `lang="zh-CN"`。
6. **色彩对比度** — `text-ink` (#2A241B) 在 `bg-paper` (#F2EEDF) 上的对比度 > 10:1，满足 WCAG AAA。

### 测试与质量门禁

**框架：**

- **Vitest** + **@testing-library/react** + **@testing-library/jest-dom** + **jsdom**
- 测试文件命名：`*.test.{ts,tsx}`
- 测试配置在 `vite.config.ts`，setup 在 `vitest.setup.ts`

**必跑命令：** 每次前端代码变更后，至少运行：

```bash
npm run lint
npm run build
npm run test
```

如果只改文档，可以不跑 build/test，但需要确认文档与现有实现一致。

**新增功能必须伴随测试：**

| 测试类型 | 范围 | 示例 |
|---------|------|------|
| 单元测试 | `services/` 工具函数 | `apiError.test.ts` |
| 纯逻辑测试 | 页面 draft/helper、数据转换 | `settingsDraft.test.ts` |
| 组件测试 | 纯展示组件渲染 | 后续新增复杂组件时补充 |

**最小测试要求：**

- 工具函数（`apiError.ts`、`formatters` 等）必须有单元测试
- 页面私有 helper（如 `settingsDraft.ts`）必须有单元测试
- 复杂交互组件（如 `VoiceGenerator`、`SegmentEditor`）鼓励添加组件测试

### 性能

1. **图片** — 使用 WebP 格式，配合 `loading="lazy"`。
2. **字体** — `index.html` 中使用 `preconnect` + `display=swap` 预加载。
3. **代码分割** — 非首屏路由页面使用 `React.lazy()` + `Suspense` 懒加载；首屏 `SourceCollection` 保持直接导入。
4. **Store 选择器** — 使用 Zustand selector 避免不必要的重渲染（只订阅需要的值，不订阅整个 store）。
5. **`useCallback`** — 传递给子组件的回调函数用 `useCallback` 包裹。
6. **列表 `key`** — 使用稳定唯一 ID，不用 index（除非列表不会重排）。

## Checklist

新增一个页面时，按顺序完成：

- [ ] `pages/NewPage.tsx` — 创建页面组件，使用 `Header` + 毛玻璃卡片布局
- [ ] `App.tsx` — 非首屏页面用 `React.lazy()` 添加 `<Route path="/new" element={<NewPage />} />`
- [ ] `Sidebar.tsx` — 在 `navItems` 添加导航项
- [ ] 确认 `NotFound` 兜底路由仍保留
- [ ] 使用 `bg-white/[0.55] backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border` 作为卡片基类
- [ ] 卡片标题使用 `font-display italic` + 色点
- [ ] 添加入场动画 `style={{ animation: 'fade-in-up ...' }}`
- [ ] 加载状态使用骨架屏，错误状态使用 `animate-shake`
- [ ] 按钮使用语义色（lemon/sage/lilac/pink）
- [ ] 二级界面使用 `ModalShell`，未手写固定遮罩/对话框基础逻辑
- [ ] 音频播放条使用 `AudioPlaybackBar` / `AudioPlayer` / `MiniAudioPlayer`，未手写 `<audio>` 播放控制逻辑
- [ ] Store 读取使用 selector，不写无 selector 的 `useStore()`
- [ ] 新增 API 响应字段时同步 `store/types.ts` 与 `services/schemas.ts`
- [ ] 运行 `npm run lint`
- [ ] 运行 `npm run build` 确认无 TypeScript 错误
- [ ] 运行 `npm run test`
- [ ] 运行 `npm run dev` 目视检查三个页面样式一致

新增一个子组件时：

- [ ] `components/{Feature}/NewComponent.tsx` — 创建组件
- [ ] 同时提供 `export const` 和 `export default`
- [ ] Props 使用 `interface {Name}Props`
- [ ] 卡片标题使用色点 + 斜体衬线
- [ ] 按钮/输入框使用统一样式模板
- [ ] 如组件直接读 store，必须使用 selector
- [ ] 纯逻辑 helper 需要配套 `*.test.ts`
- [ ] 确保 `npm run lint && npm run build && npm run test` 通过

## 相关 skill / 文档

- 视觉模板（色彩/字体/卡片/按钮/动效） → `frontend-styling`
- store/selector/API/Zod → `frontend-state-data`
- 跨前后端加字段 → `add-persisted-field`
- 技术栈、目录结构 → `frontend/FRONTEND_CONVENTIONS.md`
