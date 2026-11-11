import { randomInt } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import { logFor, type Actor } from "../activity-log";
import type { Db } from "../db/connection";
import {
  accounts,
  activityLog,
  boxes,
  pallets,
  priorityMoves,
  sessions,
  userPermissions,
  twoFactors,
  users,
} from "../db/schema";
import { isPermission, type Permission } from "../permissions/registry";
import { hashPassword } from "./password";

/**
 * Admin operations on users. The administration screen (step 8) calls these;
 * every one writes to the activity log. Temporary passwords are returned once
 * and never stored in clear.
 */

// No 0/O, 1/l/I, so a password read from a screen or printout is unambiguous.
const PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

export function generateTemporaryPassword(length = 10): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
  }
  return out;
}

export class AdminError extends Error {
  constructor(
    public readonly code:
      | "EMAIL_TAKEN"
      | "USER_NOT_FOUND"
      | "OWNER_PROTECTED"
      | "HAS_HISTORY"
      | "SELF_PROTECTED"
      | "INVALID_PERMISSION",
  ) {
    super(code);
    this.name = "AdminError";
  }
}

export interface CreateUserInput {
  email: string;
  name: string;
  displayName: string;
  jobTitle?: string;
  locale?: "he" | "en";
  permissions?: string[];
}

export async function createUser(
  db: Db,
  input: CreateUserInput,
  actor: Actor,
): Promise<{ id: string; temporaryPassword: string }> {
  const email = input.email.trim().toLowerCase();
  const permissions = validatePermissions(input.permissions ?? []);
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing.length > 0) throw new AdminError("EMAIL_TAKEN");

  const id = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({
        email,
        emailVerified: true,
        name: input.name.trim(),
        displayName: input.displayName.trim() || input.name.trim(),
        jobTitle: input.jobTitle?.trim() ?? "",
        locale: input.locale ?? "he",
        mustChangePassword: true,
      })
      .returning({ id: users.id });

    await tx.insert(accounts).values({
      userId: created.id,
      accountId: created.id,
      providerId: "credential",
      password: passwordHash,
    });

    if (permissions.length > 0) {
      await tx
        .insert(userPermissions)
        .values(permissions.map((permission) => ({ userId: created.id, permission })));
    }
    return created.id;
  });

  await logFor(
    actor,
    "admin.userCreated",
    { entityType: "user", entityId: id, details: { email, permissions: input.permissions ?? [] } },
    db,
  );
  return { id, temporaryPassword };
}

/** New temporary password, forced change on next login, logged out everywhere. Also serves to lock an employee out. */
export async function resetUserPassword(
  db: Db,
  userId: string,
  actor: Actor,
): Promise<{ temporaryPassword: string }> {
  const user = await findUser(db, userId);
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(accounts)
      .set({ password: passwordHash })
      .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")))
      .returning({ id: accounts.id });
    if (updated.length === 0) {
      await tx
        .insert(accounts)
        .values({ userId, accountId: userId, providerId: "credential", password: passwordHash });
    }
    await tx.update(users).set({ mustChangePassword: true }).where(eq(users.id, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
  });

  await logFor(
    actor,
    "admin.passwordReset",
    { entityType: "user", entityId: userId, details: { email: user.email } },
    db,
  );
  return { temporaryPassword };
}

