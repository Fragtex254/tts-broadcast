import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useSettingsAutoSave } from './useSettingsAutoSave';
import { createSettingsFormData } from '../settingsDraft';
import { defaultSettings } from '../../store/defaults';
import type { SettingsFormData } from '../../store';

function createHarness() {
  const formData = createSettingsFormData(defaultSettings);
  const formDataRef = { current: formData };
  const dirtyFieldsRef = { current: new Set<keyof SettingsFormData>(['llm_model']) };
  const updateSettings = vi.fn().mockResolvedValue(undefined);
  const onFormDataChange = vi.fn((next: SettingsFormData) => { formDataRef.current = next; });
  const onDirtyFieldsChange = vi.fn((next: Set<keyof SettingsFormData>) => { dirtyFieldsRef.current = next; });
  const render = () => renderHook(() => useSettingsAutoSave({
    formDataRef,
    dirtyFieldsRef,
    updateSettings,
    onFormDataChange,
    onDirtyFieldsChange,
  }));
  return { formDataRef, dirtyFieldsRef, updateSettings, onFormDataChange, onDirtyFieldsChange, render };
}

describe('useSettingsAutoSave', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  test('debounce 只保留最后一次调用', async () => {
    const harness = createHarness();
    harness.formDataRef.current = { ...harness.formDataRef.current, llm_model: 'model-a' };
    const { result } = harness.render();

    act(() => {
      result.current.debouncedAutoSave('llm_model');
      result.current.debouncedAutoSave('llm_model');
      result.current.debouncedAutoSave('llm_model');
    });
    await act(async () => { vi.advanceTimersByTime(900); });

    expect(harness.updateSettings).toHaveBeenCalledTimes(1);
    expect(harness.updateSettings).toHaveBeenCalledWith({ llm_model: 'model-a' });
  });

  test('保存成功后字段移出 dirty 集合', async () => {
    const harness = createHarness();
    harness.formDataRef.current = { ...harness.formDataRef.current, llm_model: 'model-b' };
    const { result } = harness.render();

    await act(async () => { await result.current.handleAutoSave('llm_model'); });

    expect(harness.dirtyFieldsRef.current.has('llm_model')).toBe(false);
  });

  test('密钥字段保存成功后清空输入', async () => {
    const harness = createHarness();
    harness.formDataRef.current = { ...harness.formDataRef.current, mimo_api_key: 'sk-new-secret' };
    harness.dirtyFieldsRef.current = new Set<keyof SettingsFormData>(['mimo_api_key']);
    const { result } = harness.render();

    await act(async () => { await result.current.handleAutoSave('mimo_api_key'); });

    expect(harness.updateSettings).toHaveBeenCalledWith({ mimo_api_key: 'sk-new-secret' });
    expect(harness.formDataRef.current.mimo_api_key).toBe('');
    expect(harness.dirtyFieldsRef.current.has('mimo_api_key')).toBe(false);
  });

  test('保存失败保留 dirty 状态且不抛错', async () => {
    const harness = createHarness();
    harness.formDataRef.current = { ...harness.formDataRef.current, llm_model: 'model-c' };
    harness.updateSettings.mockRejectedValue(new Error('网络失败'));
    const { result } = harness.render();

    await act(async () => { await result.current.handleAutoSave('llm_model'); });

    expect(harness.dirtyFieldsRef.current.has('llm_model')).toBe(true);
  });

  test('卸载时清理未触发的防抖计时器', () => {
    const harness = createHarness();
    harness.formDataRef.current = { ...harness.formDataRef.current, llm_model: 'model-d' };
    const { result, unmount } = harness.render();

    act(() => { result.current.debouncedAutoSave('llm_model'); });
    unmount();
    act(() => { vi.advanceTimersByTime(2000); });

    expect(harness.updateSettings).not.toHaveBeenCalled();
  });
});
