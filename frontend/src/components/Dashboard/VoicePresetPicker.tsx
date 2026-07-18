import React from 'react';
import type { VoicePreset } from '../../store';
import { MiniAudioPlayer } from './MiniAudioPlayer';

interface VoicePresetPickerProps {
  presets: VoicePreset[];
  selectedPresetName: string;
  onSelect: (preset: VoicePreset) => void;
  onManage: () => void;
}

export const VoicePresetPicker: React.FC<VoicePresetPickerProps> = ({
  presets,
  selectedPresetName,
  onSelect,
  onManage,
}) => {
  if (presets.length === 0) {
    return (
      <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-card-border bg-white/55 p-6 text-center">
        <p className="font-display italic text-[18px] text-ink-soft/60">还没有保存的音色</p>
        <p className="mt-2 max-w-sm font-body text-[12px] leading-relaxed text-ink-soft/50">
          先在音色库完成设计或克隆，再回到这里选择用于当前稿件的音色。
        </p>
        <button
          type="button"
          onClick={onManage}
          className="mt-4 rounded-xl bg-lilac px-4 py-2.5 font-body text-[12px] font-medium text-ink shadow-btn ui-transition duration-fast hover:brightness-105 active:translate-y-0 active:shadow-none"
        >
          前往音色库
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-body text-[11px] uppercase tracking-wider text-ink-soft/70">
          选择当前稿件使用的预设
        </p>
        <button type="button" onClick={onManage} className="font-body text-[11px] text-ink-soft transition-colors hover:text-ink">
          管理音色
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {presets.map((preset) => {
          const isSelected = selectedPresetName === preset.name;
          const description = preset.type === 'design'
            ? preset.design_prompt || preset.style_prompt || '未填写音色描述'
            : preset.style_prompt || '克隆音色';
          return (
            <section
              key={preset.id}
              className={`rounded-card border p-4 ui-transition duration-fast ${
                isSelected
                  ? 'border-ink/20 bg-lemon/20 shadow-card'
                  : 'border-card-border bg-white/65 hover:border-ink/15 hover:bg-white/85'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className={`inline-flex rounded-full px-2 py-0.5 font-body text-[11px] text-ink ${preset.type === 'design' ? 'bg-lilac/35' : 'bg-blush/45'}`}>
                    {preset.type === 'design' ? '设计' : '克隆'}
                  </span>
                  <h4 className="mt-2 truncate font-display text-[18px] font-medium text-ink">{preset.name}</h4>
                </div>
                {isSelected && (
                  <span className="rounded-full bg-sage/35 px-2 py-1 font-body text-[11px] uppercase tracking-wider text-ink">当前</span>
                )}
              </div>
              <p className="mt-2 line-clamp-3 min-h-14 font-body text-[11px] leading-relaxed text-ink-soft/70">{description}</p>
              {preset.trial_audio_path && (
                <div className="mt-3">
                  <MiniAudioPlayer src={preset.trial_audio_path} />
                </div>
              )}
              <button
                type="button"
                onClick={() => onSelect(preset)}
                className={`mt-3 w-full rounded-xl px-3 py-2 font-body text-[11px] font-medium ui-transition duration-fast ${
                  isSelected
                    ? 'bg-sage/45 text-ink'
                    : 'bg-white/70 text-ink-soft shadow-btn hover:bg-lemon/35 hover:text-ink'
                }`}
              >
                {isSelected ? '已选择' : '用于当前稿件'}
              </button>
            </section>
          );
        })}
      </div>
    </div>
  );
};

export default VoicePresetPicker;
