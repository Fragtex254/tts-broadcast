import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ErrorBoundary } from './ErrorBoundary';
import { sanitizeErrorSummary } from './errorSummary';

function ThrowingChild({ message }: { message: string }): never {
  throw new Error(message);
}

describe('ErrorBoundary', () => {
  test('子树抛错时显示 role=alert、脱敏摘要与返回首页入口', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary section="转录">
        <ThrowingChild message="请求失败 Bearer abcdef1234567890abcdef 详情" />
      </ErrorBoundary>
    );

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('「转录」出了点问题');
    expect(alert.textContent).not.toContain('abcdef1234567890abcdef');
    expect(screen.getByRole('link', { name: '返回首页' }).getAttribute('href')).toBe('/');
    expect(screen.getByRole('button', { name: '刷新页面' })).toBeTruthy();
  });

  test('自定义 fallback 优先渲染', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary fallback={<p>局部降级</p>}>
        <ThrowingChild message="boom" />
      </ErrorBoundary>
    );

    expect(screen.getByText('局部降级')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('sanitizeErrorSummary', () => {
  test('空消息回退默认文案', () => {
    expect(sanitizeErrorSummary(undefined)).toBe('发生了一个意外错误，请刷新页面重试');
    expect(sanitizeErrorSummary('')).toBe('发生了一个意外错误，请刷新页面重试');
  });

  test('打码疑似密钥并折叠空白', () => {
    const summary = sanitizeErrorSummary('鉴权失败\nBearer sk-live-abcdef123456  请重试');
    expect(summary).not.toContain('sk-live-abcdef123456');
    expect(summary).not.toContain('\n');
  });

  test('超长摘要截断到 160 字符', () => {
    const summary = sanitizeErrorSummary(`错误：${'很长的描述'.repeat(50)}`);
    expect(summary.length).toBeLessThanOrEqual(160);
    expect(summary.endsWith('…')).toBe(true);
  });
});
