import type { MaskedSecret, SecretSettingKey, Settings, SettingsFormData } from '../store';

export const SECRET_SETTING_KEYS: readonly SecretSettingKey[] = [
  'mimo_api_key',
  'mimo_tts_api_key',
  'embedding_api_key',
  'qwen_asr_api_key',
  'wsl_asr_api_key',
];

export interface SettingsDraft {
  formData: SettingsFormData;
  dirtyFields: Set<keyof SettingsFormData>;
  apiFormatTouched: boolean;
}

export function createSettingsFormData(settings: Settings): SettingsFormData {
  return {
    ...settings,
    mimo_api_key: '',
    mimo_tts_api_key: '',
    embedding_api_key: '',
    qwen_asr_api_key: '',
    wsl_asr_api_key: '',
  };
}

export function isSecretSettingKey(field: keyof SettingsFormData): field is SecretSettingKey {
  return SECRET_SETTING_KEYS.some((key) => key === field);
}

export function clearSecretInputs(formData: SettingsFormData): SettingsFormData {
  return {
    ...formData,
    mimo_api_key: '',
    mimo_tts_api_key: '',
    embedding_api_key: '',
    qwen_asr_api_key: '',
    wsl_asr_api_key: '',
  };
}

export function clearSecretInput(formData: SettingsFormData, field: SecretSettingKey): SettingsFormData {
  const next = { ...formData };
  next[field] = '';
  return next;
}

export function getSecretPlaceholder(secret: MaskedSecret, emptyPlaceholder: string): string {
  return secret.is_set ? `已配置（${secret.masked}）` : emptyPlaceholder;
}

export function inferApiFormat(baseUrl: string): SettingsFormData['llm_api_format'] {
  return baseUrl.toLowerCase().includes('/anthropic') ? 'anthropic' : 'openai';
}

export function changeBaseUrl(draft: SettingsDraft, value: string): SettingsDraft {
  const dirtyFields = new Set(draft.dirtyFields);
  const formData: SettingsFormData = {
    ...draft.formData,
    llm_base_url: value,
  };

  dirtyFields.add('llm_base_url');

  if (!draft.apiFormatTouched) {
    const nextFormat = inferApiFormat(value);
    formData.llm_api_format = nextFormat;
    if (draft.formData.llm_api_format !== nextFormat) {
      dirtyFields.add('llm_api_format');
    }
  }

  return {
    ...draft,
    formData,
    dirtyFields,
  };
}

export function buildAutoSaveUpdate<K extends keyof SettingsFormData>(
  formData: SettingsFormData,
  dirtyFields: Set<keyof SettingsFormData>,
  field: K
): Pick<SettingsFormData, K> | null {
  if (!dirtyFields.has(field)) return null;
  return { [field]: formData[field] } as Pick<SettingsFormData, K>;
}
