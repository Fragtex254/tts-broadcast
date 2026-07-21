# 导航重构设计：Dashboard 拆分为 4 页面

**日期**：2026-06-07
**状态**：已批准
**方案**：方案 A — 最小改动拆分

---

## 1. 背景与目标

当前 Dashboard 页面（`/`）聚合了过多逻辑：资讯获取、口播稿改写、语音生成、段落编辑、音频播放。用户希望将这些职责拆分到独立页面，使每个页面聚焦一个核心任务。

**目标：**
- 侧边栏从 3 个标签扩展为 4 个：信源收集、口播稿编辑、历史记录、设置
- 每个页面职责单一，降低认知负担
- 设置页面将 API Key 拆分为 LLM 和 TTS 两个独立配置

---

## 2. 导航与路由

### 2.1 侧边栏结构

| 标签 | 图标 | 路径 | 说明 |
|------|------|------|------|
| 信源收集 | 📡 | `/` | 默认首页，原 Dashboard 左半部分 |
| 口播稿编辑 | ✏️ | `/editor` | 原 Dashboard 右半部分 |
| 历史记录 | 📋 | `/history` | 保持不变 + 新增"重新编辑"按钮 |
| 设置 | ⚙️ | `/settings` | 新增 TTS API Key 输入框 |

### 2.2 路由配置（App.tsx）

```tsx
<Routes>
  <Route path="/" element={<SourceCollection />} />
  <Route path="/editor" element={<ScriptEditor />} />
  <Route path="/history" element={<History />} />
  <Route path="/settings" element={<Settings />} />
</Routes>
```

### 2.3 文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新增 | `pages/SourceCollection.tsx` | 信源收集页面 |
| 新增 | `pages/ScriptEditor.tsx` | 口播稿编辑页面 |
| 修改 | `App.tsx` | 更新路由配置 |
| 修改 | `Sidebar.tsx` | 更新导航项为 4 个 |
| 修改 | `History.tsx` | 新增"重新编辑"按钮 |
| 修改 | `Settings.tsx` | 拆分 API Key 为两个输入框 |
| 修改 | `store/index.ts` | 微调（见状态管理） |
| 修改 | `backend/src/db/index.js` | 默认设置新增 `mimo_tts_api_key` |
| 删除 | `pages/Dashboard.tsx` | 被两个新页面替代 |

---

## 3. 信源收集页面（SourceCollection）

### 3.1 路径与入口

- 路径：`/`（默认首页）
- 组件：`SourceCollection.tsx`
- 来源：原 `QuickGenerate.tsx` 组件 + `Header` 布局

### 3.2 页面结构

