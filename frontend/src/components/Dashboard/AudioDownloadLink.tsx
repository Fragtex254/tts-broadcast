import React from 'react';

interface AudioDownloadLinkProps {
  src: string | null;
  filename: string;
  compact?: boolean;
  onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}

export const AudioDownloadLink: React.FC<AudioDownloadLinkProps> = ({
  src,
  filename,
  compact = false,
  onClick,
}) => {
  if (!src) return null;

  return (
    <a
      href={src}
      download={filename}
      onClick={onClick}
      className={`inline-flex items-center justify-center rounded-xl border border-card-border bg-white/65 font-body font-medium text-ink-soft ui-transition duration-fast hover:bg-white/90 hover:text-ink ${
        compact ? 'px-2.5 py-1.5 text-[11px]' : 'px-3.5 py-2 text-[12px]'
      }`}
      title="下载试听音频"
    >
      下载
    </a>
  );
};

export default AudioDownloadLink;
