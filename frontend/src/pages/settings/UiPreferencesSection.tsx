import React from 'react';
import type { Settings as AppSettings } from '../../store';
import { SectionCard } from './SettingsSection';
import type { SettingsFormProps } from './types';

const voiceOptions = [
  { value: '冰糖', label: '冰糖' },
  { value: '蜜糖', label: '蜜糖' },
  { value: '清风', label: '清风' },
  { value: '墨鱼', label: '墨鱼' },
  { value: '楠楠', label: '楠楠' },
];

const fontPresetOptions: { value: AppSettings['ui_font_preset']; label: string; description: string }[] = [
  { value: 'modern', label: '现代', description: '内置 MiSans，适合工作台与控制面板' },
  { value: 'system', label: '系统', description: '跟随 macOS / Windows 系统字体，更稳妥' },
  { value: 'editorial', label: '标题出版感', description: '标题更有杂志感，正文保持清晰' },
];

const fontScaleOptions: { value: AppSettings['ui_font_scale']; label: string; description: string }[] = [
  { value: 'compact', label: '紧凑', description: '信息密度高' },
  { value: 'comfortable', label: '标准', description: '默认平衡' },
  { value: 'large', label: '舒展', description: '更清楚易读' },
  { value: 'extra_large', label: '大字', description: '远看更舒服' },
];

export const UiFontSection: React.FC<SettingsFormProps> = ({ formData, onImmediateChange }) => (
  <SectionCard dotColor="bg-lilac" title="界面字体">
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5">
      <div className="space-y-4">
        <div>
          <label className="font-body text-[13px] font-medium text-ink-soft mb-2 block">字体方案</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {fontPresetOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onImmediateChange('ui_font_preset', option.value)}
                className={`text-left p-4 rounded-2xl border ui-transition ${
                  formData.ui_font_preset === option.value
                    ? 'bg-lilac/55 border-ink/15 shadow-btn'
                    : 'bg-white/45 border-card-border hover:border-ink/15'
                }`}
              >
                <span className="block font-display text-[18px] font-medium text-ink">{option.label}</span>
                <span className="block mt-1 font-body text-[12px] leading-5 text-ink-soft/75">{option.description}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="font-body text-[13px] font-medium text-ink-soft mb-2 block">字号尺度</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {fontScaleOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onImmediateChange('ui_font_scale', option.value)}
                className={`p-4 rounded-2xl border ui-transition ${
                  formData.ui_font_scale === option.value
                    ? 'bg-sage/60 border-ink/15 shadow-btn'
                    : 'bg-white/45 border-card-border hover:border-ink/15'
                }`}
              >
                <span className="block font-display text-[18px] font-medium text-ink">{option.label}</span>
                <span className="block mt-1 font-body text-[12px] leading-5 text-ink-soft/75">{option.description}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white/60 rounded-2xl border border-card-border p-5">
        <p className="font-body text-[11px] uppercase tracking-wider text-ink-soft/70 mb-3">预览</p>
        <h4 className="font-display text-[26px] font-medium text-ink leading-tight">音色预设</h4>
        <p className="mt-2 font-body text-[14px] leading-7 text-ink-soft">
          用同一套字体节奏约束页面标题、卡片标题、正文和标签，避免不同功能各自随手写字号。
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="px-2.5 py-1 rounded-full bg-lilac/45 font-body text-[12px] text-ink">设计</span>
          <span className="px-2.5 py-1 rounded-full bg-sage/45 font-body text-[12px] text-ink">可试听</span>
        </div>
      </div>
    </div>
  </SectionCard>
);

export const VoiceSection: React.FC<SettingsFormProps> = ({ formData, onChange, onAutoSave }) => (
  <SectionCard dotColor="bg-blush" title="音色设置">
    <div>
      <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/60 mb-2 block">默认音色</label>
      <select
        value={formData.default_voice}
        onChange={(e) => onChange('default_voice', e.target.value)}
        onBlur={() => onAutoSave('default_voice')}
        className="w-full px-4 py-2.5 bg-white/70 border border-card-border rounded-xl text-ink focus:outline-none focus:border-ink/20 font-body text-[12px] appearance-none cursor-pointer transition-colors"
      >
        {voiceOptions.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
      </select>
      <p className="mt-2 font-body text-[11px] text-ink-soft/70">新建或导入稿件进入编辑器时会自动应用，仍可在当前稿件中更换</p>
    </div>
  </SectionCard>
);

export const BroadcastScriptSection: React.FC<SettingsFormProps> = ({
  formData,
  onChange,
  onAutoSave,
  onDebouncedAutoSave,
}) => (
  <SectionCard dotColor="bg-sage" title="播报设置">
    <div className="space-y-4">
      <div>
        <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/60 mb-2 block">开场白</label>
        <textarea
          value={formData.opening_script}
          onChange={(e) => {
            onChange('opening_script', e.target.value);
            onDebouncedAutoSave('opening_script');
          }}
          onBlur={() => onAutoSave('opening_script')}
          rows={3}
          placeholder="请输入播报开场白"
          className="w-full px-4 py-2.5 bg-white/70 border border-card-border rounded-xl text-ink placeholder-ink-soft/30 focus:outline-none focus:border-ink/20 font-body text-[12px] resize-none transition-colors"
        />
      </div>
      <div>
        <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/60 mb-2 block">结束语</label>
        <textarea
          value={formData.closing_script}
          onChange={(e) => {
            onChange('closing_script', e.target.value);
            onDebouncedAutoSave('closing_script');
          }}
          onBlur={() => onAutoSave('closing_script')}
          rows={3}
          placeholder="请输入播报结束语"
          className="w-full px-4 py-2.5 bg-white/70 border border-card-border rounded-xl text-ink placeholder-ink-soft/30 focus:outline-none focus:border-ink/20 font-body text-[12px] resize-none transition-colors"
        />
      </div>
    </div>
  </SectionCard>
);
