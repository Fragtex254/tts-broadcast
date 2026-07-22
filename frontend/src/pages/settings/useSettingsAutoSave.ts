import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import { createScopedLogger, toLogError } from '../../services/logger';
import type { AppState } from '../../store';
import type { SettingsFormData } from '../../store';
import { buildAutoSaveUpdate, clearSecretInput, isSecretSettingKey } from '../settingsDraft';

const logger = createScopedLogger('settings-auto-save');

interface UseSettingsAutoSaveOptions {
  formDataRef: MutableRefObject<SettingsFormData>;
  dirtyFieldsRef: MutableRefObject<Set<keyof SettingsFormData>>;
  updateSettings: AppState['updateSettings'];
  onFormDataChange: (next: SettingsFormData) => void;
  onDirtyFieldsChange: (next: Set<keyof SettingsFormData>) => void;
}

interface SettingsAutoSave {
  /** 立即自动保存单个字段（onBlur 或 debounce 触发） */
  handleAutoSave: (field: keyof SettingsFormData) => Promise<void>;
  /** 文本输入防抖自动保存，默认 800ms */
  debouncedAutoSave: (field: keyof SettingsFormData, delay?: number) => void;
}

/**
 * 设置页自动保存：同一字段的防抖计时器互相替换，卸载时统一清理。
 * 保存成功后密钥字段清空输入、字段移出 dirty 集合；失败只记日志，保留 dirty 状态。
 */
export function useSettingsAutoSave({
  formDataRef,
  dirtyFieldsRef,
  updateSettings,
  onFormDataChange,
  onDirtyFieldsChange,
}: UseSettingsAutoSaveOptions): SettingsAutoSave {
  const autoSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const handleAutoSave = useCallback(async (field: keyof SettingsFormData) => {
    const update = buildAutoSaveUpdate(formDataRef.current, dirtyFieldsRef.current, field);
    if (!update) return;
    try {
      await updateSettings(update);
      if (isSecretSettingKey(field)) {
        const nextFormData = clearSecretInput(formDataRef.current, field);
        formDataRef.current = nextFormData;
        onFormDataChange(nextFormData);
      }
      const nextDirtyFields = new Set(dirtyFieldsRef.current);
      nextDirtyFields.delete(field);
      onDirtyFieldsChange(nextDirtyFields);
    } catch (e) {
      logger.error({ err: toLogError(e), field: String(field) }, '自动保存设置失败');
    }
  }, [dirtyFieldsRef, formDataRef, onDirtyFieldsChange, onFormDataChange, updateSettings]);

  const debouncedAutoSave = useCallback((field: keyof SettingsFormData, delay = 800) => {
    const key = String(field);
    if (autoSaveTimers.current[key]) clearTimeout(autoSaveTimers.current[key]);
    autoSaveTimers.current[key] = setTimeout(() => {
      void handleAutoSave(field);
    }, delay);
  }, [handleAutoSave]);

  useEffect(() => () => {
    Object.values(autoSaveTimers.current).forEach(clearTimeout);
  }, []);

  return { handleAutoSave, debouncedAutoSave };
}
