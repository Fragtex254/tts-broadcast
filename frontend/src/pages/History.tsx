import React, { useEffect, useState } from 'react';
import { Header } from '../components/Layout/Header';
import { AudioPlayer } from '../components/Dashboard/AudioPlayer';
import useStore from '../store';
import type { Broadcast } from '../store';

/** 格式化时长（秒 -> mm:ss） */
const formatDuration = (seconds: number | null): string => {
  if (seconds === null || seconds === undefined) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/** 格式化日期 */
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

  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/** 状态标签样式 */
const getStatusBadge = (status: string) => {
  switch (status) {
    case 'completed':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-900/50 text-green-400 border border-green-800">
          已完成
        </span>
      );
    case 'generating':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-900/50 text-yellow-400 border border-yellow-800">
          生成中
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-900/50 text-red-400 border border-red-800">
          失败
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-700 text-gray-400 border border-gray-600">
          {status}
        </span>
      );
  }
};

export const History: React.FC = () => {
  const { broadcasts, fetchBroadcasts, currentBroadcast, setCurrentBroadcast, saveBroadcast } =
    useStore();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  /** 加载播报历史 */
  const loadBroadcasts = async (pageNum: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchBroadcasts({ page: pageNum, limit });
      setTotal(result.pagination.total);
    } catch (err) {
      setError('加载播报历史失败，请稍后重试');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBroadcasts(page);
  }, [page]);

  /** 点击选中播报记录 */
  const handleSelectBroadcast = (broadcast: Broadcast) => {
    setCurrentBroadcast(broadcast);
  };

  /** 构造音频 URL */
  const getAudioUrl = (broadcast: Broadcast): string | null => {
    if (!broadcast.audio_path) return null;
    // audio_path 存储的是相对路径，拼接为 API 可访问的完整路径
    return `/api/broadcast/${broadcast.id}/audio`;
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header title="播报历史" subtitle={`共 ${total} 条播报记录`} />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* 列表区域 */}
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            {/* 表头 */}
            <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-gray-750 border-b border-gray-700 text-xs font-medium text-gray-400 uppercase tracking-wider">
              <div className="col-span-5">标题</div>
              <div className="col-span-2">时间</div>
              <div className="col-span-2">时长</div>
              <div className="col-span-2">状态</div>
              <div className="col-span-1"></div>
            </div>

            {/* 加载状态 */}
            {isLoading && (
              <div className="px-6 py-16 flex items-center justify-center">
                <div className="flex items-center gap-3">
                  <svg
                    className="animate-spin h-5 w-5 text-blue-500"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  <span className="text-gray-400">加载中...</span>
                </div>
              </div>
            )}

            {/* 错误状态 */}
            {error && !isLoading && (
              <div className="px-6 py-16 text-center">
                <p className="text-red-400 mb-3">{error}</p>
                <button
                  onClick={() => loadBroadcasts(page)}
                  className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                >
                  重新加载
                </button>
              </div>
            )}

            {/* 空状态 */}
            {!isLoading && !error && broadcasts.length === 0 && (
              <div className="px-6 py-16 text-center">
                <svg
                  className="w-12 h-12 text-gray-600 mx-auto mb-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
                <p className="text-gray-500">暂无播报记录</p>
                <p className="text-gray-600 text-sm mt-1">
                  前往控制台生成第一条播报
                </p>
              </div>
            )}

            {/* 列表内容 */}
            {!isLoading &&
              !error &&
              broadcasts.map((broadcast) => {
                const isSelected = currentBroadcast?.id === broadcast.id;
                return (
                  <div
                    key={broadcast.id}
                    onClick={() => handleSelectBroadcast(broadcast)}
                    className={`grid grid-cols-12 gap-4 px-6 py-4 border-b border-gray-700/50 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-blue-900/20 border-l-2 border-l-blue-500'
                        : 'hover:bg-gray-750 border-l-2 border-l-transparent'
                    }`}
                  >
                    {/* 标题 */}
                    <div className="col-span-5 flex items-center">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p
                            className={`text-sm font-medium truncate ${
                              isSelected ? 'text-blue-300' : 'text-white'
                            }`}
                          >
                            {broadcast.title}
                          </p>
                          {broadcast.saved === 1 && (
                            <svg className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                            </svg>
                          )}
                        </div>
                        {broadcast.voice_type && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            语音: {broadcast.voice_type}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* 时间 */}
                    <div className="col-span-2 flex items-center">
                      <span className="text-sm text-gray-400">
                        {formatDate(broadcast.created_at)}
                      </span>
                    </div>

                    {/* 时长 */}
                    <div className="col-span-2 flex items-center">
                      <span className="text-sm text-gray-400">
                        {formatDuration(broadcast.duration)}
                      </span>
                    </div>

                    {/* 状态 */}
                    <div className="col-span-2 flex items-center">
                      {getStatusBadge(broadcast.status)}
                    </div>

                    {/* 操作 */}
                    <div className="col-span-1 flex items-center justify-end">
                      {broadcast.audio_path && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectBroadcast(broadcast);
                          }}
                          className="text-gray-400 hover:text-blue-400 transition-colors"
                          title="播放"
                        >
                          <svg
                            className="w-5 h-5"
                            fill="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-400">
                第 {page} / {totalPages} 页，共 {total} 条
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 text-sm bg-gray-800 text-gray-300 rounded-lg border border-gray-700 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  上一页
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 text-sm bg-gray-800 text-gray-300 rounded-lg border border-gray-700 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  下一页
                </button>
              </div>
            </div>
          )}

          {/* 口播稿预览 */}
          {currentBroadcast?.content && (
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">口播稿预览</h3>
                <span className="text-xs text-gray-500">
                  {currentBroadcast.content.length} 字 | 约 {Math.ceil(currentBroadcast.content.length / 4)} 秒
                </span>
              </div>
              <div className="bg-gray-700 rounded-lg p-4">
                <pre className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap font-sans">
                  {currentBroadcast.content}
                </pre>
              </div>
            </div>
          )}

          {/* 音频播放器 */}
          <AudioPlayer
            audioUrl={
              currentBroadcast ? getAudioUrl(currentBroadcast) : null
            }
            title={currentBroadcast?.title || '选择一条播报记录播放'}
            broadcastId={currentBroadcast?.id}
            isSaved={currentBroadcast?.saved === 1}
            onSave={saveBroadcast}
          />
        </div>
      </main>
    </div>
  );
};

export default History;
