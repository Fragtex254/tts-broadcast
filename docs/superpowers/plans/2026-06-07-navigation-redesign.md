# 导航重构实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前 Dashboard 页面拆分为 4 个独立页面（信源收集、口播稿编辑、历史记录、设置），并将设置页面的 API Key 拆分为 LLM 和 TTS 两个独立输入框。

**Architecture:** 前端新增 SourceCollection 和 ScriptEditor 两个页面组件，删除原 Dashboard.tsx；修改 App.tsx 路由配置和 Sidebar 导航；后端仅修改默认设置和 test-key 端点透传 type 参数。所有现有组件（QuickGenerate、ScriptPreview、VoiceGenerator、SegmentEditor、AudioPlayer）直接复用，VoiceGenerator 改为横向紧凑布局。

**Tech Stack:** React 19, TypeScript 6, Vite 8, Tailwind CSS 4, Zustand 5, React Router 7, Express 5, better-sqlite3

**Spec:** `docs/superpowers/specs/2026-06-07-navigation-redesign-design.md`

---

## 文件结构总览

### 新增
- `frontend/src/pages/SourceCollection.tsx` — 信源收集页面
- `frontend/src/pages/ScriptEditor.tsx` — 口播稿编辑页面

### 修改
- `frontend/src/store/index.ts` — Settings 接口新增 `mimo_tts_api_key`，testApiKey 支持 type 参数
- `frontend/src/services/api.ts` — settingsApi.testKey 接受 type 参数
- `backend/src/db/index.js` — 默认设置新增 `mimo_tts_api_key`
- `backend/src/routes/settings.js` — test-key 端点透传 type 参数
- `frontend/src/components/Dashboard/VoiceGenerator.tsx` — 改为横向紧凑布局
- `frontend/src/pages/History.tsx` — 新增"重新编辑"按钮
- `frontend/src/pages/Settings.tsx` — API Key 拆分为 LLM + TTS 两个输入框
- `frontend/src/App.tsx` — 路由配置更新
- `frontend/src/components/Layout/Sidebar.tsx` — 导航项更新为 4 个

### 删除
- `frontend/src/pages/Dashboard.tsx` — 被 SourceCollection + ScriptEditor 替代

---

## Task 1: 更新 Store 类型和 testApiKey 支持

**Files:**
- Modify: `frontend/src/store/index.ts`
- Modify: `frontend/src/services/api.ts`
- Modify: `backend/src/db/index.js`
- Modify: `backend/src/routes/settings.js`

- [ ] **Step 1: 更新 Settings 接口，新增 `mimo_tts_api_key`**

在 `frontend/src/store/index.ts` 第 46-52 行，`Settings` 接口新增字段：

```ts
export interface Settings {
  mimo_api_key: string;
  mimo_tts_api_key: string;
  default_voice: string;
  opening_script: string;
  closing_script: string;
  content_categories: string;
}
```

- [ ] **Step 2: 更新 defaultSettings，新增 `mimo_tts_api_key`**

在 `frontend/src/store/index.ts` 第 133-139 行：

```ts
const defaultSettings: Settings = {
  mimo_api_key: '',
  mimo_tts_api_key: '',
  default_voice: '冰糖',
  opening_script: '大家好，欢迎收听今日 AI 简讯。',
  closing_script: '以上就是今天的 AI 简讯，感谢收听，我们明天再见。',
  content_categories: '["ai-models", "ai-products", "industry", "paper", "tip"]',
};
```

- [ ] **Step 3: 更新 testApiKey action 支持 type 参数**

在 `frontend/src/store/index.ts` 第 396-404 行，修改 `testApiKey` action 签名和实现：

```ts
testApiKey: async (type?: 'llm' | 'tts') => {
  try {
    const response = await settingsApi.testKey(type);
    return response.data;
  } catch (error) {
    console.error('测试 API Key 失败:', error);
    return { valid: false, error: (error as Error).message };
  }
},
```

同步更新 `AppState` 接口中 `testApiKey` 的签名（约第 121 行）：

