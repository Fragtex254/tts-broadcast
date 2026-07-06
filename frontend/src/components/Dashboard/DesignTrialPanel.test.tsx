import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosHeaders, type AxiosResponse } from 'axios';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { DesignTrialPanel } from './DesignTrialPanel';
import { voicePresetApi } from '../../services/api';

const mockStore = vi.hoisted(() => ({
  fetchPresets: vi.fn(),
}));

vi.mock('../../store', () => {
  const state = {
    presets: [],
    fetchPresets: mockStore.fetchPresets,
  };
  const useStoreMock = (selector: (value: typeof state) => unknown) => selector(state);
  return {
    default: useStoreMock,
    useStore: useStoreMock,
  };
});

vi.mock('../../services/api', () => ({
  voicePresetApi: {
    inferDesignFromImage: vi.fn(),
    suggestTrialTextTags: vi.fn(),
    trialDesign: vi.fn(),
    create: vi.fn(),
  },
}));

function axiosResponse<T>(data: T): AxiosResponse<T> {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: { headers: new AxiosHeaders() },
  };
}

describe('DesignTrialPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:preview'),
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      blob: async () => new Blob(['wav'], { type: 'audio/wav' }),
    })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderPanel(overrides: Partial<ComponentProps<typeof DesignTrialPanel>> = {}) {
    const props = {
      voiceDesign: '',
      stylePrompt: '',
      optimizeTextPreview: false,
      characterImageFile: null,
      onVoiceDesignChange: vi.fn(),
      onStylePromptChange: vi.fn(),
      onOptimizeTextPreviewChange: vi.fn(),
      onCharacterImageChange: vi.fn(),
      ...overrides,
    };
    const view = render(<DesignTrialPanel {...props} />);
    return { props, ...view };
  }

  test('上传立绘后反推音色描述并填充设计描述', async () => {
    vi.mocked(voicePresetApi.inferDesignFromImage).mockResolvedValue(axiosResponse({
        designPrompt: '青年女性，清亮柔和，温和角色感',
        characterSummary: '明亮温和',
        stylePrompt: '语气温柔，语速适中',
      }));
    const image = new File(['png'], 'character.png', { type: 'image/png' });
    const { props, container, rerender } = renderPanel();

    expect(container.querySelector('input[type="file"]')).toBeNull();
    fireEvent.click(screen.getByText('打开面板'));
    const fileInput = container.querySelector('input[type="file"]');
    if (!fileInput) throw new Error('file input not found');
    fireEvent.change(fileInput, { target: { files: [image] } });
    expect(props.onCharacterImageChange).toHaveBeenCalledWith(image);

    rerender(
      <DesignTrialPanel
        {...props}
        characterImageFile={image}
      />
    );
    fireEvent.click(screen.getByText('打开面板'));
    fireEvent.click(screen.getByText('反推音色描述'));

    await waitFor(() => {
      expect(props.onVoiceDesignChange).toHaveBeenCalledWith('青年女性，清亮柔和，温和角色感');
    });
    expect(props.onStylePromptChange).toHaveBeenCalledWith('语气温柔，语速适中');
    expect(screen.getAllByText('明亮温和').length).toBeGreaterThan(0);
    const formData = vi.mocked(voicePresetApi.inferDesignFromImage).mock.calls[0][0];
    expect(formData.get('character_image')).toBe(image);
  });

  test('立绘面板内展示上传格式错误', () => {
    const { container } = renderPanel();

    fireEvent.click(screen.getByText('打开面板'));
    const fileInput = container.querySelector('input[type="file"]');
    if (!fileInput) throw new Error('file input not found');
    const file = new File(['text'], 'character.txt', { type: 'text/plain' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(screen.getAllByText('仅支持 PNG、JPG 或 WebP 角色立绘').length).toBeGreaterThan(0);
  });

  test('保存设计预设时随表单提交角色立绘', async () => {
    vi.mocked(voicePresetApi.trialDesign).mockResolvedValue(axiosResponse({ audioUrl: '/audio/trial.wav' }));
    vi.mocked(voicePresetApi.create).mockResolvedValue(axiosResponse({ preset: {} }));
    const image = new File(['png'], 'character.png', { type: 'image/png' });
    const { container } = renderPanel({
      voiceDesign: '清亮柔和的年轻声线',
      characterImageFile: image,
    });

    const trialText = screen.getByPlaceholderText('输入要试听的文本内容...');
    fireEvent.change(trialText, { target: { value: '你好，欢迎收听。' } });
    fireEvent.click(screen.getByText('试听'));

    await waitFor(() => {
      expect(voicePresetApi.trialDesign).toHaveBeenCalled();
    });
    fireEvent.click(screen.getByText('保存预设'));
    fireEvent.change(screen.getByPlaceholderText('为这个音色取个名字...'), {
      target: { value: '立绘音色' },
    });
    fireEvent.click(screen.getByText('保存'));

    await waitFor(() => {
      expect(voicePresetApi.create).toHaveBeenCalled();
    });
    const formData = vi.mocked(voicePresetApi.create).mock.calls[0][0];
    expect(formData.get('type')).toBe('design');
    expect(formData.get('design_prompt')).toBe('清亮柔和的年轻声线');
    expect(formData.get('character_image')).toBe(image);
    expect(container.querySelector('audio')).toBeTruthy();
  });

  test('试听文本标签面板支持 AI 回填', async () => {
    vi.mocked(voicePresetApi.suggestTrialTextTags).mockResolvedValue(axiosResponse({
      taggedText: '[温柔]你好，[轻笑]欢迎收听。',
      stylePrompt: '语气温柔，语速适中，问候后轻停顿',
    }));
    const { props } = renderPanel({
      voiceDesign: '清亮柔和的年轻声线',
      stylePrompt: '语速适中',
    });

    const trialText = screen.getByPlaceholderText('输入要试听的文本内容...');
    fireEvent.change(trialText, { target: { value: '你好，欢迎收听。' } });
    fireEvent.click(screen.getByText('标签编辑'));
    fireEvent.click(screen.getByText('AI 自动优化'));

    await waitFor(() => {
      expect(voicePresetApi.suggestTrialTextTags).toHaveBeenCalledWith({
        text: '你好，欢迎收听。',
        voice_design: '清亮柔和的年轻声线',
        style_prompt: '语速适中',
      });
    });
    await waitFor(() => {
      expect(screen.getAllByDisplayValue('[温柔]你好，[轻笑]欢迎收听。').length).toBeGreaterThan(0);
    });
    expect(props.onStylePromptChange).toHaveBeenCalledWith('语气温柔，语速适中，问候后轻停顿');
  });

  test('试听文本标签面板支持拖到词语之间重排', () => {
    renderPanel();

    const trialText = screen.getByPlaceholderText('输入要试听的文本内容...');
    fireEvent.change(trialText, { target: { value: '你好，欢迎收听。' } });
    fireEvent.click(screen.getByText('标签编辑'));

    const dataStore = new Map<string, string>();
    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      setData: (type: string, data: string) => dataStore.set(type, data),
      getData: (type: string) => dataStore.get(type) || '',
    };

    fireEvent.dragStart(screen.getByText('[轻笑]'), { dataTransfer });
    fireEvent.drop(screen.getByLabelText('插入位置 2'), { dataTransfer });

    expect(screen.getAllByDisplayValue('你好[轻笑]，欢迎收听。').length).toBeGreaterThan(0);
  });

  test('同一位置多标签自动合并为一个方括号标签', () => {
    renderPanel();

    const trialText = screen.getByPlaceholderText('输入要试听的文本内容...');
    fireEvent.change(trialText, { target: { value: '你好，欢迎收听。' } });
    fireEvent.click(screen.getByText('标签编辑'));

    fireEvent.click(screen.getByLabelText('插入位置 0'));
    fireEvent.click(screen.getByText('[温柔]'));
    fireEvent.click(screen.getByLabelText('插入位置 0'));
    fireEvent.click(screen.getByText('[平静]'));

    expect(screen.getAllByDisplayValue('[温柔，平静]你好，欢迎收听。').length).toBeGreaterThan(0);
  });

  test('支持删除单个标签和清空全部标签', () => {
    renderPanel();

    const trialText = screen.getByPlaceholderText('输入要试听的文本内容...');
    fireEvent.change(trialText, { target: { value: '[温柔，平静]你好[轻笑]，欢迎收听。' } });
    fireEvent.click(screen.getByText('标签编辑'));

    fireEvent.click(screen.getByLabelText('删除标签 平静'));
    expect(screen.getAllByDisplayValue('[温柔]你好[轻笑]，欢迎收听。').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText('清空标签'));
    expect(screen.getAllByDisplayValue('你好，欢迎收听。').length).toBeGreaterThan(0);
  });
});
