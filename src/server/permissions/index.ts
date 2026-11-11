import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { requireActiveUser, type CurrentUser } from "../auth/session";
import { db } from "../db";
import {
  can as canPure,
  canAccessScreen as canAccessScreenPure,
  isDeviceAllowed,
  visibleScreens as visibleScreensPure,
  type AccessInput,
} from "./evaluate";
import { loadPermissionSet } from "./load";
import { ALL_PERMISSIONS, type Permission, type ScreenKey } from "./registry";

export type { Permission, ScreenKey } from "./registry";
export { loadPermissionSet } from "./load";

/** The logged-in user together with everything needed to decide what they may do. */
export interface Access extends CurrentUser {
  isOwner: boolean;
  permissions: ReadonlySet<Permission>;
  deviceAllowed: boolean;
  can(permission: Permission): boolean;
  canAccessScreen(screen: ScreenKey): boolean;
  visibleScreens(): ScreenKey[];
}

export class PermissionError extends Error {
  constructor(public readonly permission: Permission) {
    super(`Missing permission: ${permission}`);
    this.name = "PermissionError";
  }
}

export function buildAccess(current: CurrentUser, permissions: ReadonlySet<Permission>): Access {
  const input: AccessInput = {
    isOwner: Boolean(current.user.isOwner),
    deviceType: current.deviceType,
    permissions,
  };
  return {
    ...current,
    isOwner: input.isOwner,
    permissions,
    deviceAllowed: isDeviceAllowed(input),
    can: (permission) => canPure(input, permission),
    canAccessScreen: (screen) => canAccessScreenPure(input, screen),
    visibleScreens: () => visibleScreensPure(input),
  };
}

/** Access for the current request: logged in, enabled, password already changed. Read once per request. */
export const getAccess = cache(async (): Promise<Access> => {
  const current = await requireActiveUser();
  const permissions = current.user.isOwner
    ? new Set<Permission>(ALL_PERMISSIONS)
    : await loadPermissionSet(db, current.user.id);
  return buildAccess(current, permissions);
});

/** For pages: the screen is "not found" for users without any of its keys or not allowed on this device. */
export async function requireScreen(screen: ScreenKey): Promise<Access> {
  const access = await getAccess();
  if (!access.canAccessScreen(screen)) notFound();
  return access;
}

/** For pages: "not found" without the permission (the plan: hidden sections never show). */
export async function requirePermission(permission: Permission): Promise<Access> {
  const access = await getAccess();
  if (!access.can(permission)) notFound();
  return access;
}

/** For server actions and route handlers: throws instead of rendering not-found. */
export async function assertPermission(permission: Permission): Promise<Access> {
  const access = await getAccess();
  if (!access.can(permission)) throw new PermissionError(permission);
  return access;
}
