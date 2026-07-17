---
name: frontend-component
description: 新增或修改 React 页面、组件、路由和交互结构时使用。覆盖组件职责与拆分、ActionButton/ActionCard/WorkbenchCard、ModalShell、音频与转录共享组件、加载错误空状态、TypeScript、无障碍、测试和质量门禁。触发场景：加组件、改页面、React UI 重构、按钮或卡片封装、弹窗、长任务状态、加路由、ErrorBoundary。
---

# 前端组件与页面开发

## 适用范围

- 组件结构、页面编排、交互语义、路由和组件测试使用本 skill。
- 视觉 token、动效、响应式规则见 `frontend-styling`。
- Zustand、API、Zod 和跨页面数据流见 `frontend-state-data`。
- 技术栈、目录和命名背景见 `frontend/FRONTEND_CONVENTIONS.md`。

## 组件边界

1. 页面负责路由参数、页面级数据编排和功能组件组合，不沉淀通用 UI class。
2. 功能组件通过 props 或精准 Zustand selector 取数；不直接调用 API。
3. props 下传、events 上抛。超过约 300 行，或同时承担数据编排、复杂编辑和展示时，拆出子组件或纯逻辑 helper。
4. 组件同时提供具名导出和默认导出；props 使用 `interface {Component}Props`。
5. 不使用裸 `any`。共享业务类型放 `store/types.ts`；类型断言只在边界不可避免时使用，并说明原因。
6. 列表使用稳定业务 ID 作 key；会重排的列表禁止使用 index。

推荐文件顺序：导入 → props/type → 局部常量/子组件 → 主组件 → 默认导出。

## 共享 UI 优先级

先复用，再新增清晰变体；不要在业务组件复制一整段交互 class。

| 场景 | 组件 | 边界 |
|---|---|---|
| 普通语义操作 | `components/UI/ActionButton.tsx` | primary/edit/confirm/danger/neutral/text，支持 loading |
| 整块可点击入口或任务卡 | `components/UI/ActionCard.tsx` | 原生 button 语义；不用于纯展示卡片 |
| 带标题的标准工作区 | `components/UI/WorkbenchCard.tsx` | 统一卡片外壳、标题色点和 header action |
| 弹窗、二级界面、全屏编辑 | `components/ModalShell.tsx` | 统一 dialog、焦点、Esc、遮罩和进退场 |
| 音频播放 | `AudioPlaybackBar` / `AudioPlayer` / `MiniAudioPlayer` | 唯一播放状态、seek、倍速实现 |
| MiMo 标签编辑 | `AudioTagTextEditor` | 不新增局部简化版标签编辑器 |
| 转录预览与阅读 | `LiveTranscriptionPreview` / `TranscriptionPreviewModal` / `TranscriptConversationModal` | 实时与固定结果保持只读语义 |

开关、分页、音频 transport、紧凑图标工具和拖拽手柄是专用控件，可以保留原生 button；它们不应被强行塞进 `ActionButton`。

## 页面与路由

- 首屏 `SourceCollection` 直接导入；非首屏页面使用 `React.lazy()` + `Suspense`。
- 新路径在 `App.tsx` 注册并确认 `NotFound` 仍兜底；只有顶级用户任务才加入 Sidebar。
- 顶级导航保持「工作台 / 内容库 / 音色库 / 自动化 / 设置」。`/editor`、`/transcribe` 和转录详情是上下文任务页。
- 路由页面由全局 `ErrorBoundary` 保护；仅对可独立失败且能局部恢复的复杂区域增加局部边界。

## 状态表达

每个异步流程都必须能区分：空闲、进行中、成功、失败；长任务还应显示阶段或真实进度。

- 页面/卡片初载：结构匹配的 skeleton，使用 `animate-pulse`，不使用无上下文 spinner。
- 按钮任务：`ActionButton isLoading` + 明确进行中文案；loading 时自动 disabled 和 `aria-busy`。
- 错误：靠近触发位置展示可操作文案；可恢复错误给重试入口。`animate-shake` 只用于新发生的低频错误。
- 空状态：说明为什么为空，并提供下一步；不要只写“暂无数据”。
- 成功：对会改变后续操作的结果给持久状态或文案，不依赖一闪而过的动画。
- SSE：保留已有进度和已完成内容，不用阶段事件覆盖真实结果。

## TypeScript 与事件

```tsx
interface ExampleProps {
  title: string;
  isLoading?: boolean;
  onSubmit: (value: string) => Promise<void>;
}

export const Example: React.FC<ExampleProps> = ({ title, isLoading, onSubmit }) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    // ...
  };
  return null;
};

export default Example;
```

- 事件与 ref 写明确类型。
- 可选回调使用可选链；异步 UI handler 用 `void` 明确忽略 Promise。
- 页面私有转换、排序、校验等纯逻辑移到 `*Model.ts` / `*Utils.ts` 并单测。

## 无障碍

- 优先语义元素；交互使用 `<button>` / `<a>`，不要用 click div 模拟。
- 纯图标按钮必须有可访问名称（`aria-label` 或可读 `title`）。装饰图标加 `aria-hidden="true"`。
- 表单控件有 label；错误区使用 `role="alert"`，动态任务状态按必要性使用 `aria-live`。
- 不破坏键盘焦点、Tab 顺序和 focus-visible；弹窗焦点行为交给 `ModalShell`。
- 颜色不能是唯一状态信号，需配合文案、图标或形状。

## 性能与测试

- Zustand 只订阅所需字段；不要无 selector 订阅整个 store。
- 不为了“优化”到处加 `useCallback` / `useMemo`；只用于昂贵计算、稳定依赖或已证实的重渲染边界。
- 新共享 UI、复杂交互、纯逻辑 helper 必须有对应 Vitest/Testing Library 测试。
- 测试用户可观察行为和语义，不锁死无意义的 DOM 结构。

## 完成检查

- [ ] 已复用合适的共享 UI；专用控件没有被过度抽象
- [ ] 页面与组件职责清楚，长组件已评估拆分
- [ ] loading / success / error / empty 状态完整
- [ ] TypeScript 无裸 `any`，列表 key 稳定
- [ ] 键盘、可访问名称、表单 label 和 dialog 语义正确
- [ ] 新共享组件或纯逻辑有测试
- [ ] 运行 `npm run lint`、`npm run test`、`npm run build`

## 相关规范

- 视觉与动效：`frontend-styling`
- 状态与 API：`frontend-state-data`
- 背景和目录：`frontend/FRONTEND_CONVENTIONS.md`
