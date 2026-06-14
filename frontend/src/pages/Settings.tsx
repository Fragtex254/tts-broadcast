import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Header } from '../components/Layout/Header';
import { PasswordField } from '../components/PasswordField';
import { createScopedLogger, toLogError } from '../services/logger';
import useStore, { type LlmModelOption, type Settings as AppSettings } from '../store';
import { buildAutoSaveUpdate, changeBaseUrl } from './settingsDraft';

const logger = createScopedLogger('settings-page');

const voiceOptions = [
  { value: '冰糖', label: '冰糖' },
  { value: '蜜糖', label: '蜜糖' },
  { value: '清风', label: '清风' },
  { value: '墨鱼', label: '墨鱼' },
  { value: '楠楠', label: '楠楠' },
];

const cronExamples = [
  { label: '每天早上 8:00', value: '0 8 * * *' },
  { label: '每天中午 12:00', value: '0 12 * * *' },
  { label: '每天下午 18:00', value: '0 18 * * *' },
  { label: '工作日早上 9:00', value: '0 9 * * 1-5' },
  { label: '每周一早上 10:00', value: '0 10 * * 1' },
];

export const Settings: React.FC = () => {
  const settings = useStore((s) => s.settings);
  const isLoadingSettings = useStore((s) => s.isLoadingSettings);
  const fetchSettings = useStore((s) => s.fetchSettings);
  const updateSettings = useStore((s) => s.updateSettings);
  const testApiKey = useStore((s) => s.testApiKey);
  const fetchLlmModels = useStore((s) => s.fetchLlmModels);
  const schedules = useStore((s) => s.schedules);
  const fetchSchedules = useStore((s) => s.fetchSchedules);
  const createSchedule = useStore((s) => s.createSchedule);
  const deleteSchedule = useStore((s) => s.deleteSchedule);
  const toggleSchedule = useStore((s) => s.toggleSchedule);

  const [formData, setFormData] = useState(settings);
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingKey, setIsTestingKey] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { valid: boolean; error?: string }>>({});
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [dirtyFields, setDirtyFields] = useState<Set<keyof AppSettings>>(new Set());
  const [modelOptions, setModelOptions] = useState<LlmModelOption[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [modelFetchResult, setModelFetchResult] = useState<{ error?: string; resolvedUrl?: string } | null>(null);
  const [apiFormatTouched, setApiFormatTouched] = useState(false);

  const autoSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const formDataRef = useRef(formData);
  const dirtyFieldsRef = useRef(dirtyFields);

  const [scheduleForm, setScheduleForm] = useState({ name: '', cron_expression: '', content_types: '' });
  const [isCreatingSchedule, setIsCreatingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const setDirtyFieldsState = useCallback((next: Set<keyof AppSettings>) => {
    dirtyFieldsRef.current = next;
    setDirtyFields(next);
  }, []);

  useEffect(() => { fetchSettings(); fetchSchedules(); }, [fetchSettings, fetchSchedules]);
  useEffect(() => {
    if (dirtyFieldsRef.current.size > 0) return;
    formDataRef.current = settings;
    setFormData(settings);
  }, [settings]);

  const handleChange = <K extends keyof AppSettings>(field: K, value: AppSettings[K]) => {
    const nextFormData = { ...formDataRef.current, [field]: value };
    const nextDirtyFields = new Set(dirtyFieldsRef.current).add(field);
    formDataRef.current = nextFormData;
    setFormData(nextFormData);
    setDirtyFieldsState(nextDirtyFields);
    setSaveSuccess(false);
  };

  /** 自动保存单个字段（onBlur 或 debounce 调用） */
  const handleAutoSave = useCallback(async (field: keyof AppSettings) => {
    const update = buildAutoSaveUpdate(formDataRef.current, dirtyFieldsRef.current, field);
    if (!update) return;
    try {
      await updateSettings(update);
      const nextDirtyFields = new Set(dirtyFieldsRef.current);
      nextDirtyFields.delete(field);
      setDirtyFieldsState(nextDirtyFields);
    } catch (e) { logger.error({ err: toLogError(e), field: String(field) }, '自动保存设置失败'); }
  }, [setDirtyFieldsState, updateSettings]);

  /** debounce 自动保存，用于文本输入 */
  const debouncedAutoSave = useCallback((field: keyof AppSettings, delay = 800) => {
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

  const handleApiFormatChange = (value: AppSettings['llm_api_format']) => {
    setApiFormatTouched(true);
    handleChange('llm_api_format', value);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await updateSettings(formDataRef.current);
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
      const apiKey = type === 'tts' ? formData.mimo_tts_api_key : formData.mimo_api_key;
      const llmConfig = type === 'llm' ? {
        apiFormat: formData.llm_api_format,
        baseUrl: formData.llm_base_url,
        model: formData.llm_model,
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
        apiKey: formData.mimo_api_key,
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

  const handleCreateSchedule = async () => {
    if (!scheduleForm.name || !scheduleForm.cron_expression) { setScheduleError('请填写任务名称和执行时间'); return; }
    setIsCreatingSchedule(true); setScheduleError(null);
    try { await createSchedule(scheduleForm); setScheduleForm({ name: '', cron_expression: '', content_types: '' }); }
    catch { setScheduleError('创建定时任务失败'); }
    finally { setIsCreatingSchedule(false); }
  };

  const handleDeleteSchedule = async (id: number) => {
    if (!window.confirm('确定要删除此定时任务吗？')) return;
    try { await deleteSchedule(id); } catch (e) { logger.error({ err: toLogError(e), scheduleId: id }, '删除定时任务失败'); }
  };

  const handleToggleSchedule = async (id: number) => {
    try { await toggleSchedule(id); } catch (e) { logger.error({ err: toLogError(e), scheduleId: id }, '切换任务状态失败'); }
  };

  const formatCronExpression = (cron: string) => cronExamples.find((e) => e.value === cron)?.label || cron;

  const SectionCard: React.FC<{
    dotColor: string;
    title: string;
    index: number;
    children: React.ReactNode;
  }> = ({ dotColor, title, index, children }) => (
    <section
      className="bg-white/[0.55] backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border"
      style={{ animation: `fade-in-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) ${index * 0.1}s both` }}
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
      <Header title="系统设置" subtitle="配置 TTS 播报系统参数" />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {isLoadingSettings && (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white/[0.55] rounded-card p-5 animate-pulse">
                  <div className="h-3 bg-ink/5 rounded w-24 mb-4" />
                  <div className="h-8 bg-ink/5 rounded w-full" />
                </div>
              ))}
            </div>
          )}

          {!isLoadingSettings && (
            <SectionCard dotColor="bg-pink" title="API 配置" index={0}>
              <div className="space-y-5">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/60">LLM API</label>
                      <p className="font-body text-[10px] text-ink-soft/40 mt-0.5">用于资讯改写、文本切分和模型发现</p>
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
                          className={`px-3 py-1.5 rounded-full font-body text-[11px] transition-all ${formData.llm_api_format === option.value ? 'bg-lilac text-ink shadow-btn' : 'text-ink-soft hover:text-ink'}`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="font-body text-[10px] uppercase tracking-wider text-ink-soft/50 mb-1 block">LLM API Key</label>
                      <PasswordField
                        value={formData.mimo_api_key}
                        onChange={(v) => handleChange('mimo_api_key', v)}
                        onBlur={() => handleAutoSave('mimo_api_key')}
                        placeholder="输入 LLM API Key"
                      />
                    </div>
                    <div>
                      <label className="font-body text-[10px] uppercase tracking-wider text-ink-soft/50 mb-1 block">LLM Base URL</label>
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
                    <label className="font-body text-[10px] uppercase tracking-wider text-ink-soft/50 mb-1 block">LLM 模型</label>
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
                        disabled={isFetchingModels || !formData.llm_base_url || !formData.mimo_api_key}
                        className="px-4 py-2.5 bg-lemon hover:brightness-105 disabled:opacity-40 text-ink rounded-xl font-body text-[12px] shadow-btn transition-all duration-150 flex items-center justify-center gap-2 whitespace-nowrap"
                      >
                        {isFetchingModels ? (
                          <><div className="w-3 h-1 bg-ink/20 rounded-full overflow-hidden"><div className="h-full bg-ink/50 rounded-full animate-pulse" style={{ width: '60%' }} /></div>获取中...</>
                        ) : '获取模型'}
                      </button>
                    </div>
                    {modelFetchResult?.resolvedUrl && (
                      <p className="mt-2 font-body text-[11px] text-ink-soft/50 animate-fade-in">已从 {modelFetchResult.resolvedUrl} 获取模型</p>
                    )}
                    {modelFetchResult?.error && (
                      <div className="mt-2 bg-pink/10 border border-pink/30 rounded-xl p-2.5 text-ink text-[12px] font-body animate-shake">
                        {modelFetchResult.error}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="font-body text-[10px] uppercase tracking-wider text-ink-soft/50 mb-1 block">改写系统提示词</label>
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
                      <label className="font-body text-[10px] uppercase tracking-wider text-ink-soft/50 mb-1 block">切分系统提示词</label>
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
                      disabled={isTestingKey === 'llm' || !formData.mimo_api_key}
                      className="px-4 py-2.5 bg-sage hover:brightness-105 disabled:opacity-40 text-ink rounded-xl font-body text-[12px] shadow-btn transition-all duration-150 flex items-center justify-center gap-2 whitespace-nowrap"
                    >
                      {isTestingKey === 'llm' ? (
                        <><div className="w-3 h-1 bg-ink/20 rounded-full overflow-hidden"><div className="h-full bg-ink/50 rounded-full animate-pulse" style={{ width: '60%' }} /></div>测试中...</>
                      ) : '测试 LLM'}
                    </button>
                    {dirtyFields.has('mimo_api_key') && (
                      <span className="font-body text-[11px] text-ink-soft/40 flex items-center">未保存</span>
                    )}
                  </div>
                  {testResults.llm && (
                    <div className={`p-2.5 rounded-xl font-body text-[12px] animate-fade-in ${testResults.llm.valid ? 'bg-sage/15 text-ink' : 'bg-pink/10 text-ink'}`}>
                      {testResults.llm.valid ? '✓ LLM API Key 验证成功！' : `✕ 验证失败${testResults.llm.error ? `: ${testResults.llm.error}` : '，请检查 API Key 是否正确'}`}
                    </div>
                  )}
                </div>

                <div className="border-t border-dashed border-card-border" />

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/60">TTS API Key</label>
                    <span className="font-body text-[10px] text-ink-soft/40">用于语音合成和转录</span>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <PasswordField
                      value={formData.mimo_tts_api_key}
                      onChange={(v) => handleChange('mimo_tts_api_key', v)}
                      onBlur={() => handleAutoSave('mimo_tts_api_key')}
                      placeholder="输入 TTS API Key"
                      className="flex-1"
                    />
                    <button
                      onClick={() => handleTestKey('tts')}
                      disabled={isTestingKey === 'tts' || !formData.mimo_tts_api_key}
                      className="px-4 py-2.5 bg-sage hover:brightness-105 disabled:opacity-40 text-ink rounded-xl font-body text-[12px] shadow-btn transition-all duration-150 flex items-center justify-center gap-2 whitespace-nowrap"
                    >
                      {isTestingKey === 'tts' ? (
                        <><div className="w-3 h-1 bg-ink/20 rounded-full overflow-hidden"><div className="h-full bg-ink/50 rounded-full animate-pulse" style={{ width: '60%' }} /></div>测试中...</>
                      ) : '测试 TTS'}
                    </button>
                    {dirtyFields.has('mimo_tts_api_key') && (
                      <span className="font-body text-[11px] text-ink-soft/40 flex items-center">未保存</span>
                    )}
                  </div>
                  {testResults.tts && (
                    <div className={`mt-2 p-2.5 rounded-xl font-body text-[12px] animate-fade-in ${testResults.tts.valid ? 'bg-sage/15 text-ink' : 'bg-pink/10 text-ink'}`}>
                      {testResults.tts.valid ? '✓ TTS API Key 验证成功！' : `✕ 验证失败${testResults.tts.error ? `: ${testResults.tts.error}` : '，请检查 API Key 是否正确'}`}
                    </div>
                  )}
                </div>
              </div>
            </SectionCard>
          )}

          {!isLoadingSettings && (
            <SectionCard dotColor="bg-blush" title="音色设置" index={1}>
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
                <p className="mt-2 font-body text-[11px] text-ink-soft/40">选择播报时使用的默认语音音色</p>
              </div>
            </SectionCard>
          )}

          {!isLoadingSettings && (
            <SectionCard dotColor="bg-sage" title="播报设置" index={2}>
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
            <div className="flex items-center justify-between" style={{ animation: 'fade-in-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.3s both' }}>
              <div className="flex items-center gap-2">
                {saveSuccess && (
                  <span className="font-body text-[12px] text-sage flex items-center gap-1.5 animate-fade-in">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    设置已保存
                  </span>
                )}
                {dirtyFields.size > 0 && !saveSuccess && (
                  <span className="font-body text-[12px] text-ink-soft/40">
                    {dirtyFields.size} 项更改未保存
                  </span>
                )}
              </div>
              <button
                onClick={handleSave}
                disabled={isSaving || dirtyFields.size === 0}
                className="px-6 py-2.5 bg-sage hover:brightness-105 disabled:opacity-40 text-ink rounded-xl font-body font-medium text-[12px] shadow-btn transition-all duration-150 hover:-translate-y-px active:translate-y-0 flex items-center gap-2 uppercase tracking-wider"
              >
                {isSaving ? (
                  <><div className="w-3 h-1 bg-ink/20 rounded-full overflow-hidden"><div className="h-full bg-ink/50 rounded-full animate-pulse" style={{ width: '60%' }} /></div>保存中...</>
                ) : '保存设置'}
              </button>
            </div>
          )}

          <SectionCard dotColor="bg-lemon" title="定时任务" index={4}>
            <div className="bg-white/30 rounded-2xl p-4 mb-4 border border-card-border">
              <h4 className="font-body text-[12px] font-medium text-ink mb-3">添加新任务</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="font-body text-[10px] uppercase tracking-wider text-ink-soft/50 mb-1 block">任务名称</label>
                  <input type="text" value={scheduleForm.name} onChange={(e) => setScheduleForm((p) => ({ ...p, name: e.target.value }))} placeholder="例如：每日早报" className="w-full px-3 py-2 bg-white/70 border border-card-border rounded-xl text-ink text-[12px] font-body placeholder-ink-soft/30 focus:outline-none focus:border-ink/20" />
                </div>
                <div>
                  <label className="font-body text-[10px] uppercase tracking-wider text-ink-soft/50 mb-1 block">执行时间</label>
                  <select value={scheduleForm.cron_expression} onChange={(e) => setScheduleForm((p) => ({ ...p, cron_expression: e.target.value }))} className="w-full px-3 py-2 bg-white/70 border border-card-border rounded-xl text-ink text-[12px] font-body focus:outline-none focus:border-ink/20 appearance-none cursor-pointer">
                    <option value="">选择执行时间</option>
                    {cronExamples.map((ex) => <option key={ex.value} value={ex.value}>{ex.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="font-body text-[10px] uppercase tracking-wider text-ink-soft/50 mb-1 block">内容类型（可选）</label>
                  <input type="text" value={scheduleForm.content_types} onChange={(e) => setScheduleForm((p) => ({ ...p, content_types: e.target.value }))} placeholder="留空则使用默认" className="w-full px-3 py-2 bg-white/70 border border-card-border rounded-xl text-ink text-[12px] font-body placeholder-ink-soft/30 focus:outline-none focus:border-ink/20" />
                </div>
              </div>
              {scheduleError && <p className="mt-2 font-body text-[11px] text-pink">{scheduleError}</p>}
              <div className="mt-3 flex justify-end">
                <button onClick={handleCreateSchedule} disabled={isCreatingSchedule} className="px-4 py-2 bg-lemon hover:brightness-105 disabled:opacity-40 text-ink text-[12px] font-body font-medium rounded-xl shadow-btn transition-all duration-150">
                  {isCreatingSchedule ? '创建中...' : '添加任务'}
                </button>
              </div>
            </div>

            {schedules.length === 0 ? (
              <div className="text-center py-8 animate-fade-in">
                <p className="font-display italic text-[14px] text-ink-soft/30">暂无定时任务</p>
                <p className="font-body text-[11px] text-ink-soft/20 mt-1">添加定时任务可自动生成播报</p>
              </div>
            ) : (
              <div className="space-y-2">
                {schedules.map((schedule, index) => (
                  <div
                    key={schedule.id}
                    className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${schedule.is_active ? 'bg-white/40 border-card-border' : 'bg-white/20 border-card-border opacity-50'}`}
                    style={{ animation: `fade-in-up 0.3s cubic-bezier(0.22, 1, 0.36, 1) ${index * 0.05}s both` }}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleToggleSchedule(schedule.id)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${schedule.is_active ? 'bg-sage' : 'bg-ink/10'}`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${schedule.is_active ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
                      </button>
                      <div>
                        <p className="font-body text-[13px] font-medium text-ink">{schedule.name}</p>
                        <p className="font-body text-[10px] text-ink-soft/50 mt-0.5">{formatCronExpression(schedule.cron_expression)}</p>
                        {schedule.last_run_at && (
                          <p className="font-body text-[10px] text-ink-soft/30 mt-0.5">上次运行: {new Date(schedule.last_run_at).toLocaleString('zh-CN')}</p>
                        )}
                      </div>
                    </div>
                    <button onClick={() => handleDeleteSchedule(schedule.id)} className="p-1.5 text-ink-soft/30 hover:text-pink transition-colors rounded-lg" title="删除任务">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </main>
    </div>
  );
};

export default Settings;
