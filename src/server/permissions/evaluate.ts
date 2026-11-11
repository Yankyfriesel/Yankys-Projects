import type { DeviceType } from "../db/schema";
import {
  SCREEN_KEYS,
  screenPermissions,
  viewPermission,
  type Permission,
  type ScreenKey,
} from "./registry";

/**
 * Pure permission logic, shared by server checks, the menu and the editor.
 * The owner passes every check. Everyone else needs the key itself and the
 * device permission matching the session's device type.
 */
export interface AccessInput {
  isOwner: boolean;
  deviceType: DeviceType;
  permissions: ReadonlySet<string>;
}

export function isDeviceAllowed(a: AccessInput): boolean {
  return a.isOwner || a.permissions.has(`device.${a.deviceType}`);
}

export function can(a: AccessInput, permission: Permission): boolean {
  return a.isOwner || (isDeviceAllowed(a) && a.permissions.has(permission));
}

/** Any key of the screen opens it (a screen with no keys is hidden entirely). */
export function canAccessScreen(a: AccessInput, screen: ScreenKey): boolean {
  if (a.isOwner) return true;
  if (!isDeviceAllowed(a)) return false;
  return screenPermissions(screen).some((p) => a.permissions.has(p));
}

/** Screens for the menu, in menu order. */
export function visibleScreens(a: AccessInput): ScreenKey[] {
  return SCREEN_KEYS.filter((screen) => canAccessScreen(a, screen));
}

export type ScreenLevel = "none" | "view" | "edit";

/**
 * The three-way summary the permission editor shows per screen:
 * none = no keys, view = only the view key, edit = any action beyond viewing.
 */
export function screenLevel(permissions: ReadonlySet<string>, screen: ScreenKey): ScreenLevel {
  const keys = screenPermissions(screen).filter((p) => permissions.has(p));
  if (keys.length === 0) return "none";
  if (keys.length === 1 && keys[0] === viewPermission(screen)) return "view";
  return "edit";
}
