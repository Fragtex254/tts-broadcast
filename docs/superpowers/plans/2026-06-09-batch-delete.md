# 批量删除功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为历史记录页面添加批量删除功能，支持多选、跨页保持选择、确认对话框

**Architecture:** 
- 后端新增批量删除 API（`POST /api/broadcast/batch-delete`），使用事务保证数据一致性
- 前端在 History 页面添加多选模式状态管理，支持跨页选择
- 复用现有的 broadcastStore 和 cleanAudioFile 工具函数

**Tech Stack:** Express, better-sqlite3, React, TypeScript, Zustand

---

## 文件结构

### 后端文件
- **Modify:** `backend/src/routes/broadcast.js` - 新增批量删除路由
- **Modify:** `backend/src/services/broadcastStore.js` - 新增批量删除函数
- **Test:** `backend/tests/routes/batch-delete.test.js` - 批量删除 API 测试

### 前端文件
- **Modify:** `frontend/src/services/api.ts` - 新增 batchDelete API 方法
- **Modify:** `frontend/src/store/index.ts` - 新增批量删除状态和 action
- **Modify:** `frontend/src/pages/History.tsx` - 实现多选模式 UI 和交互
- **Create:** `frontend/src/components/ConfirmDialog.tsx` - 确认对话框组件

---

## Task 1: 后端 - broadcastStore 批量删除函数

**Files:**
- Modify: `backend/src/services/broadcastStore.js:146-147`
- Test: `backend/tests/services/broadcastStore.test.js`

- [ ] **Step 1: 编写批量删除函数的测试**

在 `backend/tests/services/broadcastStore.test.js` 中添加测试（如果文件不存在则创建）：

```javascript
const broadcastStore = require('../../src/services/broadcastStore');
const db = require('../../src/db');

describe('broadcastStore - batchDeleteByIds', () => {
  beforeEach(() => {
    db.exec('DELETE FROM broadcasts');
  });

  test('应该批量删除多条记录', () => {
    // 准备测试数据
    const b1 = broadcastStore.create({ title: 'Test 1', content: 'Content 1' });
    const b2 = broadcastStore.create({ title: 'Test 2', content: 'Content 2' });
    const b3 = broadcastStore.create({ title: 'Test 3', content: 'Content 3' });

    const result = broadcastStore.batchDeleteByIds([b1.id, b3.id]);

    expect(result.deleted).toBe(2);
    expect(result.failed).toBe(0);
    expect(broadcastStore.getById(b1.id)).toBeUndefined();
    expect(broadcastStore.getById(b2.id)).toBeDefined();
    expect(broadcastStore.getById(b3.id)).toBeUndefined();
  });

  test('应该处理不存在的 ID', () => {
    const b1 = broadcastStore.create({ title: 'Test 1', content: 'Content 1' });

    const result = broadcastStore.batchDeleteByIds([b1.id, 99999]);

    expect(result.deleted).toBe(1);
    expect(result.failed).toBe(1);
  });

  test('应该处理空数组', () => {
    const result = broadcastStore.batchDeleteByIds([]);

    expect(result.deleted).toBe(0);
    expect(result.failed).toBe(0);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd backend && npm test -- tests/services/broadcastStore.test.js
```

预期：测试失败，因为 `batchDeleteByIds` 函数不存在

- [ ] **Step 3: 实现批量删除函数**

在 `backend/src/services/broadcastStore.js` 的 `deleteById` 函数后面添加：

```javascript
/**
 * 批量删除播报记录（含级联删除 segments）
 * @param {number[]} ids - 播报 ID 数组
 * @returns {Object} { deleted: number, failed: number }
 */
function batchDeleteByIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { deleted: 0, failed: 0 };
  }

  let deleted = 0;
  let failed = 0;

  const deleteTransaction = db.transaction((idList) => {
    for (const id of idList) {
      const record = db.prepare('SELECT id FROM broadcasts WHERE id = ?').get(id);
      if (record) {
        db.prepare('DELETE FROM broadcasts WHERE id = ?').run(id);
        deleted++;
      } else {
        failed++;
      }
    }
  });

  deleteTransaction(ids);
  return { deleted, failed };
}
```

在 `module.exports` 中添加 `batchDeleteByIds`：

