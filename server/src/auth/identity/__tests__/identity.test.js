// ============================================================
// IDENTITY MODULE — Integration Test Suite
// ============================================================
// Comprehensive tests for the enterprise identity resolver.
// Tests every layer: validators, repositories, resolvers, factory.
//
// Run: npx jest server/src/auth/identity/__tests__/identity.test.js
//
// Uses mock dependencies to isolate each layer and test:
//   - Happy path: valid Google payload → resolved identity
//   - Invalid payloads: missing/malformed fields
//   - Unauthorized domains: non-whitelisted emails
//   - Cache hit/miss: repeated resolutions
//   - Database failures: transient error handling
//   - Error classification: correct error types thrown
// ============================================================

// ---- Mock the external dependencies BEFORE requiring modules ----

// Mock emailService — we test our wrappers, not the original functions
jest.mock("../../../services/emailService", () => ({
  normalizeEmail: jest.fn((email) => email.toLowerCase().trim()),
  extractDomain: jest.fn((email) => email.split("@")[1]),
  validateDomain: jest.fn(async (domain) => {
    if (domain !== "bitsathy.ac.in") {
      const error = new Error("Domain not allowed");
      error.code = "DOMAIN_NOT_ALLOWED";
      error.statusCode = 403;
      throw error;
    }
  }),
  hashEmail: jest.fn(async (email) => `hashed_${email}`),
}));

// Mock User model
jest.mock("../../../models/User", () => ({
  findByEmailHash: jest.fn(async (hash) => {
    if (hash === "hashed_kamesh.mz23@bitsathy.ac.in") {
      return {
        id: "user-uuid-123",
        email: "kamesh.mz23@bitsathy.ac.in",
        user_role: "student",
        display_name: "Kamesh",
      };
    }
    return null; // New user
  }),
  findById: jest.fn(async () => null),
  create: jest.fn(async (data) => ({ id: "new-user-uuid", ...data })),
}));

// Mock IdentitySnapshot model
jest.mock("../../../models/IdentitySnapshot", () => ({
  create: jest.fn(async () => ({})),
}));

// Mock logger
jest.mock("../../../utils/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: jest.fn(function () {
    return this;
  }),
}));

// Mock database
jest.mock("../../../config/database", () => ({
  query: jest.fn(async () => ({ rows: [{ "?column?": 1 }] })),
  getClient: jest.fn(),
}));

// ---- Now require the modules under test ----
const InputSanitizer = require("../validators/InputSanitizer");
const EmailNormalizer = require("../validators/EmailNormalizer");
const DomainValidator = require("../validators/DomainValidator");
const UserRepository = require("../repositories/UserRepository");
const AuditRepository = require("../repositories/AuditRepository");
const CacheRepository = require("../repositories/CacheRepository");
const EmailIdentityResolver = require("../resolvers/EmailIdentityResolver");
const { createEmailResolver } = require("../resolvers");
const {
  InputValidationError,
  InvalidEmailError,
  UnauthorizedDomainError,
  DatabaseUnavailableError,
} = require("../errors/IdentityErrors");
const {
  mapErrorToResponse,
  isTransientError,
  isSecurityConcern,
} = require("../errors/errorMapper");

const logger = require("../../../utils/logger");
const db = require("../../../config/database");

// ============================================================
// Test data fixtures
// ============================================================
const VALID_PAYLOAD = {
  email: "Kamesh.MZ23@bitsathy.ac.in",
  email_verified: true,
  sub: "google-sub-123456",
  name: "Kamesh",
  given_name: "Kamesh",
  family_name: "MZ",
  picture: "https://lh3.googleusercontent.com/photo.jpg",
};

const EXTERNAL_DOMAIN_PAYLOAD = {
  email: "hacker@gmail.com",
  email_verified: true,
  sub: "google-sub-evil",
  name: "Hacker",
};

// ============================================================
// InputSanitizer Tests
// ============================================================
describe("InputSanitizer", () => {
  let sanitizer;

  beforeEach(() => {
    sanitizer = new InputSanitizer({ logger });
  });

  test("accepts valid Google payload", () => {
    expect(() => sanitizer.sanitize(VALID_PAYLOAD)).not.toThrow();
  });

  test("rejects null payload", () => {
    expect(() => sanitizer.sanitize(null)).toThrow(InputValidationError);
  });

  test("rejects undefined payload", () => {
    expect(() => sanitizer.sanitize(undefined)).toThrow(InputValidationError);
  });

  test("rejects payload without email", () => {
    expect(() =>
      sanitizer.sanitize({ email_verified: true, sub: "123" }),
    ).toThrow(InputValidationError);
  });

  test("rejects payload with unverified email", () => {
    expect(() =>
      sanitizer.sanitize({ email: "a@b.com", email_verified: false, sub: "1" }),
    ).toThrow(InputValidationError);
  });

  test("rejects payload without sub", () => {
    expect(() =>
      sanitizer.sanitize({ email: "a@b.com", email_verified: true }),
    ).toThrow(InputValidationError);
  });

  test("rejects email with dangerous characters", () => {
    expect(() =>
      sanitizer.sanitize({
        email: "test<script>@bitsathy.ac.in",
        email_verified: true,
        sub: "123",
      }),
    ).toThrow(InputValidationError);
  });

  test("rejects email exceeding 254 chars", () => {
    const longEmail = "a".repeat(250) + "@b.com";
    expect(() =>
      sanitizer.sanitize({
        email: longEmail,
        email_verified: true,
        sub: "123",
      }),
    ).toThrow(InputValidationError);
  });
});

