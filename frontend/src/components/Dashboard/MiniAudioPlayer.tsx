import React, { useRef, useState, useEffect, useCallback } from 'react';

// ============ 接口定义 ============

interface MiniAudioPlayerProps {
  src: string | null;
  onEnded?: () => void;
}

// ============ 静态数据 ============

const generateBars = (count: number) => {
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    bars.push(6 + Math.random() * 14);
  }
  return bars;
};

const BARS = generateBars(20);

// ============ 主组件 ============

export const MiniAudioPlayer: React.FC<MiniAudioPlayerProps> = ({ src, onEnded }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onMeta = () => setDuration(audio.duration);
    const onEnd = () => { setIsPlaying(false); onEnded?.(); };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('ended', onEnd);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('ended', onEnd);
    };
  }, [src, onEnded]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !src) return;
    if (isPlaying) { audio.pause(); } else { audio.play(); }
    setIsPlaying(!isPlaying);
  }, [isPlaying, src]);

  const formatTime = (s: number) => {
    if (isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  if (!src) return null;

  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <div className="animate-fade-in">
      <audio ref={audioRef} src={src} preload="metadata" />
      <div className="bg-white/50 rounded-full px-3 py-2 flex items-center gap-2 border border-card-border">
        <button
          onClick={togglePlay}
          className="w-7 h-7 bg-pink/25 hover:bg-pink/35 rounded-full flex items-center justify-center transition-colors flex-shrink-0 border border-card-border"
        >
          {isPlaying ? (
            <svg className="w-3 h-3 text-ink" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
          ) : (
            <svg className="w-3 h-3 text-ink ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          )}
        </button>
        <div className="flex-1 flex items-center gap-[2px] h-5 overflow-hidden">
          {BARS.map((height, i) => {
            const barProgress = i / BARS.length;
            const isPlayed = barProgress <= progress;
            return (
              <div
                key={i}
                className={`w-[2px] rounded-full transition-all duration-100 ${isPlayed ? 'bg-pink' : 'bg-ink/10'}`}
                style={{ height: `${height * 0.7}px` }}
              />
            );
          })}
        </div>
        <span className="font-body text-[9px] text-ink-soft/50 min-w-[56px] text-right tabular-nums">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
    </div>
  );
};

export default MiniAudioPlayer;
