"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  AdminError,
  createUser,
  deleteUser,
  resetTwoFactor,
  resetUserPassword,
  setUserDisabled,
  setUserPermissions,
  updateUserProfile,
} from "@/server/auth/admin";
import { listActivityReport } from "@/server/auth/admin-queries";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { retryFailed } from "@/server/receiving";
import { sendMail } from "@/server/mail";
import { welcomeEmail } from "@/server/mail/welcome";
import { handleMessage } from "@/server/messages";
import { markAlertsSeen } from "@/server/security/alerts";
import { endSession } from "@/server/security/sessions";
import { isIdleMinutes, setIdleMinutes } from "@/server/security";
import { assertPermission, PermissionError, type Access } from "@/server/permissions";
import { isPermission } from "@/server/permissions/registry";

export type AdminErrorCode =
  | "EMAIL_TAKEN"
  | "USER_NOT_FOUND"
  | "OWNER_PROTECTED"
  | "HAS_HISTORY"
  | "SELF_PROTECTED"
  | "INVALID_PERMISSION"
  | "NOT_ALLOWED"
  | "INVALID_INPUT"
  | "GENERIC";

export type AdminResult<T = object> = ({ ok: true } & T) | { ok: false; error: AdminErrorCode };

const profileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  displayName: z.string().trim().max(40),
  jobTitle: z.string().trim().max(60),
  locale: z.enum(["he", "en"]),
});

const createSchema = profileSchema.extend({
  email: z.string().trim().toLowerCase().max(120).pipe(z.email()),
  permissions: z.array(z.string()).max(200),
});

const updateSchema = profileSchema.extend({
  id: z.string().min(1),
  /** Undefined leaves the permissions as they are (the caller may not hold admin.permissions). */
  permissions: z.array(z.string()).max(200).optional(),
});

async function run<T extends object>(
  work: () => Promise<T>,
): Promise<({ ok: true } & T) | { ok: false; error: AdminErrorCode }> {
  try {
    const result = await work();
    revalidatePath("/admin");
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof AdminError) return { ok: false, error: error.code };
    if (error instanceof PermissionError) return { ok: false, error: "NOT_ALLOWED" };
    if (error instanceof z.ZodError) return { ok: false, error: "INVALID_INPUT" };
    console.error("[admin] action failed", error);
    return { ok: false, error: "GENERIC" };
  }
}

/** Anyone below the owner may only hand out keys they hold themselves. */
function assertCanGrant(access: Access, keys: string[]): void {
  for (const key of keys) {
    if (!isPermission(key)) throw new AdminError("INVALID_PERMISSION");
    if (!access.isOwner && !access.permissions.has(key)) throw new PermissionError(key);
  }
}

async function targetIsOwner(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ isOwner: users.isOwner })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) throw new AdminError("USER_NOT_FOUND");
  return row.isOwner;
}

/** Only the owner may touch the owner's account. */
async function assertMayTouch(access: Access, userId: string): Promise<void> {
  if (!access.isOwner && (await targetIsOwner(userId))) throw new AdminError("OWNER_PROTECTED");
}

export async function createUserAction(
  input: z.input<typeof createSchema>,
): Promise<AdminResult<{ temporaryPassword: string; email: string; emailed: boolean }>> {
  return run(async () => {
    const access = await assertPermission("admin.users.create");
    const data = createSchema.parse(input);
    // Permissions can only be given by someone who may edit them.
    const permissions = access.can("admin.permissions") ? data.permissions : [];
    assertCanGrant(access, permissions);
    const created = await createUser(
      db,
      {
        email: data.email,
        name: data.name,
        displayName: data.displayName,
        jobTitle: data.jobTitle,
        locale: data.locale,
        permissions,
      },
      access.actor,
    );
    // The sign-in details also go to the new person by email; if mail is not set up or fails,
    // the screen still shows the password so the person who created the user can hand it over.
    const emailed = await sendMail(
      welcomeEmail({
        to: data.email,
        name: data.displayName || data.name,
        temporaryPassword: created.temporaryPassword,
        appUrl: process.env.APP_URL || "http://localhost:3000",
        locale: data.locale,
      }),
    );
    return { temporaryPassword: created.temporaryPassword, email: data.email, emailed };
  });
}

export async function updateUserAction(input: z.input<typeof updateSchema>): Promise<AdminResult> {
  return run(async () => {
    const access = await assertPermission("admin.users.edit");
    const data = updateSchema.parse(input);
    await assertMayTouch(access, data.id);
    await updateUserProfile(db, data.id, data, access.actor);

    if (data.permissions !== undefined) {
      await assertPermission("admin.permissions");
      assertCanGrant(access, data.permissions);
      await setUserPermissions(db, data.id, data.permissions, access.actor);
    }
    return {};
  });
}

/** Permissions alone, for someone who may change them but not edit profiles. */
export async function setPermissionsAction(input: {
  id: string;
  permissions: string[];
}): Promise<AdminResult> {
  return run(async () => {
    const access = await assertPermission("admin.permissions");
    const data = z.object({ id: z.string().min(1), permissions: z.array(z.string()) }).parse(input);
    await assertMayTouch(access, data.id);
    assertCanGrant(access, data.permissions);
    await setUserPermissions(db, data.id, data.permissions, access.actor);
    return {};
  });
}

