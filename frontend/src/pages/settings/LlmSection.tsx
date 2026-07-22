import React from 'react';
import { PasswordField } from '../../components/PasswordField';
import { getSecretPlaceholder } from '../settingsDraft';
import { SecretStatus } from './SettingsSection';
import type { KeyTestState, ModelFetchState, SettingsFormProps } from './types';

interface LlmSectionProps extends SettingsFormProps, ModelFetchState, KeyTestState {
  onBaseUrlChange: (value: string) => void;
  onApiFormatChange: (value: SettingsFormProps['formData']['llm_api_format']) => void;
}

export const LlmSection: React.FC<LlmSectionProps> = ({
  formData,
  settings,
  dirtyFields,
  onChange,
  onAutoSave,
  onDebouncedAutoSave,
  modelOptions,
  isFetchingModels,
  modelFetchResult,
  onFetchModels,
  isTestingKey,
  testResults,
  onTestKey,
  onBaseUrlChange,
  onApiFormatChange,
}) => (
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
            onClick={() => onApiFormatChange(option.value)}
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
          onChange={(v) => onChange('mimo_api_key', v)}
          onBlur={() => onAutoSave('mimo_api_key')}
          placeholder={getSecretPlaceholder(settings.mimo_api_key, '输入 LLM API Key')}
        />
      </div>
      <div>
        <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/70 mb-1 block">LLM Base URL</label>
        <input
          type="text"
          value={formData.llm_base_url}
          onChange={(e) => onBaseUrlChange(e.target.value)}
          onBlur={() => onAutoSave('llm_base_url')}
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
          onChange={(e) => onChange('llm_model', e.target.value)}
          onBlur={() => onAutoSave('llm_model')}
          placeholder="输入或选择模型 ID"
          className="flex-1 px-4 py-2.5 bg-white/70 border border-card-border rounded-xl text-ink placeholder-ink-soft/30 focus:outline-none focus:border-ink/20 font-body text-[12px] transition-colors"
        />
        {modelOptions.length > 0 && (
          <select
            value={formData.llm_model}
            onChange={(e) => onChange('llm_model', e.target.value)}
            className="sm:w-56 px-4 py-2.5 bg-white/70 border border-card-border rounded-xl text-ink focus:outline-none focus:border-ink/20 font-body text-[12px] appearance-none cursor-pointer transition-colors"
          >
            {modelOptions.map((model) => (
              <option key={model.id} value={model.id}>{model.id}</option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={onFetchModels}
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
            onChange('llm_rewrite_system_prompt', e.target.value);
            onDebouncedAutoSave('llm_rewrite_system_prompt');
          }}
          onBlur={() => onAutoSave('llm_rewrite_system_prompt')}
          rows={3}
          className="w-full px-4 py-2.5 bg-white/70 border border-card-border rounded-xl text-ink placeholder-ink-soft/30 focus:outline-none focus:border-ink/20 font-body text-[12px] resize-none transition-colors"
        />
      </div>
      <div>
        <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/70 mb-1 block">切分系统提示词</label>
        <textarea
          value={formData.llm_split_system_prompt}
          onChange={(e) => {
            onChange('llm_split_system_prompt', e.target.value);
            onDebouncedAutoSave('llm_split_system_prompt');
          }}
          onBlur={() => onAutoSave('llm_split_system_prompt')}
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
            onChange={(e) => onChange(item.field, e.target.checked)}
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
        onClick={() => onTestKey('llm')}
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
);
