import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Encrypts a secret (the Priority API password) before it is stored, so a copy
 * of the database alone does not reveal it. AES-256-GCM with a key derived from
 * AUTH_SECRET; changing AUTH_SECRET makes stored secrets unreadable and they
 * must be entered again. Format: "v1.<iv>.<tag>.<ciphertext>" in base64url.
 */

function keyFrom(secret: string): Buffer {
  return createHash("sha256").update(`weighing-settings:${secret}`).digest();
}

export function encryptSecret(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), body].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

/** The original text, or null when the value is damaged or was encrypted with another secret. */
export function decryptSecret(stored: string, secret: string): string | null {
  const [version, iv, tag, body] = stored.split(".");
  if (version !== "v1" || !iv || !tag || !body) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** The server's secret from the environment; throws if the app was started without one. */
export function appSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return secret;
}
