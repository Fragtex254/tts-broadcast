---
name: frontend-styling
description: 调整 Warm Workbench / Soft Editorial 视觉、Tailwind class、ActionButton/ActionCard/WorkbenchCard 变体、颜色、字体、层级、响应式和动效时使用。覆盖 paper/ink/pink/lemon/blush/sage/lilac 语义色、MiSans、transition-ui、按压反馈、Modal 动效、reduced motion。触发场景：改样式、按钮卡片一致性、动效审查、transition-all、hover、视觉层级、响应式、好看一点。
---

# 前端视觉与交互规范

## 设计目标

**Warm Workbench / Soft Editorial** 是成熟的内容生产工作台：温暖、有编辑感，但首先清楚、稳定、响应迅速。

- 保留暖纸色背景、MiSans 和柔和功能色，不改成黑白极简或冷灰 SaaS。
- 粉彩颜色表达动作与状态，不作无意义装饰。
- 主工作区层级要实，内部层级再逐步变轻；避免所有表面都透明发虚。
- 高频操作克制，偶发状态变化和弹窗才使用轻量空间动效。

## 语义 token

组件只使用 `index.css` 注册的语义 class，不硬编码 hex，也不直接散用底层参考色阶。

| Token | 语义 |
|---|---|
| `paper` / `paper-2` | 页面与 app chrome 暖纸底色 |
| `ink` / `ink-soft` | 主文字 / 次文字 |
| `lemon` | 开始、生成、获取等主操作；等待状态 |
| `sage` | 保存、确认、成功 |
| `lilac` | 编辑、转换、排版、切分 |
| `pink` | 危险、失败、警告、强强调 |
| `blush` | 音色、温暖辅助强调 |

危险按钮仍用 `text-ink`，不要自动套白字。低对比度文字仅用于辅助信息，不用于关键说明、表单标签和操作名称。

## 字体与信息层级

- 页面标题、卡片标题、关键数字：`font-display`。
- 正文、表单、按钮、标签：`font-body`。两者都以 MiSans 为首选字体。
- 页面标题通常 `text-[28px]`–`text-[32px]`；工作区标题 `text-[14px]`–`text-[16px]`；正文 `text-[12px]`–`text-[14px]`。
- 大写和宽字距只用于极短标签；中文操作按钮默认不强制 uppercase。
- 同一层级保持字号和字重一致，不靠更多颜色补救层级混乱。

## 表面与共享组件

优先使用 `components/UI`，组件选择边界见 `frontend-component`。

### 标准工作区

使用 `WorkbenchCard`：白色 80% 表面、card border、shadow-card、圆角和标题色点由组件统一。需要纯展示且没有标题的局部表面才手写：

```tsx
<section className="rounded-card border border-card-border bg-white/80 p-5 shadow-card backdrop-blur-sm" />
```

卡片内部次级内容通常使用 `rounded-2xl border border-card-border bg-white/60 p-4`；不要给每一层都加阴影。

### 可点击入口

使用 `ActionCard`。`lemon` 表示开始/创建路径，`lilac` 表示编辑/整理路径，`neutral` 表示普通导航。纯展示内容不要伪装成可点击卡片。

### 按钮

使用 `ActionButton`：

| variant | 用途 |
|---|---|
| `primary` | 开始、生成、获取 |
| `confirm` | 保存、确认、成功后续动作 |
| `edit` | 编辑、转换、排版、切分 |
| `danger` | 删除、破坏性确认、失败重试 |
| `neutral` | 次要但完整的操作 |
| `text` | 取消、返回、轻量辅助动作 |

同一操作区只保留一个最强主按钮。loading 使用 `isLoading` 和具体文案，不在调用处重复拼 pulse、disabled、`aria-busy`。

开关、音频 transport、分页、列表内图标工具等专用控件可保留原生 button，但必须有 focus、disabled 和按压反馈。

## 表单与状态

- 文本输入：`rounded-xl border border-card-border bg-white/70`；select 可用 pill 形状。
- focus 至少改变 border 或 ring，不能只依赖浏览器默认且不可见的 outline。
- 状态 pill 使用淡色背景 + `text-ink`，同时带明确文字。
- 错误靠近相关字段/操作，`bg-pink/10 border-pink/30`；成功用 sage，但不要把整页染绿。
- 骨架结构应接近最终内容，避免加载完成后大幅跳动。

## 动效

### 原则

1. 普通交互 120–250ms，默认使用快速 ease-out：`cubic-bezier(0.22, 1, 0.36, 1)`。
2. 使用 `transition-ui` 或明确的 `transition-colors` / `transition-opacity`；禁止 `transition-all`。
3. 只动画 `transform`、`opacity`、颜色、边框、阴影和滤镜。避免动画 width、height、margin、top/left。
4. 按钮和可点击卡片有 `active:scale-[0.97]` 等轻微按压反馈；hover 位移最多 1px。
5. hover 只增强已有可点击语义；关键内容不能只在 hover 出现。触摸设备不依赖 hover 完成任务。
6. 页面 Header、Sidebar、高频切换区域和动态列表不重复播放入场动画。
7. 不为增加动效而增加动效；状态清楚优先于动画存在。

### 适合使用的动画

- Modal：遮罩 opacity；面板轻微 translate/scale，方向与触发关系一致，transform-origin 靠近触发侧。
- 新出现的低频成功/错误状态：短淡入；错误可单次 shake。
- 音频播放：受播放状态驱动的 waveform；停止后立即结束。
- 长任务：进度使用 transform scaleX 或明确阶段，不用不可中断循环 keyframe 假装进度。

动态列表的进入/退出优先用可被状态中断的 transition。若必须 stagger，总延迟应很短，且不应用于频繁刷新列表。

### Reduced motion

`index.css` 的 `prefers-reduced-motion: reduce` 应移除位移、缩放和长循环，但保留即时的颜色、边框和透明度反馈。组件不要用内联 animation 绕过全局规则。

## 响应式

- 默认按窄屏单列设计，再用 `sm:` / `lg:` 扩展。
- 窄屏操作区允许换行；主按钮保持易点击，图标工具仍需可访问名称。
- 桌面多栏必须允许子项 `min-w-0`，长标题截断或换行，避免横向溢出。
- Sidebar 小屏保持紧凑，桌面展示完整导航；不要改变既有导航结构。

## 完成检查

- [ ] 保留 Warm Workbench 色彩、MiSans 和暖纸底色
- [ ] 使用语义 token，无组件级硬编码色值
- [ ] 标准按钮、入口卡、工作区已复用 UI 组件
- [ ] 主次操作和文字对比清楚，同一区域只有一个最强主按钮
- [ ] 无 `transition-all`，常规动画在 120–250ms
- [ ] 高频区域没有重复入场，动态列表动画可中断
- [ ] hover 不承担触摸设备必需功能
- [ ] reduced motion 下仍有清晰的非位移反馈
- [ ] 窄屏无横向溢出，长文本可处理

## 相关规范

- 组件结构和共享组件边界：`frontend-component`
- 设计 token 实现：`frontend/src/index.css`
- 技术栈与目录：`frontend/FRONTEND_CONVENTIONS.md`
