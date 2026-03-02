// ============================================================
// IDENTITY METRICS — Prometheus Observability for Resolvers
// ============================================================
// Provides pre-configured Prometheus metrics for the identity
// resolution pipeline. All resolvers instrument through these
// shared counters, histograms, and gauges.
//
// Metrics exposed:
//   identity_resolution_total       — Counter: total resolutions by status
//   identity_resolution_duration_ms — Histogram: resolution latency
//   identity_cache_operations_total — Counter: cache hits/misses
//   identity_domain_validation_total— Counter: domain checks by result
//   identity_active_resolutions     — Gauge: in-flight resolutions
//
// Uses prom-client if available, otherwise falls back to no-op
// collectors that implement the same interface. This means the
// resolver code never breaks even if prom-client isn't installed.
// ============================================================

let client;
let metricsAvailable = false;

try {
  client = require("prom-client");
  metricsAvailable = true;
} catch {
  // prom-client not installed — use no-op fallback
  metricsAvailable = false;
}

// ============================================================
// No-op metric implementations for when prom-client is missing
// Same interface so resolver code doesn't need conditionals
// ============================================================
const noopCounter = {
  inc: () => {},
  labels: () => ({ inc: () => {} }),
};

const noopHistogram = {
  observe: () => {},
  labels: () => ({ observe: () => {} }),
  startTimer: () => () => {},
};

const noopGauge = {
  inc: () => {},
  dec: () => {},
  set: () => {},
  labels: () => ({ inc: () => {}, dec: () => {}, set: () => {} }),
};

// ============================================================
// Create real or no-op metrics based on prom-client availability
// ============================================================

let resolutionTotal;
let resolutionDuration;
let cacheOperations;
let domainValidation;
let activeResolutions;

if (metricsAvailable) {
  // ---- Counter: total identity resolutions ----
  resolutionTotal = new client.Counter({
    name: "identity_resolution_total",
    help: "Total number of identity resolution attempts",
    labelNames: ["status", "resolver_type", "domain"],
  });

  // ---- Histogram: resolution latency (ms) ----
  resolutionDuration = new client.Histogram({
    name: "identity_resolution_duration_ms",
    help: "Identity resolution duration in milliseconds",
    labelNames: ["resolver_type", "status"],
    buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500],
  });

  // ---- Counter: cache hit/miss operations ----
  cacheOperations = new client.Counter({
    name: "identity_cache_operations_total",
    help: "Total cache operations for identity resolution",
    labelNames: ["operation"], // 'hit', 'miss', 'set', 'invalidate'
  });

  // ---- Counter: domain validations by result ----
  domainValidation = new client.Counter({
    name: "identity_domain_validation_total",
    help: "Total domain validation checks",
    labelNames: ["result", "domain"], // result: 'allowed', 'denied'
  });

  // ---- Gauge: currently in-flight resolutions ----
  activeResolutions = new client.Gauge({
    name: "identity_active_resolutions",
    help: "Number of identity resolutions currently in progress",
    labelNames: ["resolver_type"],
  });
} else {
  resolutionTotal = noopCounter;
  resolutionDuration = noopHistogram;
  cacheOperations = noopCounter;
  domainValidation = noopCounter;
  activeResolutions = noopGauge;
}

// ============================================================
// Export all metrics + availability flag
// ============================================================
module.exports = {
  /** @type {boolean} Whether prom-client is installed */
  metricsAvailable,

  /** @type {import('prom-client').Counter} Total resolutions by status */
  resolutionTotal,

  /** @type {import('prom-client').Histogram} Resolution latency */
  resolutionDuration,

  /** @type {import('prom-client').Counter} Cache hit/miss operations */
  cacheOperations,

  /** @type {import('prom-client').Counter} Domain validation results */
  domainValidation,

  /** @type {import('prom-client').Gauge} In-flight resolutions */
  activeResolutions,
};
