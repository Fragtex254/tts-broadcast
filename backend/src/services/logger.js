const fs = require('fs');
const path = require('path');
const pino = require('pino');

const DEFAULT_LOG_DIR = path.join(__dirname, '../../logs');

function getNow(options) {
  return options && options.now ? options.now : () => new Date();
}

function getLogFilePath({ logDir = DEFAULT_LOG_DIR, now = () => new Date() } = {}) {
  const date = now().toISOString().slice(0, 10);
  return path.join(logDir, `app-${date}.log`);
}

function shouldWriteFiles(options) {
  if (typeof options.writeFiles === 'boolean') {
    return options.writeFiles;
  }
  return process.env.NODE_ENV !== 'test';
}

function createFileDestination({ logDir, now }) {
  fs.mkdirSync(logDir, { recursive: true });
  return pino.destination({ dest: getLogFilePath({ logDir, now }), sync: true });
}

function createDestination(options) {
  const streams = [];
  const includeConsole = options.includeConsole !== false;
  const logDir = options.logDir || DEFAULT_LOG_DIR;
  const now = getNow(options);

  if (options.stream) {
    streams.push({ stream: options.stream });
  } else if (includeConsole) {
    streams.push({ stream: process.stdout });
  }

  if (shouldWriteFiles(options)) {
    streams.push({ stream: createFileDestination({ logDir, now }) });
  }

  if (streams.length === 0) {
    return pino.destination({ dest: '/dev/null', sync: true });
  }

  if (streams.length === 1) {
    return streams[0].stream;
  }

  return pino.multistream(streams);
}

function createRootLogger(options = {}) {
  const now = getNow(options);
  return pino(
    {
      level: 'info',
      base: null,
      timestamp: () => `,"time":"${now().toISOString()}"`,
    },
    createDestination(options)
  );
}

const rootLogger = createRootLogger();

function createScopedLogger(scope, options) {
  const parent = options ? createRootLogger(options) : rootLogger;
  return parent.child({ scope });
}

module.exports = {
  DEFAULT_LOG_DIR,
  createRootLogger,
  createScopedLogger,
  getLogFilePath,
};
