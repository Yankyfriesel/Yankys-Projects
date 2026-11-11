import { and, desc, gte, inArray } from "drizzle-orm";
import type { Db } from "../db/connection";
import { activityLog } from "../db/schema";
import { readSetting, writeSetting } from "../settings";

/**
 * Warnings about sign-in attempts that look like someone breaking in, read from the activity log:
 * - "locked": an account was locked after wrong passwords and someone kept trying;
 * - "guessing": wrong passwords for one email, a few times in a day (before it locks);
 * - "codes": wrong two-step codes from one address, a few times in a day;
 * - "google": a Google sign-in refused (an account that is not registered, or one with a code).
 * Which warnings have been seen is kept as one time in the settings.
 */

export type AlertKind = "locked" | "guessing" | "codes" | "google";

export interface SecurityAlert {
  kind: AlertKind;
  /** The email (locked, guessing) or the address (codes, google) it is about. */
  subject: string;
  count: number;
  lastAt: Date;
  /** Addresses the attempts came from. */
  ips: string[];
}

const SEEN_KEY = "security.alertsSeenAt";
const WEEK = 7 * 24 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
/** Wrong passwords or codes in a day before they count as a warning. */
export const ALERT_THRESHOLD = 3;

const ACTIONS = [
  "auth.loginFailed",
  "auth.loginBlocked",
  "auth.twoFactorFailed",
  "auth.googleRefused",
];

interface Row {
  action: string;
  at: Date;
  ip: string | null;
  email: string;
}

function group(rows: Row[], key: (row: Row) => string, since: number) {
  const groups = new Map<string, { count: number; lastAt: Date; ips: Set<string> }>();
  for (const row of rows) {
    if (row.at.getTime() < since) continue;
    const name = key(row);
    const entry = groups.get(name) ?? { count: 0, lastAt: row.at, ips: new Set<string>() };
    entry.count += 1;
    if (row.at > entry.lastAt) entry.lastAt = row.at;
    if (row.ip) entry.ips.add(row.ip);
    groups.set(name, entry);
  }
  return groups;
}

/** The warnings of the last week, newest first. */
export async function getSecurityAlerts(db: Db, now = new Date()): Promise<SecurityAlert[]> {
  const weekAgo = now.getTime() - WEEK;
  const dayAgo = now.getTime() - DAY;
  const found = await db
    .select({
      action: activityLog.action,
      at: activityLog.at,
      ip: activityLog.ip,
      userDisplay: activityLog.userDisplay,
      details: activityLog.details,
    })
    .from(activityLog)
    .where(and(inArray(activityLog.action, ACTIONS), gte(activityLog.at, new Date(weekAgo))))
    .orderBy(desc(activityLog.at))
    .limit(5000);

  const rows: Row[] = found.map((r) => ({
    action: r.action,
    at: r.at,
    ip: r.ip,
    email: String(
      (r.details as { email?: unknown } | null)?.email ?? r.userDisplay ?? "",
    ).toLowerCase(),
  }));
  const of = (action: string) => rows.filter((row) => row.action === action);

  const alerts: SecurityAlert[] = [];
  const add = (kind: AlertKind, groups: ReturnType<typeof group>, minimum: number): void => {
    for (const [subject, entry] of groups) {
      if (entry.count < minimum) continue;
      alerts.push({
        kind,
        subject,
        count: entry.count,
        lastAt: entry.lastAt,
        ips: [...entry.ips],
      });
    }
  };

  add(
    "locked",
    group(of("auth.loginBlocked"), (r) => r.email || "?", weekAgo),
    1,
  );
  add(
    "guessing",
    group(of("auth.loginFailed"), (r) => r.email || "?", dayAgo),
    ALERT_THRESHOLD,
  );
  add(
    "codes",
    group(of("auth.twoFactorFailed"), (r) => r.ip ?? "?", dayAgo),
    ALERT_THRESHOLD,
  );
  add(
    "google",
    group(of("auth.googleRefused"), (r) => r.ip ?? "?", weekAgo),
    1,
  );

  return alerts.sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
}

export async function getAlertsSeenAt(db: Db): Promise<Date | null> {
  const stored = await readSetting<string>(db, SEEN_KEY);
  const date = typeof stored?.value === "string" ? new Date(stored.value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

export function countUnseen(alerts: SecurityAlert[], seenAt: Date | null): number {
  return alerts.filter((alert) => !seenAt || alert.lastAt > seenAt).length;
}

/** How many warnings are new since someone last marked them as seen. */
export async function getUnseenAlertCount(db: Db): Promise<number> {
  const [alerts, seenAt] = await Promise.all([getSecurityAlerts(db), getAlertsSeenAt(db)]);
  return countUnseen(alerts, seenAt);
}

export async function markAlertsSeen(db: Db, actorId: string | null, now = new Date()) {
  await writeSetting(db, SEEN_KEY, now.toISOString(), actorId);
}
