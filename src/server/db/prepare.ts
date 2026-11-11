import { PASSWORD_MIN_LENGTH } from "../auth/password";
import { getDatabase } from "./index";
import { hasOwner, seed, type OwnerSeed, type SeedReport } from "./seed";

export function ownerFromEnv(): OwnerSeed {
  return {
    email: process.env.SEED_OWNER_EMAIL || "owner@example.com",
    password: process.env.SEED_OWNER_PASSWORD || "change-me-on-first-login",
    name: process.env.SEED_OWNER_NAME || "Owner",
  };
}

/**
 * Runs pending migrations and the idempotent seed. Called once at server start
 * (src/instrumentation.ts) and by the db:migrate / db:seed scripts.
 */
export async function prepareDatabase(): Promise<SeedReport> {
  const database = getDatabase();
  await database.migrate();
  // A live system never starts with the stand-in owner password that is public in the code.
  if (process.env.NODE_ENV === "production" && !(await hasOwner(database.db))) {
    const password = process.env.SEED_OWNER_PASSWORD ?? "";
    if (!process.env.SEED_OWNER_EMAIL || password.length < PASSWORD_MIN_LENGTH)
      throw new Error(
        `Set SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD (at least ${PASSWORD_MIN_LENGTH} characters) to create the first owner.`,
      );
  }
  return seed(database.db, ownerFromEnv());
}
