import React, { useState } from 'react';
import { ModalShell } from '../ModalShell';

interface TranscriptionResultModalProps {
  isOpen: boolean;
  title: string;
  text: string;
  formattedText?: string;
  canFormat: boolean;
  onClose: () => void;
  onCopy: (text: string) => Promise<void>;
  onDownload: (text: string) => void;
  onImport: (text: string) => void;
  onFormat: (text: string) => Promise<string>;
}

export const TranscriptionResultModal: React.FC<TranscriptionResultModalProps> = ({
  isOpen,
  title,
  text,
  formattedText,
  canFormat,
  onClose,
  onCopy,
  onDownload,
  onImport,
  onFormat,
}) => {
  const [draftText, setDraftText] = useState(text);
  const [draftFormattedText, setDraftFormattedText] = useState(formattedText || '');
  const [isFormatting, setIsFormatting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const primaryText = draftFormattedText.trim() || draftText.trim();

  const handleFormat = async () => {
    if (!draftText.trim() || !canFormat) return;
    setIsFormatting(true);
    setError(null);
    try {
      const nextText = await onFormat(draftText);
      setDraftFormattedText(nextText);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 排版失败');
    } finally {
      setIsFormatting(false);
    }
  };

  const handleCopy = async () => {
    if (!primaryText) return;
    await onCopy(primaryText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <ModalShell
      isOpen={isOpen}
      title="转录结果"
      subtitle={(
        <p className="font-body text-[13px] text-ink truncate" title={title}>
          {title}
        </p>
      )}
      onClose={onClose}
      size="xl"
      accent="lilac"
      ariaLabel="转录结果"
      contentClassName="p-5 space-y-4"
      footerClassName="p-5"
      footer={(
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <button
            onClick={handleFormat}
            disabled={!draftText.trim() || !canFormat || isFormatting}
            className="relative overflow-hidden bg-lilac hover:brightness-105 disabled:opacity-40 text-ink rounded-xl px-4 py-2.5 shadow-btn font-body text-[12px] font-medium uppercase tracking-wider transition-all duration-150"
          >
            {isFormatting && <span className="absolute left-0 top-0 h-full w-2/3 bg-white/20 animate-pulse" />}
            <span className="relative">{isFormatting ? '排版中...' : 'AI 排版分段'}</span>
          </button>

          <div className="flex flex-wrap justify-end gap-2">
            <button
              onClick={handleCopy}
              disabled={!primaryText}
              className="px-4 py-2 font-body text-[12px] text-ink-soft hover:text-ink disabled:opacity-40 transition-colors"
            >
              {copied ? '已复制' : '复制'}
            </button>
            <button
              onClick={() => onDownload(primaryText)}
              disabled={!primaryText}
              className="px-4 py-2 font-body text-[12px] text-ink-soft hover:text-ink disabled:opacity-40 transition-colors"
            >
              下载 TXT
            </button>
            <button
              onClick={() => onImport(primaryText)}
              disabled={!primaryText}
              className="px-4 py-2 font-body text-[12px] bg-sage hover:brightness-105 disabled:opacity-40 text-ink rounded-xl shadow-btn transition-all duration-150"
            >
              导入稿件
            </button>
          </div>
        </div>
      )}
    >
      {error && (
        <div className="bg-pink/10 border border-pink/30 rounded-xl p-3 text-ink text-[12px] font-body animate-shake">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="min-w-0">
          <div className="flex items-center justify-between mb-2">
            <span className="font-body text-[11px] uppercase tracking-wider text-ink-soft/55">原文</span>
            <span className="font-body text-[10px] uppercase tracking-wider text-ink-soft/70">{draftText.length} 字</span>
          </div>
          <textarea
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            className="w-full h-[48vh] min-h-72 bg-white/70 text-ink rounded-2xl p-4 border border-card-border focus:border-ink/20 focus:outline-none resize-none font-body text-[13px] leading-[1.9] transition-colors"
          />
        </div>

        <div className="min-w-0">
          <div className="flex items-center justify-between mb-2">
            <span className="font-body text-[11px] uppercase tracking-wider text-ink-soft/55">AI 排版</span>
            <span className="font-body text-[10px] uppercase tracking-wider text-ink-soft/70">{draftFormattedText.length} 字</span>
          </div>
          <textarea
            value={draftFormattedText}
            onChange={(e) => setDraftFormattedText(e.target.value)}
            placeholder="AI 排版结果"
            className="w-full h-[48vh] min-h-72 bg-white/70 text-ink rounded-2xl p-4 border border-card-border focus:border-ink/20 focus:outline-none resize-none font-body text-[13px] leading-[1.9] transition-colors placeholder-ink-soft/35"
          />
        </div>
      </div>
    </ModalShell>
  );
};

export default TranscriptionResultModal;