export async function resetPasswordAction(
  userId: string,
): Promise<AdminResult<{ temporaryPassword: string }>> {
  return run(async () => {
    const access = await assertPermission("admin.resetPassword");
    await assertMayTouch(access, userId);
    if (access.user.id === userId) throw new AdminError("SELF_PROTECTED");
    return resetUserPassword(db, userId, access.actor);
  });
}

export async function resetTwoFactorAction(userId: string): Promise<AdminResult> {
  return run(async () => {
    const access = await assertPermission("admin.resetPassword");
    await assertMayTouch(access, userId);
    if (access.user.id === userId) throw new AdminError("SELF_PROTECTED");
    await resetTwoFactor(db, userId, access.actor);
    return {};
  });
}

export async function setDisabledAction(userId: string, disabled: boolean): Promise<AdminResult> {
  return run(async () => {
    const access = await assertPermission("admin.users.disable");
    await setUserDisabled(db, userId, disabled, access.actor);
    return {};
  });
}

/** Without `force`, a user with history is refused (HAS_HISTORY) so the screen can warn first. */
export async function deleteUserAction(userId: string, force = false): Promise<AdminResult> {
  return run(async () => {
    const access = await assertPermission("admin.users.delete");
    await deleteUser(db, userId, access.actor, { force: force === true });
    return {};
  });
}

/** Puts failed sends to Priority back in the queue. Needs "admin.sends". */
export async function retrySendsAction(
  ids: number[],
): Promise<{ ok: true; count: number } | { ok: false }> {
  try {
    const access = await assertPermission("admin.sends");
    const parsed = z.array(z.number().int()).max(500).parse(ids);
    const count = await retryFailed(db, parsed, access.actor);
    revalidatePath("/admin");
    return { ok: true, count };
  } catch (error) {
    if (!(error instanceof PermissionError) && !(error instanceof z.ZodError))
      console.error("[admin] retrying sends failed", error);
    return { ok: false };
  }
}

export interface ActivityReportRow {
  /** ISO time */
  at: string;
  user: string;
  action: string;
  subject: string;
  device: "desktop" | "phone" | null;
}

const reportSchema = z.object({
  user: z.string().max(100).optional(),
  action: z.string().max(100).optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

/** Every log entry matching the filter, for the printed report. */
export async function activityReportAction(
  input: z.input<typeof reportSchema>,
): Promise<
  | { ok: true; rows: ActivityReportRow[]; total: number }
  | { ok: false; error: "NOT_ALLOWED" | "GENERIC" }
> {
  try {
    await assertPermission("admin.activityLog");
    const filter = reportSchema.parse(input);
    const { rows, total } = await listActivityReport(db, {
      userId: filter.user || undefined,
      action: filter.action || undefined,
      from: filter.from,
      to: filter.to,
    });
    return {
      ok: true,
      total,
      rows: rows.map((row) => ({
        at: row.at.toISOString(),
        user: row.userId === null && row.userDisplay === "system" ? "" : row.userDisplay,
        action: row.action,
        subject: typeof row.details?.email === "string" ? row.details.email : "",
        device: row.deviceType,
      })),
    };
  } catch (error) {
    if (error instanceof PermissionError) return { ok: false, error: "NOT_ALLOWED" };
    console.error("[admin] the activity report failed", error);
    return { ok: false, error: "GENERIC" };
  }
}

/** Marks the security warnings as seen, so the red number in the menu goes away until a new one. */
export async function markAlertsSeenAction(): Promise<AdminResult> {
  try {
    const access = await assertPermission("admin.security");
    await markAlertsSeen(db, access.user.id);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    if (error instanceof PermissionError) return { ok: false, error: "NOT_ALLOWED" };
    console.error("[admin] marking the security warnings as seen failed", error);
    return { ok: false, error: "GENERIC" };
  }
}

/** Sets after how many minutes without activity people are signed out (0 = never). Needs "security". */
export async function setIdleMinutesAction(minutes: number): Promise<AdminResult> {
  try {
    const access = await assertPermission("admin.security");
    if (!isIdleMinutes(minutes)) return { ok: false, error: "INVALID_INPUT" };
    await setIdleMinutes(db, minutes, access.actor);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    if (error instanceof PermissionError) return { ok: false, error: "NOT_ALLOWED" };
    console.error("[admin] changing the idle sign-out time failed", error);
    return { ok: false, error: "GENERIC" };
  }
}

/** Signs one place out. The place this is done from stays, so nobody locks themselves out by accident. */
export async function endSessionAction(sessionId: string): Promise<AdminResult> {
  return run(async () => {
    const access = await assertPermission("admin.security");
    const id = z.string().min(1).parse(sessionId);
    if (access.session.id === id) throw new AdminError("SELF_PROTECTED");
    await endSession(db, id, access.actor, { mayEndOwner: access.isOwner });
    return {};
  });
}

/** Marks a message as done, with an optional answer for the sender. */
export async function handleMessageAction(id: string, reply: string): Promise<AdminResult> {
  return run(async () => {
    const access = await assertPermission("admin.messages");
    await handleMessage(db, access.actor, String(id), String(reply ?? ""));
    return {};
  });
}
