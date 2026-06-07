# TTS Broadcast 前端重构设计方案

## 概述

将 TTS Broadcast 前端从通用 Tailwind dark-mode admin 模板升级为 **Soft Editorial** 设计风格——温暖杂志感、文学衬线标题、柔和粉彩色系、毛玻璃半透明卡片。采用 A+B 策略：先建设计系统地基，再逐组件完整重做（含全套动效）。

## 设计方向

**风格来源：** beautiful-html-templates 模板库中的 Soft Editorial 模板

**视觉语言：**
- 暖纸色背景 `#F2EEDF`，替代当前的 `gray-900` 暗色
- Cormorant Garamond 衬线标题，替代当前的 Inter（未加载）
- Work Sans 无衬线正文，替代当前的 system-ui 回退
- 粉彩色系（玫瑰粉、柠檬绿、蜜桃腮红、鼠尾草、丁香紫）替代蓝紫灰单调配色
- 毛玻璃半透明卡片 + 24px 大圆角，替代当前的纯色 `bg-gray-800 rounded-lg`
- 极轻阴影 + 1px 细线，替代当前的零阴影纯色分层

**参考 Mockup：** `.superpowers/brainstorm/*/content/capsule-dashboard.html` 和 `soft-editorial-dashboard.html`

---

## 阶段一：设计系统基础

### 1.1 CSS 变量体系

在 `frontend/src/index.css` 中建立完整的 Soft Editorial 设计 token：

```css
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
```

### 1.2 Tailwind 主题扩展

更新 `tailwind.config.js`，将设计 token 映射为 Tailwind 自定义主题：

- 自定义颜色：`paper`, `paper-2`, `ink`, `ink-soft`, `pink`, `lemon`, `blush`, `sage`, `lilac`
- 自定义圆角：`card: 24px`
- 自定义阴影：`card`, `card-hover`
- 移除 `darkMode: 'class'`（全量切换到浅色主题）

### 1.3 字体加载

