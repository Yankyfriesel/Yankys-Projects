import { and, count, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { Db } from "../db/connection";
import { activityLog, sessions, userPermissions, users, type DeviceType } from "../db/schema";
import { isPermission, type Permission } from "../permissions/registry";

/** What the administration screen reads. Writes live in admin.ts. */

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  displayName: string;
  jobTitle: string;
  locale: "he" | "en";
  isOwner: boolean;
  isDisabled: boolean;
  mustChangePassword: boolean;
  twoFactorEnabled: boolean;
  createdAt: Date;
  permissions: Permission[];
  /** Newest session start, null if the user never signed in. */
  lastSeen: Date | null;
}

/** Owner first, then by display name. */
export async function listUsers(db: Db): Promise<AdminUserRow[]> {
  const rows = await db.select().from(users).orderBy(desc(users.isOwner), users.displayName);
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const grants = await db
    .select({ userId: userPermissions.userId, permission: userPermissions.permission })
    .from(userPermissions)
    .where(inArray(userPermissions.userId, ids));
  const seen = await db
    .select({ userId: sessions.userId, at: sql<Date>`max(${sessions.createdAt})` })
    .from(sessions)
    .where(inArray(sessions.userId, ids))
    .groupBy(sessions.userId);

  const byUser = new Map<string, Permission[]>();
  for (const g of grants) {
    // A key from a feature that was removed is left out, so saving the user never fails on it.
    if (!isPermission(g.permission)) continue;
    const list = byUser.get(g.userId) ?? [];
    list.push(g.permission as Permission);
    byUser.set(g.userId, list);
  }
  const lastSeen = new Map(seen.map((s) => [s.userId, s.at ? new Date(s.at) : null]));

  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    displayName: r.displayName,
    jobTitle: r.jobTitle,
    locale: r.locale,
    isOwner: r.isOwner,
    isDisabled: r.isDisabled,
    mustChangePassword: r.mustChangePassword,
    twoFactorEnabled: r.twoFactorEnabled,
    createdAt: r.createdAt,
    permissions: byUser.get(r.id) ?? [],
    lastSeen: lastSeen.get(r.id) ?? null,
  }));
}

export const ACTIVITY_PAGE_SIZE = 25;

export interface ActivityFilter {
  userId?: string;
  /** Exact action, or a prefix ending in "." to take a whole family ("admin."). */
  action?: string;
  /** YYYY-MM-DD, factory time, inclusive. */
  from?: string;
  to?: string;
  page: number;
}

export interface ActivityRow {
  id: number;
  at: Date;
  userId: string | null;
  userDisplay: string;
  deviceType: DeviceType | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
}

function activityWhere(filter: ActivityFilter) {
  const conditions = [];
  if (filter.userId) conditions.push(eq(activityLog.userId, filter.userId));
  if (filter.action) {
    conditions.push(
      filter.action.endsWith(".")
        ? sql`${activityLog.action} like ${filter.action + "%"}`
        : eq(activityLog.action, filter.action),
    );
  }
  if (filter.from) conditions.push(gte(activityLog.at, startOfDay(filter.from)));
  if (filter.to) conditions.push(lt(activityLog.at, startOfDay(filter.to, 1)));
  return conditions.length > 0 ? and(...conditions) : undefined;
}

/** Newest first. `total` is the number of rows matching the filter. */
export async function listActivity(
  db: Db,
  filter: ActivityFilter,
): Promise<{ rows: ActivityRow[]; total: number; pageCount: number }> {
  const where = activityWhere(filter);

  const [{ value: total }] = await db.select({ value: count() }).from(activityLog).where(where);
  const pageCount = Math.max(1, Math.ceil(total / ACTIVITY_PAGE_SIZE));
  const page = Math.min(Math.max(1, filter.page), pageCount);

  const rows = await db
    .select()
    .from(activityLog)
    .where(where)
    .orderBy(desc(activityLog.at), desc(activityLog.id))
    .limit(ACTIVITY_PAGE_SIZE)
    .offset((page - 1) * ACTIVITY_PAGE_SIZE);

  return { rows, total, pageCount };
}

/** The most entries one printed report holds. */
export const ACTIVITY_REPORT_LIMIT = 2000;

/** Every entry matching the filter (not one page), newest first, up to the report limit. */
export async function listActivityReport(
  db: Db,
  filter: Omit<ActivityFilter, "page">,
): Promise<{ rows: ActivityRow[]; total: number }> {
  const where = activityWhere({ ...filter, page: 1 });
  const [{ value: total }] = await db.select({ value: count() }).from(activityLog).where(where);
  const rows = await db
    .select()
    .from(activityLog)
    .where(where)
    .orderBy(desc(activityLog.at), desc(activityLog.id))
    .limit(ACTIVITY_REPORT_LIMIT);
  return { rows, total };
}

/** The distinct actions in the log, for the filter. */
export async function listActivityActions(db: Db): Promise<string[]> {
  const rows = await db
    .selectDistinct({ action: activityLog.action })
    .from(activityLog)
    .orderBy(activityLog.action);
  return rows.map((r) => r.action);
}

/** Midnight of a YYYY-MM-DD date in the factory time zone (Asia/Jerusalem), plus whole days. */
function startOfDay(iso: string, plusDays = 0): Date {
  const [y, m, d] = iso.split("-").map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d + plusDays);
  // Offset of the zone at that moment, so daylight saving is respected.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    timeZoneName: "longOffset",
  })
    .formatToParts(new Date(utcMidnight))
    .find((p) => p.type === "timeZoneName")?.value;
  const match = parts?.match(/GMT([+-])(\d{2}):(\d{2})/);
  const offsetMinutes = match
    ? (match[1] === "+" ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3]))
    : 0;
  return new Date(utcMidnight - offsetMinutes * 60_000);
}