```ts
testApiKey: (type?: 'llm' | 'tts') => Promise<{ valid: boolean; error?: string }>;
```

- [ ] **Step 4: 更新 settingsApi.testKey 支持 type 参数**

在 `frontend/src/services/api.ts` 第 68 行：

```ts
testKey: (type?: 'llm' | 'tts') => api.post('/settings/test-key', { type }),
```

- [ ] **Step 5: 更新后端默认设置**

在 `backend/src/db/index.js` 第 43-49 行，新增 `mimo_tts_api_key`：

```js
const defaultSettings = {
  mimo_api_key: '',
  mimo_tts_api_key: '',
  default_voice: '冰糖',
  opening_script: '大家好，欢迎收听今日 AI 简讯。',
  closing_script: '以上就是今天的 AI 简讯，感谢收听，我们明天再见。',
  content_categories: '["ai-models", "ai-products", "industry", "paper", "tip"]',
};
```

- [ ] **Step 6: 更新后端 test-key 端点透传 type**

在 `backend/src/routes/settings.js` 第 68-76 行，修改 `test-key` 路由：

```js
router.post('/test-key', async (req, res) => {
  try {
    const { type } = req.body || {};
    const mimoType = type === 'tts' ? 'tts' : 'anthropic';
    const isValid = await mimo.testApiKey(mimoType);
    res.json({ valid: isValid });
  } catch (error) {
    console.error('测试 API Key 失败:', error);
    res.json({ valid: false, error: error.message });
  }
});
```

- [ ] **Step 7: 验证构建通过**

```bash
cd /Users/jinghao/Desktop/workBase/tts-broadcast/frontend && npm run build
```

预期：TypeScript 编译通过，无错误。

- [ ] **Step 8: Commit**

```bash
git add frontend/src/store/index.ts frontend/src/services/api.ts backend/src/db/index.js backend/src/routes/settings.js
git commit -m "feat: add mimo_tts_api_key support and test-key type parameter"
```

---

## Task 2: 创建信源收集页面

**Files:**
- Create: `frontend/src/pages/SourceCollection.tsx`

- [ ] **Step 1: 创建 SourceCollection.tsx**

在 `frontend/src/pages/SourceCollection.tsx` 创建页面组件。页面结构：Header + QuickGenerate 组件包裹在页面布局中。改写成功后自动 `navigate('/editor')`。

```tsx
import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Layout/Header';
import { QuickGenerate } from '../components/Dashboard/QuickGenerate';
import useStore from '../store';

export const SourceCollection: React.FC = () => {
  const navigate = useNavigate();
  const { isRewriting, script } = useStore();

  const handleRewriteComplete = useCallback(() => {
    // rewriteScript 完成后 script 已写入 store，自动跳转到编辑页
    navigate('/editor');
  }, [navigate]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header title="信源收集" subtitle="获取今日 AI 资讯并改写为口播稿" />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">
          <QuickGenerate onRewriteComplete={handleRewriteComplete} />
        </div>
      </main>
    </div>
  );
};

export default SourceCollection;
```

注意：`QuickGenerate` 当前接受 `onItemsLoaded` 回调，但不接受改写完成回调。需要在下一步修改 `QuickGenerate` 以支持 `onRewriteComplete`。

- [ ] **Step 2: 修改 QuickGenerate 支持 onRewriteComplete 回调**

在 `frontend/src/components/Dashboard/QuickGenerate.tsx` 第 4-7 行，更新接口：

```tsx
interface QuickGenerateProps {
  onItemsLoaded?: () => void;
  onRewriteComplete?: () => void;
}
```

在第 8 行，解构新增 prop：

```tsx
export const QuickGenerate: React.FC<QuickGenerateProps> = ({ onItemsLoaded, onRewriteComplete }) => {
```

在第 49-61 行，`handleRewrite` 函数末尾添加跳转回调：

```tsx
const handleRewrite = async () => {
  if (todayItems.length === 0) {
    setError('请先获取今日资讯');
    return;
  }
  setError(null);
  try {
    await rewriteScript({ items: todayItems });
    onRewriteComplete?.();
  } catch (err) {
    setError('改写口播稿失败，请稍后重试');
    console.error(err);
  }
};
```

