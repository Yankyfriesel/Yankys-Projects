import { and, count, eq, gt, sql } from "drizzle-orm";
import type { Db } from "../db/connection";
import { activityLog } from "../db/schema";

/** Wrong passwords for one email that lock it, and for how long. */
export const LOCKOUT_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;

/**
 * Whether sign-in for this email is locked: too many wrong passwords within the last
 * minutes, counted from the activity log. Counted per email (not per address), so an
 * attacker cannot get around it by changing address or headers. An email that does not
 * exist is counted the same, so the answer reveals nothing about who has an account.
 */
export async function isLockedOut(db: Db, email: string): Promise<boolean> {
  const since = new Date(Date.now() - LOCKOUT_MINUTES * 60_000);
  const [row] = await db
    .select({ failures: count() })
    .from(activityLog)
    .where(
      and(
        eq(activityLog.action, "auth.loginFailed"),
        gt(activityLog.at, since),
        sql`lower(${activityLog.details}->>'email') = ${email.trim().toLowerCase()}`,
      ),
    );
  return (row?.failures ?? 0) >= LOCKOUT_ATTEMPTS;
}
