import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useStore } from '../../store';
import type { Segment } from '../../store';

// ============ StatusBadge ============

interface StatusBadgeProps {
  status: Segment['status'];
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const styles: Record<string, string> = {
    pending: 'bg-lemon/25 text-ink',
    generating: 'bg-lilac/25 text-ink',
    generated: 'bg-sage/30 text-ink',
    failed: 'bg-pink/20 text-ink',
  };
  const labels: Record<string, string> = {
    pending: '◌ 等待中',
    generating: '⟳ 生成中',
    generated: '✓ 就绪',
    failed: '✕ 失败',
  };
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] px-2.5 py-1 rounded-full font-body font-medium uppercase tracking-wider ${styles[status] || ''}`}>
      {labels[status] || status}
    </span>
  );
};

// ============ SegmentAudio ============

interface SegmentAudioProps {
  audioUrl: string;
}

const SegmentAudio: React.FC<SegmentAudioProps> = ({ audioUrl }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [audioUrl]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) { audio.pause(); } else { audio.play(); }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const formatTime = (s: number) => {
    if (isNaN(s)) return '0:00';
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-2">
      <audio ref={audioRef} src={audioUrl} preload="metadata" />
      <button
        onClick={togglePlay}
        className="w-7 h-7 bg-pink/25 hover:bg-pink/35 rounded-full flex items-center justify-center transition-colors flex-shrink-0 border border-card-border"
      >
        {isPlaying ? (
          <svg className="w-3 h-3 text-ink" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
        ) : (
          <svg className="w-3 h-3 text-ink ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
        )}
      </button>
      <span className="font-body text-[10px] text-ink-soft/50">{formatTime(duration)}</span>
    </div>
  );
};

// ============ 主组件 ============

interface SegmentEditorProps {
  broadcastId: number;
  onMerged?: () => void;
}

export const SegmentEditor: React.FC<SegmentEditorProps> = ({ broadcastId, onMerged }) => {
  const {
    segments, isSplitting, isMerging,
    fetchSegments, updateSegmentText, regenerateSegment,
    batchGenerateSegments, deleteSegment, mergeSegments,
  } = useStore();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSegments(broadcastId).catch(() => setError('加载句子列表失败'));
  }, [broadcastId, fetchSegments]);

  if (!segments.length && !isSplitting) return null;

  const hasPendingOrFailed = segments.some((s) => s.status === 'pending' || s.status === 'failed');
  const allGenerated = segments.length > 0 && segments.every((s) => s.status === 'generated');

  const handleStartEdit = (seg: Segment) => { setEditingId(seg.id); setEditText(seg.text); };
  const handleCancelEdit = () => { setEditingId(null); setEditText(''); };
  const handleSaveEdit = async (segId: number) => {
    if (!editText.trim()) return;
    setError(null);
    try { await updateSegmentText(broadcastId, segId, editText.trim()); setEditingId(null); setEditText(''); }
    catch { setError('保存编辑失败'); }
  };
  const handleRegenerate = async (segId: number) => { setError(null); try { await regenerateSegment(broadcastId, segId); } catch { setError('重新生成失败'); } };
  const handleDelete = async (segId: number) => { setError(null); try { await deleteSegment(broadcastId, segId); } catch { setError('删除失败'); } };
  const handleBatchGenerate = async () => { setError(null); try { await batchGenerateSegments(broadcastId); } catch { setError('批量生成失败'); } };
  const handleMerge = async () => { setError(null); try { await mergeSegments(broadcastId); onMerged?.(); } catch { setError('合并失败'); } };

  if (isSplitting) {
    return (
      <div className="bg-white/[0.55] backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border">
        <div className="flex items-center justify-center gap-3 py-8">
          <div className="w-4 h-1 bg-ink/10 rounded-full overflow-hidden">
            <div className="h-full bg-lilac rounded-full animate-pulse" style={{ width: '60%' }} />
          </div>
          <span className="font-body text-[12px] text-ink-soft">正在切分句子...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/[0.55] backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border" style={{ animation: 'fade-in-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.12s both' }}>
      <div className="flex items-center gap-2 mb-4">
        <span className="w-2 h-2 rounded-full bg-lilac" />
        <h3 className="font-display italic text-[14px] font-medium text-ink-soft">段落编辑器</h3>
      </div>

      <div className="space-y-2 mb-4">
        {segments.map((seg, index) => (
          <div
            key={seg.id}
            className="bg-white/45 rounded-2xl p-3 border border-card-border flex items-center gap-3"
            style={{ animation: `fade-in-up 0.3s cubic-bezier(0.22, 1, 0.36, 1) ${index * 0.05}s both` }}
          >
            <span className="font-display italic text-[18px] font-medium text-lilac min-w-[22px]">
              {String(seg.index + 1).padStart(2, '0')}
            </span>

            <div className="flex-1 min-w-0">
              {editingId === seg.id ? (
                <div className="animate-fade-in">
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="w-full h-16 bg-white/60 text-ink rounded-xl px-3 py-2 border border-ink/15 focus:border-ink/25 focus:outline-none resize-none font-body text-[12px]"
                    autoFocus
                  />
                  <div className="flex gap-2 mt-1.5">
                    <button onClick={() => handleSaveEdit(seg.id)} className="px-3 py-1 bg-sage text-ink text-[11px] font-body rounded-lg shadow-btn">保存</button>
                    <button onClick={handleCancelEdit} className="px-3 py-1 text-ink-soft text-[11px] font-body">取消</button>
                  </div>
                </div>
              ) : (
                <p className="font-body text-[12px] text-ink leading-relaxed truncate">{seg.text}</p>
              )}
            </div>

            <StatusBadge status={seg.status} />

            <div className="flex items-center gap-0.5">
              <button onClick={() => handleStartEdit(seg)} disabled={seg.status === 'generating' || editingId === seg.id} className="p-1.5 rounded-lg text-ink-soft/40 hover:text-ink hover:bg-white/50 transition-colors disabled:opacity-30" title="编辑">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              </button>
              <button onClick={() => handleRegenerate(seg.id)} disabled={seg.status === 'generating'} className="p-1.5 rounded-lg text-ink-soft/40 hover:text-ink hover:bg-white/50 transition-colors disabled:opacity-30" title="重新生成">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              </button>
              <button onClick={() => handleDelete(seg.id)} disabled={seg.status === 'generating'} className="p-1.5 rounded-lg text-ink-soft/40 hover:text-pink hover:bg-white/50 transition-colors disabled:opacity-30" title="删除">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-3 bg-pink/10 border border-pink/30 rounded-xl p-3 text-ink text-[12px] font-body animate-shake">{error}</div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={handleBatchGenerate}
          disabled={!hasPendingOrFailed}
          className="flex-1 bg-sage hover:brightness-105 disabled:opacity-40 text-ink font-body font-medium text-[12px] rounded-xl px-4 py-2.5 shadow-btn transition-all duration-150 uppercase tracking-wider"
        >
          全部生成
        </button>
        <button
          onClick={handleMerge}
          disabled={!allGenerated || isMerging}
          className="flex-1 bg-lilac hover:brightness-105 disabled:opacity-40 text-ink font-body font-medium text-[12px] rounded-xl px-4 py-2.5 shadow-btn transition-all duration-150 uppercase tracking-wider flex items-center justify-center gap-2"
        >
          {isMerging ? (
            <>
              <div className="w-3 h-1 bg-ink/20 rounded-full overflow-hidden"><div className="h-full bg-ink/50 rounded-full animate-pulse" style={{ width: '60%' }} /></div>
              合并中...
            </>
          ) : '合并音频'}
        </button>
      </div>
    </div>
  );
};

export default SegmentEditor;
