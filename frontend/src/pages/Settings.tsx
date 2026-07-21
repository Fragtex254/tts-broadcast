import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Header } from '../components/Layout/Header';
import { PasswordField } from '../components/PasswordField';
import { createScopedLogger, toLogError } from '../services/logger';
import useStore, {
  type LlmModelOption,
  type MaskedSecret,
  type Settings as AppSettings,
  type SettingsFormData,
} from '../store';
import {
  buildAutoSaveUpdate,
  changeBaseUrl,
  clearSecretInput,
  clearSecretInputs,
  createSettingsFormData,
  getSecretPlaceholder,
  isSecretSettingKey,
} from './settingsDraft';

const logger = createScopedLogger('settings-page');

const voiceOptions = [
  { value: '冰糖', label: '冰糖' },
  { value: '蜜糖', label: '蜜糖' },
  { value: '清风', label: '清风' },
  { value: '墨鱼', label: '墨鱼' },
  { value: '楠楠', label: '楠楠' },
];

const asrProviderOptions: { value: AppSettings['asr_provider']; label: string; description: string }[] = [
  { value: 'mimo', label: 'MiMo 云端', description: '复用 TTS API Key，适合无需本地部署的场景' },
  { value: 'wsl_asr', label: 'WSL 局域网', description: '一套连接，可使用 Qwen 或 MOSS 识别引擎' },
  { value: 'qwen_mlx', label: 'Qwen 本地（Mac MLX）', description: '连接 Mac 上的 mlx-qwen3-asr serve 服务' },
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

interface SecretStatusProps {
  secret: MaskedSecret;
}

const SecretStatus: React.FC<SecretStatusProps> = ({ secret }) => (
  <span className="font-body text-[11px] text-ink-soft/70">
    {secret.is_set ? `已配置 · ${secret.masked}` : '未配置'}
  </span>
);

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

  const autoSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const formDataRef = useRef(formData);
  const dirtyFieldsRef = useRef(dirtyFields);
  const hasSyncedAsrTab = useRef(false);

  const setDirtyFieldsState = useCallback((next: Set<keyof SettingsFormData>) => {
    dirtyFieldsRef.current = next;
    setDirtyFields(next);
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);
  useEffect(() => {
    if (dirtyFieldsRef.current.size > 0) return;
    const nextFormData = createSettingsFormData(settings);
    formDataRef.current = nextFormData;
    setFormData(nextFormData);
  }, [settings]);
  useEffect(() => {
    if (isLoadingSettings || hasSyncedAsrTab.current) return;
    setAsrConfigTab(settings.asr_provider);
    hasSyncedAsrTab.current = true;
  }, [isLoadingSettings, settings.asr_provider]);

  const handleChange = <K extends keyof SettingsFormData>(field: K, value: SettingsFormData[K]) => {
    const nextFormData = { ...formDataRef.current, [field]: value };
    const nextDirtyFields = new Set(dirtyFieldsRef.current).add(field);
    formDataRef.current = nextFormData;
    setFormData(nextFormData);
    setDirtyFieldsState(nextDirtyFields);
    setSaveSuccess(false);
  };

  /** 自动保存单个字段（onBlur 或 debounce 调用） */
  const handleAutoSave = useCallback(async (field: keyof SettingsFormData) => {
    const update = buildAutoSaveUpdate(formDataRef.current, dirtyFieldsRef.current, field);
    if (!update) return;
    try {
      await updateSettings(update);
      if (isSecretSettingKey(field)) {
        const nextFormData = clearSecretInput(formDataRef.current, field);
        formDataRef.current = nextFormData;
        setFormData(nextFormData);
      }
      const nextDirtyFields = new Set(dirtyFieldsRef.current);
      nextDirtyFields.delete(field);
      setDirtyFieldsState(nextDirtyFields);
    } catch (e) { logger.error({ err: toLogError(e), field: String(field) }, '自动保存设置失败'); }
  }, [setDirtyFieldsState, updateSettings]);

  /** debounce 自动保存，用于文本输入 */
  const debouncedAutoSave = useCallback((field: keyof SettingsFormData, delay = 800) => {
    const key = String(field);
    if (autoSaveTimers.current[key]) clearTimeout(autoSaveTimers.current[key]);
    autoSaveTimers.current[key] = setTimeout(() => {
      handleAutoSave(field);
    }, delay);
  }, [handleAutoSave]);

  useEffect(() => () => {
    Object.values(autoSaveTimers.current).forEach(clearTimeout);
  }, []);

  const handleBaseUrlChange = (value: string) => {
    const draft = changeBaseUrl({
      formData: formDataRef.current,
      dirtyFields: dirtyFieldsRef.current,
      apiFormatTouched,
    }, value);
    formDataRef.current = draft.formData;
    setFormData(draft.formData);
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
      formDataRef.current = nextFormData;
      setFormData(nextFormData);
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

  const SectionCard: React.FC<{
    dotColor: string;
    title: string;
    children: React.ReactNode;
  }> = ({ dotColor, title, children }) => (
    <section
      className="bg-white/80 backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border"

    >
      <div className="flex items-center gap-2 mb-4">
        <span className={`w-2 h-2 rounded-full ${dotColor}`} />
        <h3 className="font-display italic text-[14px] font-medium text-ink-soft">{title}</h3>
      </div>
      {children}
    </section>
  );

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
                          onClick={() => handleImmediateSettingChange('ui_font_preset', option.value)}
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
                          onClick={() => handleImmediateSettingChange('ui_font_scale', option.value)}
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
          )}

          {!isLoadingSettings && settingsView === 'connections' && (
            <SectionCard dotColor="bg-pink" title="API 配置">
              <div className="space-y-5">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/60">LLM API</label>
                      <p className="font-body text-[11px] text-ink-soft/70 mt-0.5">用于资讯改写、文本切分和模型发现</p>
                    </div>
                    <div className="inline-flex rounded-full bg-white/50 border border-card-border p-1">
                      {([
                        { value: 'openai', label: 'OpenAI 兼容' },
                        { value: 'anthropic', label: 'Anthropic 兼容' },
                      ] as const).map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => handleApiFormatChange(option.value)}
                          className={`px-3 py-1.5 rounded-full font-body text-[11px] ui-transition ${formData.llm_api_format === option.value ? 'bg-lilac text-ink shadow-btn' : 'text-ink-soft hover:text-ink'}`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/70">LLM API Key</label>
                        <SecretStatus secret={settings.mimo_api_key} />
                      </div>
                      <PasswordField
                        value={formData.mimo_api_key}
                        onChange={(v) => handleChange('mimo_api_key', v)}
                        onBlur={() => handleAutoSave('mimo_api_key')}
                        placeholder={getSecretPlaceholder(settings.mimo_api_key, '输入 LLM API Key')}
                      />
                    </div>
                    <div>
                      <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/70 mb-1 block">LLM Base URL</label>
                      <input
                        type="text"
                        value={formData.llm_base_url}
                        onChange={(e) => handleBaseUrlChange(e.target.value)}
                        onBlur={() => handleAutoSave('llm_base_url')}
                        placeholder="https://api.example.com/v1"
                        className="w-full px-4 py-2.5 bg-white/70 border border-card-border rounded-xl text-ink placeholder-ink-soft/30 focus:outline-none focus:border-ink/20 font-body text-[12px] transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/70 mb-1 block">LLM 模型</label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={formData.llm_model}
                        onChange={(e) => handleChange('llm_model', e.target.value)}
                        onBlur={() => handleAutoSave('llm_model')}
                        placeholder="输入或选择模型 ID"
                        className="flex-1 px-4 py-2.5 bg-white/70 border border-card-border rounded-xl text-ink placeholder-ink-soft/30 focus:outline-none focus:border-ink/20 font-body text-[12px] transition-colors"
                      />
                      {modelOptions.length > 0 && (
                        <select
                          value={formData.llm_model}
                          onChange={(e) => handleChange('llm_model', e.target.value)}
                          className="sm:w-56 px-4 py-2.5 bg-white/70 border border-card-border rounded-xl text-ink focus:outline-none focus:border-ink/20 font-body text-[12px] appearance-none cursor-pointer transition-colors"
                        >
                          {modelOptions.map((model) => (
                            <option key={model.id} value={model.id}>{model.id}</option>
                          ))}
                        </select>
                      )}
                      <button
                        type="button"
                        onClick={handleFetchModels}
                        disabled={isFetchingModels || !formData.llm_base_url || (!formData.mimo_api_key && !settings.mimo_api_key.is_set)}
                        className="px-4 py-2.5 bg-lemon hover:brightness-105 disabled:opacity-40 text-ink rounded-xl font-body text-[12px] shadow-btn ui-transition duration-fast flex items-center justify-center gap-2 whitespace-nowrap"
                      >
                        {isFetchingModels ? (
                          <><div className="w-3 h-1 bg-ink/20 rounded-full overflow-hidden"><div className="h-full bg-ink/50 rounded-full animate-pulse" style={{ width: '60%' }} /></div>获取中...</>
                        ) : '获取模型'}
                      </button>
                    </div>
                    {modelFetchResult?.resolvedUrl && (
                      <p className="mt-2 font-body text-[11px] text-ink-soft/70 animate-fade-in">已从 {modelFetchResult.resolvedUrl} 获取模型</p>
                    )}
                    {modelFetchResult?.error && (
                      <div className="mt-2 bg-pink/10 border border-pink/30 rounded-xl p-2.5 text-ink text-[12px] font-body animate-shake">
                        {modelFetchResult.error}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/70 mb-1 block">改写系统提示词</label>
                      <textarea
                        value={formData.llm_rewrite_system_prompt}
                        onChange={(e) => {
                          handleChange('llm_rewrite_system_prompt', e.target.value);
                          debouncedAutoSave('llm_rewrite_system_prompt');
                        }}
                        onBlur={() => handleAutoSave('llm_rewrite_system_prompt')}
                        rows={3}
                        className="w-full px-4 py-2.5 bg-white/70 border border-card-border rounded-xl text-ink placeholder-ink-soft/30 focus:outline-none focus:border-ink/20 font-body text-[12px] resize-none transition-colors"
                      />
                    </div>
                    <div>
                      <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/70 mb-1 block">切分系统提示词</label>
                      <textarea
                        value={formData.llm_split_system_prompt}
                        onChange={(e) => {
                          handleChange('llm_split_system_prompt', e.target.value);
                          debouncedAutoSave('llm_split_system_prompt');
                        }}
                        onBlur={() => handleAutoSave('llm_split_system_prompt')}
                        rows={3}
                        className="w-full px-4 py-2.5 bg-white/70 border border-card-border rounded-xl text-ink placeholder-ink-soft/30 focus:outline-none focus:border-ink/20 font-body text-[12px] resize-none transition-colors"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    {([
                      { field: 'llm_rewrite_thinking_enabled', label: '改写 Thinking' },
                      { field: 'llm_split_thinking_enabled', label: '切分 Thinking' },
                    ] as const).map((item) => (
                      <label key={item.field} className="flex items-center justify-between gap-3 flex-1 px-3.5 py-2.5 bg-white/35 border border-card-border rounded-xl cursor-pointer">
                        <span className="font-body text-[12px] text-ink-soft">{item.label}</span>
                        <input
                          type="checkbox"
                          checked={formData[item.field]}
                          onChange={(e) => handleChange(item.field, e.target.checked)}
                          className="sr-only"
                        />
                        <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${formData[item.field] ? 'bg-sage' : 'bg-ink/10'}`}>
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${formData[item.field] ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
                        </span>
                      </label>
                    ))}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={() => handleTestKey('llm')}
                      disabled={isTestingKey === 'llm' || (!formData.mimo_api_key && !settings.mimo_api_key.is_set)}
                      className="px-4 py-2.5 bg-sage hover:brightness-105 disabled:opacity-40 text-ink rounded-xl font-body text-[12px] shadow-btn ui-transition duration-fast flex items-center justify-center gap-2 whitespace-nowrap"
                    >
                      {isTestingKey === 'llm' ? (
                        <><div className="w-3 h-1 bg-ink/20 rounded-full overflow-hidden"><div className="h-full bg-ink/50 rounded-full animate-pulse" style={{ width: '60%' }} /></div>测试中...</>
                      ) : '测试 LLM'}
                    </button>
                    {dirtyFields.has('mimo_api_key') && (
                      <span className="font-body text-[11px] text-ink-soft/70 flex items-center">未保存</span>
                    )}
                  </div>
                  {testResults.llm && (
                    <div className={`p-2.5 rounded-xl font-body text-[12px] animate-fade-in ${testResults.llm.valid ? 'bg-sage/15 text-ink' : 'bg-pink/10 text-ink'}`}>
                      {testResults.llm.valid ? '✓ LLM API Key 验证成功！' : `✕ 验证失败${testResults.llm.error ? `: ${testResults.llm.error}` : '，请检查 API Key 是否正确'}`}
                    </div>
                  )}
                </div>

                <div className="border-t border-dashed border-card-border" />

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div><label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/60">Embedding 搜索</label><p className="mt-0.5 font-body text-[11px] text-ink-soft/70">用于跨播客语义搜索；关闭或连接失败时自动使用关键词检索</p></div>
                    <label className="flex cursor-pointer items-center gap-2 font-body text-[11px] text-ink-soft"><input type="checkbox" checked={formData.embedding_enabled} onChange={(event) => void handleImmediateSettingChange('embedding_enabled', event.target.checked)} />启用</label>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="font-body text-[11px] text-ink-soft">OpenAI-compatible Base URL<input value={formData.embedding_base_url} onChange={(event) => handleChange('embedding_base_url', event.target.value)} onBlur={() => handleAutoSave('embedding_base_url')} placeholder="https://api.openai.com/v1" className="mt-1 w-full rounded-xl border border-card-border bg-white/70 px-4 py-2.5 font-body text-[12px] text-ink outline-none focus:border-ink/20" /></label>
                    <label className="font-body text-[11px] text-ink-soft">Embedding 模型<input value={formData.embedding_model} onChange={(event) => handleChange('embedding_model', event.target.value)} onBlur={() => handleAutoSave('embedding_model')} placeholder="text-embedding-3-small" className="mt-1 w-full rounded-xl border border-card-border bg-white/70 px-4 py-2.5 font-body text-[12px] text-ink outline-none focus:border-ink/20" /></label>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <label className="font-body text-[11px] text-ink-soft">Embedding API Key</label>
                      <SecretStatus secret={settings.embedding_api_key} />
                    </div>
                    <PasswordField value={formData.embedding_api_key} onChange={(value) => handleChange('embedding_api_key', value)} onBlur={() => handleAutoSave('embedding_api_key')} placeholder={getSecretPlaceholder(settings.embedding_api_key, '输入 Embedding API Key')} />
                  </div>
                </div>

                <div className="border-t border-dashed border-card-border" />

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/60">TTS API Key</label>
                    <span className="font-body text-[11px] text-ink-soft/70">用于语音合成和 MiMo 云端转录</span>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <PasswordField
                      value={formData.mimo_tts_api_key}
                      onChange={(v) => handleChange('mimo_tts_api_key', v)}
                      onBlur={() => handleAutoSave('mimo_tts_api_key')}
                      placeholder={getSecretPlaceholder(settings.mimo_tts_api_key, '输入 TTS API Key')}
                      className="flex-1"
                    />
                    <button
                      onClick={() => handleTestKey('tts')}
                      disabled={isTestingKey === 'tts' || (!formData.mimo_tts_api_key && !settings.mimo_tts_api_key.is_set)}
                      className="px-4 py-2.5 bg-sage hover:brightness-105 disabled:opacity-40 text-ink rounded-xl font-body text-[12px] shadow-btn ui-transition duration-fast flex items-center justify-center gap-2 whitespace-nowrap"
                    >
                      {isTestingKey === 'tts' ? (
                        <><div className="w-3 h-1 bg-ink/20 rounded-full overflow-hidden"><div className="h-full bg-ink/50 rounded-full animate-pulse" style={{ width: '60%' }} /></div>测试中...</>
                      ) : '测试 TTS'}
                    </button>
                    {dirtyFields.has('mimo_tts_api_key') && (
                      <span className="font-body text-[11px] text-ink-soft/70 flex items-center">未保存</span>
                    )}
                  </div>
                  <div className="mt-1"><SecretStatus secret={settings.mimo_tts_api_key} /></div>
                  {testResults.tts && (
                    <div className={`mt-2 p-2.5 rounded-xl font-body text-[12px] animate-fade-in ${testResults.tts.valid ? 'bg-sage/15 text-ink' : 'bg-pink/10 text-ink'}`}>
                      {testResults.tts.valid ? '✓ TTS API Key 验证成功！' : `✕ 验证失败${testResults.tts.error ? `: ${testResults.tts.error}` : '，请检查 API Key 是否正确'}`}
                    </div>
                  )}
                </div>

                <div className="border-t border-dashed border-card-border" />

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
                        onClick={() => setAsrConfigTab(option.value)}
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
                          onChange={(e) => handleChange('qwen_asr_base_url', e.target.value)}
                          onBlur={() => handleAutoSave('qwen_asr_base_url')}
                          placeholder="http://localhost:8765/v1"
                          className="w-full px-4 py-2.5 bg-white/70 border border-card-border rounded-xl text-ink placeholder-ink-soft/30 focus:outline-none focus:border-ink/20 font-body text-[12px] transition-colors"
                        />
                      </div>
                      <div>
                        <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/70 mb-1 block">Qwen ASR 模型</label>
                        <input
                          type="text"
                          value={formData.qwen_asr_model}
                          onChange={(e) => handleChange('qwen_asr_model', e.target.value)}
                          onBlur={() => handleAutoSave('qwen_asr_model')}
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
                          onChange={(v) => handleChange('qwen_asr_api_key', v)}
                          onBlur={() => handleAutoSave('qwen_asr_api_key')}
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
                          onChange={(e) => handleChange('wsl_asr_base_url', e.target.value)}
                          onBlur={() => handleAutoSave('wsl_asr_base_url')}
                          placeholder="http://192.168.31.137:18080/v1"
                          className="w-full px-4 py-2.5 bg-white/70 border border-card-border rounded-xl text-ink placeholder-ink-soft/30 focus:outline-none focus:border-ink/20 font-body text-[12px] transition-colors"
                        />
                      </div>
                      <div>
                        <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/70 mb-1 block">默认识别引擎</label>
                        <select
                          value={formData.wsl_asr_engine}
                          onChange={(e) => handleChange('wsl_asr_engine', e.target.value as AppSettings['wsl_asr_engine'])}
                          onBlur={() => handleAutoSave('wsl_asr_engine')}
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
                          onChange={(e) => handleChange('wsl_asr_model', e.target.value)}
                          onBlur={() => handleAutoSave('wsl_asr_model')}
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
                          onChange={(v) => handleChange('wsl_asr_api_key', v)}
                          onBlur={() => handleAutoSave('wsl_asr_api_key')}
                          placeholder={getSecretPlaceholder(settings.wsl_asr_api_key, '如果 WSL 网关启用了 Bearer Token，在这里填写')}
                        />
                      </div>
                      <p className="md:col-span-2 font-body text-[11px] text-ink-soft/70">
                        Qwen 使用 WSL job API；MOSS 使用同一地址下的 OpenAI-compatible 转录接口。协议差异由后端自动处理。
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </SectionCard>
          )}

          {!isLoadingSettings && settingsView === 'preferences' && (
            <SectionCard dotColor="bg-blush" title="音色设置">
              <div>
                <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/60 mb-2 block">默认音色</label>
                <select
                  value={formData.default_voice}
                  onChange={(e) => handleChange('default_voice', e.target.value)}
                  onBlur={() => handleAutoSave('default_voice')}
                  className="w-full px-4 py-2.5 bg-white/70 border border-card-border rounded-xl text-ink focus:outline-none focus:border-ink/20 font-body text-[12px] appearance-none cursor-pointer transition-colors"
                >
                  {voiceOptions.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
                </select>
                <p className="mt-2 font-body text-[11px] text-ink-soft/70">新建或导入稿件进入编辑器时会自动应用，仍可在当前稿件中更换</p>
              </div>
            </SectionCard>
          )}

          {!isLoadingSettings && settingsView === 'preferences' && (
            <SectionCard dotColor="bg-sage" title="播报设置">
              <div className="space-y-4">
                <div>
                  <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/60 mb-2 block">开场白</label>
                  <textarea
                    value={formData.opening_script}
                    onChange={(e) => {
                      handleChange('opening_script', e.target.value);
                      debouncedAutoSave('opening_script');
                    }}
                    onBlur={() => handleAutoSave('opening_script')}
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
                      handleChange('closing_script', e.target.value);
                      debouncedAutoSave('closing_script');
                    }}
                    onBlur={() => handleAutoSave('closing_script')}
                    rows={3}
                    placeholder="请输入播报结束语"
                    className="w-full px-4 py-2.5 bg-white/70 border border-card-border rounded-xl text-ink placeholder-ink-soft/30 focus:outline-none focus:border-ink/20 font-body text-[12px] resize-none transition-colors"
                  />
                </div>
              </div>
            </SectionCard>
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
