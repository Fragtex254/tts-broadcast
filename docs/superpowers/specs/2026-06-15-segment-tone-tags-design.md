# 分段语气标签设计方案

## 背景

分段（`segmented`）模式下，口播稿被 LLM 切分为多个 segment，每段独立生成音频后合并。当前每段只有纯文本，所有段共享播报级音色配置（`voice_type` / `voice_config`），无法逐段控制语气。

MiMo TTS 支持在**待合成文本（`assistant` 消息）**里嵌入两类风格标签（见 `docs/ttsSeries.md`「音频标签控制」）：

- **整体风格标签** `(风格)`：放在文本**最开头**，控制整段基调。一段一个（或一组）。例：`(平静)苹果今天发布了新款 AI 芯片。`
- **细粒度音频标签** `[音频标签]`：插入文本**任意位置**，控制局部停顿/呼吸/轻笑等。一段可多个、位置敏感。例：`苹果发布了[停顿]新款 AI 芯片[叹气]。`

本方案让用户给每段同时使用这两类标签：整体风格做成结构化字段，细粒度标签内联进文本。

---

## 目标与非目标

**目标**

- 每个 segment 可设置**一个整体风格标签**（精选清单 + 自定义），生成时自动前置 `(风格)`。
- 编辑某段文本时，可在**光标处插入细粒度 `[音频标签]`**（精选 + 自定义）。
- 提供「✨ AI 建议风格」一键按钮：LLM 为全部段落各建议一个整体风格标签，可手动改。
- 走 `add-persisted-field` 端到端链路，前后端契约不漂移。

**非目标（YAGNI）**

- 不做细粒度标签的结构化存储 / 位置管理（内联文本即可）。
- 不做 `whole` 整篇模式的标签（无"每段"概念）。
- 不新增 LLM 设置项（用内置 prompt；需要再加）。
- 不改动 `VoiceGenerator` 的 `emotion`/`speed`/`pitch` 精细参数 UI（播报级、已存在）。

---

## 关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 整体风格标签存储 | segments 新增 `style_tag` 列 | 用户最初强调"每段一个"；结构化便于 chip 展示、AI 建议、独立清除，不会被改文本误删 |
| 细粒度标签存储 | 内联进 `segment.text` | API 本就把它当任意位置内联标记；独立存位置在编辑后极易失效（过度设计） |
| 注入 `(风格)` 的位置 | 路由层生成时拼接 | 只有这里同时拿到 segment 与其 `style_tag`；`tts.js`/`voiceConfig.js` 保持通用，整篇生成不受影响 |
| `segment.text` 入库内容 | 始终是干净正文（不含 `(风格)`） | 前缀只在合成那一刻拼上；列表显示=干净文本 + 独立 chip |
| 标签清单 | 新闻向精选 + 自定义输入 | 文档完整清单含大量与新闻无关项；文档明确支持自定义风格 |
| 标签清单单一数据源 | 前端常量；AI 建议时由前端把候选集传给后端 | 后端不重复维护清单、尊重用户自定义 |
| AI 建议指派方式 | 手动为主 + 一键建议按钮（非切分时自动） | 用户选择；切分逻辑不耦合标签 |

---

## 数据库设计

### `segments` 表新增列

```sql
-- schema.sql
style_tag TEXT DEFAULT ''   -- 整体风格标签（如 "平静" / "平静 严肃" / 自定义；空串=无）
```

### 迁移（`db/index.js`，沿用现有 try-catch 范式）

```js
// 迁移：为旧数据库的 segments 添加 style_tag 列
try {
  db.prepare('SELECT style_tag FROM segments LIMIT 1').get();
} catch {
  db.exec("ALTER TABLE segments ADD COLUMN style_tag TEXT DEFAULT ''");
}
```

### DAL（`services/segmentStore.js`）

| 函数 | 行为 |
|------|------|
| `createMany`（不变） | 新段 `style_tag` 取默认空串 |
| `updateStyleTag(segId, styleTag)`（新增） | 写 `style_tag`，**并 reset `status='pending'`、`audio_path=NULL`**（前置标签改变合成结果，须重新生成） |
| `bulkUpdateStyleTags(broadcastId, items)`（新增） | 事务批量写 `[{id, styleTag}]`；**只对 tag 真正变化的段** reset 状态/音频，未变段不动（避免无谓重置已生成段） |
| `updateText`（不变） | 仍只动 text/status/audio，**不碰 style_tag**（改文本不该丢标签） |