```javascript
module.exports = {
  create,
  getById,
  getHistory,
  countAll,
  countUnsaved,
  countSaved,
  getOldestUnsaved,
  getOldestSaved,
  updateAudioPath,
  updateVoiceConfig,
  toggleSaved,
  deleteById,
  batchDeleteByIds,  // 新增
  clearAudioAndSetMode,
  updateStatus
};
```

- [ ] **Step 4: 运行测试验证通过**

```bash
cd backend && npm test -- tests/services/broadcastStore.test.js
```

预期：所有测试通过

- [ ] **Step 5: 提交代码**

```bash
git add backend/src/services/broadcastStore.js backend/tests/services/broadcastStore.test.js
git commit -m "feat(backend): 添加 broadcastStore.batchDeleteByIds 批量删除函数"
```

---

## Task 2: 后端 - 批量删除 API 路由

**Files:**
- Modify: `backend/src/routes/broadcast.js:159-160`
- Test: `backend/tests/routes/batch-delete.test.js`

- [ ] **Step 1: 编写批量删除路由的测试**

创建 `backend/tests/routes/batch-delete.test.js`：

```javascript
const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/db');
const broadcastStore = require('../../src/services/broadcastStore');

describe('POST /api/broadcast/batch-delete', () => {
  beforeEach(() => {
    db.exec('DELETE FROM broadcasts');
  });

  test('应该批量删除多条记录', async () => {
    const b1 = broadcastStore.create({ title: 'Test 1', content: 'Content 1' });
    const b2 = broadcastStore.create({ title: 'Test 2', content: 'Content 2' });
    const b3 = broadcastStore.create({ title: 'Test 3', content: 'Content 3' });

    const response = await request(app)
      .post('/api/broadcast/batch-delete')
      .send({ ids: [b1.id, b3.id] })
      .expect(200);

    expect(response.body.deleted).toBe(2);
    expect(response.body.failed).toBe(0);
    expect(broadcastStore.getById(b1.id)).toBeUndefined();
    expect(broadcastStore.getById(b2.id)).toBeDefined();
    expect(broadcastStore.getById(b3.id)).toBeUndefined();
  });

  test('应该返回 400 如果 ids 为空', async () => {
    const response = await request(app)
      .post('/api/broadcast/batch-delete')
      .send({ ids: [] })
      .expect(400);

    expect(response.body.error).toBe('请提供要删除的记录 ID 列表');
  });

  test('应该返回 400 如果 ids 不是数组', async () => {
    const response = await request(app)
      .post('/api/broadcast/batch-delete')
      .send({ ids: 'not-array' })
      .expect(400);

    expect(response.body.error).toBe('请提供要删除的记录 ID 列表');
  });

  test('应该处理不存在的 ID', async () => {
    const b1 = broadcastStore.create({ title: 'Test 1', content: 'Content 1' });

    const response = await request(app)
      .post('/api/broadcast/batch-delete')
      .send({ ids: [b1.id, 99999] })
      .expect(200);

    expect(response.body.deleted).toBe(1);
    expect(response.body.failed).toBe(1);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd backend && npm test -- tests/routes/batch-delete.test.js
```

预期：测试失败，因为路由不存在

- [ ] **Step 3: 实现批量删除路由**

在 `backend/src/routes/broadcast.js` 的 `GET /history` 路由后面添加：

```javascript
/**
 * POST /api/broadcast/batch-delete
 * 批量删除播报记录
 */
router.post('/batch-delete', (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: '请提供要删除的记录 ID 列表' });
    }

    // 获取要删除的记录，用于清理音频文件
    const records = [];
    for (const id of ids) {
      const record = broadcastStore.getById(id);
      if (record) {
        records.push(record);
      }
    }

    // 清理音频文件
    for (const record of records) {
      if (record.audio_path) {
        cleanAudioFile(record.audio_path);
      }
      // 清理关联的 segment 音频文件
      const segments = segmentStore.getByBroadcastId(record.id);
      for (const seg of segments) {
        if (seg.audio_path) {
          cleanAudioFile(seg.audio_path);
        }
      }
    }

    // 批量删除数据库记录
    const result = broadcastStore.batchDeleteByIds(ids);

    res.json(result);
  } catch (error) {
    console.error('批量删除失败:', error);
    res.status(500).json({ error: '批量删除失败' });
  }
});
```

- [ ] **Step 4: 运行测试验证通过**

