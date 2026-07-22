import React from 'react';
import { PasswordField } from '../../components/PasswordField';
import { getSecretPlaceholder } from '../settingsDraft';
import { SecretStatus } from './SettingsSection';
import type { SettingsFormProps } from './types';

export const EmbeddingSection: React.FC<SettingsFormProps> = ({
  formData,
  settings,
  onChange,
  onAutoSave,
  onImmediateChange,
}) => (
  <div className="space-y-3">
    <div className="flex items-center justify-between gap-3">
      <div>
        <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/60">Embedding 搜索</label>
        <p className="mt-0.5 font-body text-[11px] text-ink-soft/70">用于跨播客语义搜索；关闭或连接失败时自动使用关键词检索</p>
      </div>
      <label className="flex cursor-pointer items-center gap-2 font-body text-[11px] text-ink-soft">
        <input
          type="checkbox"
          checked={formData.embedding_enabled}
          onChange={(event) => void onImmediateChange('embedding_enabled', event.target.checked)}
        />
        启用
      </label>
    </div>
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <label className="font-body text-[11px] text-ink-soft">
        OpenAI-compatible Base URL
        <input
          value={formData.embedding_base_url}
          onChange={(event) => onChange('embedding_base_url', event.target.value)}
          onBlur={() => onAutoSave('embedding_base_url')}
          placeholder="https://api.openai.com/v1"
          className="mt-1 w-full rounded-xl border border-card-border bg-white/70 px-4 py-2.5 font-body text-[12px] text-ink outline-none focus:border-ink/20"
        />
      </label>
      <label className="font-body text-[11px] text-ink-soft">
        Embedding 模型
        <input
          value={formData.embedding_model}
          onChange={(event) => onChange('embedding_model', event.target.value)}
          onBlur={() => onAutoSave('embedding_model')}
          placeholder="text-embedding-3-small"
          className="mt-1 w-full rounded-xl border border-card-border bg-white/70 px-4 py-2.5 font-body text-[12px] text-ink outline-none focus:border-ink/20"
        />
      </label>
    </div>
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="font-body text-[11px] text-ink-soft">Embedding API Key</label>
        <SecretStatus secret={settings.embedding_api_key} />
      </div>
      <PasswordField
        value={formData.embedding_api_key}
        onChange={(value) => onChange('embedding_api_key', value)}
        onBlur={() => onAutoSave('embedding_api_key')}
        placeholder={getSecretPlaceholder(settings.embedding_api_key, '输入 Embedding API Key')}
      />
    </div>
  </div>
);