`deleteAndReindex` 按 index 重命名音频，与 `style_tag` 无关，无需改动。

---

## 标签清单常量

新建 `frontend/src/constants/toneTags.ts`：

```ts
// 整体风格精选（段首 (风格)，取自文档 基础情绪/整体语调）
export const STYLE_TAGS = ['平静', '严肃', '活泼', '深沉', '温柔', '干练', '惊讶', '兴奋'];

// 细粒度精选（文本内 [音频标签]，取自文档 语速节奏/哭笑 + 正文明确提到的"停顿"）
export const AUDIO_TAGS = ['停顿', '吸气', '叹气', '轻笑', '深呼吸'];

export function sanitizeStyleTag(raw: string): string {
  return (raw ?? '').replace(/[()（）\[\]]/g, '').trim().slice(0, 20);
}
export function sanitizeAudioTag(raw: string): string {
  return (raw ?? '').replace(/[\[\]]/g, '').trim().slice(0, 20);
}
```

- 两类均支持清单外**自定义输入**（如 `东北话`、`咳嗽`）。
- 清单具体取值可在实现时微调。

---

## 后端设计

### ① 生成时注入 `(风格)`

新建纯函数工具 `backend/src/utils/segmentText.js`（可单测）：

```js
function sanitizeStyleTag(raw) {
  return String(raw || '').replace(/[()（）\[\]]/g, '').trim().slice(0, 20);
}
function prependStyleTag(text, styleTag) {
  const tag = sanitizeStyleTag(styleTag);
  return tag ? `(${tag})${text}` : text;
}
module.exports = { sanitizeStyleTag, prependStyleTag };
```

在 `routes/segments.js` 的 **batch-generate** 与 **regenerate** 两处，把传给 `voiceConfigService.toSpeechParams` 的 `text` 改为：

```js
const effectiveText = prependStyleTag(segment.text, segment.style_tag);
// ... toSpeechParams({ text: effectiveText, voiceType, voiceConfig, ... })
```

细粒度 `[音频标签]` 已内联在 `segment.text`，原样送入，无需特殊处理。

### ② AI 建议：`mimo.suggestStyleTags(texts, allowedTags)`

`services/mimo.js` 新增函数，沿用 `splitScript` 范式：

- prompt 列出**带序号**的各段文本 + **候选标签集**（来自入参 `allowedTags`），要求："为每段从候选集中选**最贴合的一个**，不确定则留空；以 JSON 数组输出，**长度必须等于段数**，只输出 JSON。"
- 复用 `createLlmMessage({ prompt, systemPrompt, maxTokens, thinkingEnabled })`；`maxTokens` 按段数估算；`thinkingEnabled` 复用 `splitThinkingEnabled`。
- 解析复用 `splitScript` 的代码块剥离 + `JSON.parse`：
  - 数组长度 ≠ 段数 → 抛错（形状严格）。
  - 单项不在候选集 ∪ `""` → 归为 `""`（单项宽容）。
- 返回与输入等长的标签数组。

### ③ 错误处理

- 所有 LLM 调用经 `createLlmMessage`，已带 timeout、中文错误映射。
- AI 建议是**单次** LLM 调用、非长任务，**不接 SSE**。

---

## API 设计

### 字段更新（复用现有 PUT）

```
PUT /api/broadcast/:id/segments/:segId
```

Body 接受 `{ text? }` 或 `{ styleTag? }`（至少一个）：

- 传 `text` → 校验非空 → `cleanAudioFile(旧音频)` → `updateText`。
- 传 `styleTag` → `sanitizeStyleTag` → `cleanAudioFile(旧音频)` → `updateStyleTag`。
- 两条路径都 reset 段为 `pending`（改任一都要重新生成）。
- UI 上改文本、改风格是独立动作，一次基本只传一个；若同时传，则分别更新（`text` 走 `updateText`、`styleTag` 走 `updateStyleTag`），均 reset。
- 两者都未传 → 400。

