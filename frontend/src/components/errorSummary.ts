/**
 * 对外展示前脱敏：折叠空白、打码疑似密钥/长 token、截断过长摘要。
 * 完整错误只进日志（ErrorBoundary.componentDidCatch）。
 */
export function sanitizeErrorSummary(message: string | undefined): string {
  if (!message) return '发生了一个意外错误，请刷新页面重试';
  const collapsed = message.replace(/\s+/g, ' ').trim();
  const redacted = collapsed
    .replace(/bearer\s+[a-z0-9._-]+/gi, 'Bearer •••')
    .replace(/\b(sk|pk|key|token|secret)[-_][a-z0-9._-]{6,}/gi, '$1•••')
    .replace(/\b[a-f0-9]{24,}\b/gi, '•••');
  const summary = redacted || '发生了一个意外错误，请刷新页面重试';
  return summary.length > 160 ? `${summary.slice(0, 157)}…` : summary;
}