- [ ] **Step 3: 验证构建通过**

```bash
cd /Users/jinghao/Desktop/workBase/tts-broadcast/frontend && npm run build
```

预期：TypeScript 编译通过，SourceCollection 页面和 QuickGenerate 新增 prop 无类型错误。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/SourceCollection.tsx frontend/src/components/Dashboard/QuickGenerate.tsx
git commit -m "feat: add SourceCollection page with auto-navigate after rewrite"
```

---

## Task 3: 修改 VoiceGenerator 为横向紧凑布局

**Files:**
- Modify: `frontend/src/components/Dashboard/VoiceGenerator.tsx`

- [ ] **Step 1: 重构 VoiceGenerator 为横向布局**

将 `VoiceGenerator.tsx` 改为横向紧凑条：左侧标题，中间音色类型选择 + 预设音色按钮横向排列，右侧生成按钮。去掉纵向网格布局和标签文字。

替换整个文件内容为：

```tsx
import React, { useState } from 'react';
import { useStore } from '../../store';

interface VoiceGeneratorProps {
  script: string;
}

const VOICE_OPTIONS = [
  { value: 'mimo_default', label: 'MiMo-默认' },
  { value: '冰糖', label: '冰糖' },
  { value: '茉莉', label: '茉莉' },
  { value: '苏打', label: '苏打' },
  { value: '白桦', label: '白桦' },
  { value: 'Mia', label: 'Mia' },
  { value: 'Chloe', label: 'Chloe' },
  { value: 'Milo', label: 'Milo' },
  { value: 'Dean', label: 'Dean' },
];

const VOICE_TYPES = [
  { value: 'preset', label: '预设' },
  { value: 'clone', label: '克隆' },
  { value: 'design', label: '设计' },
];