```bash
cd backend && npm test -- tests/routes/batch-delete.test.js
```

预期：所有测试通过

- [ ] **Step 5: 提交代码**

```bash
git add backend/src/routes/broadcast.js backend/tests/routes/batch-delete.test.js
git commit -m "feat(backend): 添加 POST /api/broadcast/batch-delete 批量删除路由"
```

---

## Task 3: 前端 - API 客户端和 Store

**Files:**
- Modify: `frontend/src/services/api.ts:73`
- Modify: `frontend/src/store/index.ts:164`

- [ ] **Step 1: 添加 API 客户端方法**

在 `frontend/src/services/api.ts` 的 `broadcastApi` 对象中添加：

```typescript
export const broadcastApi = {
  // ... 现有方法

  /** 批量删除播报记录 */
  batchDelete: (ids: number[]) =>
    api.post('/broadcast/batch-delete', { ids }),
};
```

- [ ] **Step 2: 添加 Store 状态和 action**

在 `frontend/src/store/index.ts` 的 `AppState` 接口中添加：

```typescript
export interface AppState {
  // ... 现有状态

  // 批量删除状态
  isBatchDeleting: boolean;

  // ... 现有 actions

  // 批量删除操作
  batchDeleteBroadcasts: (ids: number[]) => Promise<{ deleted: number; failed: number }>;
}
```

在 store 实现中添加：

```typescript
export const useStore = create<AppState>((set) => ({
  // ... 现有状态

  // 批量删除状态
  isBatchDeleting: false,

  // ... 现有 actions

  /** 批量删除播报记录 */
  batchDeleteBroadcasts: async (ids) => {
    set({ isBatchDeleting: true });
    try {
      const response = await broadcastApi.batchDelete(ids);
      const result = response.data;
      set({ isBatchDeleting: false });
      return result;
    } catch (error) {
      set({ isBatchDeleting: false });
      console.error('批量删除失败:', error);
      throw error;
    }
  },
}));
```

- [ ] **Step 3: 运行 TypeScript 类型检查**

```bash
cd frontend && npx tsc --noEmit
```

预期：无类型错误

- [ ] **Step 4: 提交代码**

```bash
git add frontend/src/services/api.ts frontend/src/store/index.ts
git commit -m "feat(frontend): 添加批量删除 API 客户端和 Store 方法"
```

---

## Task 4: 前端 - 确认对话框组件

**Files:**
- Create: `frontend/src/components/ConfirmDialog.tsx`

- [ ] **Step 1: 创建确认对话框组件**

创建 `frontend/src/components/ConfirmDialog.tsx`：

```typescript
import React from 'react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  warningMessage?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  warningMessage,
  confirmText = '确认删除',
  cancelText = '取消',
  onConfirm,
  onCancel,
  isLoading = false,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 遮罩层 */}
      <div
        className="absolute inset-0 bg-ink/30 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* 对话框 */}
      <div className="relative bg-white rounded-2xl shadow-xl border border-card-border p-6 max-w-md w-full mx-4 animate-fade-in">
        {/* 标题 */}
        <h3 className="font-display text-[18px] font-semibold text-ink mb-2">
          {title}
        </h3>

        {/* 消息 */}
        <p className="font-body text-[14px] text-ink-soft mb-2">
          {message}
        </p>

        {/* 警告消息 */}
        {warningMessage && (
          <p className="font-body text-[13px] text-pink font-medium mb-4">
            {warningMessage}
          </p>
        )}

        {/* 按钮 */}
        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 bg-white border border-card-border text-ink-soft font-body text-[13px] font-medium rounded-lg hover:bg-paper-2 transition-colors disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="px-4 py-2 bg-pink text-white font-body text-[13px] font-medium rounded-lg shadow-btn hover:brightness-105 transition-all disabled:opacity-50"
          >
            {isLoading ? '删除中...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
```

- [ ] **Step 2: 运行 TypeScript 类型检查**

```bash
cd frontend && npx tsc --noEmit
```

预期：无类型错误

- [ ] **Step 3: 提交代码**

```bash
git add frontend/src/components/ConfirmDialog.tsx
git commit -m "feat(frontend): 添加 ConfirmDialog 确认对话框组件"
```

---

## Task 5: 前端 - History 页面多选模式