/** For someone who lost the phone: two-step verification is turned off and the user signed out everywhere. */
export async function resetTwoFactor(db: Db, userId: string, actor: Actor): Promise<void> {
  const user = await findUser(db, userId);
  await db.transaction(async (tx) => {
    await tx.delete(twoFactors).where(eq(twoFactors.userId, userId));
    await tx.update(users).set({ twoFactorEnabled: false }).where(eq(users.id, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
  });
  await logFor(
    actor,
    "admin.twoFactorReset",
    { entityType: "user", entityId: userId, details: { email: user.email } },
    db,
  );
}

export async function setUserDisabled(
  db: Db,
  userId: string,
  disabled: boolean,
  actor: Actor,
): Promise<void> {
  const user = await findUser(db, userId);
  if (user.isOwner) throw new AdminError("OWNER_PROTECTED");
  if (actor.id === userId) throw new AdminError("SELF_PROTECTED");

  await db.transaction(async (tx) => {
    await tx.update(users).set({ isDisabled: disabled }).where(eq(users.id, userId));
    if (disabled) await tx.delete(sessions).where(eq(sessions.userId, userId));
  });

  await logFor(
    actor,
    disabled ? "admin.userDisabled" : "admin.userEnabled",
    { entityType: "user", entityId: userId, details: { email: user.email } },
    db,
  );
}

/**
 * Deletes a user. A user with history (activity log rows, received boxes, pallets, moves) is
 * deleted only when `force` says so, after the person was warned: the history stays, still under
 * the name the user had when it was written, but no longer linked to a user.
 */
export async function deleteUser(
  db: Db,
  userId: string,
  actor: Actor,
  { force = false }: { force?: boolean } = {},
): Promise<void> {
  const user = await findUser(db, userId);
  if (user.isOwner) throw new AdminError("OWNER_PROTECTED");
  if (actor.id === userId) throw new AdminError("SELF_PROTECTED");

  const history = await db.transaction(async (tx) => {
    const counts = await Promise.all(
      (
        [
          [activityLog, activityLog.userId],
          [boxes, boxes.receivedBy],
          [pallets, pallets.createdBy],
          [priorityMoves, priorityMoves.createdBy],
        ] as const
      ).map(async ([table, column]) => {
        const [{ value }] = await tx
          .select({ value: count() })
          .from(table)
          .where(eq(column, userId));
        return value;
      }),
    );
    const total = counts.reduce((sum, value) => sum + value, 0);
    if (total > 0 && !force) throw new AdminError("HAS_HISTORY");

    // Every row that points at the user is let go (its frozen name stays), then the user goes.
    await tx.update(activityLog).set({ userId: null }).where(eq(activityLog.userId, userId));
    await tx.update(boxes).set({ receivedBy: null }).where(eq(boxes.receivedBy, userId));
    await tx.update(pallets).set({ createdBy: null }).where(eq(pallets.createdBy, userId));
    await tx
      .update(priorityMoves)
      .set({ createdBy: null })
      .where(eq(priorityMoves.createdBy, userId));
    await tx.delete(users).where(eq(users.id, userId));
    return total;
  });

  await logFor(
    actor,
    "admin.userDeleted",
    {
      entityType: "user",
      entityId: userId,
      details: { email: user.email, name: user.displayName, historyRows: history },
    },
    db,
  );
}

export async function revokeUserSessions(db: Db, userId: string): Promise<number> {
  const deleted = await db
    .delete(sessions)
    .where(eq(sessions.userId, userId))
    .returning({ id: sessions.id });
  return deleted.length;
}

async function findUser(db: Db, userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new AdminError("USER_NOT_FOUND");
  return user;
}

/** Deduplicates and rejects keys that are not in the registry. */
export function validatePermissions(keys: string[]): Permission[] {
  const out = new Set<Permission>();
  for (const key of keys) {
    if (!isPermission(key)) throw new AdminError("INVALID_PERMISSION");
    out.add(key);
  }
  return Array.from(out);
}

export interface UpdateProfileInput {
  name: string;
  displayName: string;
  jobTitle: string;
  locale: "he" | "en";
}

/** Name, display name, job title and language. The email is the login and does not change here. */
export async function updateUserProfile(
  db: Db,
  userId: string,
  input: UpdateProfileInput,
  actor: Actor,
): Promise<void> {
  const user = await findUser(db, userId);
  const name = input.name.trim();
  await db
    .update(users)
    .set({
      name,
      displayName: input.displayName.trim() || name,
      jobTitle: input.jobTitle.trim(),
      locale: input.locale,
    })
    .where(eq(users.id, userId));
  await logFor(
    actor,
    "admin.userEdited",
    { entityType: "user", entityId: userId, details: { email: user.email } },
    db,
  );
}

/** Replaces a user's permission set; the administration screen calls this when editing. The owner needs none. */
export async function setUserPermissions(
  db: Db,
  userId: string,
  keys: string[],
  actor: Actor,
): Promise<void> {
  const user = await findUser(db, userId);
  if (user.isOwner) throw new AdminError("OWNER_PROTECTED");
  const permissions = validatePermissions(keys);
  await db.transaction(async (tx) => {
    await tx.delete(userPermissions).where(eq(userPermissions.userId, userId));
    if (permissions.length > 0) {
      await tx
        .insert(userPermissions)
        .values(permissions.map((permission) => ({ userId, permission })));
    }
  });
  await logFor(
    actor,
    "admin.permissionsChanged",
    { entityType: "user", entityId: userId, details: { email: user.email, permissions } },
    db,
  );
}
