// ============================================================
// RESOLVER FACTORY — Factory Pattern for Identity Resolvers
// ============================================================
// Creates fully-wired identity resolver instances with all
// dependencies injected. This is the ONLY place where the
// dependency graph is assembled — all other code receives
// pre-constructed instances.
//
// Factory Pattern benefits:
//   - Single source of truth for dependency wiring
//   - Easy to swap implementations for testing
//   - Configuration-driven resolver selection
//   - Lazy initialization — resolvers created on first use
//
// Usage:
//   const { createEmailResolver } = require('./resolvers');
//   const resolver = createEmailResolver();
//   const identity = await resolver.resolve(googlePayload);
// ============================================================

const logger = require("../../../utils/logger");
const db = require("../../../config/database");

// Validators
const InputSanitizer = require("../validators/InputSanitizer");
const EmailNormalizer = require("../validators/EmailNormalizer");
const DomainValidator = require("../validators/DomainValidator");

// Repositories
const UserRepository = require("../repositories/UserRepository");
const AuditRepository = require("../repositories/AuditRepository");
const CacheRepository = require("../repositories/CacheRepository");

// Resolvers
const EmailIdentityResolver = require("./EmailIdentityResolver");

// ============================================================
// Singleton cache for shared instances
// Repositories and validators are stateless (or have internal state
// like cache) so they can be shared across resolver instances.
// ============================================================
let _sharedInstances = null;

/**
 * Get or create the shared dependency instances.
 * Lazy initialization — created on first call.
 *
 * @param {Object} [overrides] - Optional dependency overrides (for testing)
 * @returns {Object} Shared dependency instances
 */
function getSharedInstances(overrides = {}) {
  if (_sharedInstances && Object.keys(overrides).length === 0) {
    return _sharedInstances;
  }

  const resolverLogger = overrides.logger || logger;

  const instances = {
    logger: resolverLogger,
    inputSanitizer:
      overrides.inputSanitizer ||
      new InputSanitizer({ logger: resolverLogger }),
    emailNormalizer:
      overrides.emailNormalizer ||
      new EmailNormalizer({ logger: resolverLogger }),
    domainValidator:
      overrides.domainValidator ||
      new DomainValidator({ logger: resolverLogger }),
    userRepository:
      overrides.userRepository ||
      new UserRepository({ logger: resolverLogger, db }),
    auditRepository:
      overrides.auditRepository ||
      new AuditRepository({ logger: resolverLogger }),
    cacheRepository:
      overrides.cacheRepository ||
      new CacheRepository({
        logger: resolverLogger,
        config: { ttlMs: 5 * 60 * 1000, maxEntries: 1000 },
      }),
  };

  // Only cache if no overrides (production path)
  if (Object.keys(overrides).length === 0) {
    _sharedInstances = instances;
  }

  return instances;
}

// ============================================================
// Factory: Create an EmailIdentityResolver with all deps wired
// ============================================================

/**
 * Create a fully-wired EmailIdentityResolver instance.
 *
 * @param {Object} [overrides] - Optional dependency overrides for testing
 * @returns {EmailIdentityResolver} Ready-to-use resolver
 */
function createEmailResolver(overrides = {}) {
  const deps = getSharedInstances(overrides);
  return new EmailIdentityResolver(deps);
}

// ============================================================
// Shutdown: Clean up shared instances (for graceful shutdown)
// ============================================================

/**
 * Shutdown shared instances (cache timers, etc).
 * Call during application graceful shutdown.
 */
function shutdown() {
  if (_sharedInstances?.cacheRepository) {
    _sharedInstances.cacheRepository.shutdown();
  }
  _sharedInstances = null;
}

// ============================================================
// Export factory functions
// ============================================================
module.exports = {
  createEmailResolver,
  getSharedInstances,
  shutdown,
};
