"use strict";

const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // 256 bits

/**
 * Derives a 256-bit key from the GITHUB_TOKEN_SECRET env var.
 */
function getKey() {
  const secret = process.env.GITHUB_TOKEN_SECRET;
  if (!secret) throw new Error("GITHUB_TOKEN_SECRET is not set");
  return crypto.scryptSync(secret, "github-pat-salt", KEY_LENGTH);
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns { encrypted, iv, authTag } all as hex strings.
 */
function encrypt(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return { encrypted, iv: iv.toString("hex"), authTag };
}

/**
 * Decrypt a ciphertext using AES-256-GCM.
 */
function decrypt(encrypted, ivHex, authTagHex) {
  const key = getKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

module.exports = { encrypt, decrypt };
