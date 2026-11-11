import { eq } from "drizzle-orm";
import type { Db } from "../db/connection";
import { settings } from "../db/schema";

/** Key-value settings kept in the database (the `settings` table). Callers own the shape of each value. */

export async function readSetting<T>(db: Db, key: string): Promise<{ value: T; updatedAt: Date } | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return row ? { value: row.value as T, updatedAt: row.updatedAt } : null;
}

export async function writeSetting(
  db: Db,
  key: string,
  value: unknown,
  updatedBy: string | null,
): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value, updatedBy })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedBy, updatedAt: new Date() } });
}

export async function deleteSetting(db: Db, key: string): Promise<void> {
  await db.delete(settings).where(eq(settings.key, key));
}
