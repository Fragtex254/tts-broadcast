# 前端开发规范

## 目录

1. [技术栈](#技术栈)
2. [项目结构](#项目结构)
3. [设计系统](#设计系统)
4. [组件规范](#组件规范)
5. [状态管理](#状态管理)
6. [API 层](#api-层)
7. [路由](#路由)
8. [动效规范](#动效规范)
9. [响应式](#响应式)
10. [TypeScript](#typescript)
11. [命名规范](#命名规范)
12. [Settings 保存模式](#settings-保存模式)
13. [质量门禁与测试](#质量门禁与测试)
14. [性能](#性能)
15. [无障碍](#无障碍)
16. [新增页面/组件 Checklist](#新增页面组件-checklist)

---

## 技术栈

| 层 | 技术 | 版本 |
|---|---|---|
| 框架 | React | 19 |
| 语言 | TypeScript | 6 |
| 构建 | Vite | 8 |
| 样式 | Tailwind CSS | v4 |
| 状态 | Zustand | 5 |
| 路由 | React Router | 7 |
| HTTP | Axios | 1.x |
| 运行时校验 | Zod | 4 |
| 测试 | Vitest + Testing Library | 4 / 16 |

**原则：谨慎引入新依赖。** UI 和普通交互优先用 CSS/原生 API 实现；运行时契约校验使用现有 Zod；测试使用现有 Vitest/Testing Library。确需新增依赖时，先评估 bundle size、维护成本和 CI 影响。

---

## 项目结构

```
frontend/src/
├── main.tsx                    # 入口，挂载 React
├── App.tsx                     # 路由定义 + 全局布局
├── index.css                   # 设计 token + 全局样式 + 动画
├── pages/                      # 路由页面（一个文件一个页面）
│   ├── SourceCollection.tsx
│   ├── ScriptEditor.tsx
│   ├── Transcribe.tsx
│   ├── History.tsx
│   ├── Settings.tsx
│   └── settingsDraft.ts            # Settings 页纯逻辑 helper（需配测试）
├── components/
│   ├── Layout/                 # 布局组件（Sidebar, Header）
│   └── Dashboard/              # Dashboard 子组件
├── hooks/                       # 可复用 hooks（useDebounce, useSSE）
├── services/
│   ├── api.ts                  # Axios API 封装
│   ├── apiError.ts             # API 错误提取 helper
│   └── schemas.ts              # Zod 运行时校验 schema
└── store/
    ├── index.ts                # Zustand 全局 store 组合入口
    ├── types.ts                # 全局共享类型
    └── *Slice.ts               # 按领域拆分的 store slice
```

### 文件职责

| 文件类型 | 职责 | 不应包含 |
|---------|------|---------|
| `pages/*.tsx` | 页面布局、数据编排、路由参数 | 通用 UI 基础组件 |
| `pages/*Draft.ts` / `pages/*Model.ts` | 页面私有纯逻辑 helper | React hooks、DOM、API 调用 |
| `components/**/*.tsx` | 独立 UI/功能单元，通过 props 或 selector 接收数据 | 直接调用 API、路由跳转 |
| `store/index.ts` | Zustand store 组合入口 | 业务 action 实现、UI 逻辑 |
| `store/*Slice.ts` | 领域状态与异步 action | 样式、页面局部状态 |
| `services/api.ts` | HTTP 请求封装 | 状态管理、页面数据组合 |
| `services/schemas.ts` | API 响应运行时 schema | UI 展示逻辑 |

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

---

## 设计系统

### 设计哲学

**Soft Editorial** — 温暖杂志感、文学衬线标题、柔和粉彩色系、毛玻璃半透明卡片。

核心特征：
- 暖纸色背景，不是纯白也不是灰色
- Cormorant Garamond 衬线标题（优雅、编辑感）
- Work Sans 无衬线正文（清晰、现代）
- 毛玻璃半透明卡片 + 极轻阴影
- 粉彩色系作为功能色（不是装饰色）

### 色彩

所有颜色通过 Tailwind class 使用，不硬编码 hex 值。

| Token | 值 | Tailwind Class | 用途 |
|-------|-----|---------------|------|
| 纸色 | `#F2EEDF` | `bg-paper` | 页面背景 |
| 纸色-2 | `#ECE6D2` | `bg-paper-2` | Sidebar 背景 |
| 墨色 | `#2A241B` | `text-ink` | 主要文字 |
| 墨色-柔 | `#5C5345` | `text-ink-soft` | 次要文字 |
| 玫瑰粉 | `#E1A4C2` | `bg-pink` | 错误、强调、波形 |
| 柠檬绿 | `#D6DD63` | `bg-lemon` | 主操作、成功 |
| 蜜桃腮红 | `#E8C9B6` | `bg-blush` | 温暖强调 |
| 鼠尾草 | `#B7C7A8` | `bg-sage` | 成功、保存、确认 |
| 丁香紫 | `#C9BEDC` | `bg-lilac` | 次操作、段落索引 |

**语义色使用约定：**

| 场景 | 颜色 |
|------|------|
| 主操作按钮（获取、保存） | `lemon` / `sage` |
| 次操作按钮（生成、合并） | `lilac` |
| 危险/强调操作（改写、删除悬停） | `pink` |
| 成功状态标签 | `sage` |
| 等待/加载状态标签 | `lemon` |
| 生成中状态标签 | `lilac` |
| 错误状态标签/提示 | `pink` |
| 卡片标题色点 | 按功能分配（见下方） |

**卡片色点分配：**

| 组件 | 色点 |
|------|------|
| 资讯获取 | `bg-lemon` |
| 口播稿预览 | `bg-pink` |
| 语音生成 | `bg-blush` |
| 段落编辑器 | `bg-lilac` |
| 播放器 | `bg-sage` |
| API 配置（LLM/TTS） | `bg-pink` |
| 音色设置 | `bg-blush` |
| 播报设置 | `bg-sage` |
| 定时任务 | `bg-lemon` |

### 字体

| 角色 | 字体 | Tailwind Class | 用途 |
|------|------|---------------|------|
| 标题/数字/装饰 | Cormorant Garamond | `font-display` | 页面标题、卡片标题、索引数字 |
| 正文/按钮/标签 | Work Sans | `font-body` | 正文、按钮、输入框、标签 |
| 中文衬线兜底 | ZCOOL XiaoWei | font-stack fallback | 中文标题自动回退 |

**字号约定：**

| 场景 | 字号 | 示例 |
|------|------|------|
| 页面标题 | `text-[32px] font-medium` | "控制台" |
| 卡片标题 | `font-display italic text-[14px] font-medium` | "资讯获取" |
| 正文 | `text-[13px]` | 口播稿内容 |
| 小标签 | `text-[11px] uppercase tracking-wider` | 分类标签 |
| 微标签 | `text-[9px] uppercase tracking-wider` | 状态 pill |
| 数字索引 | `font-display italic text-[18px] font-medium` | "01", "02" |

### 卡片

所有内容区域使用统一的毛玻璃卡片样式：

```
className="bg-white/[0.55] backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border"
```

**卡片内部结构：**

```tsx
<div className="bg-white/[0.55] backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border">
  {/* 标题区：色点 + 斜体衬线标题 */}
  <div className="flex items-center gap-2 mb-4">
    <span className="w-2 h-2 rounded-full bg-{color}" />
    <h3 className="font-display italic text-[14px] font-medium text-ink-soft">标题</h3>
  </div>

  {/* 内容区 */}
  ...
</div>
```

### 按钮

| 类型 | 样式模板 | 用途 |
|------|---------|------|
| 主操作 | `bg-lemon hover:brightness-105 text-ink rounded-full px-5 py-2 shadow-btn font-body text-[12px] font-medium uppercase tracking-wider` | 获取、保存 |
| 次操作 | `bg-lilac hover:brightness-105 text-ink rounded-xl px-4 py-2.5 shadow-btn` | 生成、合并 |
| 确认操作 | `bg-sage hover:brightness-105 text-ink rounded-xl px-4 py-2.5 shadow-btn` | 测试连接、全部生成 |
| 危险操作 | `bg-pink hover:brightness-105 text-ink rounded-full px-5 py-2 shadow-btn` | 改写口播稿 |
| 文字按钮 | `text-ink-soft hover:text-ink font-body text-[12px] transition-colors` | 编辑、取消 |
| 禁用态 | `disabled:opacity-40` | 所有按钮通用 |

**按钮交互：**

```
hover:-translate-y-px active:translate-y-0 active:shadow-none
```

### 输入框

```
className="bg-white/70 text-ink rounded-xl px-3.5 py-2.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[12px] transition-colors"
```

选择器使用 `rounded-full`，文本输入使用 `rounded-xl`。

### 状态标签（Pill）

```tsx
<span className="inline-flex items-center px-2.5 py-1 rounded-full text-[9px] font-body font-medium uppercase tracking-wider bg-{color}/{opacity} text-ink">
  ✓ 已完成
</span>
```

### 内部内容区

需要嵌套在卡片内的次要内容区：

```
className="bg-white/60 rounded-2xl p-4 border border-card-border"
```

---

## 组件规范

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
4. **导出方式** — 同时提供具名导出和默认导出：
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

---

## 状态管理

### Store 结构

使用单一 Zustand store（`store/index.ts`），按功能域分组：

```ts
export interface AppState {
  // 播报状态
  broadcasts: Broadcast[];
  currentBroadcast: Broadcast | null;
  todayItems: TodayItem[];
  script: string;
  isGenerating: boolean;
  isRewriting: boolean;

  // Segment 状态
  segments: Segment[];
  isSplitting: boolean;
  isMerging: boolean;

  // 设置
  settings: Settings;
  isLoadingSettings: boolean;

  // 定时任务
  schedules: Schedule[];

  // Actions
  fetchTodayItems: (...) => Promise<...>;
  rewriteScript: (...) => Promise<...>;
  // ...
}
```

### 使用规则

1. **页面组件**通过 selector 模式获取 store 数据和 action，负责路由级编排。
2. **功能组件**可以直接使用 selector 读取所需 store 字段；展示型子组件优先通过 props 接收数据。
3. **接口类型**统一定义在 `store/types.ts`，通过 `export` 供其他文件引用。
4. **Loading 状态**在 store 中维护（`isGenerating`, `isSplitting` 等），组件读取即可。
5. **长任务进度**放在对应领域 slice 中维护；例如转录使用 `transcribeProgress` 保存上传、准备、分片转录、完成和失败状态，页面只负责展示。

### 推荐的组件内 Store 使用模式

**强制使用 selector，禁止无 selector 的 `useStore()` 调用：**

```tsx
// ✅ 页面组件：每个字段单独 selector
export const SourceCollection: React.FC = () => {
  const todayItems = useStore((s) => s.todayItems);
  const fetchTodayItems = useStore((s) => s.fetchTodayItems);
  // 编排逻辑...
};
```

```tsx
// ✅ 功能组件：独立组件使用 selector 订阅所需字段
export const ScriptPreview: React.FC = () => {
  const script = useStore((s) => s.script);
  const updateScript = useStore((s) => s.updateScript);
  const settings = useStore((s) => s.settings);
  // ...
};
```

```tsx
// ❌ 禁止 — 订阅整个 store，任何值变化都触发重渲染
const { script, updateScript, settings } = useStore();
```

---

## API 层

### 文件：`services/api.ts`

- 使用 Axios 实例，`baseURL: '/api'`，`timeout: 300000`（5 分钟，TTS 生成可能耗时较长）
- 已配置全局响应拦截器，统一处理 401/403/429/500 等常见错误码
- 按功能域导出 API 对象：`broadcastApi`, `settingsApi`, `scheduleApi`
- Settings 页的 LLM 模型发现通过 `settingsApi.fetchLlmModels()` 调用 `POST /settings/llm-models`，页面只维护局部 loading/error 和模型下拉选项
- API 响应的结构校验 schema 放在 `services/schemas.ts`；store slice 中按领域引入对应 schema

### 命名约定

```ts
// GET → get + 名词
broadcastApi.getToday(...)
broadcastApi.getHistory(...)
broadcastApi.getSegments(...)

// POST → 动词 或 名词
broadcastApi.rewrite(...)
broadcastApi.generate(...)
broadcastApi.split(...)
broadcastApi.mergeSegments(...)
settingsApi.fetchLlmModels(...)

// PUT → update + 名词
broadcastApi.updateSegment(...)

// DELETE → delete + 名词
broadcastApi.deleteSegment(...)
```

### 错误处理

API 层通过响应拦截器统一记录错误日志，但不阻止错误传播。具体错误文案由调用方（store action 或组件）catch 处理：

```tsx
const handleFetch = async () => {
  setIsLoading(true);
  setError(null);
  try {
    await fetchTodayItems({ category, take: count });
  } catch (err) {
    setError('获取资讯失败，请稍后重试');
  } finally {
    setIsLoading(false);
  }
};
```

### 运行时数据校验

- Zod schema 命名为 `{Domain}Schema`，例如 `SettingsSchema`、`BroadcastSchema`。
- schema 与 `store/types.ts` 的共享类型保持同一字段语义；新增后端字段时先更新类型，再更新 schema。
- `safeParseArray()` 会过滤不符合 schema 的条目，只适合列表接口；详情/设置类接口解析失败时应保留旧 state 或显式报错，避免静默写入半可信数据。
- 不要在组件里直接写 schema 校验，组件只消费 store 给出的数据。

---

## 路由

### 当前路由

| 路径 | 组件 | 说明 |
|------|------|------|
| `/` | `SourceCollection` | 信源收集（默认页） |
| `/editor` | `ScriptEditor` | 口播稿编辑 |
| `/transcribe` | `Transcribe` | 音视频上传转录 |
| `/history` | `History` | 播报历史 |
| `/settings` | `Settings` | 系统设置 |
| `*` | `NotFound` | 404 兜底 |

### 规则

1. 路由定义在 `App.tsx` 的 `<Routes>` 内。
2. `Sidebar` 在 `<Routes>` 外部，跨页面持久渲染。
3. 首屏路由 `SourceCollection` 直接导入；非首屏页面使用 `React.lazy()` + `Suspense` 懒加载。
4. 所有路由页面位于 `<ErrorBoundary>` 内；新增可能独立崩溃的功能区可再加局部 Error Boundary。
5. 新增页面：在 `pages/` 创建组件 → 在 `App.tsx` 添加 `<Route>` → 在 `Sidebar` 添加导航项。
6. 新增用户可访问路径时，确认 `NotFound` 兜底仍存在。
7. 导航使用 `<NavLink>`（不是 `<Link>`），以支持 `isActive` 高亮。

---

## 动效规范

### 可用动画

| Class | 效果 | 用途 |
|-------|------|------|
| `animate-fade-in-up` | 从下方淡入上移 | 卡片入场 |
| `animate-fade-in-left` | 从左侧淡入 | 列表项入场 |
| `animate-fade-in` | 纯淡入 | 编辑模式切换、内容出现 |
| `animate-breathe` | 透明度呼吸 | 状态指示点 |
| `animate-shake` | 水平抖动 | 错误提示 |
| `animate-scale-bounce` | 缩放弹跳 | 保存成功反馈 |
| `animate-waveform-pulse` | 垂直脉动 | 音频波形播放中 |
| `animate-pulse` | Tailwind 内置脉冲 | 骨架屏、加载进度条 |

### 交错入场实现

使用 `style` 内联 `animation` 属性实现 stagger，不用 JS：

```tsx
{items.map((item, index) => (
  <div
    key={item.id}
    style={{
      animation: `fade-in-up 0.3s cubic-bezier(0.22, 1, 0.36, 1) ${index * 0.05}s both`,
    }}
  >
    ...
  </div>
))}
```

### 缓动函数

- 入场动画：`cubic-bezier(0.22, 1, 0.36, 1)`（ease-out-expo）
- 通用过渡：`transition-all duration-150` 或 `duration-200`
- 按钮 hover：`hover:brightness-105`（微妙提亮，不换色）

### `prefers-reduced-motion`

`index.css` 已全局处理：在用户开启"减少动态效果"时，所有动画自动禁用。组件层面无需额外处理。

---

## 响应式

### 断点策略

使用 Tailwind 默认断点，主要用到：

| 断点 | 宽度 | 用途 |
|------|------|------|
| 默认（无前缀） | < 640px | 移动端：单栏 |
| `lg:` | ≥ 1024px | 桌面端：双栏 |

### 布局模式

```tsx
{/* 单栏移动端 → 双栏桌面端 */}
<div className="flex flex-col lg:flex-row gap-4">
  <div className="w-full lg:w-1/2">左侧</div>
  <div className="w-full lg:w-1/2">右侧</div>
</div>
```

### Sidebar

Sidebar 桌面端使用 `sm:w-64` 展示完整品牌与导航文本；小屏使用 `w-20` 折叠，只显示短品牌和导航图标，避免主内容被挤压到文字竖排。

---

## TypeScript

### 基本规则

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

### 避免

- 不使用 `any`（除非第三方库强制要求）
- 不使用 `as` 类型断言（除非有充分理由并加注释）
- 不在组件文件中定义全局共享 interface（应在 store/types.ts 或单独 types 文件）。组件内部自用的子组件 props interface 允许在文件内定义。

---

## 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 组件文件 | PascalCase `.tsx` | `QuickGenerate.tsx` |
| 页面文件 | PascalCase `.tsx` | `SourceCollection.tsx` |
| 工具/service 文件 | camelCase `.ts` | `api.ts` |
| 组件名 | PascalCase | `ScriptPreview`, `AudioPlayer` |
| Hook/函数 | camelCase | `useStore`, `handleFetch` |
| 常量 | UPPER_SNAKE_CASE | `VOICE_OPTIONS`, `WAVEFORM_BARS` |
| CSS 变量 | kebab-case with `--` 前缀 | `--color-paper`, `--radius-card` |
| Tailwind 自定义 class | kebab-case | `bg-paper`, `rounded-card`, `animate-fade-in-up` |
| 接口 | PascalCase（无 `I` 前缀） | `Broadcast`, `AppState`, `Segment` |
| 布尔状态 | `is` / `has` 前缀 | `isLoading`, `isPlaying`, `hasError` |

### 文件命名与组件对应

```
文件路径                              → 组件名
components/Dashboard/AudioPlayer.tsx → AudioPlayer
components/Layout/Sidebar.tsx        → Sidebar
pages/SourceCollection.tsx           → SourceCollection
```

---

## 错误边界

所有路由页面已被 `<ErrorBoundary>` 包裹（`App.tsx`）。对于新增的关键功能组件，如果可能抛出异常（如 SSE 解析、音频处理等），应在组件层面考虑添加局部 Error Boundary。

## 高频状态防抖

对于 slider、resize 等高频状态变更，使用 `useDebounce` hook 延迟执行副作用：

```tsx
import { useDebounce } from '../../hooks/useDebounce';

const debouncedSync = useDebounce(() => {
  // 发送 PATCH 请求
}, 800);

// slider onChange 只更新本地 state，不直接触副作用
// useEffect 中调用 debouncedSync，用户停止操作 800ms 后执行
```

## Settings 保存模式

Settings 页使用“本地 draft + dirtyFields + onBlur/debounce 自动保存 + 顶部批量保存兜底”的模式：

- 表单值保存在页面局部 `formData`，同时用 `formDataRef` 保存最新值，避免 debounce 闭包读取上一帧数据。
- `dirtyFields` 只记录用户改过但尚未保存的字段；保存成功后清除对应字段。
- 文本域等高频输入通过 debounce 自动保存；普通输入在 `onBlur` 保存；顶部“保存设置”提交整个当前 draft。
- 纯数据变换放在 `pages/settingsDraft.ts`，并配套 `settingsDraft.test.ts`；不要把这类逻辑藏在 JSX 事件处理里。
- LLM Base URL 会自动推断 `llm_api_format`，除非用户手动切换过 API format；这两个字段的 dirty 状态必须一起维护。

新增 Settings 字段时，需要同步：

- `store/types.ts` 的 `Settings` 接口
- `store/defaults.ts` 的默认值
- `services/schemas.ts` 的 `SettingsSchema`
- `Settings.tsx` 的输入控件和保存行为
- `settingsDraft.test.ts` 中与自动保存或推断有关的测试

## 质量门禁与测试

### 框架

- **Vitest** + **@testing-library/react** + **@testing-library/jest-dom** + **jsdom**
- 测试文件命名：`*.test.{ts,tsx}`
- 测试配置在 `vite.config.ts`，setup 在 `vitest.setup.ts`

### 必跑命令

每次前端代码变更后，至少运行：

```bash
npm run lint
npm run build
npm run test
```

如果只改文档，可以不跑 build/test，但需要确认文档与现有实现一致。

### 新增功能必须伴随测试

| 测试类型 | 范围 | 示例 |
|---------|------|------|
| 单元测试 | `services/` 工具函数 | `apiError.test.ts` |
| 纯逻辑测试 | 页面 draft/helper、数据转换 | `settingsDraft.test.ts` |
| 组件测试 | 纯展示组件渲染 | 后续新增复杂组件时补充 |

### 最小测试要求

- 工具函数（`apiError.ts`、`formatters` 等）必须有单元测试
- 页面私有 helper（如 `settingsDraft.ts`）必须有单元测试
- 复杂交互组件（如 `VoiceGenerator`、`SegmentEditor`）鼓励添加组件测试

## 性能

1. **图片** — 使用 WebP 格式，配合 `loading="lazy"`。
2. **字体** — `index.html` 中使用 `preconnect` + `display=swap` 预加载。
3. **代码分割** — 非首屏路由页面使用 `React.lazy()` + `Suspense` 懒加载；首屏 `SourceCollection` 保持直接导入。
4. **Store 选择器** — 使用 Zustand selector 避免不必要的重渲染：
   ```tsx
   // ✅ 只订阅需要的值
   const script = useStore((s) => s.script);

   // ❌ 订阅整个 store（任何值变化都重渲染）
   const store = useStore();
   ```
5. **`useCallback`** — 传递给子组件的回调函数用 `useCallback` 包裹。
6. **列表 `key`** — 使用稳定唯一 ID，不用 index（除非列表不会重排）。

---

## 无障碍

1. **`prefers-reduced-motion`** — 已在 `index.css` 全局处理。
2. **语义 HTML** — 使用 `<nav>`, `<main>`, `<header>`, `<aside>`, `<section>` 等语义标签。
3. **`title` 属性** — 图标按钮必须有 `title` 描述：
   ```tsx
   <button title="编辑">✎</button>
   ```
4. **键盘导航** — `<NavLink>` 和 `<button>` 天然支持 Tab 聚焦和 Enter 触发。
5. **`lang` 属性** — `index.html` 已设置 `lang="zh-CN"`。
6. **色彩对比度** — `text-ink` (#2A241B) 在 `bg-paper` (#F2EEDF) 上的对比度 > 10:1，满足 WCAG AAA。

---

## 新增页面/组件 Checklist

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
