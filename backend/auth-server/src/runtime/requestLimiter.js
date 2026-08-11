function createSlidingWindowLimiter({
  windowMs,
  maxRequests,
  keyGenerator,
  fail,
  code,
  message,
  status = 429,
}) {
  const buckets = new Map();

  return (req, res, next) => {
    const key = keyGenerator(req);
    if (!key) {
      next();
      return;
    }

    const now = Date.now();
    const bucket = buckets.get(key) ?? [];
    const freshBucket = bucket.filter((timestamp) => now - timestamp < windowMs);

    if (freshBucket.length >= maxRequests) {
      const retryAfterMs = windowMs - (now - freshBucket[0]);
      const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
      res.setHeader('Retry-After', retryAfterSeconds);
      fail(res, code, message, status);
      return;
    }

    freshBucket.push(now);
    buckets.set(key, freshBucket);

    if (buckets.size > 10000) {
      for (const [storedKey, timestamps] of buckets.entries()) {
        const pruned = timestamps.filter((timestamp) => now - timestamp < windowMs);
        if (pruned.length === 0) {
          buckets.delete(storedKey);
        } else {
          buckets.set(storedKey, pruned);
        }
      }
    }

    next();
  };
}

module.exports = {
  createSlidingWindowLimiter,
};