在 `index.html` 的 `<head>` 中添加 Google Fonts：

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Work+Sans:wght@300;400;500;600&family=ZCOOL+XiaoWei&display=swap" rel="stylesheet">
```

中文内容使用 ZCOOL XiaoWei 作为 Cormorant 的衬线搭配，通过 font-stack fallback 自动处理。

### 1.4 全局样式重写

`index.css` 的全局样式：
- `body` 背景改为 `var(--color-paper)`
- 字体改为 `var(--font-body)`
- 滚动条样式适配浅色主题
- 添加颗粒纹理叠加（可选，CSS `background-image` with SVG noise）
- `::selection` 高亮改为 `var(--color-pink)` 半透明

### 1.5 清理

- 删除未使用的 `hero.png`, `react.svg`, `vite.svg`
- 删除 `index.css` 中未使用的旧 CSS 变量

---

## 阶段二：逐组件完整重做

按工作流优先级排序，每个组件包含：视觉升级 + 布局调整 + 动效。

### 2.1 Sidebar (`components/Layout/Sidebar.tsx`)

**视觉变更：**
- 背景：`rgba(236, 230, 210, 0.7)` 半透明暖色
- 标题：Cormorant Garamond 22px weight 500
- 副标题：Work Sans 10px uppercase letter-spacing 0.1em
- 导航项：12px 圆角，hover 半透明白，选中态半透明白 + 轻阴影
- Emoji 图标替换为简约几何图标（◉ ○ 样式）
- 底部版本号：Cormorant 斜体

**动效：**
- 导航项 hover：`background` 渐变过渡 0.2s
- 导航项选中：轻微 `scale(1.02)` + 阴影出现
- 页面切换时 sidebar 保持静止（不动画）

### 2.2 Header (`components/Layout/Header.tsx`)

**视觉变更：**
- 移除 `bg-gray-800`，改为透明背景
- 标题：Cormorant Garamond 32px weight 500
- 副标题：Work Sans 11px uppercase letter-spacing 0.1em, `ink-soft` 色
- 底部 1px `rule-soft` 分隔线
- 状态指示器：鼠尾草色 pill，带呼吸动画点

**动效：**
- 标题入场：fade-in-up 0.4s
- 状态点：`opacity` 0.3↔1 呼吸动画 2.5s infinite

### 2.3 Dashboard 主页面 (`pages/Dashboard.tsx`)

**布局变更：**
- 保持两栏布局，但容器改为 `max-w-6xl` 居中
- 两栏间距从 `gap-6` 调整为 `gap-16px`
- 移除各栏独立滚动，改为页面整体滚动

### 2.4 QuickGenerate (`components/Dashboard/QuickGenerate.tsx`)

**视觉变更：**
- 卡片：毛玻璃 `rgba(255,255,255,0.55)` + `backdrop-filter: blur(8px)` + 24px 圆角
- 卡片标题：Cormorant 斜体 + 色点（柠檬绿）
- 配置行：选择器 pill 形，按钮柠檬绿底
- 资讯列表：编号用 Cormorant 斜体玫瑰粉，标题 Work Sans 500
- 分类标签：半透明彩色 pill（`lemon` / `blush` 等）
- "改写"按钮：玫瑰粉底

**动效：**
- 卡片入场：fade-in-up 0.4s，stagger 0.08s
- 资讯列表项入场：stagger fade-in-left 0.3s，每项延迟 0.05s
- 按钮 hover：`translateY(-1px)` + 阴影增强
- 按钮 active：`translateY(1px)` + 阴影消失
- 加载状态：骨架屏替代 spinner

### 2.5 ScriptPreview (`components/Dashboard/ScriptPreview.tsx`)

**视觉变更：**
- 卡片：同上毛玻璃风格，色点玫瑰粉
- 脚本区域：`rgba(255,255,255,0.6)` 背景 + 18px 圆角 + 1px 细线
- 文本：Work Sans 13px，行高 1.9
- 元数据：Work Sans 10px uppercase，ink-soft 35% 透明度
- "添加开场白/结束语"按钮：鼠尾草色 pill

**动效：**
- 编辑模式切换：textarea 淡入 0.2s
- 保存成功：色点短暂闪烁 `scale(1.3)` → 回弹

### 2.6 VoiceGenerator (`components/Dashboard/VoiceGenerator.tsx`)

**视觉变更：**
- 卡片：同上，色点蜜桃腮红
- 音色卡片：半透明白 + 1px 边框 + 16px 圆角
- 选中态：柠檬绿半透明填充 + 轻阴影
- 音色名称：Cormorant 15px weight 500
- 音色 ID：Work Sans 9px uppercase
- 生成按钮：丁香紫底

**动效：**
- 音色卡片选中：`scale(0.97)` → `scale(1)` 弹性反馈
- 模式切换（预设/克隆/设计）：内容 crossfade 0.2s
- 生成中：按钮内进度条动画（非 spinner）

### 2.7 AudioPlayer (`components/Dashboard/AudioPlayer.tsx`)

**视觉变更：**
- 播放器容器：半透明白 + 20px 圆角 + 1px 细线
- 播放按钮：玫瑰粉半透明圆 + 1px 边框
- 波形条：已播放 = 玫瑰粉，未播放 = ink 10%
- 时间：Work Sans 11px，ink-soft 45%
- 保存/下载按钮：改为 pill 形图标按钮

**动效：**
- 播放中波形：已播放部分轻微脉动 `scaleY(1.05)` ↔ `scaleY(1)`
- 播放按钮 hover：玫瑰粉透明度增强
- 进度更新：波形条高度平滑过渡
- 空状态：柔和的 fade-in 提示文字

### 2.8 SegmentEditor (`components/Dashboard/SegmentEditor.tsx`)

**视觉变更：**
- 卡片：同上，色点丁香紫
- 段落条目：半透明白 + 14px 圆角 + 1px 细线
- 索引：Cormorant 斜体 18px，丁香紫色
- 状态标签：鼠尾草色（就绪）/ 柠檬绿（等待中），pill 形
- 操作按钮：鼠尾草（全部生成）/ 丁香紫（合并音频）

**动效：**
- 段落列表入场：stagger fade-in-up 0.3s
- 状态变更（pending → generating → generated）：颜色渐变 + 状态图标 morph
- 段落删除：fade-out + height collapse 0.3s
- 合并成功：所有段落条目同时闪烁鼠尾草色

### 2.9 History 页面 (`pages/History.tsx`)

**视觉变更：**
- 页面容器：同 Dashboard 纸色背景
- 表格改为卡片列表模式（移动端友好）
- 每条记录：毛玻璃卡片 + 24px 圆角
- 标题：Cormorant 16px weight 500
- 时间/时长：Work Sans 12px ink-soft
- 状态标签：彩色 pill（完成=鼠尾草，生成中=柠檬绿，失败=玫瑰粉）
- 分页：pill 形按钮

**动效：**
- 列表入场：stagger fade-in-up 0.05s 间隔
- 选中记录：卡片轻微 `scale(1.01)` + 阴影增强
- 详情面板：slide-in from right 0.3s
- 分页切换：列表 crossfade 0.2s

### 2.10 Settings 页面 (`pages/Settings.tsx`)

**视觉变更：**
- 容器：`max-w-3xl` 居中
- 分区卡片：毛玻璃 + 24px 圆角，每个分区独立卡片
- 分区标题：Cormorant 斜体 + 色点（对应分区语义色）
  - API Key → 玫瑰粉
  - 音色 → 蜜桃腮红
  - 播报 → 鼠尾草
  - 定时任务 → 柠檬绿
- 输入框：半透明白 + 12px 圆角 + 1px 细线，focus 时边框变为对应分区色
- 测试按钮：鼠尾草色 pill
- 定时任务开关：自定义 pill 形开关，开=鼠尾草色，关=ink 10%

**动效：**
- 各分区卡片 stagger 入场 0.1s 间隔
- 保存成功：顶部 toast 从上滑入，3s 后滑出
- 开关切换：圆形滑块平滑移动 + 背景色渐变
- 测试连接：按钮内加载动画 → 结果图标淡入

---

## 动效系统规范

### 入场动画

```css
@keyframes fade-in-up {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes fade-in-left {
  from { opacity: 0; transform: translateX(-8px); }
  to { opacity: 1; transform: translateX(0); }
}
```

- 默认时长：0.4s
- 默认缓动：`cubic-bezier(0.22, 1, 0.36, 1)`（ease-out-expo）
- Stagger 间隔：0.05-0.1s

### Hover 微交互

- 卡片：`translateY(-2px)` + `shadow-card-hover`，0.2s
- 按钮：`translateY(-1px)` + 阴影增强，0.15s
- 链接/导航项：颜色渐变，0.2s

### 状态转换

- Loading → Loaded：内容 fade-in，spinner fade-out
- 空状态 → 有内容：列表 stagger 入场
- 错误状态：元素轻微 shake（`translateX ±4px`，2 次）

### `prefers-reduced-motion`

所有动画在 `prefers-reduced-motion: reduce` 下禁用，改为即时切换。

---

## 技术约束

- **不引入新依赖**：动效优先 CSS-only，如需 JS 动画库再评估（Framer Motion ~30KB gzip）
- **Tailwind v4 兼容**：所有自定义值通过 `@theme` 或 CSS 变量注入
- **中文支持**：Cormorant + ZCOOL XiaoWei font-stack，行高 1.7-1.9，标点规范化
- **响应式**：保持当前的 `lg:` 断点策略（单栏 → 双栏），Sidebar 在移动端折叠
- **浏览器兼容**：`backdrop-filter` 需要 `-webkit-` 前缀（Safari）

---

## 成功标准

1. 所有 3 个页面 + Sidebar + 12 个组件全部升级到 Soft Editorial 风格
2. 页面间切换有平滑过渡动画
3. 列表/卡片有 stagger 入场动画
4. 所有交互元素有 hover/active 微交互
5. 加载状态使用骨架屏而非 spinner
6. 音频播放器有波形脉动动画
7. `prefers-reduced-motion` 下无动画
8. 中文排版正确（字体、行高、标点）
9. 视觉风格与 Soft Editorial mockup 一致
