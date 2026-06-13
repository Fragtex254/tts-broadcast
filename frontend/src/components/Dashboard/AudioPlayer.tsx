import React, { useRef, useState, useEffect, useCallback } from 'react';

interface AudioPlayerProps {
  audioUrl: string | null;
  title?: string;
  broadcastId?: number;
  isSaved?: boolean;
  onSave?: (id: number) => void | Promise<unknown>;
  mode?: string | null;
}

const generateWaveformBars = (count: number, seed: string) => {
  // 基于 seed 生成确定性伪随机序列
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    // 简单的 LCG 伪随机
    hash = (hash * 1103515245 + 12345) & 0x7fffffff;
    bars.push(8 + (hash % 2000) / 100);
  }
  return bars;
};

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  audioUrl,
  title = '语音播报',
  broadcastId,
  isSaved,
  onSave,
  mode,
}) => {
  const waveformBars = React.useMemo(
    () => generateWaveformBars(32, audioUrl || title),
    [audioUrl, title]
  );
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [audioUrl]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    if (isPlaying) { audio.pause(); } else { audio.play(); }
    setIsPlaying(!isPlaying);
  }, [isPlaying, audioUrl]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const time = Number(e.target.value);
    audio.currentTime = time;
    setCurrentTime(time);
  };

  const formatTime = (seconds: number): string => {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleDownload = () => {
    if (!audioUrl) return;
    const a = document.createElement('a');
    a.href = audioUrl;
    a.download = `${title}.mp3`;
    a.click();
  };

  // 保存可能因后端返回畸形数据而抛错（saveBroadcast 走 safeParseStrict），
  // 这里兜底 catch，避免未处理的 Promise rejection，并给出可感知的失败反馈
  const handleSave = useCallback(async () => {
    if (!onSave || broadcastId == null) return;
    setSaveError(false);
    setIsSaving(true);
    try {
      await onSave(broadcastId);
    } catch (err) {
      console.error('保存播报失败:', err);
      setSaveError(true);
      window.setTimeout(() => setSaveError(false), 3000);
    } finally {
      setIsSaving(false);
    }
  }, [onSave, broadcastId]);

  const progress = duration > 0 ? currentTime / duration : 0;

  if (!audioUrl) {
    return (
      <div className="bg-white/[0.55] backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border" style={{ animation: 'fade-in-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.2s both' }}>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full bg-sage" />
          <h3 className="font-display italic text-[14px] font-medium text-ink-soft">播放器</h3>
        </div>
        <div className="bg-white/40 rounded-2xl p-8 flex items-center justify-center border border-card-border">
          <p className="font-body text-[12px] text-ink-soft/40 animate-fade-in">
            {mode === 'segmented' ? '请先合并所有句子音频' : '生成语音后在此播放'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/[0.55] backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border" style={{ animation: 'fade-in-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.2s both' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-sage" />
          <h3 className="font-display italic text-[14px] font-medium text-ink-soft">播放器</h3>
        </div>
        <div className="flex items-center gap-3">
          {broadcastId && onSave && (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className={`font-body text-[11px] transition-colors flex items-center gap-1 uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed ${saveError ? 'text-pink animate-shake' : isSaved ? 'text-lemon' : 'text-ink-soft/40 hover:text-lemon'}`}
              title={saveError ? '保存失败，请重试' : isSaved ? '取消保存' : '保存此播报'}
            >
              <svg className="w-3.5 h-3.5" fill={isSaved ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </button>
          )}
          <button onClick={handleDownload} className="font-body text-[11px] text-ink-soft/40 hover:text-ink transition-colors flex items-center gap-1 uppercase tracking-wider">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </button>
        </div>
      </div>

      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      {/* pill 形播放器主体 */}
      <div className="bg-white/50 rounded-full px-4 py-3 flex items-center gap-3 border border-card-border">
        <button
          onClick={togglePlay}
          className="w-9 h-9 bg-pink/25 hover:bg-pink/35 rounded-full flex items-center justify-center transition-colors flex-shrink-0 border border-card-border"
        >
          {isPlaying ? (
            <svg className="w-4 h-4 text-ink" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
          ) : (
            <svg className="w-4 h-4 text-ink ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          )}
        </button>

        {/* 波形可视化 */}
        <div className="flex-1 flex items-center gap-[2px] h-7 overflow-hidden">
          {waveformBars.map((height, i) => {
            const barProgress = i / waveformBars.length;
            const isPlayed = barProgress <= progress;
            return (
              <div
                key={i}
                className={`w-[3px] rounded-full transition-all duration-100 ${isPlayed ? 'bg-pink' : 'bg-ink/10'}`}
                style={{
                  height: `${height}px`,
                  ...(isPlaying && isPlayed ? { animation: `waveform-pulse 1.5s ease-in-out ${i * 0.05}s infinite` } : {}),
                }}
              />
            );
          })}
        </div>

        <span className="font-body text-[11px] text-ink-soft/50 min-w-[72px] text-right tabular-nums">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={duration || 0}
        value={currentTime}
        onChange={handleSeek}
        className="w-full h-0 opacity-0 -mt-3 relative z-10 cursor-pointer"
      />
    </div>
  );
};

export default AudioPlayer;
