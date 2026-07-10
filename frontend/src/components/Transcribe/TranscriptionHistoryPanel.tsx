import React from 'react';
import type { TranscriptionRecord } from '../../store';

interface TranscriptionHistoryPanelProps {
  records: TranscriptionRecord[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpen: (record: TranscriptionRecord) => void;
  onDownload: (record: TranscriptionRecord) => void;
  onImport: (record: TranscriptionRecord) => void;
  onDelete: (record: TranscriptionRecord) => void;
}

const ACTION_BUTTON_NEUTRAL = 'px-3 py-1.5 font-body text-[11px] text-ink-soft hover:text-ink bg-white/70 hover:bg-white/90 disabled:opacity-40 rounded-lg border border-card-border transition-all duration-150';
const ACTION_BUTTON_FORMAT = 'px-3 py-1.5 font-body text-[11px] bg-lilac hover:brightness-105 disabled:opacity-40 text-ink rounded-lg transition-all duration-150';
const ACTION_BUTTON_IMPORT = 'px-3 py-1.5 font-body text-[11px] bg-lemon hover:brightness-105 disabled:opacity-40 text-ink rounded-lg transition-all duration-150';
const ACTION_BUTTON_DANGER = 'px-3 py-1.5 font-body text-[11px] text-ink-soft hover:text-pink bg-white/70 hover:bg-white/90 rounded-lg border border-card-border transition-all duration-150';

function formatRecordDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function previewText(record: TranscriptionRecord): string {
  return (record.formatted_text || record.text).replace(/\s+/g, ' ').trim();
}

function preferredText(record: TranscriptionRecord): string {
  return record.formatted_text.trim() || record.text.trim();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDuration(seconds: number): string {
  const totalSeconds = Math.max(0, Math.round(seconds));
  if (totalSeconds < 60) return `${totalSeconds} 秒`;
  const minutes = Math.floor(totalSeconds / 60);
  const restSeconds = totalSeconds % 60;
  if (minutes < 60) return restSeconds > 0 ? `${minutes} 分 ${restSeconds} 秒` : `${minutes} 分`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes > 0 ? `${hours} 小时 ${restMinutes} 分` : `${hours} 小时`;
}

function formatRecordStats(record: TranscriptionRecord, textLength: number): string {
  const parts = [`${textLength} 字`];
  if (record.file_size_bytes > 0) parts.push(formatBytes(record.file_size_bytes));
  if (record.audio_duration_seconds > 0) parts.push(formatDuration(record.audio_duration_seconds));
  if (record.processing_seconds > 0) {
    parts.push(`${record.processing_seconds.toLocaleString('zh-CN', { maximumFractionDigits: 1 })} 秒`);
  }
  return parts.join(' · ');
}

export const TranscriptionHistoryPanel: React.FC<TranscriptionHistoryPanelProps> = ({
  records,
  isLoading,
  error,
  onRefresh,
  onOpen,
  onDownload,
  onImport,
  onDelete,
}) => {
  return (
    <section
      className="bg-white/80 backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border"
      style={{ animation: 'fade-in-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.12s both' }}
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-blush" />
          <h3 className="font-display italic text-[14px] font-medium text-ink-soft">转录文稿</h3>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="px-3 py-1.5 font-body text-[11px] text-ink-soft hover:text-ink bg-white/60 hover:bg-white/80 disabled:opacity-40 rounded-xl border border-card-border transition-all duration-150"
        >
          {isLoading ? '刷新中...' : '刷新'}
        </button>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white/60 rounded-2xl p-4 border border-card-border animate-pulse">
              <div className="h-3 bg-ink/5 rounded w-3/4 mb-3" />
              <div className="h-2 bg-ink/5 rounded w-full mb-2" />
              <div className="h-2 bg-ink/5 rounded w-2/3" />
            </div>
          ))}
        </div>
      )}

      {error && !isLoading && (
        <div className="bg-pink/10 border border-pink/30 rounded-xl p-3 text-ink text-[12px] font-body animate-shake">
          {error}
        </div>
      )}

      {!isLoading && !error && records.length === 0 && (
        <div className="p-8 text-center animate-fade-in">
          <p className="font-display italic text-[16px] text-ink-soft/70 mb-1">暂无转录文稿</p>
          <p className="font-body text-[12px] text-ink-soft/30">完成转录后会自动保存到这里</p>
        </div>
      )}

      {!isLoading && !error && records.length > 0 && (
        <div className="space-y-3">
          {records.map((record, index) => {
            const text = preferredText(record);
            const preview = previewText(record);
            return (
              <article
                key={record.id}
                className="bg-white/60 rounded-2xl p-4 border border-card-border"
                style={{ animation: `fade-in-up 0.3s cubic-bezier(0.22, 1, 0.36, 1) ${index * 0.03}s both` }}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <p className="font-body text-[12px] font-medium text-ink truncate" title={record.relative_path || record.file_name}>
                      {record.relative_path || record.file_name}
                    </p>
                    <p className="font-body text-[10px] uppercase tracking-wider text-ink-soft/70 mt-1">
                      {formatRecordDate(record.created_at)} · {record.provider || 'unknown'} · {record.model || 'default'}
                    </p>
                  </div>
                  {record.formatted_text.trim() && (
                    <span className="shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-[9px] font-body font-medium uppercase tracking-wider bg-sage/25 text-ink">
                      已排版
                    </span>
                  )}
                </div>

                <p className="font-body text-[12px] leading-[1.8] text-ink-soft/75 line-clamp-3">
                  {preview || '空文本'}
                </p>

                <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
                  <span className="font-body text-[10px] uppercase tracking-wider text-ink-soft/70">
                    {formatRecordStats(record, text.length)}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onOpen(record)}
                      className={ACTION_BUTTON_FORMAT}
                    >
                      查看 / 排版
                    </button>
                    <button
                      type="button"
                      onClick={() => onDownload(record)}
                      disabled={!text}
                      className={ACTION_BUTTON_NEUTRAL}
                    >
                      下载
                    </button>
                    <button
                      type="button"
                      onClick={() => onImport(record)}
                      disabled={!text}
                      className={ACTION_BUTTON_IMPORT}
                    >
                      导入
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(record)}
                      className={ACTION_BUTTON_DANGER}
                    >
                      删除
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default TranscriptionHistoryPanel;
