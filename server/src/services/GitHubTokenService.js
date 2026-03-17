"use strict";

const { query } = require("../config/database");
const { encrypt, decrypt } = require("../utils/encryption");
const logger = require("../utils/logger");

class GitHubTokenService {
  /**
   * Save (or update) a student's GitHub PAT.
   * Validates the token against GitHub API first, then encrypts & stores.
   */
  static async saveToken(personId, pat) {
    // Validate token against GitHub API
    const validation = await this.validateWithGitHub(pat);
    if (!validation.valid) {
      throw new Error(validation.error || "Invalid GitHub token");
    }

    // Encrypt the token
    const { encrypted, iv, authTag } = encrypt(pat);

    // Upsert into github_tokens
    const result = await query(
      `INSERT INTO github_tokens (person_id, encrypted_token, iv, auth_tag, github_username, github_avatar_url, token_scopes, is_valid, last_validated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, NOW())
       ON CONFLICT (person_id)
       DO UPDATE SET encrypted_token = $2, iv = $3, auth_tag = $4,
                     github_username = $5, github_avatar_url = $6, token_scopes = $7,
                     is_valid = TRUE, last_validated_at = NOW(), updated_at = NOW()
       RETURNING id, person_id, github_username, github_avatar_url, token_scopes, is_valid, created_at, updated_at`,
      [personId, encrypted, iv, authTag, validation.username, validation.avatarUrl, validation.scopes]
    );

    logger.info(`GitHub token saved for person ${personId} (user: ${validation.username})`);
    return result.rows[0];
  }

  /**
   * Validate a PAT by calling GitHub API /user.
   * Checks that required scopes are present.
   */
  static async validateWithGitHub(pat) {
    try {
      const res = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${pat}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      if (!res.ok) {
        return { valid: false, error: `GitHub API returned ${res.status}: Invalid or expired token` };
      }

      // Check scopes from response header
      const scopesHeader = res.headers.get("x-oauth-scopes") || "";
      const scopes = scopesHeader.split(",").map((s) => s.trim()).filter(Boolean);
      const requiredScopes = ["public_repo", "read:user", "user:email"];
      const missing = requiredScopes.filter(
        (req) => !scopes.some((s) => s === req || s === "repo" || s === "user")
      );
      if (missing.length > 0) {
        return { valid: false, error: `Missing required scopes: ${missing.join(", ")}. Please enable: public_repo, read:user, user:email` };
      }

      const userData = await res.json();
      return {
        valid: true,
        username: userData.login,
        avatarUrl: userData.avatar_url,
        scopes,
      };
    } catch (err) {
      logger.error("GitHub token validation failed", { error: err.message });
      return { valid: false, error: "Failed to validate token with GitHub" };
    }
  }

  /**
   * Get token status for a student (does NOT return the token itself).
   */
  static async getTokenStatus(personId) {
    const result = await query(
      `SELECT id, person_id, github_username, github_avatar_url, token_scopes, is_valid, last_validated_at, created_at, updated_at
       FROM github_tokens WHERE person_id = $1`,
      [personId]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0];
  }

  /**
   * Get decrypted token for internal server-side use (admin GitHub fetch).
   */
  static async getDecryptedToken(personId) {
    const result = await query(
      `SELECT encrypted_token, iv, auth_tag, github_username, is_valid
       FROM github_tokens WHERE person_id = $1`,
      [personId]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    if (!row.is_valid) return null;
    try {
      const pat = decrypt(row.encrypted_token, row.iv, row.auth_tag);
      return { pat, username: row.github_username };
    } catch (err) {
      logger.error("Failed to decrypt GitHub token", { personId, error: err.message });
      return null;
    }
  }

  /**
   * Delete a student's token.
   */
  static async deleteToken(personId) {
    const result = await query(
      `DELETE FROM github_tokens WHERE person_id = $1 RETURNING id`,
      [personId]
    );
    return result.rows.length > 0;
  }

  /**
   * Re-validate a stored token.
   */
  static async revalidateToken(personId) {
    const tokenData = await this.getDecryptedToken(personId);
    if (!tokenData) return { valid: false, error: "No token found" };

    const validation = await this.validateWithGitHub(tokenData.pat);
    await query(
      `UPDATE github_tokens SET is_valid = $1, last_validated_at = NOW(), updated_at = NOW() WHERE person_id = $2`,
      [validation.valid, personId]
    );
    return validation;
  }

  /**
   * Check if a student has a valid GitHub token (for enforcement).
   */
  static async hasValidToken(personId) {
    const result = await query(
      `SELECT is_valid FROM github_tokens WHERE person_id = $1`,
      [personId]
    );
    return result.rows.length > 0 && result.rows[0].is_valid;
  }
}

module.exports = GitHubTokenService;
