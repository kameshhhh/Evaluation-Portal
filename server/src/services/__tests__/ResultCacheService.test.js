// ============================================================
// RESULT CACHE SERVICE TESTS — Unit Tests
// ============================================================
// Tests the in-memory TTL cache for computed weighted results.
//
// Run: npx jest server/src/services/__tests__/ResultCacheService.test.js
// ============================================================

// Fresh require for each test to reset singleton state
let ResultCacheService;

beforeEach(() => {
  jest.isolateModules(() => {
    ResultCacheService = require("../ResultCacheService");
  });
});

describe("ResultCacheService", () => {
  // ──────────────────────────────────────────────
  // BASIC OPERATIONS
  // ──────────────────────────────────────────────
  describe("get / set", () => {
    it("should return null for a key that has not been set", () => {
      expect(ResultCacheService.get("missing-key")).toBeNull();
    });

    it("should return the stored value for a cached key", () => {
      const data = { foo: "bar" };
      ResultCacheService.set("key-1", data);
      expect(ResultCacheService.get("key-1")).toEqual(data);
    });

    it("should overwrite existing values on re-set", () => {
      ResultCacheService.set("key-1", { v: 1 });
      ResultCacheService.set("key-1", { v: 2 });
      expect(ResultCacheService.get("key-1")).toEqual({ v: 2 });
    });
  });

  // ──────────────────────────────────────────────
  // TTL EXPIRY
  // ──────────────────────────────────────────────
  describe("TTL expiry", () => {
    it("should return null for expired entries", () => {
      // Set with very short TTL (1 ms)
      ResultCacheService.set("expiring", { data: true }, 1);

      // Wait for expiry
      return new Promise((resolve) => {
        setTimeout(() => {
          expect(ResultCacheService.get("expiring")).toBeNull();
          resolve();
        }, 10);
      });
    });
  });

  // ──────────────────────────────────────────────
  // INVALIDATION
  // ──────────────────────────────────────────────
  describe("invalidation", () => {
    it("should remove a specific key on invalidate()", () => {
      ResultCacheService.set("key-a", { data: true });
      ResultCacheService.invalidate("key-a");
      expect(ResultCacheService.get("key-a")).toBeNull();
    });

    it("should remove all keys matching a session on invalidateSession()", () => {
      ResultCacheService.set("weighted:session-001:detailed", { d: 1 });
      ResultCacheService.set("weighted:session-001:summary", { s: 1 });
      ResultCacheService.set("weighted:session-002:detailed", { d: 2 });

      ResultCacheService.invalidateSession("session-001");

      expect(
        ResultCacheService.get("weighted:session-001:detailed"),
      ).toBeNull();
      expect(ResultCacheService.get("weighted:session-001:summary")).toBeNull();
      // Other sessions should remain
      expect(ResultCacheService.get("weighted:session-002:detailed")).toEqual({
        d: 2,
      });
    });

    it("should remove all entries on clear()", () => {
      ResultCacheService.set("a", 1);
      ResultCacheService.set("b", 2);
      ResultCacheService.clear();
      expect(ResultCacheService.get("a")).toBeNull();
      expect(ResultCacheService.get("b")).toBeNull();
    });
  });

  // ──────────────────────────────────────────────
  // STATS
  // ──────────────────────────────────────────────
  describe("stats()", () => {
    it("should report cache size correctly", () => {
      ResultCacheService.set("x", 1);
      ResultCacheService.set("y", 2);
      const s = ResultCacheService.stats();
      expect(s.size).toBe(2);
      expect(typeof s.maxEntries).toBe("number");
    });
  });
});
