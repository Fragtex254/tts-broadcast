import React from 'react';

type ActionCardAccent = 'lemon' | 'lilac' | 'neutral';
type ActionCardPadding = 'compact' | 'roomy';

interface ActionCardProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  accent?: ActionCardAccent;
  padding?: ActionCardPadding;
}

const ACCENT_CLASS: Record<ActionCardAccent, string> = {
  lemon: 'border-lemon/50 bg-lemon/15 hover:bg-lemon/25 hover:shadow-card',
  lilac: 'border-lilac/55 bg-lilac/15 hover:bg-lilac/25 hover:shadow-card',
  neutral: 'border-card-border bg-white/55 shadow-card hover:bg-white/75',
};

const PADDING_CLASS: Record<ActionCardPadding, string> = {
  compact: 'p-4',
  roomy: 'p-5',
};

export const ActionCard: React.FC<ActionCardProps> = ({
  accent = 'neutral',
  padding = 'roomy',
  type = 'button',
  className,
  children,
  ...buttonProps
}) => (
  <button
    {...buttonProps}
    type={type}
    className={`pressable group w-full rounded-card border text-left transition-ui ${ACCENT_CLASS[accent]} ${PADDING_CLASS[padding]}${className ? ` ${className}` : ''}`}
  >
    {children}
  </button>
);

export default ActionCard;
