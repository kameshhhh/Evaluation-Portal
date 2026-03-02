// ============================================================
// IDENTITY MODULE CONFIG — Environment Defaults
// ============================================================
// Provides environment-specific configuration for the identity
// resolution module. These defaults can be overridden by env vars.
//
// The identity module reads config from here at startup.
// Each environment (development, production, test) has its own
// tuning parameters for cache TTL, log levels, etc.
// ============================================================

const environments = {
  // ---- Development: verbose logging, short cache ----
  development: {
    cache: {
      ttlMs: 60 * 1000, // 1 minute (short for dev iteration)
      maxEntries: 100,
      sweepIntervalMs: 30 * 1000,
    },
    logging: {
      level: "debug", // Verbose debugging
      includePayloadInLogs: true, // Log full payloads for debugging
    },
    metrics: {
      enabled: false, // No metrics server in dev
    },
  },

  // ---- Production: optimized caching, minimal logging ----
  production: {
    cache: {
      ttlMs: 5 * 60 * 1000, // 5 minutes
      maxEntries: 10000,
      sweepIntervalMs: 60 * 1000,
    },
    logging: {
      level: "info", // Only actionable events
      includePayloadInLogs: false, // Never log PII in production
    },
    metrics: {
      enabled: true, // Prometheus metrics enabled
    },
  },

  // ---- Test: no caching, minimal side effects ----
  test: {
    cache: {
      ttlMs: 0, // No caching in tests
      maxEntries: 10,
      sweepIntervalMs: 0, // No sweep timer in tests
    },
    logging: {
      level: "error", // Only errors during tests
      includePayloadInLogs: false,
    },
    metrics: {
      enabled: false, // No metrics in tests
    },
  },
};

/**
 * Get the identity module config for the current environment.
 *
 * @param {string} [env] - Override environment (defaults to NODE_ENV)
 * @returns {Object} Environment-specific config
 */
function getConfig(env) {
  const currentEnv = env || process.env.NODE_ENV || "development";
  return environments[currentEnv] || environments.development;
}

module.exports = { getConfig, environments };
