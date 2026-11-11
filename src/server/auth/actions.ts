"use server";

import { and, eq, ne } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "../db";
import { logFor } from "../activity-log";
import { accounts, sessions, users } from "../db/schema";
import { auth } from "./index";
import {
  checkPasswordStrength,
  hashPassword,
  PASSWORD_MIN_LENGTH,
  verifyPassword,
} from "./password";
import { requireUser } from "./session";

export type ChangePasswordError =
  "tooShort" | "weak" | "mismatch" | "sameAsCurrent" | "wrongCurrent" | "rateLimited" | "generic";

export interface ChangePasswordState {
  error: ChangePasswordError | null;
}

const schema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(PASSWORD_MIN_LENGTH).max(128),
  confirmPassword: z.string(),
});

/**
 * Password change. A person who just signed in with a temporary password (first login or after a
 * reset) is not asked for it again: they proved it a moment ago, and the session they hold exists
 * only because of it. Anyone else gives their current password, and Better Auth's change-password
 * rotates the session and revokes the others; its after-hook in create-auth.ts logs the event.
 */
export async function changePasswordAction(
  _previous: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const current = await requireUser();

  const parsed = schema.safeParse({
    currentPassword: formData.get("currentPassword") ?? "",
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { error: "tooShort" };

  const { currentPassword, newPassword, confirmPassword } = parsed.data;
  const forced = Boolean(current.user.mustChangePassword);
  if (!forced && !currentPassword) return { error: "wrongCurrent" };
  if (newPassword !== confirmPassword) return { error: "mismatch" };
  const weakness = checkPasswordStrength(newPassword);
  if (weakness) return { error: weakness };
  if (newPassword.toLowerCase().includes(current.user.email.split("@")[0].toLowerCase())) {
    return { error: "weak" };
  }
  if (!forced && newPassword === currentPassword) return { error: "sameAsCurrent" };

  if (forced) {
    const [credential] = await db
      .select({ id: accounts.id, password: accounts.password })
      .from(accounts)
      .where(and(eq(accounts.userId, current.user.id), eq(accounts.providerId, "credential")))
      .limit(1);
    if (!credential?.password) return { error: "generic" };
    if (await verifyPassword(credential.password, newPassword)) return { error: "sameAsCurrent" };

    const hash = await hashPassword(newPassword);
    await db.transaction(async (tx) => {
      await tx.update(accounts).set({ password: hash }).where(eq(accounts.id, credential.id));
      await tx
        .update(users)
        .set({ mustChangePassword: false })
        .where(eq(users.id, current.user.id));
      await tx
        .delete(sessions)
        .where(and(eq(sessions.userId, current.user.id), ne(sessions.id, current.session.id)));
    });
    await logFor(current.actor, "auth.passwordChanged", {}, db);
    redirect("/");
  }

  try {
    await auth.api.changePassword({
      body: { currentPassword, newPassword, revokeOtherSessions: true },
      headers: await headers(),
    });
  } catch (error) {
    if (error instanceof APIError) {
      if (error.status === 429 || error.statusCode === 429) return { error: "rateLimited" };
      const code = error.body?.code;
      if (code === "INVALID_PASSWORD" || code === "CREDENTIAL_ACCOUNT_NOT_FOUND") {
        return { error: "wrongCurrent" };
      }
      if (code === "PASSWORD_TOO_SHORT" || code === "PASSWORD_TOO_LONG")
        return { error: "tooShort" };
    }
    return { error: "generic" };
  }

  // The after-hook clears the flag too; doing it here as well keeps the redirect safe.
  await db.update(users).set({ mustChangePassword: false }).where(eq(users.id, current.user.id));
  redirect("/");
}
