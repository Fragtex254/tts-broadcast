import React, { useEffect, useRef } from 'react';
import { ArrowRight, Copy, DownloadSimple } from '@phosphor-icons/react';
import type { TranscriptionChunkPreview } from '../../store';
import { ModalShell } from '../ModalShell';

interface TranscriptionPreviewModalProps {
  isOpen: boolean;
  title: string;
  text: string;
  chunks: TranscriptionChunkPreview[];
  isLive: boolean;
  isCopied: boolean;
  onClose: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onImport?: () => void;
}

export const TranscriptionPreviewModal: React.FC<TranscriptionPreviewModalProps> = ({
  isOpen,
  title,
  text,
  chunks,
  isLive,
  isCopied,
  onClose,
  onCopy,
  onDownload,
  onImport,
}) => {
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!isLive || !viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
  }, [chunks, isLive, text]);

  return (
    <ModalShell
      isOpen={isOpen}
      title={isLive ? '实时逐字稿' : '转录文稿'}
      subtitle={<span className="block max-w-[680px] truncate">{title} · {isLive ? '内容持续更新，只读' : `${text.length} 字`}</span>}
      onClose={onClose}
      size="xl"
      accent="lilac"
      contentClassName="overflow-hidden p-0"
      panelClassName="h-[calc(100vh-3rem)]"
      closeOnBackdrop={false}
      ariaLabel={isLive ? '实时逐字稿' : '转录文稿'}
      footer={(
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCopy} disabled={!text.trim()} className="inline-flex items-center gap-1.5 px-4 py-2 font-body text-[11px] text-ink-soft transition-colors hover:text-ink disabled:opacity-40">
            <Copy aria-hidden="true" size={13} />{isCopied ? '已复制' : '复制'}
          </button>
          <button type="button" onClick={onDownload} disabled={!text.trim()} className="inline-flex items-center gap-1.5 rounded-xl bg-sage px-4 py-2.5 font-body text-[11px] font-medium text-ink shadow-btn ui-transition duration-fast hover:brightness-105 disabled:opacity-40">
            <DownloadSimple aria-hidden="true" size={13} />下载 TXT
          </button>
          {onImport && (
            <button type="button" onClick={onImport} disabled={!text.trim()} className="inline-flex items-center gap-1.5 rounded-xl bg-lemon px-4 py-2.5 font-body text-[11px] font-medium text-ink shadow-btn ui-transition duration-fast hover:brightness-105 disabled:opacity-40">
              导入稿件<ArrowRight aria-hidden="true" size={13} />
            </button>
          )}
        </div>
      )}
    >
      <div className="flex h-full min-h-0 flex-col bg-paper">
        <div className={`border-b border-card-border px-5 py-3 font-body text-[11px] text-ink-soft ${isLive ? 'bg-lilac/15' : 'bg-sage/15'}`}>
          <span className={`mr-2 inline-block h-2 w-2 rounded-full ${isLive ? 'bg-lilac animate-breathe' : 'bg-sage'}`} />
          {isLive ? '转录仍在进行；这里只展示已经完成的真实音频片段，当前内容不可编辑。' : '这是固定的转录结果；播客内容可从结果卡进入说话人对话视图。'}
        </div>
        <div ref={viewportRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8" aria-live={isLive ? 'polite' : 'off'}>
          <div className="mx-auto max-w-3xl space-y-3">
            {chunks.length > 0 ? chunks.map((chunk) => (
              <article key={chunk.index} className="grid gap-2 rounded-2xl border border-card-border bg-white/60 p-4 sm:grid-cols-[88px_minmax(0,1fr)]">
                <span className="font-body text-[11px] tabular-nums text-ink-soft/50">片段 {chunk.index}</span>
                <p className="whitespace-pre-wrap font-body text-[14px] leading-[1.9] text-ink-soft/90">{chunk.text}</p>
              </article>
            )) : text.trim() ? (
              <article className="rounded-2xl border border-card-border bg-white/60 p-5">
                <p className="whitespace-pre-wrap font-body text-[14px] leading-[1.95] text-ink-soft/90">{text}</p>
              </article>
            ) : (
              <div className="p-12 text-center animate-fade-in">
                <p className="font-display italic text-[16px] text-ink-soft/40">等待首个音频片段完成</p>
                <p className="mt-1 font-body text-[11px] text-ink-soft/35">这里不会显示尚未稳定的模型内部 token。</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalShell>
  );
};

export default TranscriptionPreviewModal;
