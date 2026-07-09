import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { AudioPlaybackBar } from './AudioPlaybackBar';
import { formatAudioTime, generateWaveformBars } from './audioPlaybackUtils';

describe('AudioPlaybackBar', () => {
  test('格式化音频时间时处理非法值和常规时长', () => {
    expect(formatAudioTime(Number.NaN)).toBe('0:00');
    expect(formatAudioTime(-1)).toBe('0:00');
    expect(formatAudioTime(65.8)).toBe('1:05');
  });

  test('波形按 seed 稳定生成', () => {
    expect(generateWaveformBars(4, 'same-audio')).toEqual(generateWaveformBars(4, 'same-audio'));
    expect(generateWaveformBars(4, 'same-audio')).not.toEqual(generateWaveformBars(4, 'other-audio'));
  });

  test('段落模式统一支持倍速、时长显示和进度拖动', () => {
    const { container } = render(
      <AudioPlaybackBar
        src="/audio/segment.wav"
        variant="segment"
        visual="progress"
        playbackRate={1.5}
        showPlaybackRate
        playLabel="段落音频"
      />
    );

    const audio = container.querySelector('audio');
    if (!audio) throw new Error('audio element not found');

    expect(audio.playbackRate).toBe(1.5);
    Object.defineProperty(audio, 'duration', { value: 30, configurable: true });
    fireEvent.loadedMetadata(audio);

    const slider = screen.getByLabelText('拖动调整播放进度');
    fireEvent.change(slider, { target: { value: '9' } });

    expect(audio.currentTime).toBe(9);
    expect(screen.getByText('0:09')).toBeTruthy();
    expect(screen.getByText('1.5x · 0:30')).toBeTruthy();
  });

  test('动态合并音频 duration 为 Infinity 时仍可使用 seekable 范围拖动进度', () => {
    const { container } = render(
      <AudioPlaybackBar
        src="/api/broadcast/1/audio"
        variant="regular"
        visual="waveform"
        playLabel="合并音频"
      />
    );

    const audio = container.querySelector('audio');
    if (!audio) throw new Error('audio element not found');

    Object.defineProperty(audio, 'duration', { value: Infinity, configurable: true });
    Object.defineProperty(audio, 'seekable', {
      value: {
        length: 1,
        start: () => 0,
        end: () => 42,
      },
      configurable: true,
    });
    fireEvent.loadedMetadata(audio);

    const slider = screen.getByLabelText('拖动调整播放进度');
    expect(slider).toBeInstanceOf(HTMLInputElement);
    const seekInput = slider as HTMLInputElement;
    expect(seekInput.disabled).toBe(false);
    expect(seekInput.max).toBe('42');

    fireEvent.change(seekInput, { target: { value: '21' } });
    expect(audio.currentTime).toBe(21);
    expect(screen.getByText('0:21 / 0:42')).toBeTruthy();
  });
});
