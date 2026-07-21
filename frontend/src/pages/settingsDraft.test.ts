import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../store/defaults';
import {
  buildAutoSaveUpdate,
  changeBaseUrl,
  clearSecretInput,
  clearSecretInputs,
  createSettingsFormData,
  getSecretPlaceholder,
} from './settingsDraft';
import type { SettingsFormData } from '../store';

describe('settings draft helpers', () => {
  it('marks base URL and inferred API format dirty when base URL changes', () => {
    const draft = changeBaseUrl(
      {
        formData: {
          ...createSettingsFormData(defaultSettings),
          llm_api_format: 'anthropic',
          llm_base_url: 'https://token-plan-cn.xiaomimimo.com/anthropic',
        },
        dirtyFields: new Set<keyof SettingsFormData>(),
        apiFormatTouched: false,
      },
      'https://example.com/v1'
    );

    expect(draft.formData.llm_base_url).toBe('https://example.com/v1');
    expect(draft.formData.llm_api_format).toBe('openai');
    expect(draft.dirtyFields.has('llm_base_url')).toBe(true);
    expect(draft.dirtyFields.has('llm_api_format')).toBe(true);
  });

  it('builds auto-save update from the current form value only when field is dirty', () => {
    const formData = {
      ...createSettingsFormData(defaultSettings),
      opening_script: 'current opening script',
    };

    expect(buildAutoSaveUpdate(formData, new Set<keyof SettingsFormData>(), 'opening_script')).toBeNull();
    expect(
      buildAutoSaveUpdate(
        formData,
        new Set<keyof SettingsFormData>(['opening_script']),
        'opening_script'
      )
    ).toEqual({ opening_script: 'current opening script' });
  });

  it('creates an edit draft without copying masked secrets into input values', () => {
    const formData = createSettingsFormData({
      ...defaultSettings,
      mimo_api_key: { masked: '••••••••1234', is_set: true },
    });

    expect(formData.mimo_api_key).toBe('');
    expect(getSecretPlaceholder(defaultSettings.mimo_api_key, '输入 Key')).toBe('输入 Key');
    expect(getSecretPlaceholder({ masked: '••••••••1234', is_set: true }, '输入 Key')).toContain('1234');
  });

  it('clears newly entered secrets after they are saved', () => {
    const formData = createSettingsFormData(defaultSettings);
    formData.mimo_api_key = 'new-secret';
    formData.wsl_asr_api_key = 'local-secret';

    expect(clearSecretInputs(formData).mimo_api_key).toBe('');
    expect(clearSecretInputs(formData).wsl_asr_api_key).toBe('');
    expect(clearSecretInput(formData, 'mimo_api_key').wsl_asr_api_key).toBe('local-secret');
  });
});
