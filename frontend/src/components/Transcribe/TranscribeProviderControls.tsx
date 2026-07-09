import React from 'react';
import type { AsrLanguage, AsrProvider } from '../../store';
import { ASR_PROVIDER_OPTIONS, LANGUAGE_OPTIONS, WSL_MODEL_OPTIONS } from '../../pages/transcribeUtils';

interface TranscribeProviderControlsProps {
  language: AsrLanguage;
  provider: AsrProvider;
  wslModel: string;
  wslContext: string;
  isDisabled?: boolean;
  isBatch?: boolean;
  qwenBaseUrl: string;
  wslBaseUrl: string;
  onLanguageChange: (language: AsrLanguage) => void;
  onProviderChange: (provider: AsrProvider) => void;
  onWslModelChange: (model: string) => void;
  onWslContextChange: (context: string) => void;
  children: React.ReactNode;
}

export const TranscribeProviderControls: React.FC<TranscribeProviderControlsProps> = ({
  language,
  provider,
  wslModel,
  wslContext,
  isDisabled = false,
  isBatch = false,
  qwenBaseUrl,
  wslBaseUrl,
  onLanguageChange,
  onProviderChange,
  onWslModelChange,
  onWslContextChange,
  children,
}) => (
  <>
    <div className="flex flex-col sm:flex-row gap-3 mt-4">
      <select
        value={language}
        onChange={(e) => onLanguageChange(e.target.value as AsrLanguage)}
        disabled={isDisabled}
        className="bg-white/70 text-ink rounded-full px-3.5 py-2.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[12px] transition-colors disabled:opacity-40"
      >
        {LANGUAGE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <select
        value={provider}
        onChange={(e) => onProviderChange(e.target.value as AsrProvider)}
        disabled={isDisabled}
        className="bg-white/70 text-ink rounded-full px-3.5 py-2.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[12px] transition-colors disabled:opacity-40"
      >
        {ASR_PROVIDER_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      {children}
    </div>

    {provider === 'qwen_mlx' && (
      <p className="mt-2 font-body text-[11px] text-ink-soft/70 animate-fade-in">
        {isBatch
          ? `批量文件会串行发送到 ${qwenBaseUrl || 'http://localhost:8765/v1'}，建议 Mac 先用 1 个任务验证负载。`
          : `将连接 ${qwenBaseUrl || 'http://localhost:8765/v1'}，请先在 Mac 上启动 mlx-qwen3-asr serve。`}
      </p>
    )}

    {provider === 'wsl_asr' && (
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 animate-fade-in">
        <select
          value={wslModel}
          onChange={(e) => onWslModelChange(e.target.value)}
          disabled={isDisabled}
          className="bg-white/70 text-ink rounded-xl px-3.5 py-2.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[12px] transition-colors disabled:opacity-40"
        >
          {WSL_MODEL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <input
          type="text"
          value={wslContext}
          onChange={(e) => onWslContextChange(e.target.value)}
          disabled={isDisabled}
          placeholder="上下文：人名、术语、产品名"
          className="bg-white/70 text-ink rounded-xl px-3.5 py-2.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[12px] transition-colors disabled:opacity-40 placeholder-ink-soft/35"
        />
        <p className="md:col-span-2 font-body text-[11px] text-ink-soft/70">
          {isBatch
            ? `批量文件会逐个提交到 ${wslBaseUrl || 'http://192.168.31.137:18080/v1'} 的 WSL job 队列。`
            : `将提交到 ${wslBaseUrl || 'http://192.168.31.137:18080/v1'} 的 WSL job 队列。`}
        </p>
      </div>
    )}
  </>
);

export default TranscribeProviderControls;
