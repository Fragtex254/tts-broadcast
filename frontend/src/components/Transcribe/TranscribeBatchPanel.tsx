import React from 'react';
import type { BatchTranscriptionProgress } from '../../store';
import { TranscribeOptionsPanel, type TranscribeOptionsPanelProps } from './TranscribeOptionsPanel';

interface TranscribeBatchPanelProps {
  fileCount: number;
  error: string | null;
  isTranscribing: boolean;
  progress: BatchTranscriptionProgress;
  options: TranscribeOptionsPanelProps;
  onChooseFiles: () => void;
  onChooseFolder: () => void;
  onDropFiles: (files: File[]) => void;
}

export const TranscribeBatchPanel: React.FC<TranscribeBatchPanelProps> = ({
  fileCount,
  error,
  isTranscribing,
  progress,
  options,
  onChooseFiles,
  onChooseFolder,
  onDropFiles,
}) => (
  <section className="bg-white/80 backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border">
    <div className="flex items-center gap-2 mb-4">
      <span className="w-2 h-2 rounded-full bg-lilac" />
      <h3 className="font-display italic text-[14px] font-medium text-ink-soft">批量队列</h3>
    </div>

    <div
      onClick={() => {
        if (!isTranscribing) onChooseFiles();
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        if (!isTranscribing) onDropFiles(Array.from(event.dataTransfer.files));
      }}
      className="bg-white/60 rounded-2xl p-8 border border-card-border text-center cursor-pointer hover:border-ink/15 transition-colors"
    >
      <p className="font-display italic text-[18px] text-ink-soft mb-1">
        {fileCount > 0 ? `已添加 ${fileCount} 个音视频文件` : '选择多个文件或一个文件夹'}
      </p>
      <p className="font-body text-[12px] text-ink-soft/70">
        文件数量决定处理方式，不需要手动切换模式
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <span className="rounded-xl bg-lilac px-3.5 py-2 font-body text-[11px] font-medium text-ink shadow-btn">重新选择文件</span>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            if (!isTranscribing) onChooseFolder();
          }}
          className="rounded-xl border border-card-border bg-white/75 px-3.5 py-2 font-body text-[11px] font-medium text-ink-soft transition-colors hover:text-ink"
        >
          选择文件夹
        </button>
      </div>
    </div>

    <TranscribeOptionsPanel {...options} />

    {error && (
      <div className="mt-3 bg-pink/10 border border-pink/30 rounded-xl p-3 text-ink text-[12px] font-body animate-shake">
        {error}
      </div>
    )}

    {(isTranscribing || progress.phase !== 'idle') && (
      <div className="mt-4 bg-white/60 rounded-2xl p-4 border border-card-border">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="min-w-0">
            <p className="font-body text-[11px] uppercase tracking-wider text-ink-soft/60">{progress.message}</p>
            <p className="font-body text-[12px] text-ink truncate">
              {progress.currentFileName || '批量转录'}
            </p>
          </div>
          <span className="font-display italic text-[22px] text-ink">
            {Math.round(progress.percent)}%
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/70 border border-card-border">
          <div
            className="h-full rounded-full bg-lilac transition-[width] duration-normal"
            style={{ width: `${Math.min(Math.max(progress.percent, 0), 100)}%` }}
          />
        </div>
        {progress.total > 0 && (
          <p className="mt-2 font-body text-[11px] text-ink-soft/70">
            文件 {progress.currentIndex + (isTranscribing ? 1 : 0)} / {progress.total}
          </p>
        )}
      </div>
    )}
  </section>
);

export default TranscribeBatchPanel;
