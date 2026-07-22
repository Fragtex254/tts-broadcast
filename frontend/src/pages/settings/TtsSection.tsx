import React from 'react';
import { PasswordField } from '../../components/PasswordField';
import { getSecretPlaceholder } from '../settingsDraft';
import { SecretStatus } from './SettingsSection';
import type { KeyTestState, SettingsFormProps } from './types';

interface TtsSectionProps extends SettingsFormProps, KeyTestState {}

export const TtsSection: React.FC<TtsSectionProps> = ({
  formData,
  settings,
  dirtyFields,
  onChange,
  onAutoSave,
  isTestingKey,
  testResults,
  onTestKey,
}) => (
  <div>
    <div className="flex items-center gap-2 mb-2">
      <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/60">TTS API Key</label>
      <span className="font-body text-[11px] text-ink-soft/70">用于语音合成和 MiMo 云端转录</span>
    </div>
    <div className="flex flex-col sm:flex-row gap-2">
      <PasswordField
        value={formData.mimo_tts_api_key}
        onChange={(v) => onChange('mimo_tts_api_key', v)}
        onBlur={() => onAutoSave('mimo_tts_api_key')}
        placeholder={getSecretPlaceholder(settings.mimo_tts_api_key, '输入 TTS API Key')}
        className="flex-1"
      />
      <button
        onClick={() => onTestKey('tts')}
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
);
