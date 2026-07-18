import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowSquareOut, CheckCircle, Copy, DownloadSimple, Radio } from '@phosphor-icons/react';
import type { TranscriptionChunkPreview, TranscriptionProgress } from '../../store';

const CARD_PREVIEW_CHUNK_COUNT = 5;

interface LiveTranscriptionPreviewProps {
  text: string;
  chunks: TranscriptionChunkPreview[];
  progress: TranscriptionProgress;
  isTranscribing: boolean;
  isPodcast: boolean;
  isCopied: boolean;
  isOpening: boolean;
  onOpen: () => void;
  onCopy: () => void;
  onDownload: () => void;
}

export const LiveTranscriptionPreview: React.FC<LiveTranscriptionPreviewProps> = ({
  text,
  chunks,
  progress,
  isTranscribing,
  isPodcast,
  isCopied,
  isOpening,
  onOpen,
  onCopy,
  onDownload,
}) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [isAutoFollowing, setIsAutoFollowing] = useState(true);
  const visibleChunks = useMemo(() => chunks.slice(-CARD_PREVIEW_CHUNK_COUNT), [chunks]);
  const hasText = text.trim().length > 0;
  const isCompleted = progress.phase === 'completed' && !isTranscribing;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !isAutoFollowing) return;
    viewport.scrollTop = viewport.scrollHeight;
  }, [isAutoFollowing, text, chunks]);

  const handleScroll = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const distanceToBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    setIsAutoFollowing(distanceToBottom < 28);
  };

  const statusLabel = isCompleted ? '已完成' : isTranscribing ? '实时更新' : '等待转录';
  const openLabel = isTranscribing
    ? '展开实时逐字稿'
    : isPodcast
      ? '打开对话逐字稿'
      : '打开文稿';

  return (
    <section
      className="bg-white/80 backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border"

      aria-label="实时转录预览"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${isCompleted ? 'bg-sage' : isTranscribing ? 'bg-lilac animate-breathe' : 'bg-ink/15'}`} />
          <div>
            <h3 className="font-display italic text-[14px] font-medium text-ink-soft">
              {isCompleted ? '转录文稿' : '实时转录预览'}
            </h3>
            <p className="mt-0.5 font-body text-[11px] text-ink-soft/55">
              {isCompleted ? '结果已固定，可进入逐字稿阅读' : '只读预览；完成的音频片段会逐段追加'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasText && <span className="font-body text-[11px] uppercase tracking-wider text-ink-soft/60">{text.length} 字</span>}
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-body text-[11px] font-medium uppercase tracking-wider text-ink ${isCompleted ? 'bg-sage/35' : isTranscribing ? 'bg-lilac/30' : 'bg-ink/5'}`}>
            {isCompleted ? <CheckCircle aria-hidden="true" size={11} weight="fill" /> : <Radio aria-hidden="true" size={11} weight="fill" />}
            {statusLabel}
          </span>
        </div>
      </div>

      <div
        ref={viewportRef}
        onScroll={handleScroll}
        className="h-64 overflow-y-auto rounded-2xl border border-card-border bg-white/60 p-4"
        aria-live="polite"
        aria-atomic="false"
      >
        {visibleChunks.length > 0 ? (
          <div className="space-y-3">
            {visibleChunks.map((chunk) => (
              <article key={chunk.index} className="grid gap-2 border-b border-card-border pb-3 last:border-0 last:pb-0 sm:grid-cols-[80px_minmax(0,1fr)]">
                <span className="font-body text-[11px] tabular-nums text-ink-soft/50">片段 {chunk.index}</span>
                <p className="whitespace-pre-wrap font-body text-[13px] leading-[1.85] text-ink-soft/90">{chunk.text}</p>
              </article>
            ))}
          </div>
        ) : hasText ? (
          <p className="whitespace-pre-wrap font-body text-[13px] leading-[1.9] text-ink-soft/90">{text}</p>
        ) : isTranscribing ? (
          <div className="space-y-4 py-3">
            <div className="space-y-2 animate-pulse" aria-hidden="true">
              <div className="h-3 w-3/4 rounded bg-ink/5" />
              <div className="h-3 w-full rounded bg-ink/5" />
              <div className="h-3 w-2/3 rounded bg-ink/5" />
            </div>
            <div className="text-center">
              <p className="font-display italic text-[14px] text-ink-soft/50">等待首个音频片段完成</p>
              <p className="mt-1 font-body text-[11px] leading-relaxed text-ink-soft/45">单次长上下文推理没有真实分片时，只展示阶段进度，不生成伪实时文字。</p>
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="font-display italic text-[15px] text-ink-soft/40">尚未开始转录</p>
            <p className="mt-1 font-body text-[11px] text-ink-soft/35">开始后，这里会显示已经完成的音频片段。</p>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-body text-[11px] text-ink-soft/50">
          {chunks.length > CARD_PREVIEW_CHUNK_COUNT && <span>显示最近 {CARD_PREVIEW_CHUNK_COUNT} / {chunks.length} 个片段</span>}
          {isTranscribing && hasText && <span>{isAutoFollowing ? '自动跟随最新内容' : '已暂停自动跟随'}</span>}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCopy} disabled={!hasText} className="inline-flex items-center gap-1.5 px-3 py-2 font-body text-[11px] text-ink-soft transition-colors hover:text-ink disabled:opacity-40">
            <Copy aria-hidden="true" size={13} />{isCopied ? '已复制' : '复制'}
          </button>
          <button type="button" onClick={onDownload} disabled={!hasText} className="inline-flex items-center gap-1.5 px-3 py-2 font-body text-[11px] text-ink-soft transition-colors hover:text-ink disabled:opacity-40">
            <DownloadSimple aria-hidden="true" size={13} />下载 TXT
          </button>
          <button type="button" onClick={onOpen} disabled={(!hasText && !isTranscribing) || isOpening} className="inline-flex items-center gap-1.5 rounded-xl bg-lilac px-4 py-2.5 font-body text-[11px] font-medium text-ink shadow-btn ui-transition duration-fast hover:brightness-105 active:translate-y-0 disabled:opacity-40">
            <ArrowSquareOut aria-hidden="true" size={14} />{isOpening ? '正在打开…' : openLabel}
          </button>
        </div>
      </div>
    </section>
  );
};

export default LiveTranscriptionPreview;
