import React from 'react';
import { ActionButton } from '../ui/ActionButton';
import { WorkbenchCard } from '../ui/WorkbenchCard';
import type { TranscriptionRecord } from '../../store';
import { formatAsrSource } from '../../pages/transcribeUtils';

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
    <WorkbenchCard className="p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-blush" />
            <h2 className="font-display text-[18px] font-medium text-ink">转录与播客内容</h2>
          </div>
          <p className="mt-1.5 font-body text-[12px] leading-relaxed text-ink-soft/70">
            {records.length > 0 ? `当前显示 ${records.length} 条，打开后可阅读、整理或继续写作。` : '音视频转成的文字会按时间保存在这里。'}
          </p>
        </div>
        <ActionButton
          tone="secondary"
          size="sm"
          onClick={onRefresh}
          disabled={isLoading}
          isLoading={isLoading}
          loadingLabel="刷新中"
          className="shrink-0"
        >
          刷新
        </ActionButton>
      </div>

      {isLoading && (
        <div className="divide-y divide-card-border">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse space-y-2 py-4 first:pt-0 last:pb-0">
              <div className="h-4 w-3/5 rounded bg-ink/5" />
              <div className="h-3 w-2/5 rounded bg-ink/5" />
              <div className="h-3 w-full rounded bg-ink/5" />
            </div>
          ))}
        </div>
      )}

      {error && !isLoading && (
        <div className="rounded-xl border border-pink/30 bg-pink/10 p-4 font-body text-[12px] text-ink animate-shake">
          <p>{error}</p>
          <ActionButton tone="secondary" size="sm" onClick={onRefresh} className="mt-3">
            重新加载
          </ActionButton>
        </div>
      )}

      {!isLoading && !error && records.length === 0 && (
        <div className="rounded-2xl border border-dashed border-card-border bg-white/35 p-8 text-center">
          <p className="font-display text-[18px] font-medium text-ink">还没有转录内容</p>
          <p className="mx-auto mt-2 max-w-md font-body text-[13px] leading-relaxed text-ink-soft/70">
            完成音视频转录后，文字会自动保存到内容库；如果刚完成任务，可以重新检查一次。
          </p>
          <ActionButton tone="secondary" onClick={onRefresh} className="mt-4">
            重新检查内容库
          </ActionButton>
        </div>
      )}

      {!isLoading && !error && records.length > 0 && (
        <div className="divide-y divide-card-border">
          {records.map((record) => {
            const text = preferredText(record);
            const preview = previewText(record);
            return (
              <article
                key={record.id}
                className="py-4 first:pt-0 last:pb-0"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="break-words font-display text-[16px] font-medium leading-snug text-ink [overflow-wrap:anywhere]" title={record.relative_path || record.file_name}>
                      {record.relative_path || record.file_name}
                    </h3>
                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 font-body text-[11px] text-ink-soft/70 [overflow-wrap:anywhere]">
                      {record.content_mode === 'podcast' && <span className="inline-flex items-center rounded-full bg-lilac/30 px-2.5 py-1 font-medium text-ink">播客内容</span>}
                      {record.summary_status === 'completed' && <span className="inline-flex items-center rounded-full bg-sage/30 px-2.5 py-1 font-medium text-ink">摘要就绪</span>}
                      {record.summary_status === 'running' || record.summary_status === 'queued' ? <span className="inline-flex items-center rounded-full bg-lemon/30 px-2.5 py-1 font-medium text-ink">正在总结</span> : null}
                      {record.formatted_text.trim() && <span className="inline-flex items-center rounded-full bg-sage/25 px-2.5 py-1 font-medium text-ink">已整理排版</span>}
                      <span>{formatAsrSource(record)}</span>
                      <span>{formatRecordDate(record.created_at)}</span>
                      <span>{record.model || '默认模型'}</span>
                    </div>
                  </div>
                </div>

                <p className="mt-3 line-clamp-3 max-w-4xl break-words font-body text-[14px] leading-[1.85] text-ink-soft/80 [overflow-wrap:anywhere] sm:line-clamp-2">
                  {preview || '空文本'}
                </p>

                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-body text-[11px] text-ink-soft/70">
                    {formatRecordStats(record, text.length)}
                  </span>
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                    <ActionButton
                      tone="edit"
                      size="sm"
                      onClick={() => onOpen(record)}
                      className="col-span-2 sm:col-auto"
                    >
                      {record.content_mode === 'podcast' && record.structure_status === 'ready' ? '打开播客工作区' : '阅读与整理'}
                    </ActionButton>
                    <ActionButton
                      tone="primary"
                      size="sm"
                      onClick={() => onImport(record)}
                      disabled={!text}
                    >
                      导入写作
                    </ActionButton>
                    <ActionButton
                      tone="secondary"
                      size="sm"
                      onClick={() => onDownload(record)}
                      disabled={!text}
                    >
                      下载文本
                    </ActionButton>
                    <ActionButton
                      tone="ghost"
                      size="sm"
                      onClick={() => onDelete(record)}
                      className="hover:text-pink"
                    >
                      删除
                    </ActionButton>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </WorkbenchCard>
  );
};

export default TranscriptionHistoryPanel;