**Files:**
- Modify: `frontend/src/pages/History.tsx`

- [ ] **Step 1: 添加多选模式状态**

在 `History` 组件顶部添加状态：

```typescript
export const History: React.FC = () => {
  const { broadcasts, fetchBroadcasts, currentBroadcast, setCurrentBroadcast, saveBroadcast, fetchSegments, batchDeleteBroadcasts, isBatchDeleting } = useStore();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  // 多选模式状态
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // ... 现有代码
```

- [ ] **Step 2: 添加多选操作函数**

在组件内添加操作函数：

```typescript
  // 进入多选模式
  const handleEnterMultiSelect = () => {
    setIsMultiSelectMode(true);
    setSelectedIds(new Set());
  };

  // 退出多选模式
  const handleExitMultiSelect = () => {
    setIsMultiSelectMode(false);
    setSelectedIds(new Set());
  };

  // 切换选择状态
  const handleToggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // 全选/取消全选当前页
  const handleToggleSelectAll = () => {
    const currentPageIds = broadcasts.map((b) => b.id);
    const allSelected = currentPageIds.every((id) => selectedIds.has(id));

    if (allSelected) {
      // 取消全选当前页
      setSelectedIds((prev) => {
        const next = new Set(prev);
        currentPageIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      // 全选当前页
      setSelectedIds((prev) => {
        const next = new Set(prev);
        currentPageIds.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  // 点击删除按钮
  const handleDeleteClick = () => {
    if (selectedIds.size === 0) return;
    setShowConfirmDialog(true);
  };

  // 确认删除
  const handleConfirmDelete = async () => {
    try {
      const ids = Array.from(selectedIds);
      await batchDeleteBroadcasts(ids);
      setShowConfirmDialog(false);
      handleExitMultiSelect();
      await loadBroadcasts(page);
    } catch (error) {
      console.error('批量删除失败:', error);
    }
  };

  // 计算已选中的已保存记录数量
  const savedCount = broadcasts.filter((b) => selectedIds.has(b.id) && b.saved === 1).length;
```

- [ ] **Step 3: 修改顶部 Header 区域**

修改 Header 组件的调用，添加多选模式的 UI：

```typescript
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header
        title="播报历史"
        subtitle={`共 ${total} 条播报记录`}
        actions={
          isMultiSelectMode ? (
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={broadcasts.length > 0 && broadcasts.every((b) => selectedIds.has(b.id))}
                  onChange={handleToggleSelectAll}
                  className="w-4 h-4 rounded border-card-border text-pink focus:ring-pink/30"
                />
                <span className="font-body text-[12px] text-ink-soft">全选当前页</span>
              </label>
              <span className="font-body text-[12px] text-ink-soft">
                已选 {selectedIds.size} 项
              </span>
              <button
                onClick={handleDeleteClick}
                disabled={selectedIds.size === 0 || isBatchDeleting}
                className="px-3 py-1.5 bg-pink text-white font-body text-[11px] font-medium rounded-lg shadow-btn hover:brightness-105 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                🗑️ 删除
              </button>
              <button
                onClick={handleExitMultiSelect}
                className="px-3 py-1.5 bg-white border border-card-border text-ink-soft font-body text-[11px] font-medium rounded-lg hover:bg-paper-2 transition-colors"
              >
                取消
              </button>
            </div>
          ) : (
            <button
              onClick={handleEnterMultiSelect}
              className="px-3 py-1.5 bg-lilac hover:brightness-105 text-ink font-body text-[11px] font-medium rounded-lg shadow-btn transition-all duration-150 hover:-translate-y-px active:translate-y-0 active:shadow-none"
            >
              ✓ 多选
            </button>
          )
        }
      />

      {/* ... 其余代码 */}
```

- [ ] **Step 4: 修改列表项添加复选框**

修改 broadcasts.map 中的列表项：

