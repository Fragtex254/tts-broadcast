import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatAudioTime, formatPlaybackRate, generateWaveformBars } from './audioPlaybackUtils';

type AudioPlaybackVariant = 'regular' | 'compact' | 'segment';
type AudioPlaybackVisual = 'waveform' | 'progress';

interface AudioPlaybackBarProps {
  src: string | null;
  variant?: AudioPlaybackVariant;
  visual?: AudioPlaybackVisual;
  playbackRate?: number;
  showPlaybackRate?: boolean;
  waveformSeed?: string;
  onEnded?: () => void;
  resetOnEnded?: boolean;
  playLabel?: string;
  className?: string;
}

interface PitchSafeAudioElement extends HTMLAudioElement {
  preservesPitch: boolean;
  mozPreservesPitch?: boolean;
  webkitPreservesPitch?: boolean;
}

interface AudioPlaybackStyle {
  wrapper: string;
  shell: string;
  playButton: string;
  icon: string;
  playIconOffset: string;
  waveformHeight: string;
  waveformBarWidth: string;
  timeClass: string;
  minimumWaveformBars: number;
  defaultWaveformBars: number;
}

const WAVEFORM_BAR_GAP = 2;
const REGULAR_WAVEFORM_BAR_WIDTH = 3;
const COMPACT_WAVEFORM_BAR_WIDTH = 2;

function getPlayableDuration(audio: HTMLAudioElement): number {
  if (Number.isFinite(audio.duration) && audio.duration > 0) {
    return audio.duration;
  }

  const { seekable } = audio;
  if (seekable.length <= 0) return 0;
  try {
    const end = seekable.end(seekable.length - 1);
    return Number.isFinite(end) && end > 0 ? end : 0;
  } catch {
    return 0;
  }
}

const PLAYBACK_STYLES: Record<AudioPlaybackVariant, AudioPlaybackStyle> = {
  regular: {
    wrapper: 'animate-fade-in',
    shell: 'bg-white/50 rounded-full px-4 py-3 flex items-center gap-3 border border-card-border',
    playButton: 'w-9 h-9 bg-pink/25 hover:bg-pink/35 rounded-full flex items-center justify-center transition-colors flex-shrink-0 border border-card-border',
    icon: 'w-4 h-4 text-ink',
    playIconOffset: 'ml-0.5',
    waveformHeight: 'h-7',
    waveformBarWidth: 'w-[3px]',
    timeClass: 'font-body text-[11px] text-ink-soft/70 min-w-[72px] text-right tabular-nums',
    minimumWaveformBars: 12,
    defaultWaveformBars: 64,
  },
  compact: {
    wrapper: 'animate-fade-in',
    shell: 'bg-white/50 rounded-full px-3 py-2 flex items-center gap-2 border border-card-border',
    playButton: 'w-7 h-7 bg-pink/25 hover:bg-pink/35 rounded-full flex items-center justify-center transition-colors flex-shrink-0 border border-card-border',
    icon: 'w-3 h-3 text-ink',
    playIconOffset: 'ml-0.5',
    waveformHeight: 'h-5',
    waveformBarWidth: 'w-[2px]',
    timeClass: 'font-body text-[9px] text-ink-soft/70 min-w-[56px] text-right tabular-nums',
    minimumWaveformBars: 20,
    defaultWaveformBars: 20,
  },
  segment: {
    wrapper: 'animate-fade-in',
    shell: 'bg-white/80 rounded-full px-2.5 py-1.5 border border-card-border flex items-center gap-2',
    playButton: 'w-7 h-7 bg-pink/25 hover:bg-pink/35 rounded-full flex items-center justify-center transition-colors flex-shrink-0 border border-card-border',
    icon: 'w-3 h-3 text-ink',
    playIconOffset: 'ml-0.5',
    waveformHeight: 'h-5',
    waveformBarWidth: 'w-[2px]',
    timeClass: 'font-body text-[9px] text-ink-soft/70 min-w-[56px] text-right tabular-nums',
    minimumWaveformBars: 20,
    defaultWaveformBars: 20,
  },
};

