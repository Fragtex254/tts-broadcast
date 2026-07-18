import React from 'react';

type ActionTone = 'primary' | 'confirm' | 'edit' | 'secondary' | 'danger' | 'ghost';
type ActionSize = 'sm' | 'md';

interface ActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ActionTone;
  size?: ActionSize;
  isLoading?: boolean;
  loadingLabel?: string;
}

const TONE_CLASS: Record<ActionTone, string> = {
  primary: 'border-lemon/60 bg-lemon text-ink hover:brightness-105',
  confirm: 'border-sage/70 bg-sage text-ink hover:brightness-105',
  edit: 'border-lilac/70 bg-lilac text-ink hover:brightness-105',
  secondary: 'border-card-border bg-white/70 text-ink-soft hover:border-ink/20 hover:bg-white hover:text-ink',
  danger: 'border-pink/60 bg-pink/85 text-ink hover:brightness-105',
  ghost: 'border-transparent bg-transparent text-ink-soft hover:bg-white/55 hover:text-ink',
};

const SIZE_CLASS: Record<ActionSize, string> = {
  sm: 'ui-control-label-compact min-h-9 px-3.5 py-2',
  md: 'min-h-10 px-4 py-2.5',
};

export const ActionButton: React.FC<ActionButtonProps> = ({
  tone = 'secondary',
  size = 'md',
  isLoading = false,
  loadingLabel = '处理中…',
  disabled,
  className = '',
  children,
  ...props
}) => (
  <button
    type="button"
    className={`ui-pressable ui-control-label inline-flex items-center justify-center gap-1.5 rounded-xl border shadow-sm disabled:cursor-not-allowed disabled:opacity-45 ${TONE_CLASS[tone]} ${SIZE_CLASS[size]} ${className}`}
    disabled={disabled || isLoading}
    aria-busy={isLoading || undefined}
    {...props}
  >
    {isLoading ? loadingLabel : children}
  </button>
);

export default ActionButton;
