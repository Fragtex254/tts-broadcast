import type { Settings } from '../store';

export interface SettingsDraft {
  formData: Settings;
  dirtyFields: Set<keyof Settings>;
  apiFormatTouched: boolean;
}

export function inferApiFormat(baseUrl: string): Settings['llm_api_format'] {
  return baseUrl.toLowerCase().includes('/anthropic') ? 'anthropic' : 'openai';
}

export function changeBaseUrl(draft: SettingsDraft, value: string): SettingsDraft {
  const dirtyFields = new Set(draft.dirtyFields);
  const formData: Settings = {
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

export function buildAutoSaveUpdate<K extends keyof Settings>(
  formData: Settings,
  dirtyFields: Set<keyof Settings>,
  field: K
): Pick<Settings, K> | null {
  if (!dirtyFields.has(field)) return null;
  return { [field]: formData[field] } as Pick<Settings, K>;
}
