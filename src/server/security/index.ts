import { logFor, type Actor } from "../activity-log";
import type { Db } from "../db/connection";
import { readSetting, writeSetting } from "../settings";

/**
 * Signing out someone who has left the system open: after this many minutes of not touching the
 * screen, the person is signed out. 0 means never. Set in the system settings.
 */

const KEY = "security.idleMinutes";

/** Without a saved choice the system signs out after half an hour. */
export const DEFAULT_IDLE_MINUTES = 30;
export const MAX_IDLE_MINUTES = 1440;

export function isIdleMinutes(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_IDLE_MINUTES
  );
}

export async function getIdleMinutes(db: Db): Promise<number> {
  const stored = await readSetting<number>(db, KEY);
  return isIdleMinutes(stored?.value) ? stored.value : DEFAULT_IDLE_MINUTES;
}

export async function setIdleMinutes(db: Db, minutes: number, actor: Actor): Promise<void> {
  const before = await getIdleMinutes(db);
  await writeSetting(db, KEY, minutes, actor.id);
  await logFor(
    actor,
    "settings.idleTimeoutChanged",
    { entityType: "settings", entityId: KEY, details: { from: before, to: minutes } },
    db,
  );
}
