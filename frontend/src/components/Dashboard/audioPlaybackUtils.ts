export const formatAudioTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
};

export const formatPlaybackRate = (rate: number): string => {
  if (!Number.isFinite(rate) || rate <= 0) return '1x';
  return `${rate.toFixed(2).replace(/\.?0+$/, '')}x`;
};

export const generateWaveformBars = (count: number, seed: string): number[] => {
  const normalizedCount = Math.max(0, Math.floor(count));
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return Array.from({ length: normalizedCount }, () => {
    hash = (Math.imul(hash, 1664525) + 1013904223) >>> 0;
    return 8 + (hash % 1600) / 100;
  });
};
