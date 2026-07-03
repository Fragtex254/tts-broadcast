import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { AudioPlayer } from './AudioPlayer';

let resizeObserverCallback: ResizeObserverCallback | null = null;

beforeEach(() => {
  resizeObserverCallback = null;
  vi.stubGlobal('ResizeObserver', class ResizeObserver {
    private callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
      resizeObserverCallback = callback;
    }

    observe(target: Element) {
      Object.defineProperty(target, 'clientWidth', { value: 500, configurable: true });
      this.callback([], this);
    }

    disconnect() {}

    unobserve() {}
  });
});

describe('AudioPlayer', () => {
  test('波形区域提供可拖动的播放进度热区', () => {
    const { container } = render(<AudioPlayer audioUrl="/audio/test.wav" title="测试音频" />);
    const audio = container.querySelector('audio');
    if (!audio) throw new Error('audio element not found');
    Object.defineProperty(audio, 'duration', { value: 60, configurable: true });

    fireEvent.loadedMetadata(audio);

    const slider = screen.getByLabelText('拖动调整播放进度');
    expect(slider.className).toContain('h-full');
    expect(slider.className).not.toContain('h-0');

    fireEvent.change(slider, { target: { value: '12' } });

    expect(audio.currentTime).toBe(12);
  });

  test('波形柱按可用宽度铺满播放器区域', async () => {
    const { container } = render(<AudioPlayer audioUrl="/audio/test.wav" title="测试音频" />);
    resizeObserverCallback?.([], {} as ResizeObserver);

    await waitFor(() => {
      expect(container.querySelectorAll('[data-waveform-bar="true"]').length).toBeGreaterThan(80);
    });
  });
});
