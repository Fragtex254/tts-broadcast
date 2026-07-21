# 前端开发规范

## 目录

1. [技术栈](#技术栈)
2. [项目结构](#项目结构)
3. [命名规范](#命名规范)
4. [开发规则（已迁移至 skill）](#开发规则已迁移至-skill)

> **本文档只保留低频背景（技术栈/结构/文件职责/命名规范）。**
> 高频开发规则（设计系统/组件/状态管理/API/路由/动效/响应式/TS/测试）已迁移为按需加载的 skill，见下方「开发规则」索引。开发前请按根目录 `AGENTS.md` 的「任务 → skill 路由表」调用对应 skill。

---

## 技术栈

| 层 | 技术 | 版本 |
|---|---|---|
| 框架 | React | 19 |
| 语言 | TypeScript | 6 |
| 构建 | Vite | 8 |
| 样式 | Tailwind CSS | v4（全局字体默认使用本机 MiSans，缺失时回退 Noto Sans SC / sans-serif） |
| 状态 | Zustand | 5 |
| 路由 | React Router | 7 |
| HTTP | Axios | 1.x |
| 运行时校验 | Zod | 4 |
| 测试 | Vitest + Testing Library | 4 / 16 |
| 压缩包生成 | JSZip | 3.x（批量转录结果打包下载为 ZIP） |

**原则：谨慎引入新依赖。** UI 和普通交互优先用 CSS/原生 API 实现；运行时契约校验使用现有 Zod；测试使用现有 Vitest/Testing Library。确需新增依赖时，先评估 bundle size、维护成本和 CI 影响。JSZip 用于批量转录结果打包下载，浏览器原生无 zip 生成能力，属于合理新增。

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
│   ├── VoicePresets.tsx
│   ├── Transcribe.tsx
│   ├── TranscriptWorkspace.tsx     # 播客详情、校对与一键总结编排
│   ├── ContentLibrary.tsx
│   ├── Automation.tsx
│   ├── Settings.tsx
│   ├── settingsDraft.ts            # Settings 页纯逻辑 helper（需配测试）
│   └── transcribeUtils.ts          # Transcribe 页纯逻辑 helper（需配测试）
├── components/
│   ├── ModalShell.tsx             # 统一二级界面/弹窗/全屏编辑面板外壳
│   ├── Layout/                 # 布局组件（Sidebar, Header）
│   ├── Library/                # 内容库子面板（播报、转录稿）
│   ├── Dashboard/              # Dashboard 子组件（含统一音频播放条 AudioPlaybackBar）
│   └── Transcribe/             # 转录与播客工作区子组件（Provider、历史、Speaker、Summary、Turn）
├── hooks/                       # 可复用 hooks（如 useDebounce）
├── services/
│   ├── api.ts                  # Axios API 封装
│   ├── apiError.ts             # API 错误提取 helper
│   ├── schemas.ts              # API 与 SSE 的 Zod 运行时校验 schema
│   ├── sseClient.ts            # 协议校验、有限重连与传输状态
│   └── sseRegistry.ts          # EventSource / timer 的模块级连接注册表
└── store/
    ├── index.ts                # Zustand 全局 store 组合入口
    ├── types.ts                # 全局共享类型
    ├── backgroundTaskSlice.ts  # 可序列化的全局后台任务快照
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
| `services/sseClient.ts` / `sseRegistry.ts` | SSE 协议校验、有限重连和非序列化连接生命周期 | 页面状态、Zustand 持久数据 |

> 组件文件内部组织顺序（导入 → 接口 → 子组件 → 常量 → 主组件 → 默认导出）见 skill：`frontend-component`。

### 共享 UI 模块约定

- `components/ModalShell.tsx` 是二级界面、确认弹窗、全屏编辑面板的统一外壳，集中处理 `role="dialog"`、Esc 关闭、backdrop 关闭、标题区、footer 和尺寸变体。业务组件不得重复手写固定遮罩与对话框基础逻辑。
- `components/Dashboard/AudioPlaybackBar.tsx` 是音频播放条唯一底层实现，集中处理 `<audio>` 生命周期、播放/暂停、时长、seek、波形、进度条、播放失败和倍速保音高。整篇/历史播放器通过 `AudioPlayer`，试听小播放器通过 `MiniAudioPlayer` 接入；业务组件不得重新实现播放控制。
- 与播放条相关的纯函数放在 `components/Dashboard/audioPlaybackUtils.ts`，保持组件文件只导出 React 组件，符合 Vite Fast Refresh 规则。
- 播客详情使用独立上下文路由 `/history/transcriptions/:id`；`TranscriptWorkspace` 只负责编排，Speaker、Summary、Turn 分为展示组件。普通来源的时间码仍只读；严格解析为 Bilibili BV/av 的 `source_url` 可通过 `BilibiliTranscriptPlayer` 使用 Turn `start_seconds` 定位官方外链播放器，必须保留双击、键盘和显式按钮三种入口。`2xl` 全屏阅读采用说话人、逐字稿、上下文三栏：上下文仅显示与视口当前 Turn 时间相交的 `speaker_viewpoint` 并在下方固定播放器；窄屏退回底部播放器，无交集时显示空态而非猜测最近观点。
- `components/Layout/GlobalTaskProgressBar.tsx` 统一展示跨路由继续运行的后台任务。任务链接、阶段、百分比和断线恢复提示来自 `backgroundTaskSlice` 的纯 JSON 快照；断线动作通过 registry 按原 taskId 恢复，组件不得持有或关闭 `EventSource`。

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

## 开发规则（已迁移至 skill）

以下高频开发规则已从本文档迁移为按需加载的 skill。开发前请按根目录 `AGENTS.md` 的「任务 → skill 路由表」调用对应 skill（`Skill` 工具），不要全量读规范文档。

| 原章节 | 现归属 skill |
|--------|------------|
| 设计系统（设计哲学 / 色彩 / 字体 / 卡片 / 按钮 / 输入框 / Pill / 内部内容区） | `frontend-styling` |
| 动效规范（可用动画 / 交错入场 / 缓动 / prefers-reduced-motion） | `frontend-styling` |
| 响应式（断点 / 布局模式 / Sidebar） | `frontend-styling` |
| 组件规范（组件文件组织 / 组件类型 / 设计原则 / 入场动画 / 加载 / 错误 / 空状态） | `frontend-component` |
| 路由（当前路由 / 规则 / 懒加载） | `frontend-component` |
| TypeScript（严格模式 / Props interface / 事件 / Ref / Store 类型） | `frontend-component` |
| 错误边界、无障碍 | `frontend-component` |
| 状态管理（Store 结构 / selector 强制 / 使用模式） | `frontend-state-data` |
| API 层（api.ts / 命名约定 / 错误处理 / Zod 运行时校验） | `frontend-state-data` |
| 高频状态防抖、Settings 保存模式 | `frontend-state-data` |
| 质量门禁与测试、性能 | 已并入 `frontend-component` / `frontend-state-data` 的 Checklist |
| 新增页面/组件 Checklist | `frontend-component` |

> skill 是 Claude Code 专属机制（`.claude/skills/`）。非 Claude agent 无法发现 skill，可直接查阅对应 skill 目录下的 `SKILL.md` 获取完整规则。
