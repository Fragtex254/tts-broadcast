import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AudioPlayer } from '../Dashboard/AudioPlayer';
import { ConfirmDialog } from '../ConfirmDialog';
import { ActionButton } from '../ui/ActionButton';
import { WorkbenchCard } from '../ui/WorkbenchCard';
import { createScopedLogger, toLogError } from '../../services/logger';
import useStore from '../../store';
import type { Broadcast } from '../../store';

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
    draft: 'bg-lemon/25 text-ink',
    pending: 'bg-paper-2 text-ink-soft',
    generated: 'bg-sage/30 text-ink',
    generating: 'bg-lilac/30 text-ink',
    failed: 'bg-pink/20 text-ink',
  };
  const labels: Record<string, string> = {
    draft: '编辑草稿',
    pending: '文字草稿',
    generated: '音频就绪',
    generating: '正在生成音频',
    failed: '音频生成失败',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 font-body text-[11px] font-medium ${styles[status] || 'bg-paper-2 text-ink-soft'}`}>
      {labels[status] || status}
    </span>
  );
};

export const BroadcastLibrary: React.FC = () => {
  const broadcasts = useStore((s) => s.broadcasts);
  const fetchBroadcasts = useStore((s) => s.fetchBroadcasts);
  const currentBroadcast = useStore((s) => s.currentBroadcast);
  const setCurrentBroadcast = useStore((s) => s.setCurrentBroadcast);
  const saveBroadcast = useStore((s) => s.saveBroadcast);
  const batchDeleteBroadcasts = useStore((s) => s.batchDeleteBroadcasts);
  const forkEditorDraft = useStore((s) => s.forkEditorDraft);
  const cancelEditorDraftCreation = useStore((s) => s.cancelEditorDraftCreation);
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
  const [editError, setEditError] = useState<string | null>(null);
  const [reopeningBroadcastId, setReopeningBroadcastId] = useState<number | null>(null);

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

  useEffect(() => cancelEditorDraftCreation, [cancelEditorDraftCreation]);

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
    setEditError(null);
    setReopeningBroadcastId(broadcast.id);
    try {
      const draft = broadcast.status === 'draft'
        ? broadcast
        : await forkEditorDraft(broadcast.id);
      navigate(`/editor/${draft.id}`);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : '创建可编辑副本失败，请重试。');
    } finally {
      setReopeningBroadcastId(null);
    }
  }, [forkEditorDraft, navigate]);
  const getAudioUrl = useCallback((broadcast: Broadcast): string | null => (
    broadcast.audio_path || (broadcast.mode === 'segmented' && broadcast.status === 'generated')
      ? `/api/broadcast/${broadcast.id}/audio?t=${encodeURIComponent(broadcast.updated_at)}`
      : null
  ), []);
  const totalPages = Math.ceil(total / limit);
  const selectedBroadcast = broadcasts.find((broadcast) => broadcast.id === currentBroadcast?.id) || null;

  return (
    <div className="space-y-4">
      <WorkbenchCard tone="secondary" className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-[18px] font-medium text-ink">已保存的成稿与音频</h2>
          <p className="mt-1 font-body text-[12px] leading-relaxed text-ink-soft/70">
            共 {total} 条；选择标题可预览全文和音频，也可以直接继续编辑。
          </p>
        </div>
        {isMultiSelectMode ? (
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <label className="flex min-h-9 cursor-pointer items-center gap-2 rounded-xl px-1">
                <input
                  type="checkbox"
                  checked={broadcasts.length > 0 && broadcasts.every((b) => selectedIds.has(b.id))}
                  onChange={handleToggleSelectAll}
                  className="h-4 w-4 rounded border-card-border text-pink focus:ring-pink/30"
                />
                <span className="font-body text-[12px] text-ink-soft">全选当前页</span>
              </label>
              <span className="rounded-full bg-white/60 px-2.5 py-1 font-body text-[11px] text-ink-soft">
                已选 {selectedIds.size} 项
              </span>
              <ActionButton
                tone="danger"
                size="sm"
                onClick={handleDeleteClick}
                disabled={selectedIds.size === 0 || isBatchDeleting}
                isLoading={isBatchDeleting}
                loadingLabel="正在删除"
              >
                删除所选
              </ActionButton>
              <ActionButton
                tone="secondary"
                size="sm"
                onClick={handleExitMultiSelect}
              >
                取消
              </ActionButton>
            </div>
          ) : (
            <ActionButton
              tone="secondary"
              size="sm"
              onClick={handleEnterMultiSelect}
            >
              批量管理
            </ActionButton>
          )}
      </WorkbenchCard>

          <WorkbenchCard className="overflow-hidden">
            {isLoading && (
              <div className="space-y-5 p-5 sm:p-6">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="animate-pulse space-y-2">
                    <div className="h-4 w-3/5 rounded bg-ink/5" />
                    <div className="h-3 w-2/5 rounded bg-ink/5" />
                  </div>
                ))}
              </div>
            )}

            {error && !isLoading && (
              <div className="p-8 text-center sm:p-12">
                <p className="mb-3 font-body text-[13px] text-ink">{error}</p>
                <ActionButton tone="secondary" size="sm" onClick={() => loadBroadcasts(page)}>
                  重新加载
                </ActionButton>
              </div>
            )}

            {!isLoading && !error && broadcasts.length === 0 && (
              <div className="p-8 text-center sm:p-12">
                <p className="font-display text-[18px] font-medium text-ink">这里还没有成稿</p>
                <p className="mx-auto mt-2 max-w-md font-body text-[13px] leading-relaxed text-ink-soft/70">
                  从内容工作台开始写作，保存后的文字和生成音频会集中出现在这里。
                </p>
                <ActionButton tone="primary" className="mt-4" onClick={() => navigate('/')}>
                  开始一次创作
                </ActionButton>
              </div>
            )}

            {!isLoading && !error && broadcasts.map((broadcast) => {
              const isSelected = selectedBroadcast?.id === broadcast.id;
              const isChecked = selectedIds.has(broadcast.id);
              return (
                <article
                  key={broadcast.id}
                  className={`border-b border-card-border px-4 py-4 last:border-b-0 sm:px-5 ${
                    isMultiSelectMode && isChecked
                      ? 'bg-sage/10'
                      : isSelected
                      ? 'bg-sage/10'
                      : 'hover:bg-white/30'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {isMultiSelectMode && (
                      <input
                        type="checkbox"
                        aria-label={`选择「${broadcast.title}」`}
                        checked={isChecked}
                        onChange={() => handleToggleSelect(broadcast)}
                        className="mt-1 h-4 w-4 shrink-0 rounded border-card-border text-pink focus:ring-pink/30"
                      />
                    )}
                    <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
                      <button
                        type="button"
                        onClick={() => isMultiSelectMode ? handleToggleSelect(broadcast) : handleSelectBroadcast(broadcast)}
                        aria-pressed={isMultiSelectMode ? undefined : isSelected}
                        className="ui-pressable min-w-0 flex-1 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lilac/80"
                      >
                        <span className="flex items-start gap-2">
                          <span className={`min-w-0 break-words font-display text-[16px] font-medium leading-snug ${isSelected ? 'text-ink' : 'text-ink/90'}`}>
                            {broadcast.title || '未命名成稿'}
                          </span>
                          {broadcast.saved === 1 && (
                            <span aria-label="已保存" title="已保存" className="mt-0.5 shrink-0 text-lemon">
                              <svg aria-hidden="true" className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                              </svg>
                            </span>
                          )}
                        </span>
                        <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 font-body text-[11px] text-ink-soft/70">
                          {getStatusBadge(broadcast.status)}
                          <span>{broadcast.mode === 'segmented' ? '分段成稿' : '整篇成稿'}</span>
                          <span>更新于 {formatDate(broadcast.updated_at)}</span>
                          <span>{broadcast.content.length} 字</span>
                          {broadcast.duration !== null && <span>音频 {formatDuration(broadcast.duration)}</span>}
                        </span>
                      </button>
                      {!isMultiSelectMode && (
                        <ActionButton
                          tone="edit"
                          size="sm"
                          onClick={(e) => handleReEdit(broadcast, e)}
                          isLoading={reopeningBroadcastId === broadcast.id}
                          loadingLabel="正在创建副本…"
                          disabled={reopeningBroadcastId !== null}
                          className="w-full shrink-0 sm:w-auto"
                        >
                          继续编辑
                        </ActionButton>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </WorkbenchCard>

          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-body text-[11px] text-ink-soft/70">第 {page} / {totalPages} 页，共 {total} 条</p>
              <div className="flex items-center gap-2">
                <ActionButton tone="secondary" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>上一页</ActionButton>
                <ActionButton tone="secondary" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>下一页</ActionButton>
              </div>
            </div>
          )}

          {selectedBroadcast?.content && (
            <WorkbenchCard className="p-5">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-pink" />
                <h3 className="font-display text-[17px] font-medium text-ink">成稿预览</h3>
                <span className="ml-auto font-body text-[11px] text-ink-soft/70">
                  {selectedBroadcast.content.length} 字 · 预计口播 {Math.ceil(selectedBroadcast.content.length / 4)} 秒
                </span>
              </div>
              <div className="rounded-2xl border border-card-border bg-white/60 p-4 sm:p-5">
                <p className="ui-reading-body mx-auto max-w-3xl whitespace-pre-wrap break-words text-ink">
                  {selectedBroadcast.content}
                </p>
              </div>
            </WorkbenchCard>
          )}

          {selectedBroadcast && (
            <AudioPlayer
              audioUrl={getAudioUrl(selectedBroadcast)}
              title={selectedBroadcast.title}
              broadcastId={selectedBroadcast.id}
              isSaved={selectedBroadcast.saved === 1}
              onSave={saveBroadcast}
            />
          )}

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
      {editError && (
        <div role="alert" className="fixed bottom-4 right-4 z-50 rounded-lg border border-pink/30 bg-pink/10 px-4 py-3 text-pink animate-shake">
          {editError}
        </div>
      )}
    </div>
  );
};

export default BroadcastLibrary;
