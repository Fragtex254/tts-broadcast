import React from 'react';
import { PasswordField } from '../../components/PasswordField';
import type { Settings as AppSettings } from '../../store';
import { getSecretPlaceholder } from '../settingsDraft';
import { SecretStatus } from './SettingsSection';
import type { SettingsFormProps } from './types';

const asrProviderOptions: { value: AppSettings['asr_provider']; label: string; description: string }[] = [
  { value: 'mimo', label: 'MiMo 云端', description: '复用 TTS API Key，适合无需本地部署的场景' },
  { value: 'wsl_asr', label: 'WSL 局域网', description: '一套连接，可使用 Qwen 或 MOSS 识别引擎' },
  { value: 'qwen_mlx', label: 'Qwen 本地（Mac MLX）', description: '连接 Mac 上的 mlx-qwen3-asr serve 服务' },
];

interface AsrSectionProps extends SettingsFormProps {
  asrConfigTab: AppSettings['asr_provider'];
  onTabChange: (tab: AppSettings['asr_provider']) => void;
}

export const AsrSection: React.FC<AsrSectionProps> = ({
  formData,
  settings,
  onChange,
  onAutoSave,
  asrConfigTab,
  onTabChange,
}) => (
  <div className="space-y-3">
    <div>
      <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/60">ASR 服务连接</label>
      <p className="font-body text-[11px] text-ink-soft/70 mt-0.5">这里只维护各服务的连接参数；当前任务使用哪个服务，请在转录页选择</p>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {asrProviderOptions.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onTabChange(option.value)}
          className={`text-left p-3.5 rounded-2xl border ui-transition ${asrConfigTab === option.value ? 'bg-lilac/35 border-ink/15 shadow-btn' : 'bg-white/35 border-card-border hover:border-ink/15'}`}
        >
          <span className="block font-body text-[12px] font-medium text-ink">{option.label}</span>
          <span className="block mt-1 font-body text-[11px] text-ink-soft/70 leading-relaxed">{option.description}</span>
        </button>
      ))}
    </div>

    {asrConfigTab === 'mimo' && (
      <div className="rounded-2xl border border-card-border bg-white/45 p-4 font-body text-[11px] leading-relaxed text-ink-soft/70 animate-fade-in">
        MiMo 云端转录复用上方的 TTS API Key，无需额外连接参数。
      </div>
    )}

    {asrConfigTab === 'qwen_mlx' && (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-fade-in">
        <div>
          <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/70 mb-1 block">Qwen ASR Base URL</label>
          <input
            type="text"
            value={formData.qwen_asr_base_url}
            onChange={(e) => onChange('qwen_asr_base_url', e.target.value)}
            onBlur={() => onAutoSave('qwen_asr_base_url')}
            placeholder="http://localhost:8765/v1"
            className="w-full px-4 py-2.5 bg-white/70 border border-card-border rounded-xl text-ink placeholder-ink-soft/30 focus:outline-none focus:border-ink/20 font-body text-[12px] transition-colors"
          />
        </div>
        <div>
          <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/70 mb-1 block">Qwen ASR 模型</label>
          <input
            type="text"
            value={formData.qwen_asr_model}
            onChange={(e) => onChange('qwen_asr_model', e.target.value)}
            onBlur={() => onAutoSave('qwen_asr_model')}
            placeholder="Qwen/Qwen3-ASR-1.7B"
            className="w-full px-4 py-2.5 bg-white/70 border border-card-border rounded-xl text-ink placeholder-ink-soft/30 focus:outline-none focus:border-ink/20 font-body text-[12px] transition-colors"
          />
        </div>
        <div className="md:col-span-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/70">Qwen ASR API Key（可选）</label>
            <SecretStatus secret={settings.qwen_asr_api_key} />
          </div>
          <PasswordField
            value={formData.qwen_asr_api_key}
            onChange={(v) => onChange('qwen_asr_api_key', v)}
            onBlur={() => onAutoSave('qwen_asr_api_key')}
            placeholder={getSecretPlaceholder(settings.qwen_asr_api_key, '如果 serve 设置了 --api-key，在这里填写')}
          />
        </div>
        <p className="md:col-span-2 font-body text-[11px] text-ink-soft/70">
          Mac 上可用：mlx-qwen3-asr serve --api-key your-local-key
        </p>
      </div>
    )}

    {asrConfigTab === 'wsl_asr' && (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-fade-in">
        <div>
          <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/70 mb-1 block">WSL ASR Base URL</label>
          <input
            type="text"
            value={formData.wsl_asr_base_url}
            onChange={(e) => onChange('wsl_asr_base_url', e.target.value)}
            onBlur={() => onAutoSave('wsl_asr_base_url')}
            placeholder="http://192.168.31.137:18080/v1"
            className="w-full px-4 py-2.5 bg-white/70 border border-card-border rounded-xl text-ink placeholder-ink-soft/30 focus:outline-none focus:border-ink/20 font-body text-[12px] transition-colors"
          />
        </div>
        <div>
          <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/70 mb-1 block">默认识别引擎</label>
          <select
            value={formData.wsl_asr_engine}
            onChange={(e) => onChange('wsl_asr_engine', e.target.value as AppSettings['wsl_asr_engine'])}
            onBlur={() => onAutoSave('wsl_asr_engine')}
            className="w-full px-4 py-2.5 bg-white/70 border border-card-border rounded-xl text-ink placeholder-ink-soft/30 focus:outline-none focus:border-ink/20 font-body text-[12px] transition-colors"
          >
            <option value="qwen">Qwen3-ASR</option>
            <option value="moss">MOSS</option>
          </select>
        </div>
        <div>
          <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/70 mb-1 block">默认模型</label>
          <input
            type="text"
            value={formData.wsl_asr_model}
            onChange={(e) => onChange('wsl_asr_model', e.target.value)}
            onBlur={() => onAutoSave('wsl_asr_model')}
            placeholder={formData.wsl_asr_engine === 'moss' ? '可在转录页从模型列表选择' : 'qwen3-asr-1.7b'}
            className="w-full px-4 py-2.5 bg-white/70 border border-card-border rounded-xl text-ink placeholder-ink-soft/30 focus:outline-none focus:border-ink/20 font-body text-[12px] transition-colors"
          />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/70">WSL ASR API Key（可选）</label>
            <SecretStatus secret={settings.wsl_asr_api_key} />
          </div>
          <PasswordField
            value={formData.wsl_asr_api_key}
            onChange={(v) => onChange('wsl_asr_api_key', v)}
            onBlur={() => onAutoSave('wsl_asr_api_key')}
            placeholder={getSecretPlaceholder(settings.wsl_asr_api_key, '如果 WSL 网关启用了 Bearer Token，在这里填写')}
          />
        </div>
        <p className="md:col-span-2 font-body text-[11px] text-ink-soft/70">
          Qwen 使用 WSL job API；MOSS 使用同一地址下的 OpenAI-compatible 转录接口。协议差异由后端自动处理。
        </p>
      </div>
    )}
  </div>
);
