function createMatchCleanupScheduler({
  runtimeState,
  cleanupIntervalMs,
  performCleanup,
}) {
  let intervalHandle = null;

  async function runOnce() {
    if (runtimeState.shuttingDown || runtimeState.cleanupRunning) {
      return;
    }

    runtimeState.cleanupRunning = true;
    try {
      await performCleanup();
    } catch (error) {
      console.error('[match-cleanup] Background cleanup failed.', error);
    } finally {
      runtimeState.cleanupRunning = false;
    }
  }

  function start() {
    if (intervalHandle) {
      clearInterval(intervalHandle);
    }

    intervalHandle = setInterval(() => {
      void runOnce();
    }, cleanupIntervalMs);
    intervalHandle.unref?.();
    void runOnce();
  }

  function stop() {
    if (!intervalHandle) {
      return;
    }

    clearInterval(intervalHandle);
    intervalHandle = null;
  }

  return {
    runOnce,
    start,
    stop,
  };
}

module.exports = {
  createMatchCleanupScheduler,
};