响应：`{ segment }`（含 `style_tag`）。

### AI 一键建议（新增）

```
POST /api/broadcast/:id/segments/suggest-tags
```

Request：

```json
{ "allowedTags": ["平静", "严肃", "活泼", "深沉", "温柔", "干练", "惊讶", "兴奋"] }
```

- 校验 `allowedTags` 为非空字符串数组。
- 取该播报所有 segment（按 index）→ `mimo.suggestStyleTags(texts, allowedTags)` → `bulkUpdateStyleTags`（只 reset 变化段）。

Response：`{ segments }`（更新后的完整列表）。

---

## 前端设计

### 契约同步

- `store/types.ts`：`Segment` 加 `style_tag: string`；`AppState` 加 `isSuggestingTags: boolean`、`updateSegmentStyleTag`、`suggestTags`。
- `services/schemas.ts`：`SegmentSchema` 加 `style_tag: z.string()`。
- `services/api.ts`：`updateSegment` 的 data 类型加 `styleTag?: string`；新增 `suggestSegmentTags(broadcastId, allowedTags)`。

### Store（`store/segmentSlice.ts`）

```ts
updateSegmentStyleTag(broadcastId, segId, styleTag)  // 调 updateSegment({ styleTag })，回写该段
suggestTags(broadcastId)                             // set isSuggestingTags；调 suggestSegmentTags(broadcastId, STYLE_TAGS)；回写 segments
```

`buildVoicePayload` 不变（风格标签不进 voiceConfig）。

### 组件

**`SegmentEditor.tsx`（布局 B：第二行 meta 区）**

```
┌─ 段落行 ────────────────────────────────────────────┐
│ 01  苹果今天发布了新款 AI 芯片，性能大幅提升……  ✓就绪 ▶0:08 ✎↻🗑 │
│     风格  [(平静) ▾]                                   │   ← 文本下方 meta 行
└──────────────────────────────────────────────────────┘
```

- 文本独占首行；下方 meta 行：`风格` label + 风格 chip（无标签时显示 `+风格`）。点 chip 打开 `TagPicker`。
- 编辑模式（textarea）下方加一排"插入 `[音频标签]`" chips（`AudioTagInserter`）。
- 底部工具栏在「全部生成 / 合并音频」前加「✨ AI 建议风格」：调 `suggestTags`，`isSuggestingTags` 时禁用 + loading；失败用 `getApiErrorMessage` 显示。

**`TagPicker.tsx`（新增，popover 子组件）**

- 精选 `STYLE_TAGS` chips + 自定义输入框（`sanitizeStyleTag`）+ 清除/应用。
- 选中即调 `updateSegmentStyleTag`。抽出独立组件，避免 `SegmentEditor`（现 ~300 行）继续膨胀。

**`AudioTagInserter.tsx`（新增，编辑模式用）**

- 精选 `AUDIO_TAGS` chips + 自定义输入（`sanitizeAudioTag`）。
- 点击在 textarea **光标处**插入 `[标签]`（持 textarea ref，更新 `editText` 与光标位置）。

---

## 数据流

```
切分 → segments（style_tag=''）
        │
        ├─ 手动：点风格 chip → TagPicker → PUT {styleTag} → updateStyleTag（reset pending+清音频）
        ├─ 一键：✨AI建议 → POST suggest-tags{allowedTags}
        │           → mimo.suggestStyleTags → bulkUpdateStyleTags（只 reset 变化段）
        └─ 编辑文本：textarea + AudioTagInserter 在光标插 [标签] → PUT {text}
        │
        ▼
生成（batch / regenerate）
   effectiveText = prependStyleTag(segment.text, segment.style_tag)   // "(平静)苹果……[停顿]……"
   → toSpeechParams({ text: effectiveText }) → tts.generateSpeech     // assistant content
   → 各段音频 → merge → 最终 broadcast 音频
```

---

## 模式边界与标签优先级（仅 UI 提示，不硬限制）

依据 `docs/ttsSeries.md`「风格控制优先级」：精细参数 > 自然语言(user) > 标签(assistant)。

