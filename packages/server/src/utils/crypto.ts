// ============================================================================
// SECRETS-AT-REST ENCRYPTION (audit L8)
// ============================================================================
// Symmetric AES-256-GCM encryption for third-party secrets stored in the DB
// (OAuth access/refresh tokens, provider client secrets, job-board API keys).
//
// The key is derived from SECRETS_ENCRYPTION_KEY when set, otherwise from the
// (already-strong, prod-validated) JWT secret, so encryption is active by
// default without new configuration. Ciphertext is self-describing:
//   enc:v1:<iv_b64>:<authTag_b64>:<ciphertext_b64>
// Values without that marker are treated as legacy plaintext and returned
// unchanged, so existing rows keep working and get encrypted the next time they
// are written. A value that can't be decrypted (e.g. the key was rotated)
// decrypts to null so callers treat it as absent rather than crashing.
// ============================================================================

import crypto from "crypto";
import { config } from "../config";

const MARKER = "enc:v1:";
let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const source = process.env.SECRETS_ENCRYPTION_KEY || config.jwt.secret;
  // scrypt derives a stable 32-byte key from the configured secret.
  cachedKey = crypto.scryptSync(source, "emp-recruit/secrets-at-rest/v1", 32);
  return cachedKey;
}

/** Encrypt a secret for storage. null/empty and already-encrypted values pass through. */
export function encryptSecret(plain: string | null | undefined): string | null {
  if (plain == null || plain === "") return plain ?? null;
  if (plain.startsWith(MARKER)) return plain; // already encrypted
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${MARKER}${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

/** Decrypt a stored secret. Legacy plaintext (no marker) is returned unchanged;
 *  an undecryptable value returns null. */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (stored == null || stored === "") return stored ?? null;
  if (!stored.startsWith(MARKER)) return stored; // legacy plaintext
  try {
    const [ivB64, tagB64, dataB64] = stored.slice(MARKER.length).split(":");
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const data = Buffer.from(dataB64, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
