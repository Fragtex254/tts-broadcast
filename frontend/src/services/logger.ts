import pino, { type Logger } from 'pino/browser';

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';

const DEFAULT_LOG_LEVEL: LogLevel = (import.meta.env.VITE_LOG_LEVEL as LogLevel | undefined) ?? 'info';

const rootLogger = pino({
  level: DEFAULT_LOG_LEVEL,
  browser: {
    asObject: true,
    serialize: true,
  },
  base: undefined,
  timestamp: () => new Date().toISOString(),
});

export function createScopedLogger(scope: string): Logger {
  return rootLogger.child({ scope });
}
