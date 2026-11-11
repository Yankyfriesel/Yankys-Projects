import { getDatabase } from "../db";
import { createAuth, type Auth } from "./create-auth";

const globalRef = globalThis as unknown as { __weighingAuth?: Auth };

function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    if (!secret || secret.length < 32) {
      throw new Error("AUTH_SECRET must be set to a random value of at least 32 characters.");
    }
  }
  return secret || "development-only-secret-change-me";
}

function buildAuth(): Auth {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  return createAuth({
    db: getDatabase().db,
    baseURL: process.env.APP_URL || "http://localhost:3000",
    secret: authSecret(),
    google: clientId && clientSecret ? { clientId, clientSecret } : null,
    trustedOrigins: (process.env.TRUSTED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  });
}

export function getAuth(): Auth {
  globalRef.__weighingAuth ??= buildAuth();
  return globalRef.__weighingAuth;
}

export const auth = getAuth();

export const googleSignInEnabled = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
);

export type { Auth, AuthSession, SessionUser } from "./create-auth";
