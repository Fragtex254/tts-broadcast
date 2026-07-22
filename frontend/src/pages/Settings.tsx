import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Header } from '../components/Layout/Header';
import { createScopedLogger, toLogError } from '../services/logger';
import useStore, {
  type LlmModelOption,
  type Settings as AppSettings,
  type SettingsFormData,
} from '../store';
import {
  changeBaseUrl,
  clearSecretInputs,
  createSettingsFormData,
} from './settingsDraft';
import { AsrSection } from './settings/AsrSection';
import { EmbeddingSection } from './settings/EmbeddingSection';
import { LlmSection } from './settings/LlmSection';
import { SectionCard } from './settings/SettingsSection';
import { TtsSection } from './settings/TtsSection';
import { BroadcastScriptSection, UiFontSection, VoiceSection } from './settings/UiPreferencesSection';
import { useSettingsAutoSave } from './settings/useSettingsAutoSave';

const logger = createScopedLogger('settings-page');

export const Settings: React.FC = () => {
  const settings = useStore((s) => s.settings);
  const isLoadingSettings = useStore((s) => s.isLoadingSettings);
  const fetchSettings = useStore((s) => s.fetchSettings);
  const updateSettings = useStore((s) => s.updateSettings);
  const testApiKey = useStore((s) => s.testApiKey);
  const fetchLlmModels = useStore((s) => s.fetchLlmModels);

  const [formData, setFormData] = useState<SettingsFormData>(() => createSettingsFormData(settings));
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingKey, setIsTestingKey] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { valid: boolean; error?: string }>>({});
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [dirtyFields, setDirtyFields] = useState<Set<keyof SettingsFormData>>(new Set());
  const [modelOptions, setModelOptions] = useState<LlmModelOption[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [modelFetchResult, setModelFetchResult] = useState<{ error?: string; resolvedUrl?: string } | null>(null);
  const [apiFormatTouched, setApiFormatTouched] = useState(false);
  const [asrConfigTab, setAsrConfigTab] = useState<AppSettings['asr_provider']>(settings.asr_provider);
  const [settingsView, setSettingsView] = useState<'connections' | 'preferences'>('connections');

  const formDataRef = useRef(formData);
  const dirtyFieldsRef = useRef(dirtyFields);
  const hasSyncedAsrTab = useRef(false);

  const setDirtyFieldsState = useCallback((next: Set<keyof SettingsFormData>) => {
    dirtyFieldsRef.current = next;
    setDirtyFields(next);
  }, []);

  const setFormDataState = useCallback((next: SettingsFormData) => {
    formDataRef.current = next;
    setFormData(next);
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);
  useEffect(() => {
    if (dirtyFieldsRef.current.size > 0) return;
    setFormDataState(createSettingsFormData(settings));
  }, [settings, setFormDataState]);
  useEffect(() => {
    if (isLoadingSettings || hasSyncedAsrTab.current) return;
    setAsrConfigTab(settings.asr_provider);
    hasSyncedAsrTab.current = true;
  }, [isLoadingSettings, settings.asr_provider]);

  const { handleAutoSave, debouncedAutoSave } = useSettingsAutoSave({
    formDataRef,
    dirtyFieldsRef,
    updateSettings,
    onFormDataChange: setFormDataState,
    onDirtyFieldsChange: setDirtyFieldsState,
  });

  const handleChange = <K extends keyof SettingsFormData>(field: K, value: SettingsFormData[K]) => {
    const nextFormData = { ...formDataRef.current, [field]: value };
    const nextDirtyFields = new Set(dirtyFieldsRef.current).add(field);
    formDataRef.current = nextFormData;
    setFormData(nextFormData);
    setDirtyFieldsState(nextDirtyFields);
    setSaveSuccess(false);
  };

  const handleBaseUrlChange = (value: string) => {
    const draft = changeBaseUrl({
      formData: formDataRef.current,
      dirtyFields: dirtyFieldsRef.current,
      apiFormatTouched,
    }, value);
    setFormDataState(draft.formData);
    setDirtyFieldsState(draft.dirtyFields);
    setModelFetchResult(null);
    setSaveSuccess(false);
  };

  const handleApiFormatChange = (value: SettingsFormData['llm_api_format']) => {
    setApiFormatTouched(true);
    handleChange('llm_api_format', value);
  };

  const handleImmediateSettingChange = async <K extends keyof SettingsFormData>(field: K, value: SettingsFormData[K]) => {
    const nextFormData = { ...formDataRef.current, [field]: value };
    formDataRef.current = nextFormData;
    setFormData(nextFormData);
    setSaveSuccess(false);
    try {
      await updateSettings({ [field]: value } as Pick<SettingsFormData, K>);
      const nextDirtyFields = new Set(dirtyFieldsRef.current);
      nextDirtyFields.delete(field);
      setDirtyFieldsState(nextDirtyFields);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 1800);
    } catch (e) {
      const nextDirtyFields = new Set(dirtyFieldsRef.current).add(field);
      setDirtyFieldsState(nextDirtyFields);
      logger.error({ err: toLogError(e), field: String(field) }, '立即保存设置失败');
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await updateSettings(formDataRef.current);
      const nextFormData = clearSecretInputs(formDataRef.current);
      setFormDataState(nextFormData);
      setDirtyFieldsState(new Set());
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
    catch (e) { logger.error({ err: toLogError(e), dirtyFieldCount: dirtyFieldsRef.current.size }, '保存设置失败'); }
    finally { setIsSaving(false); }
  };

  const handleTestKey = async (type: 'llm' | 'tts') => {
    // 测试前自动保存对应的 key
    const keyField = type === 'tts' ? 'mimo_tts_api_key' : 'mimo_api_key';
    if (dirtyFields.has(keyField)) {
      await handleAutoSave(keyField);
    }
    setIsTestingKey(type);
    try {
      const currentFormData = formDataRef.current;
      const apiKey = type === 'tts' ? currentFormData.mimo_tts_api_key : currentFormData.mimo_api_key;
      const llmConfig = type === 'llm' ? {
        apiFormat: currentFormData.llm_api_format,
        baseUrl: currentFormData.llm_base_url,
        model: currentFormData.llm_model,
      } : undefined;
      const result = await testApiKey(type, apiKey, llmConfig);
      setTestResults((prev) => ({ ...prev, [type]: result }));
    } catch (e) {
      setTestResults((prev) => ({ ...prev, [type]: { valid: false, error: (e as Error).message } }));
    } finally {
      setIsTestingKey(null);
    }
  };

  const handleFetchModels = async () => {
    setIsFetchingModels(true);
    setModelFetchResult(null);
    try {
      const result = await fetchLlmModels({
        baseUrl: formData.llm_base_url,
        apiKey: formData.mimo_api_key || undefined,
        apiFormat: formData.llm_api_format,
      });
      setModelOptions(result.models);
      setModelFetchResult({ resolvedUrl: result.resolvedUrl });
    } catch (e) {
      setModelOptions([]);
      setModelFetchResult({ error: (e as Error).message || '获取模型列表失败' });
    } finally {
      setIsFetchingModels(false);
    }
  };

  const formProps = {
    formData,
    settings,
    dirtyFields,
    onChange: handleChange,
    onAutoSave: handleAutoSave,
    onDebouncedAutoSave: debouncedAutoSave,
    onImmediateChange: handleImmediateSettingChange,
  };

  const keyTestProps = {
    isTestingKey,
    testResults,
    onTestKey: (type: 'llm' | 'tts') => { void handleTestKey(type); },
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header title="设置" subtitle="管理服务连接、默认偏好与界面体验" />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto space-y-4">
          {isLoadingSettings && (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white/80 rounded-card p-5 animate-pulse">
                  <div className="h-3 bg-ink/5 rounded w-24 mb-4" />
                  <div className="h-8 bg-ink/5 rounded w-full" />
                </div>
              ))}
            </div>
          )}

          {!isLoadingSettings && (
            <nav aria-label="设置分类" className="grid grid-cols-2 gap-2 rounded-card border border-card-border bg-white/55 p-2 shadow-card">
              <button
                type="button"
                onClick={() => setSettingsView('connections')}
                className={`rounded-2xl px-4 py-3 text-left ui-transition duration-fast ${settingsView === 'connections' ? 'bg-white/90 shadow-card' : 'hover:bg-white/45'}`}
              >
                <span className="block font-display text-[16px] font-medium text-ink">服务连接</span>
                <span className="mt-1 block font-body text-[11px] text-ink-soft/60">LLM、TTS 与 ASR</span>
              </button>
              <button
                type="button"
                onClick={() => setSettingsView('preferences')}
                className={`rounded-2xl px-4 py-3 text-left ui-transition duration-fast ${settingsView === 'preferences' ? 'bg-white/90 shadow-card' : 'hover:bg-white/45'}`}
              >
                <span className="block font-display text-[16px] font-medium text-ink">默认偏好</span>
                <span className="mt-1 block font-body text-[11px] text-ink-soft/60">界面、音色与播报文案</span>
              </button>
            </nav>
          )}

          {!isLoadingSettings && settingsView === 'preferences' && (
            <UiFontSection {...formProps} />
          )}

          {!isLoadingSettings && settingsView === 'connections' && (
            <SectionCard dotColor="bg-pink" title="API 配置">
              <div className="space-y-5">
                <LlmSection
                  {...formProps}
                  {...keyTestProps}
                  modelOptions={modelOptions}
                  isFetchingModels={isFetchingModels}
                  modelFetchResult={modelFetchResult}
                  onFetchModels={() => { void handleFetchModels(); }}
                  onBaseUrlChange={handleBaseUrlChange}
                  onApiFormatChange={handleApiFormatChange}
                />

                <div className="border-t border-dashed border-card-border" />

                <EmbeddingSection {...formProps} />

                <div className="border-t border-dashed border-card-border" />

                <TtsSection {...formProps} {...keyTestProps} />

                <div className="border-t border-dashed border-card-border" />

                <AsrSection {...formProps} asrConfigTab={asrConfigTab} onTabChange={setAsrConfigTab} />
              </div>
            </SectionCard>
          )}

          {!isLoadingSettings && settingsView === 'preferences' && (
            <VoiceSection {...formProps} />
          )}

          {!isLoadingSettings && settingsView === 'preferences' && (
            <BroadcastScriptSection {...formProps} />
          )}

          {!isLoadingSettings && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {saveSuccess && (
                  <span className="font-body text-[12px] text-sage flex items-center gap-1.5 animate-fade-in">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    设置已保存
                  </span>
                )}
                {dirtyFields.size > 0 && !saveSuccess && (
                  <span className="font-body text-[12px] text-ink-soft/70">
                    {dirtyFields.size} 项更改未保存
                  </span>
                )}
              </div>
              <button
                onClick={handleSave}
                disabled={isSaving || dirtyFields.size === 0}
                className="px-6 py-2.5 bg-sage hover:brightness-105 disabled:opacity-40 text-ink rounded-xl font-body font-medium text-[12px] shadow-btn ui-transition duration-fast active:translate-y-0 flex items-center gap-2 uppercase tracking-wider"
              >
                {isSaving ? (
                  <><div className="w-3 h-1 bg-ink/20 rounded-full overflow-hidden"><div className="h-full bg-ink/50 rounded-full animate-pulse" style={{ width: '60%' }} /></div>保存中...</>
                ) : '保存设置'}
              </button>
            </div>
          )}

        </div>
      </main>
    </div>
  );
};

export default Settings;