// ============================================================
// EmailNormalizer Tests
// ============================================================
describe("EmailNormalizer", () => {
  let normalizer;

  beforeEach(() => {
    normalizer = new EmailNormalizer({ logger });
  });

  test("canonicalizes email to lowercase", () => {
    const result = normalizer.canonicalize("Kamesh.MZ23@bitsathy.ac.in");
    expect(result).toBe("kamesh.mz23@bitsathy.ac.in");
  });

  test("strips whitespace", () => {
    const result = normalizer.canonicalize("  kamesh.mz23@bitsathy.ac.in  ");
    expect(result).toBe("kamesh.mz23@bitsathy.ac.in");
  });

  test("analyzes college student format", () => {
    const info = normalizer.analyzeFormat("kamesh.mz23@bitsathy.ac.in");
    expect(info.isCollegeFormat).toBe(true);
    expect(info.localPart).toBe("kamesh.mz23");
    expect(info.domain).toBe("bitsathy.ac.in");
  });

  test("detects non-college format", () => {
    const info = normalizer.analyzeFormat("random@gmail.com");
    expect(info.domain).toBe("gmail.com");
  });
});

// ============================================================
// DomainValidator Tests
// ============================================================
describe("DomainValidator", () => {
  let validator;

  beforeEach(() => {
    validator = new DomainValidator({ logger });
  });

  test("accepts bitsathy.ac.in domain", async () => {
    await expect(
      validator.validate("kamesh.mz23@bitsathy.ac.in"),
    ).resolves.not.toThrow();
  });

  test("rejects external domains", async () => {
    await expect(validator.validate("hacker@gmail.com")).rejects.toThrow(
      UnauthorizedDomainError,
    );
  });

  test("rejects empty domain", async () => {
    await expect(validator.validate("@")).rejects.toThrow(
      UnauthorizedDomainError,
    );
  });

  test("extracts domain correctly", () => {
    expect(validator.extractDomain("user@bitsathy.ac.in")).toBe(
      "bitsathy.ac.in",
    );
  });

  test("validates valid subdomain", () => {
    expect(
      validator.validateSubdomain("faculty.bitsathy.ac.in", "bitsathy.ac.in"),
    ).toBe(true);
  });

  test("rejects invalid subdomain", () => {
    expect(
      validator.validateSubdomain("evil.gmail.com", "bitsathy.ac.in"),
    ).toBe(false);
  });
});

// ============================================================
// CacheRepository Tests
// ============================================================
describe("CacheRepository", () => {
  let cache;

  beforeEach(() => {
    cache = new CacheRepository({
      logger,
      config: { ttlMs: 1000, maxEntries: 3, sweepIntervalMs: 0 },
    });
  });

  afterEach(() => {
    cache.shutdown();
  });

  test("returns null on cache miss", () => {
    expect(cache.get("nonexistent")).toBeNull();
  });

  test("stores and retrieves values", () => {
    cache.set("key1", { data: "value1" });
    expect(cache.get("key1")).toEqual({ data: "value1" });
  });

  test("returns null for expired entries", async () => {
    cache.set("expiring", { data: "temp" }, 1); // 1ms TTL
    await new Promise((r) => setTimeout(r, 10));
    expect(cache.get("expiring")).toBeNull();
  });

  test("invalidates specific entries", () => {
    cache.set("key1", { data: "value1" });
    cache.invalidate("key1");
    expect(cache.get("key1")).toBeNull();
  });

  test("evicts oldest entry when at capacity", () => {
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    cache.set("d", 4); // Should evict 'a'
    expect(cache.get("a")).toBeNull();
    expect(cache.get("d")).toBe(4);
  });

  test("reports metrics correctly", () => {
    cache.set("x", 1);
    cache.get("x"); // hit
    cache.get("y"); // miss
    const m = cache.getMetrics();
    expect(m.hits).toBe(1);
    expect(m.misses).toBe(1);
    expect(m.size).toBe(1);
    expect(m.hitRate).toBe(0.5);
  });

  test("isHealthy returns true", () => {
    expect(cache.isHealthy()).toBe(true);
  });

  test("clear removes all entries", () => {
    cache.set("a", 1);
    cache.set("b", 2);
    cache.clear();
    expect(cache.getMetrics().size).toBe(0);
  });
});

