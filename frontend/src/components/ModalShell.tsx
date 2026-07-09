import React, { useEffect } from 'react';

type ModalVariant = 'dialog' | 'fullscreen';
type ModalSize = 'sm' | 'md' | 'lg' | 'xl';
type ModalAccent = 'pink' | 'lemon' | 'blush' | 'sage' | 'lilac';

interface ModalShellProps {
  isOpen?: boolean;
  title: string;
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  headerActions?: React.ReactNode;
  variant?: ModalVariant;
  size?: ModalSize;
  accent?: ModalAccent;
  closeLabel?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
  ariaLabel?: string;
  contentClassName?: string;
  footerClassName?: string;
  panelClassName?: string;
  panelStyle?: React.CSSProperties;
}

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
};

const ACCENT_CLASS: Record<ModalAccent, string> = {
  pink: 'bg-pink',
  lemon: 'bg-lemon',
  blush: 'bg-blush',
  sage: 'bg-sage',
  lilac: 'bg-lilac',
};

export const ModalShell: React.FC<ModalShellProps> = ({
  isOpen = true,
  title,
  subtitle,
  onClose,
  children,
  footer,
  headerActions,
  variant = 'dialog',
  size = 'lg',
  accent = 'lilac',
  closeLabel = '关闭',
  closeOnBackdrop = true,
  closeOnEscape = true,
  showCloseButton = true,
  ariaLabel,
  contentClassName = 'p-5',
  footerClassName = '',
  panelClassName = '',
  panelStyle,
}) => {
  useEffect(() => {
    if (!isOpen || !closeOnEscape) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeOnEscape, isOpen, onClose]);

  if (!isOpen) return null;

  const header = (
    <div className="flex items-start justify-between gap-4 border-b border-card-border bg-white/35 p-5 backdrop-blur-sm">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${ACCENT_CLASS[accent]}`} />
          <h3 className="truncate font-display text-[18px] font-medium italic text-ink">
            {title}
          </h3>
        </div>
        {subtitle && (
          <div className="mt-2 font-body text-[12px] leading-relaxed text-ink-soft/70">
            {subtitle}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {headerActions}
        {showCloseButton && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-card-border bg-white/60 px-3 py-2 font-body text-[12px] text-ink-soft transition-colors hover:text-ink"
          >
            {closeLabel}
          </button>
        )}
      </div>
    </div>
  );

  const footerNode = footer ? (
    <div className={`border-t border-card-border bg-white/30 p-5 ${footerClassName}`}>
      {footer}
    </div>
  ) : null;

  if (variant === 'fullscreen') {
    return (
      <div
        className={`fixed inset-0 z-50 flex flex-col bg-paper animate-fade-in ${panelClassName}`}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || title}
        style={panelStyle}
      >
        {header}
        <div className={`min-h-0 flex-1 overflow-y-auto ${contentClassName}`}>
          {children}
        </div>
        {footerNode}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 px-4 py-6 backdrop-blur-sm"
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className={`flex max-h-[calc(100vh-3rem)] w-full ${SIZE_CLASS[size]} flex-col overflow-hidden rounded-card border border-card-border bg-paper shadow-card animate-fade-in ${panelClassName}`}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || title}
        onClick={(event) => event.stopPropagation()}
        style={panelStyle}
      >
        {header}
        <div className={`min-h-0 flex-1 overflow-y-auto ${contentClassName}`}>
          {children}
        </div>
        {footerNode}
      </div>
    </div>
  );
};

export default ModalShell;
