import React from 'react';

type ActionButtonVariant = 'primary' | 'edit' | 'confirm' | 'danger' | 'neutral' | 'text';
type ActionButtonSize = 'xs' | 'sm' | 'md' | 'lg';
type ActionButtonShape = 'rounded' | 'pill';

interface ActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ActionButtonVariant;
  size?: ActionButtonSize;
  shape?: ActionButtonShape;
  isLoading?: boolean;
  loadingLabel?: React.ReactNode;
  isUppercase?: boolean;
}

const BASE_CLASS = 'relative inline-flex items-center justify-center gap-2 overflow-hidden font-body font-medium transition-ui disabled:cursor-not-allowed disabled:opacity-40';

const VARIANT_CLASS: Record<ActionButtonVariant, string> = {
  primary: 'bg-lemon text-ink shadow-btn hover:-translate-y-px hover:brightness-105 active:shadow-none',
  edit: 'bg-lilac text-ink shadow-btn hover:-translate-y-px hover:brightness-105 active:shadow-none',
  confirm: 'bg-sage text-ink shadow-btn hover:-translate-y-px hover:brightness-105 active:shadow-none',
  danger: 'bg-pink text-ink shadow-btn hover:-translate-y-px hover:brightness-105 active:shadow-none',
  neutral: 'border border-card-border bg-white/70 text-ink-soft hover:bg-white/90 hover:text-ink',
  text: 'bg-transparent text-ink-soft hover:text-ink',
};

const SIZE_CLASS: Record<ActionButtonSize, string> = {
  xs: 'px-3 py-1.5 text-[10px]',
  sm: 'px-3.5 py-2 text-[11px]',
  md: 'px-4 py-2.5 text-[12px]',
  lg: 'px-5 py-2.5 text-[12px]',
};

const SHAPE_CLASS: Record<ActionButtonShape, string> = {
  rounded: 'rounded-xl',
  pill: 'rounded-full',
};

export const ActionButton: React.FC<ActionButtonProps> = ({
  variant = 'neutral',
  size = 'md',
  shape = 'rounded',
  isLoading = false,
  loadingLabel,
  isUppercase = false,
  disabled,
  type = 'button',
  className,
  children,
  ...buttonProps
}) => {
  const classes = `${BASE_CLASS} ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${SHAPE_CLASS[shape]} ${isUppercase ? 'uppercase tracking-wider' : ''}${className ? ` ${className}` : ''}`;

  return (
    <button
      {...buttonProps}
      type={type}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={classes}
    >
      {isLoading && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-2/3 animate-pulse bg-white/20" />}
      <span className="relative inline-flex items-center justify-center gap-2">
        {isLoading && loadingLabel !== undefined ? loadingLabel : children}
      </span>
    </button>
  );
};

export default ActionButton;
