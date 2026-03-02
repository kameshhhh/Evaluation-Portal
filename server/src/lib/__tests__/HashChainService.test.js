// ============================================================
// HASH CHAIN SERVICE — Unit Tests
// ============================================================
// Tests the cryptographic hash chain service for:
//   - calculateHash: deterministic SHA-256 from object data
//   - createChainHash: chain hash includes previous hash
//   - verifyChainEntry: timing-safe comparison
//   - verifyChain: full chain walk validation
//   - Determinism: same input always yields same hash
//   - Sensitivity: any change in data changes the hash
//
// Run: npx jest server/src/lib/__tests__/HashChainService.test.js
// ============================================================

// Import the hash chain service
const HashChainService = require("../immutable/HashChainService");

// ============================================================
// Describe block: HashChainService
// ============================================================
describe("HashChainService", () => {
  // ============================================================
  // calculateHash Tests
  // ============================================================
  describe("calculateHash()", () => {
    // Test: returns a SHA-256 hex string (64 characters)
    test("returns a 64-character hex string", () => {
      const data = { name: "Kamesh", role: "student" };
      const hash = HashChainService.calculateHash(data);

      // SHA-256 produces 32 bytes = 64 hex characters
      expect(hash).toHaveLength(64);
      // Should only contain hex characters
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    // Test: deterministic — same data yields same hash
    test("is deterministic — same input produces same output", () => {
      const data = { id: "person-001", type: "student" };
      const hash1 = HashChainService.calculateHash(data);
      const hash2 = HashChainService.calculateHash(data);
      expect(hash1).toBe(hash2);
    });

    // Test: order-independent — keys sorted before hashing
    test("is key-order independent", () => {
      const data1 = { name: "A", age: 20 };
      const data2 = { age: 20, name: "A" };
      const hash1 = HashChainService.calculateHash(data1);
      const hash2 = HashChainService.calculateHash(data2);
      // Because keys are sorted, order should not matter
      expect(hash1).toBe(hash2);
    });

    // Test: sensitive — different data yields different hash
    test("produces different hash for different data", () => {
      const data1 = { name: "Alice" };
      const data2 = { name: "Bob" };
      const hash1 = HashChainService.calculateHash(data1);
      const hash2 = HashChainService.calculateHash(data2);
      expect(hash1).not.toBe(hash2);
    });

    // Test: even a tiny change flips the hash completely
    test("tiny change produces completely different hash", () => {
      const data1 = { value: "hello" };
      const data2 = { value: "hellO" }; // Capital O
      const hash1 = HashChainService.calculateHash(data1);
      const hash2 = HashChainService.calculateHash(data2);
      expect(hash1).not.toBe(hash2);
    });
  });

  // ============================================================
  // createChainHash Tests
  // ============================================================
  describe("createChainHash()", () => {
    // Test: chain hash includes the previous hash in calculation
    test("includes previous hash in chain calculation", () => {
      const data = { name: "Test" };
      const prevHash = "a".repeat(64); // Mock previous hash
      const noChain = HashChainService.calculateHash(data);
      const chained = HashChainService.createChainHash(data, prevHash);

      // The chained hash should differ from the standalone hash
      // because it incorporates the previous hash
      expect(chained).not.toBe(noChain);
    });

    // Test: genesis entry (null previousHash) still works
    test("handles null previous hash for genesis entry", () => {
      const data = { name: "Genesis" };
      const hash = HashChainService.createChainHash(data, null);

      // Should still produce a valid 64-char hex hash
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    // Test: different previous hashes produce different chain hashes
    test("different previous hashes yield different results", () => {
      const data = { name: "Same" };
      const prev1 = "a".repeat(64);
      const prev2 = "b".repeat(64);
      const hash1 = HashChainService.createChainHash(data, prev1);
      const hash2 = HashChainService.createChainHash(data, prev2);
      expect(hash1).not.toBe(hash2);
    });
  });

  // ============================================================
  // verifyChainEntry Tests
  // NOTE: Takes 3 params: (entryData, previousHash, storedHash)
  // ============================================================
  describe("verifyChainEntry()", () => {
    // Test: valid chain entry passes verification
    test("returns true for a valid chain entry", () => {
      const data = { name: "Verify me" };
      const previousHash = "c".repeat(64);
      const expectedHash = HashChainService.createChainHash(data, previousHash);

      // verifyChainEntry takes (data, previousHash, storedHash)
      expect(
        HashChainService.verifyChainEntry(data, previousHash, expectedHash),
      ).toBe(true);
    });

    // Test: tampered data fails verification
    test("returns false when data has been tampered with", () => {
      const data = { name: "Original" };
      const previousHash = "d".repeat(64);
      const originalHash = HashChainService.createChainHash(data, previousHash);

      // Tampered data should NOT match the stored hash
      const tamperedData = { name: "Tampered" };
      expect(
        HashChainService.verifyChainEntry(
          tamperedData,
          previousHash,
          originalHash,
        ),
      ).toBe(false);
    });

    // Test: tampered previous hash fails verification
    test("returns false when previousHash has been tampered", () => {
      const data = { name: "Test" };
      const realPrevHash = "e".repeat(64);
      const originalHash = HashChainService.createChainHash(data, realPrevHash);

      // Wrong previous hash should fail
      const wrongPrevHash = "f".repeat(64);
      expect(
        HashChainService.verifyChainEntry(data, wrongPrevHash, originalHash),
      ).toBe(false);
    });
  });

  // ============================================================
  // verifyChain Tests
  // NOTE: Returns { valid, brokenAt, details } — NOT a boolean
  // ============================================================
  describe("verifyChain()", () => {
    // Test: valid chain of 3 entries passes
    test("returns valid=true for a valid chain of entries", () => {
      // Build a chain of 3 entries
      const data1 = { step: 1 };
      const hash1 = HashChainService.createChainHash(data1, null);

      const data2 = { step: 2 };
      const hash2 = HashChainService.createChainHash(data2, hash1);

      const data3 = { step: 3 };
      const hash3 = HashChainService.createChainHash(data3, hash2);

      const chain = [
        { data: data1, previousHash: null, currentHash: hash1 },
        { data: data2, previousHash: hash1, currentHash: hash2 },
        { data: data3, previousHash: hash2, currentHash: hash3 },
      ];

      const result = HashChainService.verifyChain(chain);
      expect(result.valid).toBe(true);
    });

    // Test: broken chain (tampered middle entry) fails
    test("detects broken chain with tampered data", () => {
      const data1 = { step: 1 };
      const hash1 = HashChainService.createChainHash(data1, null);

      const data2 = { step: 2 };
      const hash2 = HashChainService.createChainHash(data2, hash1);

      const data3 = { step: 3 };
      const hash3 = HashChainService.createChainHash(data3, hash2);

      // Tamper with middle entry's data
      const chain = [
        { data: data1, previousHash: null, currentHash: hash1 },
        { data: { step: "TAMPERED" }, previousHash: hash1, currentHash: hash2 },
        { data: data3, previousHash: hash2, currentHash: hash3 },
      ];

      const result = HashChainService.verifyChain(chain);
      expect(result.valid).toBe(false);
    });

    // Test: single-entry chain (genesis only)
    test("returns valid=true for a single-entry genesis chain", () => {
      const data = { genesis: true };
      const hash = HashChainService.createChainHash(data, null);

      const chain = [{ data, previousHash: null, currentHash: hash }];

      const result = HashChainService.verifyChain(chain);
      expect(result.valid).toBe(true);
    });

    // Test: empty chain
    test("returns valid=true for empty chain", () => {
      const result = HashChainService.verifyChain([]);
      expect(result.valid).toBe(true);
    });
  });
});
