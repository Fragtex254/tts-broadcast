import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Layout/Header';
import { AudioPlayer } from '../components/Dashboard/AudioPlayer';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { createScopedLogger, toLogError } from '../services/logger';
import useStore from '../store';
import type { Broadcast } from '../store';

const logger = createScopedLogger('history-page');

const formatDuration = (seconds: number | null): string => {
  if (seconds === null || seconds === undefined) return '--:--';
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
};

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays < 7) return `${diffDays} 天前`;
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const getStatusBadge = (status: string) => {
  const styles: Record<string, string> = {
    completed: 'bg-sage/30 text-ink',
    generating: 'bg-lemon/25 text-ink',
    failed: 'bg-pink/20 text-ink',
  };
  const labels: Record<string, string> = { completed: '✓ 已完成', generating: '◌ 生成中', failed: '✕ 失败' };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[9px] font-body font-medium uppercase tracking-wider ${styles[status] || 'bg-paper-2 text-ink-soft'}`}>
      {labels[status] || status}
    </span>
  );
};

export const History: React.FC = () => {
  const broadcasts = useStore((s) => s.broadcasts);
  const fetchBroadcasts = useStore((s) => s.fetchBroadcasts);
  const currentBroadcast = useStore((s) => s.currentBroadcast);
  const setCurrentBroadcast = useStore((s) => s.setCurrentBroadcast);
  const saveBroadcast = useStore((s) => s.saveBroadcast);
  const fetchSegments = useStore((s) => s.fetchSegments);
  const batchDeleteBroadcasts = useStore((s) => s.batchDeleteBroadcasts);
  const isBatchDeleting = useStore((s) => s.isBatchDeleting);

  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  // 多选模式状态 — 使用 Set 存储选中 ID
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // 进入多选模式
  const handleEnterMultiSelect = useCallback(() => {
    setIsMultiSelectMode(true);
    setSelectedIds(new Set());
  }, []);

  // 退出多选模式
  const handleExitMultiSelect = useCallback(() => {
    setIsMultiSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  // 切换选择状态
  const handleToggleSelect = useCallback((broadcast: Broadcast) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(broadcast.id)) {
        next.delete(broadcast.id);
      } else {
        next.add(broadcast.id);
      }
      return next;
    });
  }, []);

  // 全选/取消全选当前页
  const handleToggleSelectAll = useCallback(() => {
    const allSelected = broadcasts.every((b) => selectedIds.has(b.id));

    if (allSelected) {
      // 取消全选当前页
      setSelectedIds((prev) => {
        const next = new Set(prev);
        broadcasts.forEach((b) => next.delete(b.id));
        return next;
      });
    } else {
      // 全选当前页
      setSelectedIds((prev) => {
        const next = new Set(prev);
        broadcasts.forEach((b) => next.add(b.id));
        return next;
      });
    }
  }, [broadcasts, selectedIds]);

  // 点击删除按钮
  const handleDeleteClick = useCallback(() => {
    if (selectedIds.size === 0) return;
    setShowConfirmDialog(true);
  }, [selectedIds.size]);

  // 计算已选中的已保存记录数量
  const savedCount = broadcasts.filter((b) => selectedIds.has(b.id) && b.saved === 1).length;

  const loadBroadcasts = useCallback(async (pageNum: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchBroadcasts({ page: pageNum, limit });
      setTotal(result.pagination.total);
    } catch {
      setError('加载播报历史失败，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  }, [fetchBroadcasts]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadBroadcasts(page);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [page, loadBroadcasts]);

  // 删除失败错误提示自动消失
  useEffect(() => {
    if (deleteError) {
      const timer = setTimeout(() => setDeleteError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [deleteError]);

  // 确认删除
  const handleConfirmDelete = useCallback(async () => {
    try {
      setDeleteError(null);
      const ids = Array.from(selectedIds);
      await batchDeleteBroadcasts(ids);
      setShowConfirmDialog(false);
      handleExitMultiSelect();
      await loadBroadcasts(page);
    } catch (error) {
      logger.error({ err: toLogError(error), count: selectedIds.size, page }, '批量删除失败');
      setDeleteError('删除失败，请稍后重试');
      setShowConfirmDialog(false);
    }
  }, [selectedIds, batchDeleteBroadcasts, handleExitMultiSelect, loadBroadcasts, page]);

  const handleSelectBroadcast = useCallback((broadcast: Broadcast) => setCurrentBroadcast(broadcast), [setCurrentBroadcast]);
  const handleReEdit = useCallback(async (broadcast: Broadcast, e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentBroadcast(broadcast);
    try {
      await fetchSegments(broadcast.id);
    } catch {
      // Even if segments fail to load, still navigate
    }
    navigate('/editor');
  }, [setCurrentBroadcast, fetchSegments, navigate]);
  const getAudioUrl = useCallback((broadcast: Broadcast): string | null => (
    broadcast.audio_path || (broadcast.mode === 'segmented' && broadcast.status === 'generated')
      ? `/api/broadcast/${broadcast.id}/audio?t=${encodeURIComponent(broadcast.updated_at)}`
      : null
  ), []);
  const totalPages = Math.ceil(total / limit);

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
                className="px-3 py-1.5 bg-pink text-ink font-body text-[11px] font-medium rounded-lg shadow-btn hover:brightness-105 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
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

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="bg-white/80 backdrop-blur-sm rounded-card shadow-card border border-card-border overflow-hidden">
            {isLoading && (
              <div className="p-6 space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-4 animate-pulse" style={{ animationDelay: `${i * 0.05}s` }}>
                    <div className="h-4 bg-ink/5 rounded w-2/5" />
                    <div className="h-3 bg-ink/5 rounded w-1/6" />
                    <div className="h-3 bg-ink/5 rounded w-1/12" />
                    <div className="h-5 bg-ink/5 rounded-full w-16" />
                  </div>
                ))}
              </div>
            )}

            {error && !isLoading && (
              <div className="p-12 text-center">
                <p className="font-body text-[13px] text-pink mb-3">{error}</p>
                <button onClick={() => loadBroadcasts(page)} className="font-body text-[12px] text-ink-soft hover:text-ink transition-colors">重新加载</button>
              </div>
            )}

            {!isLoading && !error && broadcasts.length === 0 && (
              <div className="p-12 text-center animate-fade-in">
                <p className="font-display italic text-[16px] text-ink-soft/70 mb-1">暂无播报记录</p>
                <p className="font-body text-[12px] text-ink-soft/30">前往信源收集生成第一条播报</p>
              </div>
            )}

            {!isLoading && !error && broadcasts.map((broadcast, index) => {
              const isSelected = currentBroadcast?.id === broadcast.id;
              const isChecked = selectedIds.has(broadcast.id);
              return (
                <div
                  key={broadcast.id}
                  onClick={() => isMultiSelectMode ? handleToggleSelect(broadcast) : handleSelectBroadcast(broadcast)}
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
                      onChange={() => handleToggleSelect(broadcast)}
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
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="font-body text-[11px] text-ink-soft/70 uppercase tracking-wider">第 {page} / {totalPages} 页，共 {total} 条</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-4 py-1.5 font-body text-[12px] bg-white/50 text-ink-soft rounded-full border border-card-border hover:bg-white/70 disabled:opacity-40 transition-colors">上一页</button>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-4 py-1.5 font-body text-[12px] bg-white/50 text-ink-soft rounded-full border border-card-border hover:bg-white/70 disabled:opacity-40 transition-colors">下一页</button>
              </div>
            </div>
          )}

          {currentBroadcast?.content && (
            <div className="bg-white/80 backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border animate-fade-in">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-pink" />
                <h3 className="font-display italic text-[14px] font-medium text-ink-soft">口播稿预览</h3>
                <span className="font-body text-[10px] uppercase tracking-wider text-ink-soft/70 ml-auto">
                  {currentBroadcast.content.length} 字 · ≈ {Math.ceil(currentBroadcast.content.length / 4)} 秒
                </span>
              </div>
              <div className="bg-white/60 rounded-2xl p-4 border border-card-border">
                <pre className="text-ink font-body text-[13px] leading-[1.9] whitespace-pre-wrap">{currentBroadcast.content}</pre>
              </div>
            </div>
          )}

          <AudioPlayer
            audioUrl={currentBroadcast ? getAudioUrl(currentBroadcast) : null}
            title={currentBroadcast?.title || '选择一条播报记录播放'}
            broadcastId={currentBroadcast?.id}
            isSaved={currentBroadcast?.saved === 1}
            onSave={saveBroadcast}
          />
        </div>
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

      {/* 删除失败错误提示 */}
      {deleteError && (
        <div className="fixed bottom-4 right-4 z-50 bg-pink/10 border border-pink/30 text-pink px-4 py-3 rounded-lg animate-shake">
          {deleteError}
        </div>
      )}
    </div>
  );
};

export default History;
