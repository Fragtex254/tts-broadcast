---
name: frontend-state-data
description: 修改前端状态管理、数据流、API 调用时使用。涵盖 Zustand store 按领域拆 slice、内容项目 Evidence/Citation/Creation Job、服务端唯一里程碑事件、观点研究、store/index.ts 只组合、强制 selector、共享类型、API 封装、Zod 运行时校验、SSE 长任务、草稿与失败恢复。触发场景：改 store、加 slice、证据工作台、引用、创作生成任务、里程碑事件、观点搜索、内容项目、selector、Zustand、调 api.ts、Zod、schemas、SSE 进度、loading 状态。
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
6. SSE 调用必须显式选择 `segment/transcribe/batch-transcribe/summary/claims/content-creation` 协议并经 Zod `safeParse`；校验失败记录并丢弃，不用 `as` 绕过。`EventSource`、重试 timer、Map 与 callback 只放 `sseClient/sseRegistry`，Zustand 的 `backgroundTasks` 只存可 JSON 序列化快照。路由卸载不关闭健康任务，App 根卸载统一释放 registry 与模块级轮询；连续断线按 1/2/4 秒最多重连 3 次，只有真实业务事件可以清零预算，单独 `connected` 握手不能。服务端 terminal 回放负责补回重连窗口内错过的完成/失败事件；耗尽后保留原 client 与领域 busy 状态，由全局任务条按原 taskId 恢复，禁止直接重提造成重复任务。
7. 高频状态（slider/resize）用 `useDebounce`；Settings 用 draft + dirtyFields + onBlur/debounce 自动保存 + 顶部批量兜底。
8. 转录 SSE 的阶段事件可能不带文字：必须保留已有累计文本；优先用 `chunks` 有序快照恢复轮询间隔内跨过的分片，旧服务只有 `chunkText` 时再按已完成 chunk 序号 upsert，不能因重复事件而重复追加。最终 `complete.text` 才替换临时结果。
9. 观点研究状态放 `researchSlice.ts`；搜索结果区分 `embedding` / `keyword` 降级模式，关系分析只提交显式选中的 claim ID，内容项目详情始终以服务端返回为准。观点分析 SSE 与总结 SSE 分开维护 loading/error，刷新后以 `claims_status` 收敛。
10. 内容项目工作区通过独立领域 slice 管理 Source、Artifact 与 Revision；服务器聚合响应是唯一真实来源。详情响应必须严格解析，mutation 后使用服务端返回对象合并或重新读取工作区，不在页面自行推导 revision number、项目归属或当前版本。
11. 口播编辑器只以 `/editor/:broadcastId` 中的正整数 Broadcast ID 为可恢复上下文。页面进入先清旧编辑状态，再严格校验后端在同一读事务中返回的 `{ broadcast, voiceConfig, sourceRevisionContext, segments, splitInProgress }` 聚合快照，一次原子落入 store，并用请求序号防止旧响应覆盖新 ID。`splitInProgress=true` 时持续重读整份聚合直到提交/失败；缺失、非法或 404 必须显式报错，不得降级使用内存旧稿。所有入口先创建或选择持久化编辑副本再按返回 ID 导航；已保存历史 Render 不得复用原 ID，已分段时副本必须保留 Segment 文字、顺序、标签与倍速并清空音频。项目稿创建 draft 时只可传正文逐字一致的 `audio_script` `artifactRevisionId`，来源上下文由后端派生。项目稿修改先 INSERT 新 Revision，再新建 draft 并 replace URL。
12. 内容项目聚合响应同时承载 Evidence、Revision Citation 与持久化 Creation Job；Evidence 的用户 `decision_state` 与技术 `lifecycle_status` 不得在 slice 中合并，生成筛选要求 selected + active，历史 Citation 的快照状态与当前 `reuse_eligible/source_linked` 分开保存。SSE 只做即时进度，`complete.workspace` 或随后重新读取的聚合才负责收敛。事件到达时先核验当前 project / job / request key，离开项目后的旧事件不得污染新页面。
13. 创作里程碑只接收服务端事务成功后返回的 `{id, kind, title, description}`；slice 按 event ID 去重并在用户关闭后清除当前展示。刷新、列表数量变化、重复 complete 和已完成幂等响应不得在前端合成或重播 milestone。
14. AI 创作提交前必须把相关局部 dirty 状态提升到工作区协调层：未保存 Brief、Evidence 用户备注或目标 Outline/Master 草稿时禁用对应任务并解释原因；任务完成不得用服务端 workspace 静默覆盖本地草稿。异步失败不能因 `activeOperation` 清空而消失。SSE 健康或持久 Job 仍有 progress/heartbeat 时不得用固定短墙钟超时关闭任务，轮询持续到 terminal 状态或应用根卸载。Outline 与 Master 历史分别维护，保存任一类型不得污染另一类型的 Revision 列表。

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
6. 播客总结的服务器 `summary_status` 与持久化 lease 是真实状态来源；本地 SSE 只负责即时进度。页面刷新后显示后台运行态并允许刷新详情，服务端负责阻止重复提交与把过期租约收敛到可重试失败态。
7. 跨路由后台任务在 `backgroundTaskSlice.ts` 保存标题、目标链接、阶段、百分比、重试次数和时间戳；非序列化连接对象必须留在 `services/sseRegistry.ts`。

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
- `safeParseArray()` 对整个列表做严格校验，任一条不符合 schema 都会失败；详情用 `safeParseStrict()`。页面需要多个响应时，必须全部校验成功后再原子写入 state，失败时显式报错，避免静默写入半可信数据。
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
- [ ] SSE 使用显式 Zod 协议；连接只在 registry，Zustand 快照可 `JSON.stringify`
- [ ] Settings 新增字段：同步 types/defaults/SettingsSchema/Settings.tsx/settingsDraft.test.ts
- [ ] 工具函数与页面私有 helper 配套 `*.test.ts`，运行 `npm run lint && npm run build && npm run test`

## 相关 skill / 文档

- 组件如何消费 store → `frontend-component`
- 跨前后端加字段完整流程 → `add-persisted-field`
- 后端 SSE 推送侧 → `backend-service`