```
┌─────────────────────────────────────────────┐
│ Header: "信源收集" + 系统在线状态              │
├─────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────┐ │
│ │ 资讯获取 卡片（毛玻璃）                    │ │
│ │ ┌─────────────────────────────────────┐ │ │
│ │ │ 分类筛选标签 + 条数选择               │ │ │
│ │ ├─────────────────────────────────────┤ │ │
│ │ │ [获取今日资讯] 按钮                   │ │ │
│ │ ├─────────────────────────────────────┤ │ │
│ │ │ 资讯列表（序号 + 标题 + 分类标签）     │ │ │
│ │ ├─────────────────────────────────────┤ │ │
│ │ │ [一键改写口播稿] 按钮                 │ │ │
│ │ └─────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### 3.3 行为

- 获取资讯：调用 `fetchTodayItems({ category, take })`
- 改写口播稿：调用 `rewriteScript(items)`，成功后自动 `navigate('/editor')`
- 改写过程中按钮显示加载状态（进度条动画）
- 资讯列表使用 `fade-in-up` + stagger 入场动画

### 3.4 组件复用

- 直接复用现有 `QuickGenerate.tsx` 组件，包裹在页面布局中
- 使用 `Header` 组件（title="信源收集", subtitle="获取今日 AI 资讯并改写为口播稿"）

---

## 4. 口播稿编辑页面（ScriptEditor）

### 4.1 路径与入口

- 路径：`/editor`
- 组件：`ScriptEditor.tsx`
- **入口 1**：从信源收集改写成功后自动跳转（store 中 `script` + `currentBroadcast` 已就绪）
- **入口 2**：从历史记录点击"重新编辑"（通过 `setCurrentBroadcast()` + `navigate('/editor')`）

### 4.2 页面结构

```
┌─────────────────────────────────────────────┐
│ Header: "口播稿编辑" + 系统在线状态            │
├─────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────┐ │
│ │ 口播稿预览 卡片（ScriptPreview）          │ │
│ │ [编辑] [+开场白] [+结束语] 按钮           │ │
│ └─────────────────────────────────────────┘ │
├─────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────┐ │
│ │ 语音生成 横条（VoiceGenerator 精简版）     │ │
│ │ 音色选择（横向排列）+ [切分并生成语音]     │ │
│ └─────────────────────────────────────────┘ │
├─────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────┐ │
│ │ 段落编辑器 卡片（SegmentEditor）          │ │ ← 主体区域
│ │                                         │ │
│ │ 01 大家好，欢迎收听...    [✓已生成] ✎🔄🗑 │ │
│ │ 02 今天我们带来...        [✓已生成] ✎🔄🗑 │ │
│ │ 03 首先是OpenAI...        [✓已生成] ✎🔄🗑 │ │
│ │ 04 GPT-5在数学推理...     [⏳等待中] ✎🔄🗑 │ │
│ │ 05 另外，Google...        [⏳等待中] ✎🔄🗑 │ │
│ │ ...                                     │ │
│ │                                         │ │
│ │     [全部生成]  [合并音频]                │ │
│ └─────────────────────────────────────────┘ │
├─────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────┐ │
│ │ 播放器 卡片（AudioPlayer）               │ │
│ │ ▶ ══════════════════ 0:00/2:15 ⬇ ⭐    │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### 4.3 布局要点

- **上下排列**，不是左右双栏
- VoiceGenerator 压缩为一行横向条（音色按钮 + 生成按钮）
- SegmentEditor 占据页面主体，是核心操作区域
- AudioPlayer 固定在底部

### 4.4 空状态

当直接访问 `/editor` 且 store 中无 `script` 时，显示空状态：

> "暂无口播稿，请先前往信源收集获取资讯"
> [前往信源收集] 按钮 → `navigate('/')`

### 4.5 组件复用

- 复用现有 `ScriptPreview.tsx`、`VoiceGenerator.tsx`、`SegmentEditor.tsx`、`AudioPlayer.tsx`
- `VoiceGenerator` 需要微调为横向紧凑布局（音色选择横向排列，去掉纵向网格）
- 各组件通过 `useStore()` 直接获取数据

---

## 5. 历史记录页面改动

### 5.1 新增"重新编辑"按钮

每条播报记录右侧新增紫色丁香色按钮：

```
⭐ 2026年6月7日 HCDS Studio    3小时前 · 2分15秒    [✓已完成]  [✏️ 重新编辑]
```

### 5.2 点击行为

```ts
const handleReEdit = async (broadcast: Broadcast) => {
  await setCurrentBroadcast(broadcast);
  await fetchSegments(broadcast.id);
  navigate('/editor');
};
```

### 5.3 失败记录

失败状态的播报记录，"重新编辑"按钮半透明但仍可点击，允许用户重新处理。

### 5.4 原有功能不变

- 点击播报仍展开 ScriptPreview + AudioPlayer
- 分页、星标保存等功能保持不变

---

## 6. 设置页面改动

### 6.1 API Key 拆分

原"API Key"卡片重命名为"API 配置"，内部拆分为两行：

```
┌─────────────────────────────────────────┐
│ ● API 配置                              │
│                                         │
│ LLM API Key          用于资讯改写、文本切分 │
│ [••••••••••]          [测试连接]          │
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
│ TTS API Key           用于语音合成        │
│ [••••••••••]          [测试连接]          │
└─────────────────────────────────────────┘
```

