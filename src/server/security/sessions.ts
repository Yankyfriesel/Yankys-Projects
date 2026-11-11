import { desc, eq, gt } from "drizzle-orm";
import { logFor, type Actor } from "../activity-log";
import { AdminError } from "../auth/admin";
import type { Db } from "../db/connection";
import { sessions, users, type DeviceType } from "../db/schema";

/** One place where someone is signed in right now. */
export interface ActiveSession {
  id: string;
  userId: string;
  name: string;
  email: string;
  isOwner: boolean;
  deviceType: DeviceType;
  ip: string | null;
  userAgent: string | null;
  signedInAt: Date;
  /** The last time the session was refreshed; it moves forward about once an hour. */
  lastSeenAt: Date;
}

/** Every session that has not run out, the most recently active first. */
export async function listActiveSessions(db: Db, now = new Date()): Promise<ActiveSession[]> {
  const rows = await db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      displayName: users.displayName,
      name: users.name,
      email: users.email,
      isOwner: users.isOwner,
      deviceType: sessions.deviceType,
      ip: sessions.ipAddress,
      userAgent: sessions.userAgent,
      signedInAt: sessions.createdAt,
      lastSeenAt: sessions.updatedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(gt(sessions.expiresAt, now))
    .orderBy(desc(sessions.updatedAt));

  return rows.map(({ displayName, name, ...row }) => ({
    ...row,
    name: displayName || name,
  }));
}

/** Signs one place out; whoever is there has to sign in again. */
export async function endSession(
  db: Db,
  sessionId: string,
  actor: Actor,
  options: { mayEndOwner: boolean },
): Promise<void> {
  const [row] = await db
    .select({ userId: sessions.userId, email: users.email, isOwner: users.isOwner })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!row) throw new AdminError("USER_NOT_FOUND");
  if (row.isOwner && !options.mayEndOwner) throw new AdminError("OWNER_PROTECTED");

  await db.delete(sessions).where(eq(sessions.id, sessionId));
  await logFor(
    actor,
    "admin.sessionEnded",
    { entityType: "user", entityId: row.userId, details: { email: row.email } },
    db,
  );
}
