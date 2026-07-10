import React from 'react';
import type { AsrEngine, AsrLanguage, AsrModelOption, AsrProvider } from '../../store';
import { ASR_PROVIDER_OPTIONS, LANGUAGE_OPTIONS, WSL_ENGINE_OPTIONS, WSL_MODEL_OPTIONS } from '../../pages/transcribeUtils';

interface TranscribeProviderControlsProps {
  language: AsrLanguage;
  provider: AsrProvider;
  wslEngine: AsrEngine;
  asrModel: string;
  asrContext: string;
  mossModelOptions: AsrModelOption[];
  isFetchingMossModels: boolean;
  mossModelFetchResult: { error?: string; resolvedUrl?: string } | null;
  isDisabled?: boolean;
  isBatch?: boolean;
  qwenBaseUrl: string;
  wslBaseUrl: string;
  onLanguageChange: (language: AsrLanguage) => void;
  onProviderChange: (provider: AsrProvider) => void;
  onWslEngineChange: (engine: AsrEngine) => void;
  onAsrModelChange: (model: string) => void;
  onAsrContextChange: (context: string) => void;
  onRefreshMossModels: () => void;
  children: React.ReactNode;
}

export const TranscribeProviderControls: React.FC<TranscribeProviderControlsProps> = ({
  language,
  provider,
  wslEngine,
  asrModel,
  asrContext,
  mossModelOptions,
  isFetchingMossModels,
  mossModelFetchResult,
  isDisabled = false,
  isBatch = false,
  qwenBaseUrl,
  wslBaseUrl,
  onLanguageChange,
  onProviderChange,
  onWslEngineChange,
  onAsrModelChange,
  onAsrContextChange,
  onRefreshMossModels,
  children,
}) => {
  const hasCurrentMossModel = wslEngine === 'moss'
    && Boolean(asrModel)
    && !mossModelOptions.some((option) => option.id === asrModel);

  return (
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
            value={wslEngine}
            onChange={(e) => onWslEngineChange(e.target.value as AsrEngine)}
            disabled={isDisabled}
            aria-label="WSL 识别引擎"
            className="bg-white/70 text-ink rounded-xl px-3.5 py-2.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[12px] transition-colors disabled:opacity-40"
          >
            {WSL_ENGINE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          {wslEngine === 'qwen' ? (
            <select
              value={asrModel}
              onChange={(e) => onAsrModelChange(e.target.value)}
              disabled={isDisabled}
              aria-label="Qwen 模型"
              className="bg-white/70 text-ink rounded-xl px-3.5 py-2.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[12px] transition-colors disabled:opacity-40"
            >
              {WSL_MODEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          ) : (
            <div className="flex gap-2">
              <select
                value={asrModel}
                onChange={(e) => onAsrModelChange(e.target.value)}
                disabled={isDisabled || mossModelOptions.length === 0}
                aria-label="MOSS 模型"
                className="min-w-0 flex-1 bg-white/70 text-ink rounded-xl px-3.5 py-2.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[12px] transition-colors disabled:opacity-40"
              >
                {hasCurrentMossModel && <option value={asrModel}>{asrModel}</option>}
                {mossModelOptions.length === 0 && <option value="">等待获取模型列表</option>}
                {mossModelOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.id}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={onRefreshMossModels}
                disabled={isDisabled || isFetchingMossModels || !wslBaseUrl}
                className="px-3.5 py-2.5 bg-lilac hover:brightness-105 disabled:opacity-40 text-ink rounded-xl shadow-btn font-body text-[12px] transition-all duration-150 whitespace-nowrap"
              >
                {isFetchingMossModels ? '获取中...' : '刷新模型'}
              </button>
            </div>
          )}

          <input
            type="text"
            value={asrContext}
            onChange={(e) => onAsrContextChange(e.target.value)}
            disabled={isDisabled}
            placeholder="上下文：人名、术语、产品名"
            className="md:col-span-2 bg-white/70 text-ink rounded-xl px-3.5 py-2.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[12px] transition-colors disabled:opacity-40 placeholder-ink-soft/35"
          />
          <p className="md:col-span-2 font-body text-[11px] text-ink-soft/70">
            {wslEngine === 'moss'
              ? `将通过 ${wslBaseUrl || 'http://192.168.31.137:18080/v1'} 的 MOSS 引擎转录。`
              : `将提交到 ${wslBaseUrl || 'http://192.168.31.137:18080/v1'} 的 Qwen job 队列。`}
          </p>
          {wslEngine === 'moss' && mossModelFetchResult?.resolvedUrl && (
            <p className="md:col-span-2 font-body text-[11px] text-ink-soft/70 animate-fade-in">
              已从 {mossModelFetchResult.resolvedUrl} 获取模型
            </p>
          )}
          {wslEngine === 'moss' && mossModelFetchResult?.error && (
            <div className="md:col-span-2 bg-pink/10 border border-pink/30 rounded-xl p-2.5 text-ink text-[12px] font-body animate-shake">
              {mossModelFetchResult.error}
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex justify-end">
        {children}
      </div>
    </>
  );
};

export default TranscribeProviderControls;
