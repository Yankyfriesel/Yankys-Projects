import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

/**
 * scrypt with the parameters and "<salt>:<key>" hex format Better Auth uses by
 * default, so the seed's owner password and step 4's login agree without a
 * custom hasher. Passwords are NFKC-normalized before hashing, as Better Auth does.
 */
const N = 16384;
const r = 16;
const p = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY = 128 * N * r * 2;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = await derive(password, salt);
  return `${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  const [salt, keyHex] = hash.split(":");
  if (!salt || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = await derive(password, salt);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password.normalize("NFKC"),
      salt,
      KEY_LENGTH,
      { N, r, p, maxmem: MAX_MEMORY },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

/** What a person chooses for a new password. Temporary passwords made by the system are exempt. */
export const PASSWORD_MIN_LENGTH = 8;

const COMMON = ["password", "123456", "qwerty", "letmein", "welcome", "northfield", "admin"];

/** Null when the password is strong enough; otherwise why not. */
export function checkPasswordStrength(password: string): "tooShort" | "weak" | null {
  if (password.length < PASSWORD_MIN_LENGTH) return "tooShort";
  const lower = password.toLowerCase();
  const hasLetter = /\p{L}/u.test(password);
  const hasDigit = /\d/.test(password);
  const kinds = [/\p{Ll}/u, /\p{Lu}/u, /\d/, /[^\p{L}\d]/u].filter((kind) => kind.test(password));
  if (!hasLetter || !hasDigit || kinds.length < 3) return "weak";
  if (COMMON.some((word) => lower.includes(word))) return "weak";
  if (/^(.)\1+$/.test(password)) return "weak";
  return null;
}
