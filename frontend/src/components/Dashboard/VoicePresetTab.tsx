import React, { useEffect, useState } from 'react';
import { useStore, type VoicePreset } from '../../store';

// ============ 接口定义 ============

interface VoicePresetTabProps {
  onApplyPreset: (preset: VoicePreset) => void;
}

// ============ 子组件 ============

const TYPE_TAG_STYLES: Record<VoicePreset['type'], string> = {
  clone: 'bg-blush/40 text-ink',
  design: 'bg-lilac/40 text-ink',
};

const TYPE_TAG_LABELS: Record<VoicePreset['type'], string> = {
  clone: '克隆',
  design: '设计',
};

// ============ 主组件 ============

export const VoicePresetTab: React.FC<VoicePresetTabProps> = ({ onApplyPreset }) => {
  const { presets, fetchPresets, deletePreset } = useStore();
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

  const handleTogglePlay = (preset: VoicePreset) => {
    if (!preset.trial_audio_path) return;
    setPlayingId((prev) => (prev === preset.id ? null : preset.id));
  };

  const handleDelete = async (id: number) => {
    if (confirmDeleteId === id) {
      // 二次确认后执行删除
      try {
        await deletePreset(id);
        setConfirmDeleteId(null);
        if (playingId === id) {
          setPlayingId(null);
        }
      } catch {
        // 错误已在 store 中处理
      }
    } else {
      // 第一次点击，进入确认态
      setConfirmDeleteId(id);
    }
  };

  const handleCancelDelete = () => {
    setConfirmDeleteId(null);
  };

  const truncateText = (text: string, maxLength: number = 30) => {
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength)}...`;
  };

  // 空状态
  if (presets.length === 0) {
    return (
      <div className="p-12 text-center animate-fade-in">
        <p className="font-display italic text-[16px] text-ink-soft/40 mb-1">暂无保存的预设</p>
        <p className="font-body text-[12px] text-ink-soft/30">使用克隆或设计面板创建并保存音色预设</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 animate-fade-in">
      {/* 标题统计 */}
      <div className="flex items-center justify-between mb-1">
        <span className="font-body text-[10px] uppercase tracking-wider text-ink-soft/50">
          已保存预设
        </span>
        <span className="font-body text-[10px] uppercase tracking-wider text-ink-soft/50">
          {presets.length}/20
        </span>
      </div>

      {/* 预设列表 */}
      <div className="flex flex-col gap-1.5 overflow-y-auto max-h-64">
        {presets.map((preset, index) => (
          <div
            key={preset.id}
            className="bg-white/50 rounded-xl px-3 py-2.5 border border-card-border hover:border-ink/10 transition-all duration-150 cursor-pointer group"
            style={{
              animation: `fade-in-up 0.3s cubic-bezier(0.22, 1, 0.36, 1) ${index * 0.03}s both`,
            }}
            onClick={() => onApplyPreset(preset)}
          >
            <div className="flex items-start gap-2">
              {/* 类型标签 */}
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-body font-medium uppercase tracking-wider flex-shrink-0 mt-0.5 ${TYPE_TAG_STYLES[preset.type]}`}
              >
                {TYPE_TAG_LABELS[preset.type]}
              </span>

              {/* 名称和摘要 */}
              <div className="flex-1 min-w-0">
                <p className="font-body text-[11px] font-medium text-ink truncate">
                  {preset.name}
                </p>
                <p className="font-body text-[9px] text-ink-soft/50 truncate mt-0.5">
                  {truncateText(
                    preset.type === 'clone'
                      ? preset.style_prompt || ''
                      : preset.design_prompt || preset.style_prompt || '',
                  )}
                </p>
              </div>

              {/* 操作按钮 */}
              <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                {/* 试听按钮 */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTogglePlay(preset);
                  }}
                  disabled={!preset.trial_audio_path}
                  className="text-[11px] text-ink-soft hover:text-ink disabled:opacity-30 transition-colors px-1 py-0.5"
                  title="试听"
                >
                  {playingId === preset.id ? '⏹' : '▶'}
                </button>

                {/* 删除按钮 */}
                {confirmDeleteId === preset.id ? (
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleDelete(preset.id)}
                      className="text-[10px] text-pink hover:text-pink font-body font-medium transition-colors px-1.5 py-0.5"
                    >
                      确认
                    </button>
                    <button
                      onClick={handleCancelDelete}
                      className="text-[10px] text-ink-soft hover:text-ink font-body transition-colors px-1.5 py-0.5"
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(preset.id);
                    }}
                    className="text-[11px] text-ink-soft/50 hover:text-pink transition-colors px-1 py-0.5"
                    title="删除预设"
                  >
                    🗑
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 内联音频播放器 */}
      {playingId !== null && (() => {
        const preset = presets.find((p) => p.id === playingId);
        if (!preset?.trial_audio_path) return null;
        return (
          <div className="animate-fade-in mt-1">
            <audio
              controls
              src={preset.trial_audio_path}
              className="w-full h-8"
              onEnded={() => setPlayingId(null)}
            />
          </div>
        );
      })()}
    </div>
  );
};

export default VoicePresetTab;
