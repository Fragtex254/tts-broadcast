import React, { useEffect, useRef } from 'react';

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
  initialFocusRef?: React.RefObject<HTMLElement | null>;
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
  initialFocusRef,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const closeOnEscapeRef = useRef(closeOnEscape);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    closeOnEscapeRef.current = closeOnEscape;
  }, [closeOnEscape]);

  useEffect(() => {
    if (!isOpen) return undefined;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const requestedFocus = initialFocusRef?.current;
      const firstFocusable = panel.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])');
      (requestedFocus && panel.contains(requestedFocus) ? requestedFocus : firstFocusable || panel).focus({ preventScroll: true });
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closeOnEscapeRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'));
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus({ preventScroll: true });
      previousFocusRef.current = null;
    };
  }, [initialFocusRef, isOpen]);

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
        ref={panelRef}
        className={`ui-fullscreen-panel fixed inset-0 z-50 flex flex-col bg-paper ${panelClassName}`}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || title}
        tabIndex={-1}
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
      className="ui-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-ink/25 px-3 py-4 backdrop-blur-sm sm:px-4 sm:py-6"
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        ref={panelRef}
        className={`ui-modal-panel flex max-h-[calc(100vh-2rem)] w-full ${SIZE_CLASS[size]} flex-col overflow-hidden rounded-card border border-card-border bg-paper shadow-card sm:max-h-[calc(100vh-3rem)] ${panelClassName}`}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || title}
        tabIndex={-1}
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
