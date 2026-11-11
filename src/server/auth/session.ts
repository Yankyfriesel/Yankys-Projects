import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Actor } from "../activity-log";
import type { DeviceType } from "../db/schema";
import { auth, type AuthSession } from "./index";
import { clientIp } from "./device";

/** The current session, read once per request. Null when not logged in. */
export const getSession = cache(async (): Promise<AuthSession | null> => {
  return auth.api.getSession({ headers: await headers() });
});

export interface CurrentUser {
  user: AuthSession["user"];
  session: AuthSession["session"];
  deviceType: DeviceType;
  /** For logActivity / logFor. */
  actor: Actor;
}

function toCurrentUser(s: AuthSession, ip: string | null): CurrentUser {
  const deviceType = (s.session.deviceType as DeviceType | undefined) ?? "desktop";
  return {
    user: s.user,
    session: s.session,
    deviceType,
    actor: { id: s.user.id, display: s.user.displayName, deviceType, ip },
  };
}

/** Logged-in user, or redirect to /login. Disabled users are sent back to login. */
export async function requireUser(): Promise<CurrentUser> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.user.isDisabled) redirect("/login?error=disabled");
  return toCurrentUser(s, clientIp(await headers()));
}

/** Like requireUser, but a pending temporary password sends the user to /change-password first. */
export async function requireActiveUser(): Promise<CurrentUser> {
  const current = await requireUser();
  if (current.user.mustChangePassword) redirect("/change-password");
  return current;
}

export async function getOptionalUser(): Promise<CurrentUser | null> {
  const s = await getSession();
  if (!s || s.user.isDisabled) return null;
  return toCurrentUser(s, clientIp(await headers()));
}
