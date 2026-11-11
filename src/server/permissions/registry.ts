/**
 * The permission registry: every screen, every action that can be allowed one
 * by one, and the two device permissions. This mirrors the table in PLAN.md
 * ("Permissions") and is the single source of truth for the permission editor,
 * the menu and every server-side check.
 *
 * Keys are "<screen>.<action>" (for example "catalog.print") and
 * "device.desktop" / "device.phone". Every screen has a "view" action; any key
 * of a screen grants access to that screen, and a screen with no keys at all
 * disappears from the user's menu.
 */

interface ScreenDefinition {
  /** Route inside the app. */
  path: string;
  /** Order in the side menu. */
  order: number;
  /** Section of the side menu the screen sits in. */
  group: "operations" | "system";
  /** When the real screen arrives: a build phase from PLAN.md, or a phase 1 step. */
  builtIn: { phase: number } | { step: number };
  /** Actions that can be allowed one by one; "view" is always first. */
  actions: readonly string[];
}

export const SCREENS = {
  dashboard: {
    path: "/dashboard",
    order: 1,
    group: "operations",
    builtIn: { phase: 5 },
    actions: ["view", "refresh", "reorder"],
  },
  catalog: {
    path: "/catalog",
    order: 2,
    group: "operations",
    builtIn: { phase: 2 },
    actions: ["view", "details", "print", "changeCopies", "packaging"],
  },
  receiving: {
    path: "/receiving",
    order: 3,
    group: "operations",
    builtIn: { phase: 4 },
    actions: ["view", "scan", "manual", "reprint", "autoPrint", "todayList"],
  },
  vendor: {
    path: "/vendor-receiving",
    order: 4,
    group: "operations",
    builtIn: { phase: 4 },
    actions: ["view", "scan", "reprint", "todayList"],
  },
  shipping: {
    path: "/shipping-labels",
    order: 5,
    group: "operations",
    builtIn: { phase: 4 },
    actions: ["view", "print", "delete"],
  },
  inventory: {
    path: "/inventory",
    order: 6,
    group: "operations",
    builtIn: { phase: 5 },
    actions: ["view", "filters", "export", "pallets", "palletsScan"],
  },
  settings: {
    path: "/settings",
    order: 7,
    group: "system",
    builtIn: { step: 9 },
    actions: [
      "view",
      "labels.view",
      "labels.edit",
      "hardware.view",
      "hardware.edit",
      "hardware.scale",
      "categories.view",
      "categories.edit",
      "vendorOrder.view",
      "vendorOrder.edit",
      "priority.view",
      "priority.edit",
    ],
  },
  admin: {
    path: "/admin",
    order: 8,
    group: "system",
    builtIn: { step: 8 },
    actions: [
      "view",
      "users.create",
      "users.edit",
      "users.disable",
      "users.delete",
      "permissions",
      "resetPassword",
      "activityLog",
      "sends",
      "security",
      "messages",
    ],
  },
} as const satisfies Record<string, ScreenDefinition>;

export type ScreenKey = keyof typeof SCREENS;

export type ScreenPermission = {
  [S in ScreenKey]: `${S}.${(typeof SCREENS)[S]["actions"][number]}`;
}[ScreenKey];

export const DEVICE_PERMISSIONS = ["device.desktop", "device.phone"] as const;
export type DevicePermission = (typeof DEVICE_PERMISSIONS)[number];

export type Permission = ScreenPermission | DevicePermission;

export const SCREEN_KEYS = (Object.keys(SCREENS) as ScreenKey[]).sort(
  (a, b) => SCREENS[a].order - SCREENS[b].order,
);

export function screenPermissions(screen: ScreenKey): Permission[] {
  return SCREENS[screen].actions.map((action) => `${screen}.${action}` as Permission);
}

export function viewPermission(screen: ScreenKey): Permission {
  return `${screen}.view` as Permission;
}

export const ALL_PERMISSIONS: readonly Permission[] = [
  ...SCREEN_KEYS.flatMap(screenPermissions),
  ...DEVICE_PERMISSIONS,
];

const PERMISSION_SET: ReadonlySet<string> = new Set(ALL_PERMISSIONS);

export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && PERMISSION_SET.has(value);
}

export function isScreenKey(value: unknown): value is ScreenKey {
  return typeof value === "string" && value in SCREENS;
}

/** "catalog.print" -> "catalog"; device permissions have no screen. */
export function screenOf(permission: Permission): ScreenKey | null {
  const screen = permission.slice(0, permission.indexOf("."));
  return isScreenKey(screen) ? screen : null;
}

/** The screen whose route is the start of `pathname`, if any. */
export function screenForPath(pathname: string): ScreenKey | null {
  for (const key of SCREEN_KEYS) {
    const path = SCREENS[key].path;
    if (pathname === path || pathname.startsWith(`${path}/`)) return key;
  }
  return null;
}
