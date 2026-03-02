// ============================================================
// AGGREGATION CACHE — In-Memory + DB Cache for Aggregation
// ============================================================
// Two-tier caching layer that sits in front of AggregationService.
//
// Tier 1: In-memory LRU cache (Map with TTL and max-size eviction)
//         → sub-millisecond reads for repeated dashboard loads
// Tier 2: session_aggregation_results table (managed by AggregationService)
//         → survives process restarts
//
// Cache invalidation:
//   - DB trigger on scarcity_allocations → aggregation_queue (marks dirty)
//   - This module checks the queue before serving memory cache
//   - Explicit invalidation via invalidate(sessionId)
//
// SRS 4.2.2: Performance layer for aggregation reads
// ============================================================

"use strict";

// Winston logger
const logger = require("../../utils/logger");

// Database access for queue checks
const db = require("../../config/database");

// ============================================================
// CONFIGURATION CONSTANTS
// ============================================================

// Maximum number of sessions held in memory cache
const MAX_CACHE_SIZE = 200;

// Time-to-live for each cache entry (5 minutes in ms)
const CACHE_TTL_MS = 5 * 60 * 1000;

// ============================================================
// AggregationCache class
// ============================================================
class AggregationCache {
  constructor() {
    // In-memory cache: sessionId → { results, cachedAt }
    this._cache = new Map();
  }

  // ==========================================================
  // PUBLIC: get(sessionId)
  // ==========================================================
  /**
   * Retrieve cached results for a session.
   * Returns null on cache miss or stale entry.
   *
   * @param {string} sessionId — UUID of the session
   * @returns {Promise<Object[]|null>} cached results or null
   */
  async get(sessionId) {
    // Check in-memory cache first
    const entry = this._cache.get(sessionId);

    // Miss: not in memory
    if (!entry) return null;

    // Expired: TTL exceeded
    const age = Date.now() - entry.cachedAt;
    if (age > CACHE_TTL_MS) {
      // Remove stale entry
      this._cache.delete(sessionId);
      logger.debug("AggregationCache: TTL expired", { sessionId, ageMs: age });
      return null;
    }

    // Dirty check: has the queue been updated since we cached?
    const isDirty = await this._isQueueDirty(sessionId, entry.cachedAt);
    if (isDirty) {
      // Allocations changed since we cached — invalidate
      this._cache.delete(sessionId);
      logger.debug("AggregationCache: queue dirty, invalidating", {
        sessionId,
      });
      return null;
    }

    // Cache hit
    logger.debug("AggregationCache: memory hit", { sessionId });
    return entry.results;
  }

  // ==========================================================
  // PUBLIC: set(sessionId, results)
  // ==========================================================
  /**
   * Store results in the in-memory cache.
   * Evicts the oldest entry if max size is reached.
   *
   * @param {string}   sessionId — UUID of the session
   * @param {Object[]} results   — aggregated result objects
   */
  set(sessionId, results) {
    // Evict oldest entry if cache is full (simple LRU: first inserted = first evicted)
    if (this._cache.size >= MAX_CACHE_SIZE) {
      const oldestKey = this._cache.keys().next().value;
      this._cache.delete(oldestKey);
      logger.debug("AggregationCache: evicted oldest entry", {
        evicted: oldestKey,
      });
    }

    // Store with timestamp
    this._cache.set(sessionId, {
      results,
      cachedAt: Date.now(),
    });

    logger.debug("AggregationCache: stored", {
      sessionId,
      resultCount: results.length,
    });
  }

  // ==========================================================
  // PUBLIC: invalidate(sessionId)
  // ==========================================================
  /**
   * Explicitly remove a session from the memory cache.
   *
   * @param {string} sessionId — UUID of the session
   */
  invalidate(sessionId) {
    this._cache.delete(sessionId);
    logger.debug("AggregationCache: invalidated", { sessionId });
  }

  // ==========================================================
  // PUBLIC: clear()
  // ==========================================================
  /**
   * Remove all entries from the in-memory cache.
   * Used during testing or admin-triggered resets.
   */
  clear() {
    const size = this._cache.size;
    this._cache.clear();
    logger.info("AggregationCache: cleared all entries", { evicted: size });
  }

  // ==========================================================
  // PUBLIC: stats()
  // ==========================================================
  /**
   * Return diagnostic stats about the cache state.
   *
   * @returns {Object} { size, maxSize, ttlMs }
   */
  stats() {
    return {
      size: this._cache.size,
      maxSize: MAX_CACHE_SIZE,
      ttlMs: CACHE_TTL_MS,
    };
  }

  // ==========================================================
  // PRIVATE: _isQueueDirty(sessionId, cachedAt)
  // ==========================================================
  /**
   * Check if the aggregation_queue has an unprocessed entry
   * triggered after our cache timestamp.
   *
   * @param {string} sessionId — UUID
   * @param {number} cachedAt  — epoch ms when we cached the results
   * @returns {Promise<boolean>} true if allocations changed since cache
   */
  async _isQueueDirty(sessionId, cachedAt) {
    try {
      const result = await db.query(
        `SELECT 1 FROM aggregation_queue
          WHERE session_id = $1
            AND processed = FALSE
            AND triggered_at > $2
          LIMIT 1`,
        [sessionId, new Date(cachedAt)],
      );

      // If a row exists, the cache is stale
      return result.rows.length > 0;
    } catch (error) {
      // On DB error, assume dirty to be safe
      logger.warn("AggregationCache: dirty check failed, assuming stale", {
        sessionId,
        error: error.message,
      });
      return true;
    }
  }
}

// Export singleton
module.exports = new AggregationCache();
