// ============================================================
// HASH CHAIN SERVICE — Cryptographic Integrity Verification
// ============================================================
// Provides SHA-256 hashing for building tamper-proof hash chains.
// Each record in a chain includes the hash of the previous record,
// creating a linked sequence where tampering with ANY record
// breaks the chain from that point forward.
//
// Used by:
//   - person_history table (hash chain of person changes)
//   - entity_freeze_snapshots table (hash chain of frozen states)
//
// This is NOT blockchain — it's a simpler linked hash chain.
// It provides tamper DETECTION, not tamper PREVENTION.
// If a hash doesn't match, we know something was modified.
// ============================================================

// Import Node.js crypto module for SHA-256 hashing
// Built into Node.js — no external dependencies needed
const crypto = require("crypto");

// ============================================================
// HashChainService — creates and verifies hash chains
// ============================================================
class HashChainService {
  /**
   * Calculate a SHA-256 hash of the given data.
   * The data is JSON-stringified before hashing for consistency.
   *
   * @param {Object} data - The data to hash (will be JSON.stringify'd)
   * @returns {string} Hex-encoded SHA-256 hash (64 characters)
   */
  static calculateHash(data) {
    // Deep-sort all object keys at every nesting level so
    // the same data always produces the identical JSON string
    // regardless of property insertion order.
    const sortedData = HashChainService._deepSortKeys(data);

    // Create SHA-256 hash and output as hexadecimal string
    return crypto
      .createHash("sha256")
      .update(JSON.stringify(sortedData))
      .digest("hex");
  }

  /**
   * Recursively sort all keys in an object at every depth.
   * Arrays are traversed but their order is preserved.
   *
   * @param {*} obj - Value to sort (objects sorted, others returned as-is)
   * @returns {*} A new structure with all object keys sorted
   */
  static _deepSortKeys(obj) {
    // null, undefined, numbers, strings, booleans — return as-is
    if (obj === null || typeof obj !== "object") return obj;

    // Arrays — preserve order but sort keys inside each element
    if (Array.isArray(obj)) {
      return obj.map((item) => HashChainService._deepSortKeys(item));
    }

    // Plain objects — sort keys alphabetically, recurse into values
    return Object.keys(obj)
      .sort()
      .reduce((sorted, key) => {
        sorted[key] = HashChainService._deepSortKeys(obj[key]);
        return sorted;
      }, {});
  }

  /**
   * Create a hash for a new chain entry.
   * Includes the previous hash in the calculation to create the chain link.
   *
   * @param {Object} entryData - The data for this chain entry
   * @param {string|null} previousHash - Hash of the previous entry (null for first)
   * @returns {string} SHA-256 hash for this entry
   */
  static createChainHash(entryData, previousHash = null) {
    // Combine the entry data with the previous hash
    // This is what creates the "chain" — each hash depends on ALL previous hashes
    const hashInput = {
      data: entryData,
      previousHash: previousHash || "GENESIS",
    };

    // Calculate and return the SHA-256 hash
    return HashChainService.calculateHash(hashInput);
  }

  /**
   * Verify that a chain entry's hash is correct.
   * Recalculates the hash from the data and compares it to the stored hash.
   *
   * @param {Object} entryData - The stored data for this chain entry
   * @param {string|null} previousHash - The stored previous hash
   * @param {string} storedHash - The stored hash to verify against
   * @returns {boolean} True if the hash matches (data hasn't been tampered with)
   */
  static verifyChainEntry(entryData, previousHash, storedHash) {
    // Recalculate the hash from the data
    const expectedHash = HashChainService.createChainHash(
      entryData,
      previousHash,
    );

    // Compare using timing-safe equals to prevent timing attacks
    // (unlikely needed here, but defense-in-depth)
    try {
      return crypto.timingSafeEqual(
        Buffer.from(expectedHash, "hex"),
        Buffer.from(storedHash, "hex"),
      );
    } catch {
      // If buffers are different lengths, they can't be equal
      return false;
    }
  }

  /**
   * Verify an entire hash chain (array of entries).
   * Checks that each entry's hash is correct AND that the
   * previous_hash field matches the preceding entry's current_hash.
   *
   * @param {Array<{ data: Object, previousHash: string|null, currentHash: string }>} chain
   * @returns {{ valid: boolean, brokenAt: number|null, details: string }}
   */
  static verifyChain(chain) {
    // Empty chain is technically valid
    if (!chain || chain.length === 0) {
      return { valid: true, brokenAt: null, details: "Empty chain" };
    }

    // Walk through each entry in the chain
    for (let i = 0; i < chain.length; i++) {
      const entry = chain[i];

      // Verify this entry's hash is correct
      const isValid = HashChainService.verifyChainEntry(
        entry.data,
        entry.previousHash,
        entry.currentHash,
      );

      // If hash doesn't match, the chain is broken at this point
      if (!isValid) {
        return {
          valid: false,
          brokenAt: i,
          details: `Hash mismatch at entry ${i}: expected recalculated hash to match stored hash`,
        };
      }

      // If this isn't the first entry, verify the chain link
      // The previous_hash of entry[i] must equal current_hash of entry[i-1]
      if (i > 0 && entry.previousHash !== chain[i - 1].currentHash) {
        return {
          valid: false,
          brokenAt: i,
          details: `Chain link broken at entry ${i}: previous_hash doesn't match preceding entry's current_hash`,
        };
      }
    }

    // All entries verified — chain is intact
    return { valid: true, brokenAt: null, details: "Chain integrity verified" };
  }
}

// ============================================================
// Export HashChainService for use across the PEMM module
// ============================================================
module.exports = HashChainService;