export const AudioPlaybackBar: React.FC<AudioPlaybackBarProps> = ({
  src,
  variant = 'regular',
  visual = 'waveform',
  playbackRate = 1,
  showPlaybackRate = false,
  waveformSeed,
  onEnded,
  resetOnEnded = false,
  playLabel = '音频',
  className = '',
}) => {
  const audioRef = useRef<PitchSafeAudioElement>(null);
  const waveformRef = useRef<HTMLDivElement>(null);
  const onEndedRef = useRef(onEnded);
  const styles = PLAYBACK_STYLES[variant];
  const normalizedPlaybackRate = Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1;

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hasPlaybackError, setHasPlaybackError] = useState(false);
  const [waveformBarCount, setWaveformBarCount] = useState(styles.defaultWaveformBars);

  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;

    const updateTime = () => {
      setCurrentTime(Number.isFinite(audio.currentTime) ? audio.currentTime : 0);
      setDuration(getPlayableDuration(audio));
    };
    const updateDuration = () => setDuration(getPlayableDuration(audio));
    const handleEnded = () => {
      setIsPlaying(false);
      if (resetOnEnded) {
        audio.currentTime = 0;
        setCurrentTime(0);
      }
      onEndedRef.current?.();
    };
    const handleError = () => {
      setIsPlaying(false);
      setHasPlaybackError(true);
    };
    const handlePause = () => setIsPlaying(false);

    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setHasPlaybackError(false);

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('durationchange', updateDuration);
    audio.addEventListener('loadeddata', updateDuration);
    audio.addEventListener('canplay', updateDuration);
    audio.addEventListener('progress', updateDuration);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('durationchange', updateDuration);
      audio.removeEventListener('loadeddata', updateDuration);
      audio.removeEventListener('canplay', updateDuration);
      audio.removeEventListener('progress', updateDuration);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('pause', handlePause);
    };
  }, [resetOnEnded, src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.preservesPitch = true;
    audio.mozPreservesPitch = true;
    audio.webkitPreservesPitch = true;
    audio.playbackRate = normalizedPlaybackRate;
  }, [normalizedPlaybackRate, src]);

  useEffect(() => {
    if (visual !== 'waveform') return undefined;
    const waveform = waveformRef.current;
    if (!waveform || typeof ResizeObserver === 'undefined') return undefined;

    const updateBarCount = () => {
      const width = waveform.clientWidth;
      if (width <= 0) return;
      const barWidth = variant === 'regular' ? REGULAR_WAVEFORM_BAR_WIDTH : COMPACT_WAVEFORM_BAR_WIDTH;
      const nextCount = Math.max(styles.minimumWaveformBars, Math.floor(width / (barWidth + WAVEFORM_BAR_GAP)));
      setWaveformBarCount((current) => (current === nextCount ? current : nextCount));
    };

    updateBarCount();
    const observer = new ResizeObserver(updateBarCount);
    observer.observe(waveform);
    return () => observer.disconnect();
  }, [styles.minimumWaveformBars, variant, visual]);

  const waveformBars = useMemo(
    () => generateWaveformBars(waveformBarCount, waveformSeed || src || playLabel),
    [playLabel, src, waveformBarCount, waveformSeed]
  );

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !src) return;

    setHasPlaybackError(false);
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    try {
      audio.play()
        .then(() => setIsPlaying(true))
        .catch(() => {
          setIsPlaying(false);
          setHasPlaybackError(true);
        });
    } catch {
      setIsPlaying(false);
      setHasPlaybackError(true);
    }
  }, [isPlaying, src]);

  const handleSeek = useCallback((event: React.ChangeEvent<HTMLInputElement> | React.FormEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    const nextTime = Number(event.currentTarget.value);
    setCurrentTime(nextTime);
    if (audio) {
      audio.currentTime = nextTime;
    }
  }, []);

  if (!src) return null;

  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;
  const wrapperClassName = [styles.wrapper, className].filter(Boolean).join(' ');

  const playIcon = isPlaying ? (
    <svg className={styles.icon} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  ) : (
    <svg className={`${styles.icon} ${styles.playIconOffset}`} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );

  const waveform = (
    <>
      <div ref={waveformRef} className={`relative flex-1 overflow-hidden ${styles.waveformHeight}`}>
        <div className="absolute inset-0 flex items-center gap-[2px] pointer-events-none">
          {waveformBars.map((height, index) => {
            const barProgress = index / waveformBars.length;
            const isPlayed = barProgress <= progress;
            return (
              <div
                key={index}
                data-waveform-bar="true"
                className={`${styles.waveformBarWidth} rounded-full transition-colors duration-100 ${isPlayed ? 'bg-pink' : 'bg-ink/10'}`}
                style={{
                  height: `${variant === 'regular' ? height : height * 0.7}px`,
                  ...(isPlaying && isPlayed ? { animation: `waveform-pulse 1.5s ease-in-out ${index * 0.05}s infinite` } : {}),
                }}
              />
            );
          })}
        </div>
        <input
          type="range"
          aria-label="拖动调整播放进度"
          min={0}
          max={duration || 0}
          step="0.01"
          value={currentTime}
          onInput={handleSeek}
          onChange={handleSeek}
          disabled={duration <= 0}
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
      </div>
      <span className={styles.timeClass}>
        {formatAudioTime(currentTime)} / {formatAudioTime(duration)}
      </span>
    </>
  );

  const progressBar = (
    <div className="min-w-0 flex-1">
      <div className="relative flex h-5 items-center">
        <div className="absolute left-0 right-0 h-1.5 overflow-hidden rounded-full bg-ink/10">
          <div
            className="h-full w-full origin-left rounded-full bg-pink transition-transform duration-100 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ transform: `scaleX(${progress})` }}
          />
        </div>
        <input
          type="range"
          aria-label="拖动调整播放进度"
          min={0}
          max={duration || 0}
          step="0.01"
          value={currentTime}
          onInput={handleSeek}
          onChange={handleSeek}
          disabled={duration <= 0}
          className="relative z-10 h-5 w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          title="拖动调整播放进度"
        />
      </div>
      <div className="flex justify-between font-body text-[9px] leading-none text-ink-soft/70 tabular-nums">
        <span>{formatAudioTime(currentTime)}</span>
        <span>
          {showPlaybackRate ? `${formatPlaybackRate(normalizedPlaybackRate)} · ` : ''}
          {formatAudioTime(duration)}
        </span>
      </div>
    </div>
  );

  return (
    <div className={wrapperClassName}>
      <audio ref={audioRef} src={src} preload="metadata" />
      <div className={styles.shell}>
        <button
          type="button"
          onClick={togglePlay}
          className={styles.playButton}
          title={isPlaying ? `暂停${playLabel}` : `播放${playLabel}`}
        >
          {playIcon}
        </button>
        {visual === 'waveform' ? waveform : progressBar}
      </div>
      {hasPlaybackError && (
        <p className="mt-1 font-body text-[10px] text-pink animate-shake">音频暂时无法播放</p>
      )}
    </div>
  );
};

export default AudioPlaybackBar;
