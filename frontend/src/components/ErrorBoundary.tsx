import React from 'react';
import { createScopedLogger, toLogError } from '../services/logger';
import { sanitizeErrorSummary } from './errorSummary';

const logger = createScopedLogger('error-boundary');

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  /** 局部降级时展示的区域名称，如「工作台」「口播编辑器」 */
  section?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error(
      { err: toLogError(error), componentStackLength: errorInfo.componentStack?.length ?? 0, section: this.props.section },
      'ErrorBoundary caught an error'
    );
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      const section = this.props.section;
      return (
        <div className="flex-1 flex items-center justify-center bg-paper" role="alert">
          <div className="text-center p-8 max-w-md">
            <div className="w-16 h-16 bg-pink/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-pink" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="font-display italic text-[20px] text-ink mb-2">
              {section ? `「${section}」出了点问题` : '页面出了点问题'}
            </h2>
            <p className="font-body text-[12px] text-ink-soft/60 mb-6">
              {sanitizeErrorSummary(this.state.error?.message)}
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => window.location.reload()}
                className="px-5 py-2 bg-lemon hover:brightness-105 text-ink rounded-full font-body text-[12px] font-medium shadow-btn ui-transition duration-fast"
              >
                刷新页面
              </button>
              <a
                href="/"
                className="px-5 py-2 bg-white/70 hover:bg-white/90 text-ink rounded-full font-body text-[12px] font-medium border border-card-border ui-transition duration-fast"
              >
                返回首页
              </a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
