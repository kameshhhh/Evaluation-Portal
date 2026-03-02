// ============================================================
// IDENTITY MODULE — Public API
// ============================================================
// Single entry point for the entire enterprise identity module.
// External code only imports from this file.
//
// Usage:
//   const { createEmailResolver, IdentityErrors } = require('./auth/identity');
//   const resolver = createEmailResolver();
//   const identity = await resolver.resolve(googlePayload);
// ============================================================

// Factory functions for resolver creation
const { createEmailResolver, shutdown } = require("./resolvers");

// Error classes for catch/instanceof checks
const IdentityErrors = require("./errors/IdentityErrors");

// Error mapping utilities
const errorMapper = require("./errors/errorMapper");

// Metrics for /metrics endpoint exposure
const metrics = require("./metrics");

// ============================================================
// Export the public API
// ============================================================
module.exports = {
  // Primary factory — create a ready-to-use resolver
  createEmailResolver,

  // Graceful shutdown — call on SIGTERM/SIGINT
  shutdown,

  // Error classes for catch blocks
  IdentityErrors,

  // Error mapping for HTTP responses
  errorMapper,

  // Prometheus metrics for /metrics endpoint
  metrics,
};