```typescript
            {!isLoading && !error && broadcasts.map((broadcast, index) => {
              const isSelected = currentBroadcast?.id === broadcast.id;
              const isChecked = selectedIds.has(broadcast.id);
              return (
                <div
                  key={broadcast.id}
                  onClick={() => isMultiSelectMode ? handleToggleSelect(broadcast.id) : handleSelectBroadcast(broadcast)}
                  className={`flex items-center gap-4 px-5 py-3.5 border-b border-card-border cursor-pointer transition-all duration-200 ${
                    isMultiSelectMode && isChecked
                      ? 'bg-sage/10'
                      : isSelected
                      ? 'bg-sage/10'
                      : 'hover:bg-white/30'
                  }`}
                  style={{ animation: `fade-in-up 0.3s cubic-bezier(0.22, 1, 0.36, 1) ${index * 0.03}s both` }}
                >
                  {isMultiSelectMode && (
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleSelect(broadcast.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 rounded border-card-border text-pink focus:ring-pink/30"
                    />
                  )}
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
                  {!isMultiSelectMode && (
                    <button
                      onClick={(e) => handleReEdit(broadcast, e)}
                      className="px-3 py-1.5 bg-lilac hover:brightness-105 text-ink font-body text-[11px] font-medium rounded-lg shadow-btn transition-all duration-150 hover:-translate-y-px active:translate-y-0 active:shadow-none whitespace-nowrap"
                    >
                      ✏️ 重新编辑
                    </button>
                  )}
                </div>
              );
            })}
```

- [ ] **Step 5: 添加确认对话框**

在组件 return 的最后添加确认对话框：

```typescript
      </main>

      {/* 确认删除对话框 */}
      <ConfirmDialog
        isOpen={showConfirmDialog}
        title="确认删除"
        message={`确定要删除选中的 ${selectedIds.size} 条记录吗？`}
        warningMessage={savedCount > 0 ? `其中包含 ${savedCount} 条已保存记录` : undefined}
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowConfirmDialog(false)}
        isLoading={isBatchDeleting}
      />
    </div>
  );
```

- [ ] **Step 6: 添加 ConfirmDialog 导入**

在文件顶部添加导入：

```typescript
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Layout/Header';
import { AudioPlayer } from '../components/Dashboard/AudioPlayer';
import { ConfirmDialog } from '../components/ConfirmDialog';
import useStore from '../store';
import type { Broadcast } from '../store';
```

- [ ] **Step 7: 运行 TypeScript 类型检查**

```bash
cd frontend && npx tsc --noEmit
```

预期：无类型错误

- [ ] **Step 8: 提交代码**

```bash
git add frontend/src/pages/History.tsx
git commit -m "feat(frontend): 实现 History 页面批量删除多选模式"
```

---

## Task 6: 集成测试和验证

**Files:**
- None (manual testing)

- [ ] **Step 1: 启动后端服务**

```bash
cd backend && npm run dev
```

- [ ] **Step 2: 启动前端服务**

```bash
cd frontend && npm run dev
```

- [ ] **Step 3: 手动测试批量删除功能**

1. 打开历史记录页面
2. 点击"多选"按钮进入多选模式
3. 选择几条记录（包括已保存的记录）
4. 使用"全选当前页"功能
5. 切换页面验证跨页选择保持
6. 点击"删除"按钮
7. 验证确认对话框显示正确的数量和已保存记录提示
8. 点击"确认删除"
9. 验证 Toast 提示
10. 验证页面重新加载
11. 验证删除后自动退出多选模式

- [ ] **Step 4: 运行所有后端测试**

```bash
cd backend && npm test
```

预期：所有测试通过

- [ ] **Step 5: 最终提交**

```bash
git add -A
git commit -m "feat: 完成批量删除功能实现"
```

---

## 检查清单

实现完成后，对照以下检查清单验证：

### 后端
- [ ] broadcastStore.batchDeleteByIds 函数正常工作
- [ ] 批量删除 API 正确处理空数组和非数组参数
- [ ] 批量删除 API 正确清理音频文件
- [ ] 批量删除 API 使用事务保证数据一致性
- [ ] 所有后端测试通过

### 前端
- [ ] 多选模式进入/退出正常
- [ ] 逐条选择和取消选择正常
- [ ] 全选当前页功能正常
- [ ] 跨页选择保持正常
- [ ] 确认对话框正确显示数量和已保存记录提示
- [ ] 批量删除 API 调用正常
- [ ] 删除后页面重新加载正常
- [ ] 删除后自动退出多选模式
- [ ] TypeScript 类型检查通过

### 代码质量
- [ ] 代码风格与现有代码一致
- [ ] 没有 TypeScript 类型错误
- [ ] 没有 ESLint 警告
- [ ] 提交信息清晰明了
