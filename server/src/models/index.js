// ============================================================
// MODEL INDEX — Central Export for All Database Models
// ============================================================
// Re-exports all models from a single entry point for clean imports.
// Usage: const { User, IdentitySnapshot, Session } = require('../models');
// ============================================================

// User model — core identity management (find, create, update)
const User = require("./User");

// IdentitySnapshot model — immutable login history (create, query)
const IdentitySnapshot = require("./IdentitySnapshot");

// Session model — JWT audit trail and revocation (create, revoke, query)
const Session = require("./Session");

// Export all models as named exports
module.exports = {
  User,
  IdentitySnapshot,
  Session,
};
