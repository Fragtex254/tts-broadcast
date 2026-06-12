import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../store/defaults';
import { buildAutoSaveUpdate, changeBaseUrl } from './settingsDraft';
import type { Settings } from '../store';

describe('settings draft helpers', () => {
  it('marks base URL and inferred API format dirty when base URL changes', () => {
    const draft = changeBaseUrl(
      {
        formData: {
          ...defaultSettings,
          llm_api_format: 'anthropic',
          llm_base_url: 'https://token-plan-cn.xiaomimimo.com/anthropic',
        },
        dirtyFields: new Set<keyof Settings>(),
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
      ...defaultSettings,
      opening_script: 'current opening script',
    };

    expect(buildAutoSaveUpdate(formData, new Set<keyof Settings>(), 'opening_script')).toBeNull();
    expect(
      buildAutoSaveUpdate(
        formData,
        new Set<keyof Settings>(['opening_script']),
        'opening_script'
      )
    ).toEqual({ opening_script: 'current opening script' });
  });
});
