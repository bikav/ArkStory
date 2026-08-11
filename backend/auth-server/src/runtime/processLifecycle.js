function registerProcessLifecycle({
  server,
  pool,
  runtimeState,
  cleanupScheduler,
  shutdownTimeoutMs,
}) {
  async function shutdown(signal) {
    if (runtimeState.shuttingDown) {
      return;
    }

    runtimeState.shuttingDown = true;
    console.warn(`[arkstory-auth-server] Received ${signal}, starting graceful shutdown.`);
    cleanupScheduler?.stop?.();

    const forceExitTimer = setTimeout(() => {
      console.error('[arkstory-auth-server] Graceful shutdown timed out, forcing exit.');
      process.exit(1);
    }, shutdownTimeoutMs);
    forceExitTimer.unref?.();

    server.close(async () => {
      try {
        await pool.end();
        clearTimeout(forceExitTimer);
        console.log('[arkstory-auth-server] Shutdown complete.');
        process.exit(0);
      } catch (error) {
        clearTimeout(forceExitTimer);
        console.error('[arkstory-auth-server] Failed to close database pool cleanly.', error);
        process.exit(1);
      }
    });
  }

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[process] Unhandled promise rejection.', reason);
  });

  process.on('uncaughtException', (error) => {
    console.error('[process] Uncaught exception.', error);
    void shutdown('uncaughtException');
  });

  return {
    shutdown,
  };
}

module.exports = {
  registerProcessLifecycle,
};
