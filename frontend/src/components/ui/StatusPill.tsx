import React from 'react';

type StatusTone = 'queued' | 'working' | 'success' | 'error' | 'neutral';

interface StatusPillProps {
  tone?: StatusTone;
  children: React.ReactNode;
  className?: string;
}

const TONE_CLASS: Record<StatusTone, string> = {
  queued: 'border-lemon/45 bg-lemon/25',
  working: 'border-lilac/55 bg-lilac/25',
  success: 'border-sage/60 bg-sage/30',
  error: 'border-pink/45 bg-pink/15',
  neutral: 'border-card-border bg-white/55',
};

export const StatusPill: React.FC<StatusPillProps> = ({ tone = 'neutral', children, className = '' }) => (
  <span className={`ui-control-label ui-control-label-compact inline-flex min-h-7 items-center rounded-full border px-2.5 py-1 text-ink ${TONE_CLASS[tone]} ${className}`}>
    {children}
  </span>
);

export default StatusPill;
