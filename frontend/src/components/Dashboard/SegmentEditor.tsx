import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useStore } from '../../store';
import type { Segment } from '../../store';

// ============ 子组件：StatusBadge ============

interface StatusBadgeProps {
  status: Segment['status'];
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  switch (status) {
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-600 text-gray-300">
          <span>⏳</span> 待生成
        </span>
      );
    case 'generating':
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-600/30 text-blue-400">
          <svg
            className="animate-spin h-3 w-3"
            xmlns="http://www.w3.org/2000/svg"
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
          生成中
        </span>
      );
    case 'generated':
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-600/30 text-green-400">
          <span>✅</span> 已生成
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-600/30 text-red-400">
          <span>❌</span> 失败
        </span>
      );
    default:
      return null;
  }
};

// ============ 子组件：SegmentAudio ============

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

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const formatTime = (seconds: number): string => {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-2">
      <audio ref={audioRef} src={audioUrl} preload="metadata" />
      <button
        onClick={togglePlay}
        className="w-7 h-7 bg-blue-600 hover:bg-blue-700 rounded-full flex items-center justify-center transition-colors flex-shrink-0"
      >
        {isPlaying ? (
          <svg
            className="w-3.5 h-3.5 text-white"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
          </svg>
        ) : (
          <svg
            className="w-3.5 h-3.5 text-white ml-0.5"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>
      <span className="text-xs text-gray-400">{formatTime(duration)}</span>
    </div>
  );
};

// ============ 主组件：SegmentEditor ============

interface SegmentEditorProps {
  broadcastId: number;
  onMerged?: () => void;
}

export const SegmentEditor: React.FC<SegmentEditorProps> = ({
  broadcastId,
  onMerged,
}) => {
  const {
    segments,
    isSplitting,
    isMerging,
    fetchSegments,
    updateSegmentText,
    regenerateSegment,
    batchGenerateSegments,
    deleteSegment,
    mergeSegments,
  } = useStore();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSegments(broadcastId).catch(() => {
      setError('加载句子列表失败');
    });
  }, [broadcastId, fetchSegments]);

  // 没有 segments 且不在 splitting 时返回 null
  if (!segments.length && !isSplitting) {
    return null;
  }

  const hasPendingOrFailed = segments.some(
    (s) => s.status === 'pending' || s.status === 'failed'
  );
  const allGenerated = segments.length > 0 && segments.every((s) => s.status === 'generated');

  // 编辑相关
  const handleStartEdit = (seg: Segment) => {
    setEditingId(seg.id);
    setEditText(seg.text);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  const handleSaveEdit = async (segId: number) => {
    if (!editText.trim()) return;
    setError(null);
    try {
      await updateSegmentText(broadcastId, segId, editText.trim());
      setEditingId(null);
      setEditText('');
    } catch {
      setError('保存编辑失败，请重试');
    }
  };

  // 重新生成单个句子
  const handleRegenerate = async (segId: number) => {
    setError(null);
    try {
      await regenerateSegment(broadcastId, segId);
    } catch {
      setError('重新生成失败，请重试');
    }
  };

  // 删除句子
  const handleDelete = async (segId: number) => {
    setError(null);
    try {
      await deleteSegment(broadcastId, segId);
    } catch {
      setError('删除失败，请重试');
    }
  };

  // 批量生成
  const handleBatchGenerate = async () => {
    setError(null);
    try {
      await batchGenerateSegments(broadcastId);
    } catch {
      setError('批量生成失败，请重试');
    }
  };

  // 合并
  const handleMerge = async () => {
    setError(null);
    try {
      await mergeSegments(broadcastId);
      onMerged?.();
    } catch {
      setError('合并失败，请重试');
    }
  };

  // splitting 加载态
  if (isSplitting) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-center gap-3 py-8">
          <svg
            className="animate-spin h-5 w-5 text-blue-400"
            xmlns="http://www.w3.org/2000/svg"
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
          <span className="text-gray-300">正在切分句子...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-white mb-4">逐句编辑</h3>

      {/* Segment 列表 */}
      <div className="space-y-3 mb-4">
        {segments.map((seg) => (
          <div
            key={seg.id}
            className="bg-gray-700 rounded-lg p-4 border border-gray-600"
          >
            {/* 顶部行：序号 + 状态 + 操作按钮 */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 font-mono">
                  #{seg.index + 1}
                </span>
                <StatusBadge status={seg.status} />
              </div>

              <div className="flex items-center gap-1">
                {/* 编辑按钮 */}
                <button
                  onClick={() => handleStartEdit(seg)}
                  disabled={seg.status === 'generating' || editingId === seg.id}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title="编辑"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </button>

                {/* 重新生成按钮 */}
                <button
                  onClick={() => handleRegenerate(seg.id)}
                  disabled={seg.status === 'generating'}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-blue-400 hover:bg-gray-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title="重新生成"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                </button>

                {/* 删除按钮 */}
                <button
                  onClick={() => handleDelete(seg.id)}
                  disabled={seg.status === 'generating'}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-gray-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title="删除"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {/* 文本内容 / 编辑模式 */}
            {editingId === seg.id ? (
              <div>
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="w-full h-20 bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-500 focus:border-blue-500 focus:outline-none resize-none text-sm"
                  autoFocus
                />
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => handleSaveEdit(seg.id)}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
                  >
                    保存
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-gray-300 text-sm rounded-lg transition-colors"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-200 leading-relaxed">{seg.text}</p>
            )}

            {/* 音频播放器（已生成时显示） */}
            {seg.status === 'generated' && seg.audio_path && (
              <div className="mt-2 pt-2 border-t border-gray-600">
                <SegmentAudio audioUrl={seg.audio_path} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mb-4 bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* 底部操作栏 */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleBatchGenerate}
          disabled={!hasPendingOrFailed}
          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded-lg px-4 py-2.5 transition-colors text-sm"
        >
          全部生成
        </button>
        <button
          onClick={handleMerge}
          disabled={!allGenerated || isMerging}
          className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded-lg px-4 py-2.5 transition-colors flex items-center justify-center gap-2 text-sm"
        >
          {isMerging ? (
            <>
              <svg
                className="animate-spin h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
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
              合并中...
            </>
          ) : (
            '合并为完整音频'
          )}
        </button>
      </div>
    </div>
  );
};

export default SegmentEditor;
