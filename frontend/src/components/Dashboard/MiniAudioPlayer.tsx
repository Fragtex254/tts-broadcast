import React from 'react';
import { AudioPlaybackBar } from './AudioPlaybackBar';

interface MiniAudioPlayerProps {
  src: string | null;
  onEnded?: () => void;
  className?: string;
}

export const MiniAudioPlayer: React.FC<MiniAudioPlayerProps> = ({ src, onEnded, className }) => (
  <AudioPlaybackBar
    src={src}
    variant="compact"
    visual="waveform"
    onEnded={onEnded}
    playLabel="试听音频"
    className={className}
  />
);

export default MiniAudioPlayer;
