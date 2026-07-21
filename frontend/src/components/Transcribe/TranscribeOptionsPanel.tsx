import React from 'react';
import type { AsrEngine, AsrLanguage, AsrModelOption, AsrProvider } from '../../store';
import { TranscribeProviderControls } from './TranscribeProviderControls';

export interface TranscribeOptionsPanelProps {
  language: AsrLanguage;
  contentMode: 'standard' | 'podcast';
  canUsePodcastMode: boolean;
  provider: AsrProvider;
  wslEngine: AsrEngine;
  asrModel: string;
  asrContext: string;
  mossModelOptions: AsrModelOption[];
  isFetchingMossModels: boolean;
  mossModelFetchResult: { error?: string; resolvedUrl?: string } | null;
  qwenBaseUrl: string;
  wslBaseUrl: string;
  isDisabled: boolean;
  isBatch?: boolean;
  isSubmitDisabled: boolean;
  selectedCount?: number;
  fileCount?: number;
  onLanguageChange: (language: AsrLanguage) => void;
  onContentModeChange: (mode: 'standard' | 'podcast') => void;
  onProviderChange: (provider: AsrProvider) => void;
  onWslEngineChange: (engine: AsrEngine) => void;
  onAsrModelChange: (model: string) => void;
  onAsrContextChange: (context: string) => void;
  onRefreshMossModels: () => void;
  onSubmit: () => void;
}

export const TranscribeOptionsPanel: React.FC<TranscribeOptionsPanelProps> = ({
  isDisabled,
  isBatch = false,
  isSubmitDisabled,
  selectedCount = 0,
  fileCount = 0,
  onSubmit,
  ...providerProps
}) => (
  <TranscribeProviderControls
    {...providerProps}
    isDisabled={isDisabled}
    isBatch={isBatch}
  >
    <button
      type="button"
      onClick={onSubmit}
      disabled={isSubmitDisabled}
      className="relative overflow-hidden bg-lemon hover:brightness-105 disabled:opacity-40 text-ink rounded-full px-5 py-2.5 shadow-btn font-body text-[12px] font-medium uppercase tracking-wider ui-transition duration-fast"
    >
      {isDisabled && (
        <span className="absolute left-0 top-0 h-full w-2/3 bg-white/20 animate-pulse" />
      )}
      <span className="relative">
        {isDisabled
          ? '转录中...'
          : isBatch
            ? `开始批量转录（已选 ${selectedCount}/${fileCount}）`
            : '开始转录'}
      </span>
    </button>
  </TranscribeProviderControls>
);

export default TranscribeOptionsPanel;