export const VoiceGenerator: React.FC<VoiceGeneratorProps> = ({ script }) => {
  const { generateBroadcast, splitScript, isGenerating, isSplitting, settings } = useStore();
  const [voiceType, setVoiceType] = useState('preset');
  const [selectedVoice, setSelectedVoice] = useState(settings.default_voice || '冰糖');
  const [voiceClone, setVoiceClone] = useState('');
  const [voiceDesign, setVoiceDesign] = useState('');
  const [stylePrompt, setStylePrompt] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSplitAndGenerate = async () => {
    if (!script) {
      setError('请先生成口播稿');
      return;
    }
    setError(null);
    try {
      const result = await generateBroadcast({
        text: script,
        voice: voiceType === 'preset' ? selectedVoice : undefined,
        voiceType,
        voiceDesign: voiceType === 'design' ? voiceDesign : undefined,
        voiceClone: voiceType === 'clone' ? voiceClone : undefined,
        stylePrompt: stylePrompt || undefined,
        mode: 'segmented',
      });
      await splitScript(result.broadcast.id);
    } catch (err) {
      setError('操作失败，请检查 API Key 或稍后重试');
      console.error(err);
    }
  };

  const isBusy = isGenerating || isSplitting;

  return (
    <div className="bg-white/[0.55] backdrop-blur-sm rounded-card px-5 py-3.5 shadow-card border border-card-border" style={{ animation: 'fade-in-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.04s both' }}>
      <div className="flex items-center gap-3 flex-wrap">
        {/* 标题 */}
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blush" />
          <h3 className="font-display italic text-[14px] font-medium text-ink-soft">语音生成</h3>
        </div>

        {/* 分隔线 */}
        <div className="w-px h-5 bg-card-border" />

        {/* 音色类型选择 */}
        <div className="flex gap-1">
          {VOICE_TYPES.map((type) => (
            <button
              key={type.value}
              onClick={() => setVoiceType(type.value)}
              className={`px-2.5 py-1 rounded-lg font-body text-[11px] font-medium transition-all duration-150 ${
                voiceType === type.value
                  ? 'bg-white/60 text-ink shadow-card border border-card-border'
                  : 'text-ink-soft hover:text-ink hover:bg-white/30'
              }`}
            >
              {type.label}
            </button>
          ))}
        </div>

        {/* 预设音色横向选择 */}
        {voiceType === 'preset' && (
          <div className="flex gap-1 animate-fade-in">
            {VOICE_OPTIONS.map((voice) => (
              <button
                key={voice.value}
                onClick={() => setSelectedVoice(voice.value)}
                className={`px-2.5 py-1.5 rounded-lg font-body text-[11px] transition-all duration-150 ${
                  selectedVoice === voice.value
                    ? 'bg-lemon/25 border border-ink/15 shadow-card text-ink font-medium'
                    : 'bg-white/50 border border-card-border text-ink-soft hover:border-ink/10'
                }`}
              >
                {voice.label}
              </button>
            ))}
          </div>
        )}

        {/* 声音克隆输入 */}
        {voiceType === 'clone' && (
          <input
            type="text"
            value={voiceClone}
            onChange={(e) => setVoiceClone(e.target.value)}
            placeholder="声音 ID"
            className="w-32 bg-white/70 text-ink rounded-lg px-3 py-1.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[11px] transition-colors animate-fade-in"
          />
        )}

        {/* 音色设计输入 */}
        {voiceType === 'design' && (
          <input
            type="text"
            value={voiceDesign}
            onChange={(e) => setVoiceDesign(e.target.value)}
            placeholder="音色描述"
            className="w-40 bg-white/70 text-ink rounded-lg px-3 py-1.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[11px] transition-colors animate-fade-in"
          />
        )}

        {/* 风格提示词（可选） */}
        {voiceType !== 'preset' && (
          <input
            type="text"
            value={stylePrompt}
            onChange={(e) => setStylePrompt(e.target.value)}
            placeholder="风格提示词（可选）"
            className="w-36 bg-white/70 text-ink rounded-lg px-3 py-1.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[11px] transition-colors animate-fade-in"
          />
        )}

        {/* 生成按钮 */}
        <button
          onClick={handleSplitAndGenerate}
          disabled={isBusy || !script}
          className="ml-auto bg-lilac hover:brightness-105 disabled:opacity-40 text-ink font-body font-medium text-[11px] rounded-xl px-4 py-2 shadow-btn transition-all duration-150 hover:-translate-y-px active:translate-y-0 active:shadow-none uppercase tracking-wider flex items-center gap-2"
        >
          {isBusy ? (
            <>
              <span className="w-3 h-1 bg-ink/20 rounded-full overflow-hidden">
                <span className="block h-full bg-ink/50 rounded-full animate-pulse" style={{ width: '60%' }} />
              </span>
              {isSplitting ? '切分中...' : '生成中...'}
            </>
          ) : (
            '切分并生成语音'
          )}
        </button>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mt-2 bg-pink/10 border border-pink/30 rounded-xl p-2.5 text-ink text-[11px] font-body animate-shake">
          {error}
        </div>
      )}
    </div>
  );
};

export default VoiceGenerator;
```

- [ ] **Step 2: 验证构建通过**

```bash
cd /Users/jinghao/Desktop/workBase/tts-broadcast/frontend && npm run build
```

预期：TypeScript 编译通过。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Dashboard/VoiceGenerator.tsx
git commit -m "refactor: restyle VoiceGenerator to horizontal compact layout"
```

---

## Task 4: 创建口播稿编辑页面

**Files:**
- Create: `frontend/src/pages/ScriptEditor.tsx`

- [ ] **Step 1: 创建 ScriptEditor.tsx**

页面结构：Header → ScriptPreview → VoiceGenerator（横向）→ SegmentEditor（主体）→ AudioPlayer（底部）。上下排列，SegmentEditor 占主体空间。空状态时引导回信源收集。

```tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Layout/Header';
import { ScriptPreview } from '../components/Dashboard/ScriptPreview';
import { VoiceGenerator } from '../components/Dashboard/VoiceGenerator';
import { SegmentEditor } from '../components/Dashboard/SegmentEditor';
import { AudioPlayer } from '../components/Dashboard/AudioPlayer';
import useStore from '../store';

export const ScriptEditor: React.FC = () => {
  const navigate = useNavigate();
  const { script, currentBroadcast, segments, saveBroadcast } = useStore();

  const audioUrl = currentBroadcast?.audio_path
    ? `/api/broadcast/${currentBroadcast.id}/audio`
    : null;

  const isSegmented = currentBroadcast?.mode === 'segmented';

  // 空状态：无口播稿时引导回信源收集
  if (!script && !currentBroadcast) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="口播稿编辑" subtitle="编辑稿件、切分短句并生成语音" />

        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white/[0.55] backdrop-blur-sm rounded-card p-12 shadow-card border border-card-border text-center animate-fade-in">
              <p className="font-display italic text-[18px] text-ink-soft/40 mb-2">
                暂无口播稿
              </p>
              <p className="font-body text-[13px] text-ink-soft/30 mb-6">
                请先前往信源收集获取资讯并改写口播稿
              </p>
              <button
                onClick={() => navigate('/')}
                className="bg-lemon hover:brightness-105 text-ink font-body font-medium text-[12px] rounded-full px-6 py-2.5 shadow-btn transition-all duration-150 hover:-translate-y-px active:translate-y-0 active:shadow-none uppercase tracking-wider"
              >
                前往信源收集
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header title="口播稿编辑" subtitle="编辑稿件、切分短句并生成语音" />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {/* 上：口播稿预览 */}
          <ScriptPreview />

          {/* 中上：语音生成（横向紧凑条） */}
          <VoiceGenerator script={script} />

          {/* 中下：段落编辑器（主体区域） */}
          {isSegmented && segments.length > 0 && currentBroadcast && (
            <SegmentEditor broadcastId={currentBroadcast.id} />
          )}

          {/* 底：播放器 */}
          <AudioPlayer
            audioUrl={audioUrl}
            title={currentBroadcast?.title}
            broadcastId={currentBroadcast?.id}
            isSaved={currentBroadcast?.saved === 1}
            onSave={saveBroadcast}
            mode={currentBroadcast?.mode}
          />
        </div>
      </main>
    </div>
  );
};

export default ScriptEditor;
```

- [ ] **Step 2: 验证构建通过**

```bash
cd /Users/jinghao/Desktop/workBase/tts-broadcast/frontend && npm run build
```

预期：TypeScript 编译通过，ScriptEditor 中所有导入和 props 使用正确。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/ScriptEditor.tsx
git commit -m "feat: add ScriptEditor page with vertical layout and empty state"
```

---

## Task 5: 更新历史记录页面

**Files:**
- Modify: `frontend/src/pages/History.tsx`

- [ ] **Step 1: 新增 useNavigate 导入和 handleReEdit 函数**

在 `frontend/src/pages/History.tsx` 第 1 行，新增 `useNavigate` 导入：

```tsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
```

在第 40 行，解构中新增 `fetchSegments`：

```tsx
const { broadcasts, fetchBroadcasts, currentBroadcast, setCurrentBroadcast, saveBroadcast, fetchSegments } = useStore();
```

在 `loadBroadcasts` 函数之后（约第 59 行），新增：

```tsx
const navigate = useNavigate();
```

在 `handleSelectBroadcast` 之后（约第 63 行），新增 handleReEdit：

```tsx
const handleReEdit = async (broadcast: Broadcast, e: React.MouseEvent) => {
  e.stopPropagation(); // 阻止冒泡到行点击事件
  setCurrentBroadcast(broadcast);
  try {
    await fetchSegments(broadcast.id);
  } catch {
    // 即使 segments 加载失败也跳转，用户可在编辑页重试
  }
  navigate('/editor');
};
```

- [ ] **Step 2: 在每条播报记录中新增"重新编辑"按钮**

在 `frontend/src/pages/History.tsx` 第 101-123 行的 `broadcasts.map` 渲染中，在 `{getStatusBadge(broadcast.status)}` 之后添加按钮：

```tsx
<button
  onClick={(e) => handleReEdit(broadcast, e)}
  className="px-3 py-1.5 bg-lilac hover:brightness-105 text-ink font-body text-[11px] font-medium rounded-lg shadow-btn transition-all duration-150 hover:-translate-y-px active:translate-y-0 active:shadow-none whitespace-nowrap"
