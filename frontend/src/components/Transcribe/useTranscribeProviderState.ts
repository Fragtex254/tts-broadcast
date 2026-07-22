import { useCallback, useEffect, useRef, useState } from 'react';
import useStore, {
  type AsrEngine,
  type AsrLanguage,
  type AsrModelOption,
  type AsrProvider,
} from '../../store';

type ContentMode = 'standard' | 'podcast';

export const useTranscribeProviderState = (onError: (message: string | null) => void) => {
  const settings = useStore((state) => state.settings);
  const updateSettings = useStore((state) => state.updateSettings);
  const fetchAsrModels = useStore((state) => state.fetchAsrModels);
  const wslDefaultRef = useRef({ engine: settings.wsl_asr_engine, model: settings.wsl_asr_model });

  const [language, setLanguage] = useState<AsrLanguage>('auto');
  const [contentMode, setContentMode] = useState<ContentMode>('standard');
  const [selectedAsrProvider, setSelectedAsrProvider] = useState<AsrProvider | null>(null);
  const [selectedWslEngine, setSelectedWslEngine] = useState<AsrEngine | null>(null);
  const [selectedWslModel, setSelectedWslModel] = useState<string | null>(null);
  const [selectedMossModel, setSelectedMossModel] = useState<string | null>(null);
  const [asrContext, setAsrContext] = useState('');
  const [mossModelOptions, setMossModelOptions] = useState<AsrModelOption[]>([]);
  const [isFetchingMossModels, setIsFetchingMossModels] = useState(false);
  const [mossModelFetchResult, setMossModelFetchResult] = useState<{ error?: string; resolvedUrl?: string } | null>(null);

  const asrProvider = selectedAsrProvider ?? settings.asr_provider ?? 'wsl_asr';
  const wslEngine = selectedWslEngine ?? settings.wsl_asr_engine ?? 'qwen';
  const wslModel = (
    selectedWslModel ?? (settings.wsl_asr_engine === 'qwen' ? settings.wsl_asr_model : '')
  ) || 'qwen3-asr-1.7b';
  const mossModel = (
    selectedMossModel ?? (settings.wsl_asr_engine === 'moss' ? settings.wsl_asr_model : '')
  ) || mossModelOptions[0]?.id || '';
  const asrModel = wslEngine === 'moss' ? mossModel : wslModel;
  const selectedMossOption = mossModelOptions.find((option) => option.id === mossModel);
  const canUsePodcastMode = asrProvider === 'wsl_asr'
    && wslEngine === 'moss'
    && selectedMossOption?.capabilities?.diarization === true
    && selectedMossOption.capabilities.segment_timestamps === true;
  const transcribeOptions = {
    ...(asrProvider === 'wsl_asr' ? { asrEngine: wslEngine, asrModel, context: asrContext } : {}),
    contentMode,
  };
  const isMossModelMissing = asrProvider === 'wsl_asr' && wslEngine === 'moss' && !mossModel.trim();
  const isPodcastUnavailable = contentMode === 'podcast' && !canUsePodcastMode;

  useEffect(() => {
    wslDefaultRef.current = { engine: settings.wsl_asr_engine, model: settings.wsl_asr_model };
  }, [settings.wsl_asr_engine, settings.wsl_asr_model]);

  const loadMossModels = useCallback(async () => {
    setIsFetchingMossModels(true);
    setMossModelFetchResult(null);
    try {
      const result = await fetchAsrModels({
        provider: 'wsl_asr',
        engine: 'moss',
        baseUrl: settings.wsl_asr_base_url,
      });
      setMossModelOptions(result.models);
      setMossModelFetchResult({ resolvedUrl: result.resolvedUrl });
      const configuredModel = wslDefaultRef.current.engine === 'moss'
        && result.models.some((option) => option.id === wslDefaultRef.current.model)
        ? wslDefaultRef.current.model
        : '';
      const nextModel = configuredModel || result.models[0]?.id || '';
      setSelectedMossModel(nextModel || null);
    } catch (error) {
      setMossModelOptions([]);
      setMossModelFetchResult({ error: error instanceof Error ? error.message : '获取 MOSS 模型列表失败' });
    } finally {
      setIsFetchingMossModels(false);
    }
  }, [fetchAsrModels, settings.wsl_asr_base_url]);

  useEffect(() => {
    if (asrProvider === 'wsl_asr' && wslEngine === 'moss') {
      const timer = window.setTimeout(() => {
        void loadMossModels();
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [asrProvider, loadMossModels, wslEngine]);

  const handleProviderChange = useCallback((provider: AsrProvider) => {
    setSelectedAsrProvider(provider);
    onError(null);
    void updateSettings({ asr_provider: provider }).catch(() => {
      onError('已切换本次服务，但保存默认转录服务失败');
    });
  }, [onError, updateSettings]);

  const handleWslEngineChange = useCallback((engine: AsrEngine) => {
    setSelectedWslEngine(engine);
    onError(null);
    if (engine === 'qwen') {
      const model = selectedWslModel || 'qwen3-asr-1.7b';
      setSelectedWslModel(model);
      void updateSettings({ wsl_asr_engine: engine, wsl_asr_model: model }).catch(() => {
        onError('已切换本次引擎，但保存默认 WSL 引擎失败');
      });
      return;
    }
    setSelectedMossModel(null);
    void updateSettings({ wsl_asr_engine: engine, wsl_asr_model: '' }).catch(() => {
      onError('已切换本次引擎，但保存默认 WSL 引擎失败');
    });
  }, [onError, selectedWslModel, updateSettings]);

  const handleAsrModelChange = useCallback((model: string) => {
    if (wslEngine === 'moss') setSelectedMossModel(model);
    else setSelectedWslModel(model);
    void updateSettings({ wsl_asr_model: model }).catch(() => {
      onError('已切换本次模型，但保存默认 WSL 模型失败');
    });
  }, [onError, updateSettings, wslEngine]);

  const handleContentModeChange = useCallback((nextMode: ContentMode) => {
    setContentMode(nextMode);
    onError(null);
    if (nextMode === 'podcast') {
      setLanguage('auto');
      setSelectedAsrProvider('wsl_asr');
      setSelectedWslEngine('moss');
    }
  }, [onError]);

  return {
    contentMode,
    asrProvider,
    transcribeOptions,
    isMossModelMissing,
    isPodcastUnavailable,
    controls: {
      language,
      contentMode,
      canUsePodcastMode,
      provider: asrProvider,
      wslEngine,
      asrModel,
      asrContext,
      mossModelOptions,
      isFetchingMossModels,
      mossModelFetchResult,
      qwenBaseUrl: settings.qwen_asr_base_url,
      wslBaseUrl: settings.wsl_asr_base_url,
      onLanguageChange: setLanguage,
      onContentModeChange: handleContentModeChange,
      onProviderChange: handleProviderChange,
      onWslEngineChange: handleWslEngineChange,
      onAsrModelChange: handleAsrModelChange,
      onAsrContextChange: setAsrContext,
      onRefreshMossModels: loadMossModels,
    },
  };
};

export default useTranscribeProviderState;
