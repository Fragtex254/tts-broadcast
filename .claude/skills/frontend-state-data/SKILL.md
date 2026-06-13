---
name: frontend-state-data
description: 修改前端状态管理、数据流、API 调用时使用。涵盖 Zustand store 按领域拆 slice、store/index.ts 只组合、强制 selector 禁无 selector useStore、store/types.ts 共享类型、services/api.ts 只封装 HTTP、Zod schema 运行时校验、safeParseArray 用法、useDebounce 高频防抖、Settings draft+dirtyFields 自动保存、SSE 长任务进度状态。触发场景：改 store、加 slice、selector、Zustand、调 api.ts、Zod、schemas、防抖、debounce、Settings 保存、SSE 进度、loading 状态。
---

# 前端状态管理与数据流

## 何时用 / 不用

- **用**：改 `store/`、`services/api.ts`、`services/schemas.ts`、`hooks/useDebounce`，或处理长任务/SSE 进度状态。
- **不用**：组件结构/视觉（→ `frontend-component` / `frontend-styling`）。
- **注意**：跨前后端加字段的完整链路见 `add-persisted-field`。

## 核心铁则

1. **强制使用 selector，禁止无 selector 的 `useStore()`**（订阅整个 store 会全量重渲染）。
2. 接口类型统一在 `store/types.ts`；`store/index.ts` 只创建 `useStore` 并组合 slice；业务 action 放领域 `*Slice.ts`。
3. `services/api.ts` 只封装 HTTP（baseURL `/api`、timeout 300000、全局拦截器），**不做状态管理或数据组合**。
4. Zod schema 命名 `{Domain}Schema`；`safeParseArray()` 只用于列表接口；详情/设置类解析失败应保留旧 state 或显式报错，不静默写半可信数据。
5. 长任务进度放对应领域 slice（如 `transcribeProgress`）；SSE 收到失败事件必须落到可重试状态。
6. 高频状态（slider/resize）用 `useDebounce`；Settings 用 draft + dirtyFields + onBlur/debounce 自动保存 + 顶部批量兜底。

## 模式与模板

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

> `store/index.ts` 只创建 `useStore` 并组合 slices；业务动作放在 `broadcastSlice.ts`、`segmentSlice.ts`、`settingsSlice.ts`、`scheduleSlice.ts`、`presetSlice.ts`、`voiceConfigSlice.ts` 等领域文件。接口类型放 `store/types.ts`。

### 使用规则

1. **页面组件**通过 selector 模式获取 store 数据和 action，负责路由级编排。
2. **功能组件**可以直接使用 selector 读取所需 store 字段；展示型子组件优先通过 props 接收数据。
3. **接口类型**统一定义在 `store/types.ts`，通过 `export` 供其他文件引用。
4. **Loading 状态**在 store 中维护（`isGenerating`, `isSplitting` 等），组件读取即可。
5. **长任务进度**放在对应领域 slice 中维护；例如转录使用 `transcribeProgress` 保存上传、准备、分片转录、完成和失败状态，页面只负责展示。SSE 收到失败事件后必须落到可重试状态。

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

### API 层：`services/api.ts`

- 使用 Axios 实例，`baseURL: '/api'`，`timeout: 300000`（5 分钟，TTS 生成可能耗时较长）
- 已配置全局响应拦截器，统一处理 401/403/429/500 等常见错误码
- 按功能域导出 API 对象：`broadcastApi`, `settingsApi`, `scheduleApi`
- Settings 页的 LLM 模型发现通过 `settingsApi.fetchLlmModels()` 调用 `POST /settings/llm-models`，页面只维护局部 loading/error 和模型下拉选项
- API 响应的结构校验 schema 放在 `services/schemas.ts`；store slice 中按领域引入对应 schema

**命名约定：**

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

**错误处理：**

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

### 高频状态防抖

对于 slider、resize 等高频状态变更，使用 `useDebounce` hook 延迟执行副作用：

```tsx
import { useDebounce } from '../../hooks/useDebounce';

const debouncedSync = useDebounce(() => {
  // 发送 PATCH 请求
}, 800);

// slider onChange 只更新本地 state，不直接触副作用
// useEffect 中调用 debouncedSync，用户停止操作 800ms 后执行
```

### Settings 保存模式

Settings 页使用"本地 draft + dirtyFields + onBlur/debounce 自动保存 + 顶部批量保存兜底"的模式：

- 表单值保存在页面局部 `formData`，同时用 `formDataRef` 保存最新值，避免 debounce 闭包读取上一帧数据。
- `dirtyFields` 只记录用户改过但尚未保存的字段；保存成功后清除对应字段。
- 文本域等高频输入通过 debounce 自动保存；普通输入在 `onBlur` 保存；顶部"保存设置"提交整个当前 draft。
- 纯数据变换放在 `pages/settingsDraft.ts`，并配套 `settingsDraft.test.ts`；不要把这类逻辑藏在 JSX 事件处理里。
- LLM Base URL 会自动推断 `llm_api_format`，除非用户手动切换过 API format；这两个字段的 dirty 状态必须一起维护。

新增 Settings 字段时，需要同步：

- `store/types.ts` 的 `Settings` 接口
- `store/defaults.ts` 的默认值
- `services/schemas.ts` 的 `SettingsSchema`
- `Settings.tsx` 的输入控件和保存行为
- `settingsDraft.test.ts` 中与自动保存或推断有关的测试

## Checklist

- [ ] store 读取一律用 selector，无裸 `useStore()`
- [ ] 新增类型加到 `store/types.ts`，action 放对应 `*Slice.ts`
- [ ] 新增 API 调用放 `services/api.ts`，按域导出
- [ ] 新增/改字段同步 `services/schemas.ts` 的 Zod schema
- [ ] 长任务有 loading/error 状态，SSE 失败可重试
- [ ] Settings 新增字段：同步 types/defaults/SettingsSchema/Settings.tsx/settingsDraft.test.ts
- [ ] 工具函数与页面私有 helper 配套 `*.test.ts`，运行 `npm run lint && npm run build && npm run test`

## 相关 skill / 文档

- 组件如何消费 store → `frontend-component`
- 跨前后端加字段完整流程 → `add-persisted-field`
- 后端 SSE 推送侧 → `backend-service`
