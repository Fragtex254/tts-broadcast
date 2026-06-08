import React, { useEffect, useState } from 'react';
import { useStore, type VoicePreset } from '../../store';
import MiniAudioPlayer from './MiniAudioPlayer';

// ============ 接口定义 ============

interface VoicePresetTabProps {
  onApplyPreset: (preset: VoicePreset) => void;
}

// ============ 常量 ============

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
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

  const handleItemClick = (preset: VoicePreset) => {
    // 选中该预设作为当前音色
    onApplyPreset(preset);
    // 展开/收起详情
    setExpandedId(expandedId === preset.id ? null : preset.id);
  };

  const handleTogglePlay = (e: React.MouseEvent, preset: VoicePreset) => {
    e.stopPropagation();
    if (!preset.trial_audio_path) return;
    setPlayingId((prev) => (prev === preset.id ? null : preset.id));
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (confirmDeleteId === id) {
      try {
        await deletePreset(id);
        setConfirmDeleteId(null);
        if (playingId === id) setPlayingId(null);
        if (expandedId === id) setExpandedId(null);
      } catch {
        // 错误已在 store 中处理
      }
    } else {
      setConfirmDeleteId(id);
    }
  };

  // 空状态
  if (presets.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center animate-fade-in min-h-0">
        <p className="font-body text-[11px] text-ink-soft/40 text-center px-4">
          暂无保存的预设<br />
          <span className="text-[9px]">在克隆或设计页签中试听满意后可保存</span>
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto mb-3 animate-fade-in min-h-0">
      <div className="flex items-center justify-between mb-1.5">
        <label className="font-body text-[10px] uppercase tracking-wider text-ink-soft/50">
          已保存预设
        </label>
        <span className="font-body text-[10px] text-ink-soft/40">
          {presets.length}/20
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        {presets.map((preset) => {
          const isExpanded = expandedId === preset.id;
          return (
            <div
              key={preset.id}
              className={`bg-white/50 border rounded-xl transition-all duration-150 cursor-pointer ${
                isExpanded
                  ? 'border-ink/20 shadow-card'
                  : 'border-card-border hover:border-ink/10'
              }`}
              onClick={() => handleItemClick(preset)}
            >
              {/* 头部：标签 + 名称 + 操作 */}
              <div className="flex items-center gap-2 px-3 py-2">
                <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-body uppercase tracking-wider flex-shrink-0 ${TYPE_TAG_STYLES[preset.type]}`}>
                  {TYPE_TAG_LABELS[preset.type]}
                </span>
                <span className="font-body text-[12px] font-medium text-ink truncate flex-1">
                  {preset.name}
                </span>

                {/* 操作按钮 */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={(e) => handleTogglePlay(e, preset)}
                    disabled={!preset.trial_audio_path}
                    className="text-[11px] text-ink-soft/50 hover:text-ink disabled:opacity-30 transition-colors px-1"
                    title="试听"
                  >
                    {playingId === preset.id ? '⏹' : '▶'}
                  </button>

                  {confirmDeleteId === preset.id ? (
                    <>
                      <button
                        onClick={(e) => handleDelete(e, preset.id)}
                        className="text-[10px] text-pink font-body font-medium transition-colors px-1"
                      >
                        确认
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                        className="text-[10px] text-ink-soft/50 hover:text-ink font-body transition-colors px-1"
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={(e) => handleDelete(e, preset.id)}
                      className="text-[11px] text-ink-soft/30 hover:text-pink transition-colors px-1"
                      title="删除"
                    >
                      🗑
                    </button>
                  )}
                </div>
              </div>

              {/* 展开的详情 */}
              {isExpanded && (
                <div className="px-3 pb-2.5 animate-fade-in space-y-1.5">
                  {/* 分隔线 */}
                  <div className="border-t border-card-border" />

                  {/* 风格提示词 */}
                  {preset.style_prompt && (
                    <div>
                      <span className="font-body text-[9px] uppercase tracking-wider text-ink-soft/40">风格</span>
                      <p className="font-body text-[10px] text-ink-soft/70">{preset.style_prompt}</p>
                    </div>
                  )}

                  {/* 设计描述 */}
                  {preset.type === 'design' && preset.design_prompt && (
                    <div>
                      <span className="font-body text-[9px] uppercase tracking-wider text-ink-soft/40">音色描述</span>
                      <p className="font-body text-[10px] text-ink-soft/70">{preset.design_prompt}</p>
                    </div>
                  )}

                  {/* 原始音频（克隆） */}
                  {preset.type === 'clone' && preset.original_audio_path && (
                    <div>
                      <span className="font-body text-[9px] uppercase tracking-wider text-ink-soft/40">参考音频</span>
                      <div className="mt-0.5"><MiniAudioPlayer src={preset.original_audio_path} /></div>
                    </div>
                  )}

                  {/* 试听音频 */}
                  {preset.trial_audio_path && (
                    <div>
                      <span className="font-body text-[9px] uppercase tracking-wider text-ink-soft/40">试听音频</span>
                      <div className="mt-0.5"><MiniAudioPlayer src={preset.trial_audio_path} /></div>
                    </div>
                  )}
                </div>
              )}

              {/* 内联播放器（非展开态的快速试听） */}
              {!isExpanded && playingId === preset.id && preset.trial_audio_path && (
                <div className="px-3 pb-2">
                  <MiniAudioPlayer src={preset.trial_audio_path} onEnded={() => setPlayingId(null)} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default VoicePresetTab;