### 6.2 设置项映射

| 设置项 | Key | 说明 |
|--------|-----|------|
| LLM API Key | `mimo_api_key` | 现有字段，用于 LLM 改写和切分 |
| TTS API Key | `mimo_tts_api_key` | 新增字段，用于 TTS 语音合成 |

### 6.3 测试连接

两个 Key 各自独立的"测试连接"按钮，调用 `POST /api/settings/test-key` 时传入 `type` 参数：

- LLM Key：`{ type: 'llm' }`
- TTS Key：`{ type: 'tts' }`

### 6.4 其他设置不变

音色设置、播报设置（开场白/结束语）、定时任务三个卡片保持现有样式。

---

## 7. 状态管理（Store）

### 7.1 现有 store 结构保持不变

Zustand store 中的 `script`、`currentBroadcast`、`segments`、`todayItems` 等状态天然跨页面共享，无需引入新的状态传递机制。

### 7.2 关键数据流

```
信源收集页面                    口播稿编辑页面
    │                              │
    ├─ fetchTodayItems()           │
    │  → todayItems 写入 store     │
    │                              │
    ├─ rewriteScript(items)        │
    │  → script 写入 store         │
    │  → currentBroadcast 写入 store
    │                              │
    ├─ navigate('/editor') ────────┤
    │                              ├─ 从 store 读取 script
    │                              ├─ ScriptPreview 展示
    │                              ├─ VoiceGenerator 选择音色
    │                              ├─ generateBroadcast() + splitScript()
    │                              │  → segments 写入 store
    │                              ├─ SegmentEditor 编辑段落
    │                              ├─ batchGenerateSegments()
    │                              ├─ mergeSegments()
    │                              └─ AudioPlayer 播放/下载/保存

历史记录页面                    口播稿编辑页面
    │                              │
    ├─ 点击"重新编辑"              │
    ├─ setCurrentBroadcast(bc)     │
    ├─ fetchSegments(bc.id)        │
    │  → currentBroadcast + segments 写入 store
    ├─ navigate('/editor') ────────┤
    │                              └─ 同上流程
```

### 7.3 Store 微调

- `Settings` 类型新增 `mimo_tts_api_key?: string`
- `defaultSettings` 中新增 `mimo_tts_api_key: ''`
- 无需新增 action，现有 `updateSettings` 已支持批量更新

---

## 8. 后端改动

### 8.1 默认设置（db/index.js）

```js
const defaultSettings = {
  mimo_api_key: '',
  mimo_tts_api_key: '',      // ← 新增
  default_voice: '冰糖',
  opening_script: '...',
  closing_script: '...',
  content_categories: '...'
};
```

### 8.2 test-key 端点（routes/settings.js）

现有 `POST /api/settings/test-key` 需要支持 `type` 参数：

```js
router.post('/test-key', async (req, res) => {
  const { type } = req.body;  // 'llm' | 'tts'
  const result = await mimo.testApiKey(type || 'llm');
  res.json(result);
});
```

`mimo.testApiKey(type)` 已支持 `type` 参数（根据 mimo.js 源码），无需修改 service 层。

### 8.3 其他后端路由不变

broadcast.js、schedule.js 路由无需修改。

---

## 9. 前端开发规范遵循

所有新增页面和组件严格遵循 `FRONTEND_CONVENTIONS.md`：

- 卡片样式：`bg-white/[0.55] backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border`
- 标题：`font-display italic` + 色点
- 按钮：语义色（lemon/sage/lilac/pink）
- 加载状态：骨架屏（`animate-pulse`）
- 错误状态：`animate-shake` + `bg-pink/10`
- 入场动画：`fade-in-up` + stagger
- 同时提供 `export const` 和 `export default`
- Props 接口命名：`{Component}Props`

---

## 10. 不在范围内

- 移动端 Sidebar 折叠（保持 w-64 固定宽度）
- React.lazy 代码分割（页面体量仍较小）
- 后端 broadcast.js 拆分（不在本次范围内）
- 定时任务触发后的自动跳转逻辑
