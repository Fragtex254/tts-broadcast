const FORCE_SHUTDOWN_TIMEOUT_MS = 5000;

function normalizeError(reason) {
  return reason instanceof Error ? reason : new Error(String(reason));
}

function closeHttpServer(server) {
  if (!server || typeof server.close !== 'function') return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

/**
 * 创建进程生命周期管理器。
 * @param {Object} params
 * @param {NodeJS.Process|import('events').EventEmitter} params.processRef - 进程事件源
 * @param {Object} params.scheduler - 调度器
 * @param {Object} params.sseManager - SSE 管理器
 * @param {import('http').Server} params.server - HTTP server
 * @param {Object} params.db - SQLite 连接
 * @param {Object} params.logger - 结构化日志实例
 * @param {number} [params.forceTimeoutMs] - 强制退出等待时间
 * @returns {{register: Function, unregister: Function, shutdown: Function}}
 */
function createProcessLifecycle({
  processRef,
  scheduler,
  sseManager,
  server,
  db,
  logger,
  forceTimeoutMs = FORCE_SHUTDOWN_TIMEOUT_MS,
}) {
  let isRegistered = false;
  let shutdownPromise = null;
  let forceTimer = null;

  const handlers = {
    unhandledRejection(reason) {
      logger.error({ err: normalizeError(reason) }, '未处理的 Promise 拒绝');
    },
    uncaughtException(error) {
      logger.error({ err: normalizeError(error) }, '未捕获的进程异常');
      processRef.exit(1);
    },
    SIGTERM() {
      void shutdown('SIGTERM');
    },
    SIGINT() {
      void shutdown('SIGINT');
    },
  };

  async function runShutdownStep(step, action, state) {
    try {
      await action();
      logger.info({ step }, '优雅停机步骤完成');
    } catch (error) {
      state.hasError = true;
      logger.error({ err: normalizeError(error), step }, '优雅停机步骤失败');
    }
  }

  function shutdown(signal) {
    if (shutdownPromise) return shutdownPromise;

    shutdownPromise = (async () => {
      const state = { hasError: false };
      logger.info({ signal }, '开始优雅停机');
      forceTimer = setTimeout(() => {
        logger.error({ signal, timeoutMs: forceTimeoutMs }, '优雅停机超时，强制退出');
        processRef.exit(1);
      }, forceTimeoutMs);
      if (typeof forceTimer.unref === 'function') forceTimer.unref();

      await runShutdownStep('scheduler', () => scheduler.shutdown(), state);
      await runShutdownStep('sse', () => sseManager.closeAll(), state);
      await runShutdownStep('http', () => closeHttpServer(server), state);
      await runShutdownStep('database', () => {
        if (db && typeof db.close === 'function' && db.open !== false) db.close();
      }, state);

      clearTimeout(forceTimer);
      forceTimer = null;
      processRef.exitCode = state.hasError ? 1 : 0;
      logger.info({ signal, exitCode: processRef.exitCode }, '优雅停机完成');
      return { hasError: state.hasError };
    })();

    return shutdownPromise;
  }

  function register() {
    if (isRegistered) return;
    for (const [event, handler] of Object.entries(handlers)) {
      processRef.on(event, handler);
    }
    isRegistered = true;
  }

  function unregister() {
    if (!isRegistered) return;
    for (const [event, handler] of Object.entries(handlers)) {
      processRef.removeListener(event, handler);
    }
    if (forceTimer) clearTimeout(forceTimer);
    forceTimer = null;
    isRegistered = false;
  }

  return { register, unregister, shutdown };
}

module.exports = {
  FORCE_SHUTDOWN_TIMEOUT_MS,
  createProcessLifecycle,
};
