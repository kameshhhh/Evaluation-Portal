// ============================================================
// CACHE REPOSITORY — In-Memory Identity Resolution Cache
// ============================================================
// Provides a lightweight in-memory cache with TTL expiration
// for identity resolution results. Reduces database lookups
// for repeat logins within a configurable time window.
//
// Design:
//   - Simple Map-based cache (no external dependency like Redis)
//   - TTL-based expiration with lazy eviction + periodic sweep
//   - Max entries cap to prevent memory leaks
//   - Metrics hooks for cache hit/miss tracking
//   - Thread-safe for single-process Node.js (no mutex needed)
//
// Future: Can be swapped for Redis/Memcached by implementing
// the same interface (get, set, invalidate, isHealthy).
// ============================================================

// ============================================================
// CacheRepository class — in-memory identity cache with TTL
// ============================================================
class CacheRepository {
  /**
   * @param {{ logger: Object, config?: Object }} deps
   * @param {Object} [deps.config] - Cache configuration
   * @param {number} [deps.config.ttlMs=300000] - TTL in ms (default: 5 min)
   * @param {number} [deps.config.maxEntries=1000] - Max cached entries
   * @param {number} [deps.config.sweepIntervalMs=60000] - Cleanup interval
   */
  constructor({ logger, config = {} }) {
    this.logger = logger.child
      ? logger.child({ module: "CacheRepository" })
      : logger;

    // Cache configuration with sensible defaults
    this.ttlMs = config.ttlMs || 5 * 60 * 1000; // 5 minutes
    this.maxEntries = config.maxEntries || 1000;
    this.sweepIntervalMs = config.sweepIntervalMs || 60 * 1000; // 1 minute

    // The cache store: key → { value, expiresAt }
    this._store = new Map();

    // Metrics counters
    this._hits = 0;
    this._misses = 0;

    // Start periodic sweep timer (unref so it doesn't prevent process exit)
    this._sweepTimer = setInterval(() => this._sweep(), this.sweepIntervalMs);
    if (this._sweepTimer.unref) {
      this._sweepTimer.unref();
    }
  }

  // ============================================================
  // Get a cached identity resolution result
  // Returns null on miss or expiry (lazy eviction)
  // ============================================================

  /**
   * Retrieve a cached value by key.
   *
   * @param {string} key - Cache key (typically canonical email)
   * @returns {Object|null} Cached value or null on miss/expiry
   */
  get(key) {
    const entry = this._store.get(key);

    // Cache miss
    if (!entry) {
      this._misses++;
      return null;
    }

    // Lazy expiration check
    if (Date.now() > entry.expiresAt) {
      this._store.delete(key);
      this._misses++;
      this.logger.debug("Cache entry expired (lazy evict)", { key });
      return null;
    }

    // Cache hit
    this._hits++;
    this.logger.debug("Cache hit", { key });
    return entry.value;
  }

  // ============================================================
  // Store an identity resolution result with TTL
  // Evicts oldest entries if max capacity is reached
  // ============================================================

  /**
   * Store a value in the cache with TTL expiration.
   *
   * @param {string} key - Cache key (typically canonical email)
   * @param {Object} value - The value to cache
   * @param {number} [ttlMs] - Optional override TTL in ms
   */
  set(key, value, ttlMs) {
    // Evict oldest entries if at capacity
    if (this._store.size >= this.maxEntries && !this._store.has(key)) {
      this._evictOldest();
    }

    const effectiveTtl = ttlMs || this.ttlMs;

    this._store.set(key, {
      value,
      expiresAt: Date.now() + effectiveTtl,
    });

    this.logger.debug("Cache entry stored", {
      key,
      ttlMs: effectiveTtl,
      storeSize: this._store.size,
    });
  }

  // ============================================================
  // Invalidate a specific cache entry
  // ============================================================

  /**
   * Remove a specific entry from the cache.
   *
   * @param {string} key - Cache key to invalidate
   * @returns {boolean} True if an entry was removed
   */
  invalidate(key) {
    const deleted = this._store.delete(key);
    if (deleted) {
      this.logger.debug("Cache entry invalidated", { key });
    }
    return deleted;
  }

  // ============================================================
  // Clear the entire cache
  // ============================================================

  /**
   * Remove all entries from the cache.
   */
  clear() {
    const previousSize = this._store.size;
    this._store.clear();
    this.logger.info("Cache cleared", { previousSize });
  }

  // ============================================================
  // Get cache metrics for monitoring
  // ============================================================

  /**
   * Get cache hit/miss statistics.
   *
   * @returns {{ hits: number, misses: number, size: number, hitRate: number }}
   */
  getMetrics() {
    const total = this._hits + this._misses;
    return {
      hits: this._hits,
      misses: this._misses,
      size: this._store.size,
      hitRate: total > 0 ? this._hits / total : 0,
    };
  }

  // ============================================================
  // Health check — cache is always "healthy" (in-memory)
  // When swapped for Redis, this would ping the connection
  // ============================================================

  /**
   * @returns {boolean} Always true for in-memory cache
   */
  isHealthy() {
    return true;
  }

  // ============================================================
  // Shutdown — clean up timers
  // ============================================================

  /**
   * Stop the sweep timer and clear the cache.
   * Call this during graceful shutdown.
   */
  shutdown() {
    if (this._sweepTimer) {
      clearInterval(this._sweepTimer);
      this._sweepTimer = null;
    }
    this._store.clear();
    this.logger.info("CacheRepository shut down");
  }

  // ============================================================
  // Private: Periodic sweep to evict expired entries
  // ============================================================

  /** @private */
  _sweep() {
    const now = Date.now();
    let evicted = 0;

    for (const [key, entry] of this._store) {
      if (now > entry.expiresAt) {
        this._store.delete(key);
        evicted++;
      }
    }

    if (evicted > 0) {
      this.logger.debug("Cache sweep completed", {
        evicted,
        remaining: this._store.size,
      });
    }
  }

  // ============================================================
  // Private: Evict the oldest entry when at capacity
  // ============================================================

  /** @private */
  _evictOldest() {
    // Map.keys() returns insertion-order — first key is oldest
    const oldestKey = this._store.keys().next().value;
    if (oldestKey !== undefined) {
      this._store.delete(oldestKey);
      this.logger.debug("Cache entry evicted (capacity)", { key: oldestKey });
    }
  }
}

// ============================================================
// Export CacheRepository class
// ============================================================
module.exports = CacheRepository;
