---
name: frontend-styling
description: 套用 Warm Workbench / Soft Editorial 设计系统、调整样式、改配色或动效时使用。涵盖基于 burnt-peach / sandy-clay / powder-blush / tea-green / sky-blue-light 的色彩 token（paper/ink/pink/lemon/blush/sage/lilac）与语义色映射、字体（font-display/font-body）与字号、卡片模板、按钮/输入框/Pill 模板、动效 class 与缓动函数、prefers-reduced-motion、响应式断点。触发场景：调样式、改颜色、改按钮、卡片样式、字体、动画、动效、配色、Tailwind class、响应式布局、好看一点。
---

# 前端样式与设计系统

## 何时用 / 不用

- **用**：套用/调整视觉样式——配色、字体、卡片、按钮、输入框、Pill、动效、响应式布局。
- **不用**：组件结构/生命周期/状态（→ `frontend-component`）；数据流（→ `frontend-state-data`）。

## 核心铁则

1. 颜色**只通过 Tailwind class 使用，不硬编码 hex**（`bg-paper`/`text-ink`/`bg-pink`/`bg-lemon`/`bg-blush`/`bg-sage`/`bg-lilac`）。
2. 语义色固定映射：主操作 `lemon`/`sage`、次操作 `lilac`、危险/强调 `pink`；状态 pill 与卡片色点按既定表分配。
3. 标题用 `font-display` + 色点；正文/按钮/标签用 `font-body`，两者默认都走本机 MiSans 中文字体。
4. 卡片、按钮、输入框、Pill 一律用文档中的统一 class 模板，不自创。
5. 动效只用既有 animate-* class + ease-out-expo 缓动（`cubic-bezier(0.22,1,0.36,1)`）；`prefers-reduced-motion` 已由 `index.css` 全局处理，组件层无需额外处理。

## 模式与模板

### 设计哲学

**Warm Workbench / Soft Editorial** — 保留温暖纸感和柔和色彩，但优先服务生产型工作台的清晰度、密度和状态可读性。

核心特征：
- 暖纸色背景，不是纯白也不是灰色
- MiSans 中文字体（标题和正文统一，清晰、现代）
- 主工作区使用更实的浅色卡片，避免所有层级都发虚
- 粉彩色系作为功能色（不是装饰色），颜色必须表达动作、状态或风险

### 色彩

所有颜色通过 Tailwind class 使用，不硬编码 hex 值。

| Token | 值 | Tailwind Class | 用途 |
|-------|-----|---------------|------|
| 纸色 | `#fbf2ea` | `bg-paper` | 页面背景 |
| 纸色-2 | `#f6e5d5` | `bg-paper-2` | Sidebar / app chrome 背景 |
| 墨色 | `#0b1718` | `text-ink` | 主要文字 |
| 墨色-柔 | `#204146` | `text-ink-soft` | 次要文字、说明文字 |
| 粉红 | `#e65c4c` | `bg-pink` | 错误、危险、警告 |
| 茶绿 | `#8ec837` | `bg-lemon` | 主操作 |
| 沙陶 | `#e5b180` | `bg-blush` | 温暖强调、音色 |
| 淡茶绿 | `#bbde87` | `bg-sage` | 成功、保存、确认 |
| 浅天蓝 | `#96c8cf` | `bg-lilac` | 转换、编辑、排版、切分 |

底层参考色板已在 `frontend/src/index.css` 注册为 `burnt-peach-*`、`sandy-clay-*`、`powder-blush-*`、`tea-green-*`、`sky-blue-light-*`。组件层优先使用上方语义 token，不直接散用底层色阶。

**语义色使用约定：**

| 场景 | 颜色 |
|------|------|
| 主操作按钮（获取、开始、保存、生成） | `lemon` / `sage` |
| 转换/编辑操作（改写、切分、排版、重新编辑） | `lilac` |
| 危险/错误操作（删除、失败、警告） | `pink`，文字使用 `text-ink`，不要用 `text-white` |
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
| 标题/数字/装饰 | MiSans | `font-display` | 页面标题、卡片标题、索引数字 |
| 正文/按钮/标签 | MiSans | `font-body` | 正文、按钮、输入框、标签 |
| 中文兜底 | Noto Sans SC | font-stack fallback | 未安装 MiSans 时回退 |

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

所有主要内容区域使用更实的工作台卡片样式：

```
className="bg-white/80 backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border"
```

**卡片内部结构：**

```tsx
<div className="bg-white/80 backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border">
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
| 转换/编辑操作 | `bg-lilac hover:brightness-105 text-ink rounded-xl px-4 py-2.5 shadow-btn` | 改写、切分、排版、重新编辑 |
| 确认操作 | `bg-sage hover:brightness-105 text-ink rounded-xl px-4 py-2.5 shadow-btn` | 测试连接、全部生成 |
| 危险操作 | `bg-pink hover:brightness-105 text-ink rounded-full px-5 py-2 shadow-btn` | 删除、失败重试 |
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

### 响应式断点策略

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

## Checklist

- [ ] 颜色用 Tailwind class，无硬编码 hex
- [ ] 语义色映射正确（主/次/危险操作、状态 pill、卡片色点）
- [ ] 卡片/按钮/输入框/Pill 用统一模板 class
- [ ] 标题 `font-display` + 色点，正文 `font-body`
- [ ] 动效用既有 animate-* class 与 ease-out-expo 缓动
- [ ] 响应式按 `lg:` 断点处理单栏→双栏

## 相关 skill / 文档

- 组件结构与生命周期 → `frontend-component`
- 设计哲学完整背景 → `frontend/FRONTEND_CONVENTIONS.md`
