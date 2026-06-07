import React, { useEffect, useState } from 'react';
import { Header } from '../components/Layout/Header';
import { AudioPlayer } from '../components/Dashboard/AudioPlayer';
import useStore from '../store';
import type { Broadcast } from '../store';

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
  const { broadcasts, fetchBroadcasts, currentBroadcast, setCurrentBroadcast, saveBroadcast } = useStore();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const loadBroadcasts = async (pageNum: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchBroadcasts({ page: pageNum, limit });
      setTotal(result.pagination.total);
    } catch (err) {
      setError('加载播报历史失败，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadBroadcasts(page); }, [page]);

  const handleSelectBroadcast = (broadcast: Broadcast) => setCurrentBroadcast(broadcast);
  const getAudioUrl = (broadcast: Broadcast): string | null => broadcast.audio_path ? `/api/broadcast/${broadcast.id}/audio` : null;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header title="播报历史" subtitle={`共 ${total} 条播报记录`} />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="bg-white/[0.55] backdrop-blur-sm rounded-card shadow-card border border-card-border overflow-hidden">
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
                <p className="font-display italic text-[16px] text-ink-soft/40 mb-1">暂无播报记录</p>
                <p className="font-body text-[12px] text-ink-soft/30">前往控制台生成第一条播报</p>
              </div>
            )}

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
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="font-body text-[11px] text-ink-soft/50 uppercase tracking-wider">第 {page} / {totalPages} 页，共 {total} 条</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-4 py-1.5 font-body text-[12px] bg-white/50 text-ink-soft rounded-full border border-card-border hover:bg-white/70 disabled:opacity-40 transition-colors">上一页</button>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-4 py-1.5 font-body text-[12px] bg-white/50 text-ink-soft rounded-full border border-card-border hover:bg-white/70 disabled:opacity-40 transition-colors">下一页</button>
              </div>
            </div>
          )}

          {currentBroadcast?.content && (
            <div className="bg-white/[0.55] backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border animate-fade-in">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-pink" />
                <h3 className="font-display italic text-[14px] font-medium text-ink-soft">口播稿预览</h3>
                <span className="font-body text-[10px] uppercase tracking-wider text-ink-soft/40 ml-auto">
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
    </div>
  );
};

export default History;
