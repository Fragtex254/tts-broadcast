import React from 'react';
import type { TranscriptionStats } from '../../store';
import { formatBytes, formatDuration, formatInteger, formatSeconds } from '../../pages/transcribeUtils';

interface TranscriptionStatsCenterProps {
  stats: TranscriptionStats;
  isLoading: boolean;
  onRefresh: () => void;
}

export const TranscriptionStatsCenter: React.FC<TranscriptionStatsCenterProps> = ({
  stats,
  isLoading,
  onRefresh,
}) => {
  const items = [
    { label: '文件总量', value: formatBytes(stats.total_file_size_bytes) },
    { label: '音频总时长', value: formatDuration(stats.total_audio_duration_seconds) },
    { label: '累计字数', value: `${formatInteger(stats.total_text_chars)} 字` },
    { label: 'GPU 累计耗时', value: `${formatSeconds(stats.total_processing_seconds)} 秒` },
  ];

  return (
    <section className="bg-white/80 backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blush" />
          <h3 className="font-display italic text-[14px] font-medium text-ink-soft">转录统计中心</h3>
          <span className="px-2 py-1 rounded-full bg-white/70 border border-card-border font-body text-[11px] text-ink-soft">
            {formatInteger(stats.total_count)} 条记录
          </span>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="px-3 py-1.5 font-body text-[11px] text-ink-soft hover:text-ink bg-white/70 hover:bg-white/90 disabled:opacity-40 rounded-xl border border-card-border ui-transition duration-fast"
        >
          {isLoading ? '刷新中...' : '刷新'}
        </button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {items.map((item) => (
          <div key={item.label} className="bg-white/65 rounded-2xl border border-card-border p-3 min-h-20">
            <p className="font-body text-[11px] uppercase tracking-wider text-ink-soft/70 mb-2">
              {item.label}
            </p>
            <p className="font-display italic text-[20px] leading-tight text-ink break-words">
              {item.value}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
};

export default TranscriptionStatsCenter;
