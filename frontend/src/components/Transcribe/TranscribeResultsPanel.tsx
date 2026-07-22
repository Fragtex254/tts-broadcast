import React, { useState } from 'react';
import JSZip from 'jszip';
import type { BatchTranscriptionItem } from '../../store';
import {
  ACTION_BUTTON_FORMAT,
  ACTION_BUTTON_IMPORT,
  ACTION_BUTTON_NEUTRAL,
  BATCH_STATUS_DOTS,
  BATCH_STATUS_ICONS,
  BATCH_STATUS_LABELS,
  downloadTextFile,
  formatTimestamp,
  relativePathToTxtName,
  relativePathToZipEntry,
} from '../../pages/transcribeUtils';

interface TranscribeResultsPanelProps {
  items: BatchTranscriptionItem[];
  isTranscribing: boolean;
  onMergeAll: () => void;
  onOpenItem: (index: number) => void;
  onImportItem: (text: string) => void;
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export const TranscribeResultsPanel: React.FC<TranscribeResultsPanelProps> = ({
  items,
  isTranscribing,
  onMergeAll,
  onOpenItem,
  onImportItem,
}) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [isZipping, setIsZipping] = useState(false);
  const completedItems = items.filter((item) => item.status === 'completed' && item.text.trim());

  const handleCopyItem = async (index: number, text: string) => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    window.setTimeout(() => setCopiedIndex(null), 1200);
  };

  const handleDownloadItem = (item: BatchTranscriptionItem) => {
    if (!item.text.trim()) return;
    downloadTextFile(relativePathToTxtName(item.relativePath), item.text);
  };

  const handleDownloadAll = async () => {
    if (completedItems.length === 0) return;
    setIsZipping(true);
    try {
      const zip = new JSZip();
      const usedNames = new Map<string, number>();
      completedItems.forEach((item) => {
        let entry = relativePathToZipEntry(item.relativePath);
        if (usedNames.has(entry)) {
          const count = (usedNames.get(entry) ?? 0) + 1;
          usedNames.set(entry, count);
          const slashIndex = entry.lastIndexOf('/');
          const directory = slashIndex >= 0 ? entry.slice(0, slashIndex + 1) : '';
          const base = slashIndex >= 0 ? entry.slice(slashIndex + 1) : entry;
          const dotIndex = base.lastIndexOf('.');
          entry = `${directory}${dotIndex >= 0 ? base.slice(0, dotIndex) : base}_${count}${dotIndex >= 0 ? base.slice(dotIndex) : ''}`;
        } else {
          usedNames.set(entry, 1);
        }
        zip.file(entry, item.text.trim());
      });
      const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });
      downloadBlob(`批量转录_${formatTimestamp(new Date())}.zip`, blob);
    } finally {
      setIsZipping(false);
    }
  };

  return (
    <section className="bg-white/80 backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-sage" />
          <h3 className="font-display italic text-[14px] font-medium text-ink-soft">转录结果</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleDownloadAll()}
            disabled={completedItems.length === 0 || isTranscribing || isZipping}
            className="px-3 py-1.5 font-body text-[11px] text-ink-soft hover:text-ink bg-white/60 hover:bg-white/80 disabled:opacity-40 rounded-xl border border-card-border ui-transition duration-fast"
          >
            {isZipping ? '打包中...' : `下载压缩包（${completedItems.length}）`}
          </button>
          <button
            type="button"
            onClick={onMergeAll}
            disabled={completedItems.length === 0 || isTranscribing}
            className="px-3 py-1.5 font-body text-[11px] bg-sage hover:brightness-105 disabled:opacity-40 text-ink rounded-xl shadow-btn ui-transition duration-fast"
          >
            合并为临时稿（{completedItems.length}）
          </button>
        </div>
      </div>

      <p className="mb-4 rounded-xl border border-lemon/35 bg-lemon/10 p-3 font-body text-[11px] leading-relaxed text-ink-soft/75">
        “导入临时稿”会进入旧编辑流程，不会自动关联内容项目、来源或版本。需要沉淀研究成果时，请从内容项目继续。
      </p>

      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={`${item.relativePath}-${index}`} className="bg-white/60 rounded-2xl p-4 border border-card-border">
            <div className="flex items-center gap-2 mb-2">
              <p className="font-body text-[12px] text-ink truncate flex-1" title={item.relativePath}>
                {item.relativePath}
              </p>
              <span
                className="inline-flex shrink-0 items-center gap-1.5"
                role="status"
                aria-label={`转录状态：${BATCH_STATUS_LABELS[item.status]}`}
              >
                <span aria-hidden="true" className={`w-2 h-2 rounded-full ${BATCH_STATUS_DOTS[item.status]}`} />
                <span aria-hidden="true" className="font-body text-[11px] leading-none text-ink-soft">
                  {BATCH_STATUS_ICONS[item.status]}
                </span>
                <span className="font-body text-[11px] uppercase tracking-wider text-ink-soft/70">
                  {BATCH_STATUS_LABELS[item.status]}
                </span>
              </span>
            </div>

            {item.status === 'failed' && (
              <p className="font-body text-[11px] text-pink">{item.error || '转录失败'}</p>
            )}

            {(item.status === 'completed' || item.status === 'transcribing') && (
              <div className="h-32 overflow-y-auto rounded-xl border border-card-border bg-white/70 p-3">
                {item.text ? (
                  <p className="whitespace-pre-wrap font-body text-[12px] leading-[1.8] text-ink-soft/90">{item.text}</p>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <p className="font-display italic text-[13px] text-ink-soft/45">等待首个音频片段完成</p>
                    <p className="mt-1 font-body text-[11px] text-ink-soft/35">当前区域只读，完成的分片会自动追加。</p>
                  </div>
                )}
              </div>
            )}

            {item.status === 'completed' && item.text && (
              <div className="flex items-center justify-between mt-2">
                <span className="font-body text-[11px] uppercase tracking-wider text-ink-soft/70">
                  {item.text.length} 字
                </span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => void handleCopyItem(index, item.text)} className={ACTION_BUTTON_NEUTRAL}>
                    {copiedIndex === index ? '已复制' : '复制'}
                  </button>
                  <button type="button" onClick={() => handleDownloadItem(item)} className={ACTION_BUTTON_NEUTRAL}>
                    下载
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenItem(index)}
                    disabled={!item.resultId && !item.transcriptionResult?.id}
                    className={ACTION_BUTTON_FORMAT}
                  >
                    {item.transcriptionResult?.content_mode === 'podcast' ? '打开对话逐字稿' : '查看文稿'}
                  </button>
                  <button type="button" onClick={() => onImportItem(item.text)} className={ACTION_BUTTON_IMPORT}>
                    导入临时稿
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};

export default TranscribeResultsPanel;
