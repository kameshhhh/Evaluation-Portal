// ============================================================
// PERSONALIZATION CACHE — In-Memory Cache for Dashboard Data
// ============================================================
// Caches personalized dashboard data to avoid repeated database
// lookups for the same user within a short time window.
//
// WHY THIS EXISTS:
//   A user's dashboard data doesn't change every second.
//   Projects, memberships, evaluations change at most a few times
//   per day. Caching for 60 seconds eliminates redundant DB queries
//   when a user refreshes the page or navigates around.
//
// DESIGN DECISIONS:
//   - In-memory Map (not Redis) — single-server deployment at Bitsathy
//   - TTL-based expiration — entries auto-expire after 60 seconds
//   - Per-user keys — each user has their own cache entry
//   - Manual invalidation — mutation endpoints clear the cache
//
// FUTURE: If Bitsathy deploys multiple servers, replace this with
// Redis or another shared cache. The interface stays the same.
// ============================================================

// Import logger for cache hit/miss tracking
const logger = require("../../utils/logger");

// ============================================================
// PersonalizationCache — TTL-based in-memory cache
// ============================================================
class PersonalizationCache {
  /**
   * Create a new cache instance.
   *
   * @param {Object} options - Cache configuration
   * @param {number} options.ttlMs - Time-to-live in milliseconds (default: 60s)
   * @param {number} options.maxEntries - Max entries before cleanup (default: 500)
   */
  constructor(options = {}) {
    // Time-to-live for cache entries — 60 seconds default
    // Short enough to reflect changes quickly, long enough to help
    this.ttlMs = options.ttlMs || 60 * 1000;

    // Maximum number of entries before forced cleanup
    // 500 users * ~2KB each ≈ 1MB memory, well within limits
    this.maxEntries = options.maxEntries || 500;

    // The actual cache storage — Map for O(1) lookups
    this.cache = new Map();

    // Cleanup interval — run every 5 minutes to remove expired entries
    // Prevents memory from growing unbounded if users stop visiting
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);

    // Allow the cleanup interval to not prevent Node.js from exiting
    // This is important for graceful shutdown during testing
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Get a cached value by key.
   *
   * Returns null if the key doesn't exist or has expired.
   * Expired entries are deleted on access (lazy expiration).
   *
   * @param {string} key - Cache key (typically userId or personId)
   * @returns {Object|null} Cached data or null if miss/expired
   */
  get(key) {
    // Look up the entry in the Map
    const entry = this.cache.get(key);

    // Cache miss — key not found
    if (!entry) {
      logger.debug("PersonalizationCache: MISS", { key });
      return null;
    }

    // Check if the entry has expired
    const now = Date.now();
    if (now - entry.createdAt > this.ttlMs) {
      // Entry expired — delete it and return null
      this.cache.delete(key);
      logger.debug("PersonalizationCache: EXPIRED", { key });
      return null;
    }

    // Cache hit — return the stored data
    logger.debug("PersonalizationCache: HIT", { key });
    return entry.data;
  }

  /**
   * Store a value in the cache.
   *
   * If the cache exceeds maxEntries, triggers a cleanup first
   * to prevent unbounded memory growth.
   *
   * @param {string} key - Cache key (typically userId or personId)
   * @param {Object} data - Data to cache (dashboard data, profile, etc.)
   */
  set(key, data) {
    // If cache is full, run cleanup before adding new entry
    if (this.cache.size >= this.maxEntries) {
      this.cleanup();
    }

    // Store the data with a creation timestamp for TTL checking
    this.cache.set(key, {
      data, // The actual cached payload
      createdAt: Date.now(), // Timestamp for TTL expiration
    });

    logger.debug("PersonalizationCache: SET", { key });
  }

  /**
   * Invalidate (delete) a specific cache entry.
   *
   * Called when a mutation occurs that changes a user's data
   * (e.g., user joins a project, person profile updated).
   *
   * @param {string} key - Cache key to invalidate
   */
  invalidate(key) {
    // Delete the entry from the Map
    const deleted = this.cache.delete(key);

    // Log the invalidation for debugging
    if (deleted) {
      logger.debug("PersonalizationCache: INVALIDATED", { key });
    }
  }

  /**
   * Invalidate all cache entries.
   *
   * Called during bulk operations (e.g., evaluation freeze)
   * that might affect multiple users' dashboard data.
   */
  invalidateAll() {
    // Get the count before clearing for logging
    const size = this.cache.size;

    // Clear all entries
    this.cache.clear();

    logger.debug("PersonalizationCache: CLEARED ALL", { previousSize: size });
  }

  /**
   * Remove all expired entries from the cache.
   *
   * Runs automatically on a timer and also triggered when
   * the cache exceeds maxEntries. This is the garbage collector.
   */
  cleanup() {
    // Current time for TTL comparison
    const now = Date.now();

    // Track how many entries we remove for logging
    let removed = 0;

    // Iterate all entries and delete expired ones
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.createdAt > this.ttlMs) {
        this.cache.delete(key);
        removed++;
      }
    }

    // Log cleanup stats if anything was removed
    if (removed > 0) {
      logger.debug("PersonalizationCache: CLEANUP", {
        removed, // How many expired entries were removed
        remaining: this.cache.size, // How many entries are still in cache
      });
    }
  }

  /**
   * Get the current number of entries in the cache.
   * Used for monitoring and health checks.
   *
   * @returns {number} Number of cached entries
   */
  get size() {
    return this.cache.size;
  }

  /**
   * Destroy the cache and stop the cleanup timer.
   * Call this during graceful shutdown.
   */
  destroy() {
    // Stop the periodic cleanup
    clearInterval(this.cleanupInterval);

    // Clear all entries
    this.cache.clear();

    logger.debug("PersonalizationCache: DESTROYED");
  }
}

// ============================================================
// Export a singleton instance for use across the application
// All personalization services share this one cache
// ============================================================
const cacheInstance = new PersonalizationCache();

module.exports = {
  // The singleton cache instance
  PersonalizationCache: cacheInstance,

  // Export the class for testing (allows creating isolated instances)
  PersonalizationCacheClass: PersonalizationCache,
};