>
  ✏️ 重新编辑
</button>
```

完整替换该 map 块为：

```tsx
{!isLoading && !error && broadcasts.map((broadcast, index) => {
  const isSelected = currentBroadcast?.id === broadcast.id;
  return (
    <div
      key={broadcast.id}
      onClick={() => handleSelectBroadcast(broadcast)}
      className={`flex items-center gap-4 px-5 py-3.5 border-b border-card-border cursor-pointer transition-all duration-200 ${isSelected ? 'bg-sage/10' : 'hover:bg-white/30'}`}
      style={{ animation: `fade-in-up 0.3s cubic-bezier(0.22, 1, 0.36, 1) ${index * 0.03}s both` }}
    >
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <p className={`font-display text-[15px] font-medium truncate ${isSelected ? 'text-ink' : 'text-ink/80'}`}>{broadcast.title}</p>
        {broadcast.saved === 1 && (
          <svg className="w-3 h-3 text-lemon flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        )}
      </div>
      <span className="font-body text-[12px] text-ink-soft/60 min-w-[80px]">{formatDate(broadcast.created_at)}</span>
      <span className="font-body text-[12px] text-ink-soft/60 min-w-[50px]">{formatDuration(broadcast.duration)}</span>
      {getStatusBadge(broadcast.status)}
      <button
        onClick={(e) => handleReEdit(broadcast, e)}
        className="px-3 py-1.5 bg-lilac hover:brightness-105 text-ink font-body text-[11px] font-medium rounded-lg shadow-btn transition-all duration-150 hover:-translate-y-px active:translate-y-0 active:shadow-none whitespace-nowrap"
      >
        ✏️ 重新编辑
      </button>
    </div>
  );
})}
```

- [ ] **Step 3: 更新空状态提示文案**

在第 97-98 行，将"前往控制台"改为"前往信源收集"：

```tsx
<p className="font-body text-[12px] text-ink-soft/30">前往信源收集生成第一条播报</p>
```

- [ ] **Step 4: 验证构建通过**

```bash
cd /Users/jinghao/Desktop/workBase/tts-broadcast/frontend && npm run build
```

预期：TypeScript 编译通过。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/History.tsx
git commit -m "feat: add re-edit button to History page broadcast items"
```

---

## Task 6: 更新设置页面 — API Key 拆分

**Files:**
- Modify: `frontend/src/pages/Settings.tsx`

- [ ] **Step 1: 拆分 API Key 卡片为 LLM 和 TTS 两个输入框**

在 `frontend/src/pages/Settings.tsx` 中，将第 116-143 行的 `SectionCard` 替换为新的 API 配置卡片，包含两个独立的输入框和测试按钮：

```tsx
{!isLoadingSettings && (
  <SectionCard dotColor="bg-pink" title="API 配置" index={0}>
    <div className="space-y-4">
      {/* LLM API Key */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/60">LLM API Key</label>
          <span className="font-body text-[10px] text-ink-soft/40">用于资讯改写、文本切分</span>
        </div>
        <div className="flex gap-2">
          <input
            type="password"
            value={formData.mimo_api_key}
            onChange={(e) => handleChange('mimo_api_key', e.target.value)}
            placeholder="输入 LLM API Key"
            className="flex-1 px-4 py-2.5 bg-white/70 border border-card-border rounded-xl text-ink placeholder-ink-soft/30 focus:outline-none focus:border-ink/20 font-body text-[12px] transition-colors"
          />
          <button
            onClick={() => handleTestKey('llm')}
            disabled={isTestingKey || !formData.mimo_api_key}
            className="px-4 py-2.5 bg-sage hover:brightness-105 disabled:opacity-40 text-ink rounded-xl font-body text-[12px] shadow-btn transition-all duration-150 flex items-center gap-2 whitespace-nowrap"
          >
            {isTestingKey ? (
              <><div className="w-3 h-1 bg-ink/20 rounded-full overflow-hidden"><div className="h-full bg-ink/50 rounded-full animate-pulse" style={{ width: '60%' }} /></div>测试中...</>
            ) : '测试连接'}
          </button>
        </div>
      </div>

      {/* 分隔线 */}
      <div className="border-t border-dashed border-card-border" />

      {/* TTS API Key */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/60">TTS API Key</label>
          <span className="font-body text-[10px] text-ink-soft/40">用于语音合成</span>
        </div>
        <div className="flex gap-2">
          <input
            type="password"
            value={formData.mimo_tts_api_key}
            onChange={(e) => handleChange('mimo_tts_api_key', e.target.value)}
            placeholder="输入 TTS API Key"
            className="flex-1 px-4 py-2.5 bg-white/70 border border-card-border rounded-xl text-ink placeholder-ink-soft/30 focus:outline-none focus:border-ink/20 font-body text-[12px] transition-colors"
          />
          <button
            onClick={() => handleTestKey('tts')}
            disabled={isTestingKey || !formData.mimo_tts_api_key}
            className="px-4 py-2.5 bg-sage hover:brightness-105 disabled:opacity-40 text-ink rounded-xl font-body text-[12px] shadow-btn transition-all duration-150 flex items-center gap-2 whitespace-nowrap"
          >
            {isTestingKey ? (
              <><div className="w-3 h-1 bg-ink/20 rounded-full overflow-hidden"><div className="h-full bg-ink/50 rounded-full animate-pulse" style={{ width: '60%' }} /></div>测试中...</>
            ) : '测试连接'}
          </button>
        </div>
      </div>

      {/* 测试结果 */}
      {testResult && (
        <div className={`p-3 rounded-xl font-body text-[12px] animate-fade-in ${testResult.valid ? 'bg-sage/15 text-ink' : 'bg-pink/10 text-ink'}`}>
          {testResult.valid ? '✓ API Key 验证成功！' : `✕ 验证失败: ${testResult.error}`}
        </div>
      )}
    </div>
  </SectionCard>
)}
```

- [ ] **Step 2: 更新 handleTestKey 支持 type 参数**

将第 53-58 行的 `handleTestKey` 函数修改为接受 type 参数：

```tsx
const handleTestKey = async (type: 'llm' | 'tts') => {
  setIsTestingKey(true);
  setTestResult(null);
  try { setTestResult(await testApiKey(type)); }
  catch (e) { setTestResult({ valid: false, error: (e as Error).message }); }
  finally { setIsTestingKey(false); }
};
```

- [ ] **Step 3: 验证构建通过**

```bash
cd /Users/jinghao/Desktop/workBase/tts-broadcast/frontend && npm run build
```

预期：TypeScript 编译通过，Settings 页面中 `formData.mimo_tts_api_key` 和 `handleTestKey('llm')` 类型正确。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Settings.tsx
git commit -m "feat: split API Key settings into LLM and TTS independent inputs"
```

---

## Task 7: 更新路由和侧边栏导航

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Layout/Sidebar.tsx`

- [ ] **Step 1: 更新 App.tsx 路由配置**

替换 `frontend/src/App.tsx` 整个文件：

```tsx
import { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Sidebar } from './components/Layout/Sidebar'
import { SourceCollection } from './pages/SourceCollection'
import { ScriptEditor } from './pages/ScriptEditor'
import { History } from './pages/History'
import { Settings } from './pages/Settings'
import useStore from './store'

function App() {
  const fetchSettings = useStore((s) => s.fetchSettings)

  useEffect(() => {
    fetchSettings()
  }, [])

  return (
    <Router>
      <div className="flex h-screen bg-paper text-ink overflow-hidden">
        {/* 侧边栏 */}
        <Sidebar />

        {/* 主内容区域 */}
        <Routes>
          <Route path="/" element={<SourceCollection />} />
          <Route path="/editor" element={<ScriptEditor />} />
          <Route path="/history" element={<History />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App
```

- [ ] **Step 2: 更新 Sidebar 导航项**

替换 `frontend/src/components/Layout/Sidebar.tsx` 中 `navItems` 数组（第 4-8 行）：

```tsx
const navItems = [
  { path: '/', label: '信源收集', icon: '◉' },
  { path: '/editor', label: '口播稿编辑', icon: '○' },
  { path: '/history', label: '历史记录', icon: '○' },
  { path: '/settings', label: '设置', icon: '○' },
];
```

同时将版本号从 `v 2.0.0` 更新为 `v 3.0.0`（第 46 行）：

```tsx
<div className="font-display italic text-[13px] text-ink/25 pl-4">
  v 3.0.0
</div>
```

- [ ] **Step 3: 验证构建通过**

```bash
cd /Users/jinghao/Desktop/workBase/tts-broadcast/frontend && npm run build
```

预期：TypeScript 编译通过，所有路由和导航正确。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/Layout/Sidebar.tsx
git commit -m "feat: update routing to 4-page navigation structure"
```

---

## Task 8: 删除 Dashboard.tsx 并最终验证

**Files:**
- Delete: `frontend/src/pages/Dashboard.tsx`

- [ ] **Step 1: 确认 Dashboard.tsx 不再被引用**

运行 grep 确认没有其他文件引用 Dashboard：

```bash
grep -r "Dashboard" /Users/jinghao/Desktop/workBase/tts-broadcast/frontend/src/ --include="*.tsx" --include="*.ts" | grep -v "node_modules"
```

预期：只有 `Dashboard.tsx` 文件本身被列出，无其他文件引用。

- [ ] **Step 2: 删除 Dashboard.tsx**

```bash
rm /Users/jinghao/Desktop/workBase/tts-broadcast/frontend/src/pages/Dashboard.tsx
```

- [ ] **Step 3: 更新 FRONTEND_CONVENTIONS.md 中的路由表格**

在 `frontend/FRONTEND_CONVENTIONS.md` 第 448-454 行，更新路由表格：

```markdown
### 当前路由

| 路径 | 组件 | 说明 |
|------|------|------|
| `/` | `SourceCollection` | 信源收集（默认页） |
| `/editor` | `ScriptEditor` | 口播稿编辑 |
| `/history` | `History` | 播报历史 |
| `/settings` | `Settings` | 系统设置 |
```

同步更新第 45-49 行的项目结构示例：

```markdown
├── pages/                      # 路由页面（一个文件一个页面）
│   ├── SourceCollection.tsx
│   ├── ScriptEditor.tsx
│   ├── History.tsx
│   └── Settings.tsx
```

- [ ] **Step 4: 最终构建验证**

```bash
cd /Users/jinghao/Desktop/workBase/tts-broadcast/frontend && npm run build
```

预期：构建成功，无 TypeScript 错误，无 ESLint 错误。

- [ ] **Step 5: 最终 Commit**

```bash
git add -A
git commit -m "chore: remove Dashboard.tsx, update conventions, finalize navigation redesign"
```

---

## Checklist

实现完成后，对照以下清单验证：

- [ ] 侧边栏显示 4 个导航项：信源收集、口播稿编辑、历史记录、设置
- [ ] 默认首页为信源收集页面（`/`）
- [ ] 信源收集页面可获取资讯、改写口播稿
- [ ] 改写成功后自动跳转到口播稿编辑页面（`/editor`）
- [ ] 口播稿编辑页面显示 ScriptPreview → VoiceGenerator（横向）→ SegmentEditor → AudioPlayer（上下排列）
- [ ] 直接访问 `/editor` 且无 script 时显示空状态，引导回信源收集
- [ ] 历史记录每条播报有"重新编辑"按钮，点击跳转到编辑页
- [ ] 设置页面 API Key 拆分为 LLM 和 TTS 两个独立输入框
- [ ] 两个 API Key 各有独立的"测试连接"按钮
- [ ] 后端默认设置包含 `mimo_tts_api_key`
- [ ] `npm run build` 通过
- [ ] `npm run dev` 目视检查 4 个页面样式一致
