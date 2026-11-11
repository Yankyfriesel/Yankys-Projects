import { getDatabase, type Db } from "../db";
import { activityLog, type DeviceType } from "../db/schema";

/**
 * One row per action. Rows are never edited or deleted. The user's display name
 * is frozen on the row so history reads the same after renames or disabling.
 */
export interface ActivityEntry {
  action: string;
  userId?: string | null;
  userDisplay: string;
  deviceType?: DeviceType | null;
  entityType?: string | null;
  entityId?: string | null;
  details?: Record<string, unknown> | null;
  ip?: string | null;
}

/** Who performs an action, for logging. */
export interface Actor {
  id: string | null;
  display: string;
  deviceType?: DeviceType | null;
  ip?: string | null;
}

export const SYSTEM_ACTOR: Actor = { id: null, display: "system" };

export async function logActivity(entry: ActivityEntry, db: Db = getDatabase().db): Promise<void> {
  await db.insert(activityLog).values({
    action: entry.action,
    userId: entry.userId ?? null,
    userDisplay: entry.userDisplay,
    deviceType: entry.deviceType ?? null,
    entityType: entry.entityType ?? null,
    entityId: entry.entityId ?? null,
    details: entry.details ?? null,
    ip: entry.ip ?? null,
  });
}

/** Shorthand for an action performed by `actor` on an entity. */
export function logFor(
  actor: Actor,
  action: string,
  rest: Omit<ActivityEntry, "action" | "userId" | "userDisplay" | "deviceType" | "ip"> = {},
  db?: Db,
): Promise<void> {
  return logActivity(
    {
      action,
      userId: actor.id,
      userDisplay: actor.display,
      deviceType: actor.deviceType ?? null,
      ip: actor.ip ?? null,
      ...rest,
    },
    db,
  );
}
