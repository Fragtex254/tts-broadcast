# 前端工程约定

本文档只记录低频、稳定的工程背景。开发时的高频规则由项目 skill 维护：

- 组件、页面、路由、状态反馈：`.claude/skills/frontend-component/SKILL.md`
- 视觉、语义色、动效、响应式：`.claude/skills/frontend-styling/SKILL.md`
- Zustand、API、Zod、数据流：`.claude/skills/frontend-state-data/SKILL.md`

项目级硬规则以根目录 `AGENTS.md` 为最高优先级。

## 产品与设计边界

前端是一个内容生产工作台，不是通用后台模板。必须保留：

- Warm Workbench / Soft Editorial 视觉方向
- `paper / ink / pink / lemon / blush / sage / lilac` 语义色
- MiSans 字体和暖纸色背景
- 顶级导航「工作台 / 内容库 / 音色库 / 自动化 / 设置」
- 现有业务流程、路由信息架构和数据契约

外部设计参考只能改善判断、交互细节和动效质量，不得重做品牌或改成冷灰、黑白极简风格。

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | React 19 + TypeScript 6 |
| 构建 | Vite 8 |
| 样式 | Tailwind CSS v4；token 和全局动效在 `src/index.css` |
| 状态 | Zustand 5 |
| 路由 | React Router 7 |
| HTTP / 校验 | Axios 1.x / Zod 4 |
| 测试 | Vitest 4 + Testing Library 16 |

谨慎引入新依赖。普通 UI 和交互优先使用现有 React、CSS 与浏览器 API；新增依赖前评估 bundle、维护和 CI 成本。

## 目录与职责

```text
frontend/src/
├── App.tsx                         # 路由与全局布局
├── index.css                       # 设计 token、全局交互和动效
├── pages/                          # 路由页：参数、页面级状态与编排
├── components/
│   ├── UI/                         # ActionButton、ActionCard、WorkbenchCard
│   ├── Layout/                     # Sidebar、Header
│   ├── Dashboard/                  # 内容生产与统一音频组件
│   ├── Library/                    # 内容库子面板
│   ├── Transcribe/                 # 转录与播客工作区
│   ├── Research/                   # 观点研究与内容项目
│   └── ModalShell.tsx              # 统一 dialog 外壳
├── hooks/                          # 可复用 hooks
├── services/                       # HTTP、错误提取、Zod schema、日志
└── store/
    ├── index.ts                    # store 组合入口
    ├── types.ts                    # 共享业务类型
    └── *Slice.ts                   # 领域状态与异步 action
```

| 位置 | 负责 | 不负责 |
|---|---|---|
| `pages/*.tsx` | 路由参数、页面布局、数据编排 | 通用 UI 基础实现 |
| `components/UI` | 稳定、无业务数据的共享视觉原语 | API、store、路由跳转 |
| `components/{Feature}` | 独立业务 UI，通过 props 或 selector 取数 | 直接调用 API |
| `pages/*Model.ts` / `*Utils.ts` | 页面私有纯逻辑 | React hooks、DOM、请求 |
| `store/*Slice.ts` | 领域状态、异步 action | 样式和页面局部交互 |
| `services/*` | 网络、校验、日志等边界能力 | 页面状态与展示逻辑 |

## 共享组件所有权

- `components/UI/ActionButton.tsx`：普通语义按钮、loading 语义和基础交互。
- `components/UI/ActionCard.tsx`：整块可点击的入口与任务卡。
- `components/UI/WorkbenchCard.tsx`：带标题和色点的标准工作区表面。
- `components/ModalShell.tsx`：dialog、焦点、Esc、遮罩和面板动画。
- `components/Dashboard/AudioPlaybackBar.tsx`：音频播放状态、时长、seek、波形和倍速的唯一底层实现。
- `components/Dashboard/AudioTagTextEditor.tsx`：MiMo 方括号标签编辑的统一复杂面板。

新增变体应先判断是否是稳定的跨业务语义。只有跨至少两个场景且不会引入大量布尔 props 时，才扩展共享组件；专用控件留在所属功能目录。

## 命名

| 类型 | 规则 | 示例 |
|---|---|---|
| 组件/页面文件 | PascalCase `.tsx` | `QuickGenerate.tsx` |
| 工具和 service | camelCase `.ts` | `apiError.ts` |
| 组件 | PascalCase | `ActionButton` |
| hook / handler | camelCase | `useSSE`, `handleSave` |
| 常量 | UPPER_SNAKE_CASE | `TURN_PAGE_SIZE` |
| props | `interface {Name}Props` | `ModalShellProps` |
| 布尔值 | `is` / `has` / `can` 前缀 | `isLoading`, `hasError`, `canFormat` |
| CSS 变量 / 自定义 class | kebab-case | `--color-paper`, `transition-ui` |

组件文件通常按：导入 → props/type → 局部常量/子组件 → 主组件 → 默认导出。

## 稳定架构事实

- 首屏 `/` 是 `SourceCollection`；非首屏路由懒加载。
- `/editor`、`/transcribe`、转录详情是上下文任务页，不加入顶级导航。
- 播客时间码当前只读，不绑定音频 seek 或“回到现场”。
- 转录实时预览只展示已完成 chunk，不把模型内部 token 当成稳定结果。
- 前端不得为视觉重构改变 API 契约、Zustand 业务结构或领域事实。

## 质量门禁

前端代码变更完成后，在 `frontend/` 执行：

```bash
npm run lint
npm run test
npm run build
```

只改文档时可以不跑 build/test，但必须确认规范与当前实现一致。
