import { beforeEach, describe, expect, test, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  getAll: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    voicePresetApi: {
      ...actual.voicePresetApi,
      getAll: apiMocks.getAll,
      update: apiMocks.update,
    },
  };
});

import useStore, { type VoicePreset } from './index';

const presetFixture: VoicePreset = {
  id: 1,
  type: 'clone',
  name: '测试音色',
  style_prompt: '',
  trial_audio_path: null,
  original_audio_path: null,
  design_prompt: null,
  character_image_path: null,
  use_trial_audio_as_clone: 0,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
};

describe('presetSlice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({ presets: [], isLoadingPresets: false, presetError: null });
  });

  test('合法响应写入预设列表', async () => {
    apiMocks.getAll.mockResolvedValue({ data: { presets: [presetFixture] } });

    await useStore.getState().fetchPresets();

    expect(useStore.getState().presets).toEqual([presetFixture]);
    expect(useStore.getState().presetError).toBeNull();
    expect(useStore.getState().isLoadingPresets).toBe(false);
  });

  test('响应结构非法时走统一错误态且不写入脏数据', async () => {
    apiMocks.getAll.mockResolvedValue({ data: { presets: [{ id: 'bad' }] } });

    await useStore.getState().fetchPresets();

    expect(useStore.getState().presets).toEqual([]);
    expect(useStore.getState().presetError).toBe('音色预设加载失败，请确认后端服务已启动');
    expect(useStore.getState().isLoadingPresets).toBe(false);
  });

  test('更新预设时校验单条响应结构', async () => {
    useStore.setState({ presets: [presetFixture] });
    const updated = { ...presetFixture, name: '新名字' };
    apiMocks.update.mockResolvedValue({ data: { preset: updated } });

    await useStore.getState().updatePreset(1, new FormData());

    expect(useStore.getState().presets[0].name).toBe('新名字');
  });

  test('更新预设响应非法时抛错并保留原列表', async () => {
    useStore.setState({ presets: [presetFixture] });
    apiMocks.update.mockResolvedValue({ data: { preset: { id: 'bad' } } });

    await expect(useStore.getState().updatePreset(1, new FormData())).rejects.toThrow();

    expect(useStore.getState().presets).toEqual([presetFixture]);
  });
});
