// ============================================================
// RESULT CACHE SERVICE — In-Memory TTL Cache for Weighted Results
// ============================================================
// Provides a lightweight caching layer for computed weighted
// aggregation results. Prevents redundant recalculations when
// the WeightedResultsDashboard is loaded multiple times.
//
// CACHE STRATEGY:
//   - Finalized sessions: cached for 1 hour (data is immutable)
//   - Active sessions: NOT cached (data changes with new allocations)
//   - Cache is invalidated when new allocations are submitted
//     or when an admin triggers recalculation
//
// IMPLEMENTATION:
//   Simple Map-based cache with TTL expiry.
//   No external dependencies (no Redis required).
//   Suitable for single-process deployments.
//
// BUSINESS CONTEXT (SRS 4.2.2):
//   Weighted aggregation computation involves multiple DB queries
//   (allocations, credibility profiles, person names). Caching
//   avoids repeating this work on every page load.
//
// PERFORMANCE:
//   - Set: O(1)
//   - Get: O(1) with TTL check
//   - Invalidate: O(1) per key, O(n) for session prefix scan
//   - Memory: ~2KB per cached session (JSON payload)
//
// SINGLETON — module.exports = new ResultCacheService()
// ============================================================

"use strict";

const logger = require("../utils/logger");

class ResultCacheService {
  constructor() {
    /**
     * Internal cache store: Map<string, { data, expiresAt }>
     * Keys are formatted as "weighted_{sessionId}_{view}"
     */
    this._cache = new Map();

    /**
     * Maximum cache entries to prevent memory leaks.
     * When exceeded, oldest entries are evicted (LRU-lite).
     */
    this._maxEntries = 200;

    /**
     * Default TTL: 1 hour (3,600,000 ms) for finalized sessions.
     */
    this._defaultTTL = 3600000;
  }

  // ============================================================
  // get(key) — Retrieve cached data if not expired
  // ============================================================
  /**
   * Get a cached value by key. Returns null if not found or expired.
   *
   * PERFORMANCE: O(1) — Map lookup + timestamp comparison.
   *
   * @param {string} key — Cache key (e.g., "weighted_123_detailed")
   * @returns {Object|null} Cached data or null
   */
  get(key) {
    const entry = this._cache.get(key);

    if (!entry) return null;

    // Check TTL expiry
    if (Date.now() > entry.expiresAt) {
      this._cache.delete(key);
      logger.info("ResultCacheService: Entry expired", { key });
      return null;
    }

    return entry.data;
  }

  // ============================================================
  // set(key, data, ttl) — Store data with TTL
  // ============================================================
  /**
   * Cache a value with an optional TTL.
   *
   * PERFORMANCE: O(1) for set, O(n) for eviction (rare).
   *
   * @param {string} key — Cache key
   * @param {Object} data — Data to cache
   * @param {number} [ttl] — Time-to-live in milliseconds (default: 1 hour)
   */
  set(key, data, ttl = this._defaultTTL) {
    // Evict oldest entries if at capacity
    if (this._cache.size >= this._maxEntries) {
      this._evictOldest();
    }

    this._cache.set(key, {
      data,
      expiresAt: Date.now() + ttl,
      createdAt: Date.now(),
    });

    logger.info("ResultCacheService: Entry cached", {
      key,
      ttlMs: ttl,
      cacheSize: this._cache.size,
    });
  }

  // ============================================================
  // invalidate(key) — Remove a specific cache entry
  // ============================================================
  /**
   * Remove a specific cached entry by key.
   *
   * @param {string} key — Cache key to remove
   * @returns {boolean} True if entry existed and was removed
   */
  invalidate(key) {
    const existed = this._cache.delete(key);
    if (existed) {
      logger.info("ResultCacheService: Entry invalidated", { key });
    }
    return existed;
  }

  // ============================================================
  // invalidateSession(sessionId) — Remove all cache entries for a session
  // ============================================================
  /**
   * Remove all cached entries for a specific session.
   * Called when new allocations are submitted or admin triggers recalc.
   *
   * PERFORMANCE: O(n) where n = total cache entries (scans all keys).
   *
   * @param {string} sessionId — Session UUID
   * @returns {number} Number of entries removed
   */
  invalidateSession(sessionId) {
    let removed = 0;
    const prefix = `weighted_${sessionId}`;

    for (const key of this._cache.keys()) {
      if (key.startsWith(prefix)) {
        this._cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      logger.info("ResultCacheService: Session cache invalidated", {
        sessionId,
        entriesRemoved: removed,
      });
    }

    return removed;
  }

  // ============================================================
  // clear() — Remove all cache entries
  // ============================================================
  /**
   * Clear the entire cache.
   *
   * @returns {number} Number of entries removed
   */
  clear() {
    const size = this._cache.size;
    this._cache.clear();
    logger.info("ResultCacheService: Cache cleared", { entriesRemoved: size });
    return size;
  }

  // ============================================================
  // stats() — Get cache statistics
  // ============================================================
  /**
   * Return current cache statistics for monitoring.
   *
   * @returns {Object} { size, maxEntries, oldestEntry, newestEntry }
   */
  stats() {
    let oldest = Infinity;
    let newest = 0;

    for (const entry of this._cache.values()) {
      if (entry.createdAt < oldest) oldest = entry.createdAt;
      if (entry.createdAt > newest) newest = entry.createdAt;
    }

    return {
      size: this._cache.size,
      maxEntries: this._maxEntries,
      oldestEntry: oldest === Infinity ? null : new Date(oldest).toISOString(),
      newestEntry: newest === 0 ? null : new Date(newest).toISOString(),
    };
  }

  // ============================================================
  // PRIVATE: _evictOldest() — Remove oldest entry when at capacity
  // ============================================================
  /**
   * Evict the oldest cache entry to make room for new data.
   * Simple LRU-lite strategy: remove the entry with the earliest createdAt.
   *
   * PERFORMANCE: O(n) scan — called rarely (only when cache is full).
   */
  _evictOldest() {
    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this._cache.entries()) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this._cache.delete(oldestKey);
      logger.info("ResultCacheService: Evicted oldest entry", {
        key: oldestKey,
        age: Date.now() - oldestTime,
      });
    }
  }
}

// ============================================================
// Export singleton instance
// ============================================================
module.exports = new ResultCacheService();
module.exports.ResultCacheService = ResultCacheService;
