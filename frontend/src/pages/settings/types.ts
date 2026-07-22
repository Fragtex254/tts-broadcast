import type { LlmModelOption, Settings as AppSettings, SettingsFormData } from '../../store';

/** 设置页表单字段变更与自动保存的统一回调集合 */
export interface SettingsFormProps {
  formData: SettingsFormData;
  settings: AppSettings;
  dirtyFields: Set<keyof SettingsFormData>;
  onChange: <K extends keyof SettingsFormData>(field: K, value: SettingsFormData[K]) => void;
  onAutoSave: (field: keyof SettingsFormData) => Promise<void>;
  onDebouncedAutoSave: (field: keyof SettingsFormData, delay?: number) => void;
  onImmediateChange: <K extends keyof SettingsFormData>(field: K, value: SettingsFormData[K]) => Promise<void>;
}

export interface ModelFetchState {
  modelOptions: LlmModelOption[];
  isFetchingModels: boolean;
  modelFetchResult: { error?: string; resolvedUrl?: string } | null;
  onFetchModels: () => void;
}

export interface KeyTestState {
  isTestingKey: string | null;
  testResults: Record<string, { valid: boolean; error?: string }>;
  onTestKey: (type: 'llm' | 'tts') => void;
}