// ============================================================
// UserRepository Tests
// ============================================================
describe("UserRepository", () => {
  let repo;

  beforeEach(() => {
    repo = new UserRepository({ logger, db });
  });

  test("finds existing user by email hash", async () => {
    const user = await repo.findByEmailHash(
      "hashed_kamesh.mz23@bitsathy.ac.in",
    );
    expect(user).not.toBeNull();
    expect(user.id).toBe("user-uuid-123");
  });

  test("returns null for unknown email hash", async () => {
    const user = await repo.findByEmailHash("hashed_unknown@bitsathy.ac.in");
    expect(user).toBeNull();
  });

  test("isHealthy returns true when DB responds", async () => {
    expect(await repo.isHealthy()).toBe(true);
  });
});

// ============================================================
// Error Mapper Tests
// ============================================================
describe("Error Mapper", () => {
  test("maps UnauthorizedDomainError to response", () => {
    const error = new UnauthorizedDomainError("gmail.com");
    const response = mapErrorToResponse(error);
    expect(response.statusCode).toBe(403);
    expect(response.code).toBe("UNAUTHORIZED_DOMAIN");
    expect(response.retryable).toBe(false);
  });

  test("maps generic Error to 500", () => {
    const error = new Error("kaboom");
    const response = mapErrorToResponse(error);
    expect(response.statusCode).toBe(500);
  });

  test("identifies transient errors", () => {
    const dbError = new DatabaseUnavailableError("DB down");
    expect(isTransientError(dbError)).toBe(true);
  });

  test("identifies security concerns", () => {
    const domainError = new UnauthorizedDomainError("evil.com");
    expect(isSecurityConcern(domainError)).toBe(true);
  });
});

// ============================================================
// EmailIdentityResolver — Full Pipeline Tests
// ============================================================
describe("EmailIdentityResolver — Full Pipeline", () => {
  let resolver;

  beforeEach(() => {
    resolver = createEmailResolver({
      logger,
    });
  });

  afterEach(() => {
    // Reset shared instances
    const { shutdown } = require("../resolvers");
    shutdown();
  });

  test("resolves existing user identity (happy path)", async () => {
    const result = await resolver.resolve(VALID_PAYLOAD);

    expect(result.email).toBe("kamesh.mz23@bitsathy.ac.in");
    expect(result.domain).toBe("bitsathy.ac.in");
    expect(result.googleSubject).toBe("google-sub-123456");
    expect(result.userId).toBe("user-uuid-123");
    expect(result.isNewUser).toBe(false);
    expect(result.existingRole).toBe("student");
    expect(result.displayName).toBe("Kamesh");
    expect(result.resolverType).toBe("EmailIdentityResolver");
    expect(result.resolvedAt).toBeDefined();
  });

  test("resolves new user identity", async () => {
    const newUserPayload = {
      email: "newstudent.ab24@bitsathy.ac.in",
      email_verified: true,
      sub: "google-sub-999",
      name: "New Student",
    };

    const result = await resolver.resolve(newUserPayload);

    expect(result.email).toBe("newstudent.ab24@bitsathy.ac.in");
    expect(result.userId).toBeNull();
    expect(result.isNewUser).toBe(true);
    expect(result.existingRole).toBeNull();
  });

  test("rejects unauthorized domain", async () => {
    await expect(resolver.resolve(EXTERNAL_DOMAIN_PAYLOAD)).rejects.toThrow(
      UnauthorizedDomainError,
    );
  });

  test("rejects null payload", async () => {
    await expect(resolver.resolve(null)).rejects.toThrow();
  });

  test("rejects payload with unverified email", async () => {
    const payload = { ...VALID_PAYLOAD, email_verified: false };
    await expect(resolver.resolve(payload)).rejects.toThrow();
  });

  test("returns cached result on second call", async () => {
    // First call — cache miss, hits DB
    const result1 = await resolver.resolve(VALID_PAYLOAD);

    // Second call — should return cached result
    const result2 = await resolver.resolve(VALID_PAYLOAD);

    expect(result2.email).toBe(result1.email);
    expect(result2.userId).toBe(result1.userId);
  });
});

// ============================================================
// AuditRepository Tests
// ============================================================
describe("AuditRepository", () => {
  let audit;

  beforeEach(() => {
    audit = new AuditRepository({ logger });
  });

  test("records resolution without throwing", async () => {
    await expect(
      audit.recordResolution({
        userId: "user-123",
        email: "test@bitsathy.ac.in",
        domain: "bitsathy.ac.in",
        resolverType: "EmailIdentityResolver",
        durationMs: 42,
      }),
    ).resolves.not.toThrow();
  });

  test("records failure without throwing", async () => {
    await expect(
      audit.recordFailure({
        email: "bad@evil.com",
        domain: "evil.com",
        reason: "Unauthorized domain",
        errorCode: "UNAUTHORIZED_DOMAIN",
        resolverType: "EmailIdentityResolver",
      }),
    ).resolves.not.toThrow();
  });

  test("records security event without throwing", async () => {
    await expect(
      audit.recordSecurityEvent({
        type: "RATE_LIMIT_HIT",
        details: { ip: "127.0.0.1" },
      }),
    ).resolves.not.toThrow();
  });
});