- **preset 模式**：若该播报设了 `emotion` 精细参数，`emotion` 优先级高于段首 `(风格)`，标签可能被盖过。标签是"尽力而为"的补充，不报错、不阻断。
- **design 模式**：`optimize_text_preview: true` 会润色文本，段首标签可能被弱化。
- 标签在 **preset（无 emotion）/ clone** 模式最可靠。
- 仅 `segmented` 模式有逐段标签；`whole` 不涉及。

UI 在风格 meta 行附近以一句话提示上述约束即可。

---

## 文件变更清单

### 新增

| 文件 | 说明 |
|------|------|
| `backend/src/utils/segmentText.js` | `prependStyleTag` / `sanitizeStyleTag` 纯函数 |
| `frontend/src/constants/toneTags.ts` | `STYLE_TAGS` / `AUDIO_TAGS` / sanitize |
| `frontend/src/components/Dashboard/TagPicker.tsx` | 风格标签选择 popover |
| `frontend/src/components/Dashboard/AudioTagInserter.tsx` | 编辑模式插入 `[音频标签]` |

### 修改

| 文件 | 说明 |
|------|------|
| `backend/src/db/schema.sql` | segments 加 `style_tag` |
| `backend/src/db/index.js` | 加迁移 |
| `backend/src/services/segmentStore.js` | `updateStyleTag` / `bulkUpdateStyleTags` |
| `backend/src/services/mimo.js` | `suggestStyleTags` |
| `backend/src/routes/segments.js` | PUT 支持 styleTag；新增 suggest-tags；生成注入 `prependStyleTag` |
| `frontend/src/store/types.ts` | `Segment.style_tag`；AppState 新增项 |
| `frontend/src/services/schemas.ts` | `SegmentSchema.style_tag` |
| `frontend/src/services/api.ts` | `updateSegment` 加 styleTag；`suggestSegmentTags` |
| `frontend/src/store/segmentSlice.ts` | `updateSegmentStyleTag` / `suggestTags` / `isSuggestingTags` |
| `frontend/src/components/Dashboard/SegmentEditor.tsx` | 布局 B meta 行、编辑插入、工具栏按钮 |
| `docs/project-facts.md` | segments 新字段、新端点说明 |

---

## 边界情况处理

1. **改 style_tag / 改 text** → 该段 reset `pending`、清旧音频，UI 即时显示需重新生成。
2. **一键建议覆盖已生成段** → 只 reset tag 真变化的段；tag 未变（含 AI 给出相同值）的段不动。
3. **AI 建议返回长度不符** → 后端抛错，前端 `getApiErrorMessage` 提示，loading 结束，不写库。
4. **AI 返回非候选标签** → 该项归为空串（不自创）。
5. **自定义标签含括号/方括号** → 前端输入即清洗，后端 `sanitizeStyleTag` 兜底。
6. **LLM Key 未配 / 超时** → 复用现有中文错误映射。
7. **空 `style_tag`** → `prependStyleTag` 原样返回正文，行为同当前。

---

## 测试策略

### 后端（全 mock 外部 API，`npm test -- --runInBand`）

- `prependStyleTag` / `sanitizeStyleTag`：括号剥离、空值、限长、有/无标签拼接。
- `segmentStore`：`updateStyleTag` reset 行为；`bulkUpdateStyleTags` 只 reset 变化段；`updateText` 不动 `style_tag`。
- `routes/segments`：PUT 带 `styleTag`；`suggest-tags`（mock `mimo.suggestStyleTags`）；batch-generate / regenerate 断言 `tts.generateSpeech` 收到的 `text` 带 `(风格)` 前缀。
- `mimo.suggestStyleTags`：mock `createLlmMessage`，验证长度校验、非法项归空、代码块剥离。

### 前端

- `npm run build` + `npm run lint`。
- 可选 vitest：`sanitizeStyleTag`/`sanitizeAudioTag`、光标插入逻辑。

---

## 落地范围

**包含：** 整体风格标签（手动 + 一键 AI 建议）、细粒度标签光标插入、生成注入、端到端契约、测试、文档同步。

**不包含（后续可迭代）：** 细粒度标签结构化/位置管理、`whole` 模式标签、专用 LLM 设置项、按标签批量筛选/统计。
