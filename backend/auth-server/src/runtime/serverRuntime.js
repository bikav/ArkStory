const crypto = require('crypto');

function createRuntimeState() {
  return {
    shuttingDown: false,
    activeRequests: 0,
    cleanupRunning: false,
  };
}

function createRequestContextMiddleware({ runtimeState, fail }) {
  return (req, res, next) => {
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    if (runtimeState.shuttingDown) {
      res.setHeader('Connection', 'close');
      fail(res, 1997, '服务正在重启，请稍后重试。', 503);
      return;
    }

    runtimeState.activeRequests += 1;
    const startedAt = Date.now();
    res.on('finish', () => {
      runtimeState.activeRequests = Math.max(0, runtimeState.activeRequests - 1);
      const durationMs = Date.now() - startedAt;
      if (res.statusCode >= 500) {
        console.error(
          `[request] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${durationMs}ms, request_id=${requestId})`,
        );
      }
    });

    next();
  };
}

function buildHealthPayload({ runtimeState, dbConnectionLimit }) {
  return {
    status: 'ok',
    shutting_down: runtimeState.shuttingDown,
    active_requests: runtimeState.activeRequests,
    cleanup_running: runtimeState.cleanupRunning,
    db_connection_limit: dbConnectionLimit,
  };
}

function buildReadyPayload({ runtimeState }) {
  return {
    status: runtimeState.shuttingDown ? 'draining' : 'ready',
    shutting_down: runtimeState.shuttingDown,
    active_requests: runtimeState.activeRequests,
    cleanup_running: runtimeState.cleanupRunning,
  };
}

module.exports = {
  createRuntimeState,
  createRequestContextMiddleware,
  buildHealthPayload,
  buildReadyPayload,
};
