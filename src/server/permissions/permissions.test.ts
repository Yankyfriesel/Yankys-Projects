import { beforeAll, describe, expect, it } from "vitest";
import { createUser } from "../auth/admin";
import { listUsers } from "../auth/admin-queries";
import { createDatabase, type Database } from "../db/connection";
import { userPermissions } from "../db/schema";
import { seed } from "../db/seed";
import { can, canAccessScreen, isDeviceAllowed, screenLevel, visibleScreens } from "./evaluate";
import { loadPermissionSet } from "./load";
import {
  ALL_PERMISSIONS,
  DEVICE_PERMISSIONS,
  isPermission,
  SCREEN_KEYS,
  SCREENS,
  screenForPath,
  screenOf,
  screenPermissions,
} from "./registry";

describe("registry", () => {
  it("has eight screens in menu order, each with a view action first", () => {
    expect(SCREEN_KEYS).toEqual([
      "dashboard",
      "catalog",
      "receiving",
      "vendor",
      "shipping",
      "inventory",
      "settings",
      "admin",
    ]);
    for (const key of SCREEN_KEYS) expect(SCREENS[key].actions[0]).toBe("view");
  });

  it("has unique keys covering every action in the plan plus the two devices", () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
    expect(ALL_PERMISSIONS).toContain("catalog.changeCopies");
    expect(ALL_PERMISSIONS).toContain("settings.vendorOrder.edit");
    expect(ALL_PERMISSIONS).toContain("settings.hardware.scale");
    expect(ALL_PERMISSIONS).toContain("admin.activityLog");
    expect(ALL_PERMISSIONS).toContain("admin.messages");
    expect(DEVICE_PERMISSIONS).toEqual(["device.desktop", "device.phone"]);
    // The label type is chosen from the item layouts at every print, so it has no permission.
    expect(ALL_PERMISSIONS).not.toContain("catalog.changeLayout");
    // Moving boxes between warehouses is done only in Priority, so it has no permission either.
    expect(ALL_PERMISSIONS).not.toContain("inventory.move");
    expect(ALL_PERMISSIONS.length).toBe(3 + 5 + 6 + 4 + 3 + 5 + 12 + 11 + 2);
  });

  it("recognises keys, screens and paths", () => {
    expect(isPermission("inventory.pallets")).toBe(true);
    expect(isPermission("inventory.fly")).toBe(false);
    expect(screenOf("settings.labels.edit")).toBe("settings");
    expect(screenOf("device.phone")).toBe(null);
    expect(screenForPath("/vendor-receiving/scan")).toBe("vendor");
    expect(screenForPath("/nowhere")).toBe(null);
    expect(screenPermissions("vendor")).toEqual([
      "vendor.view",
      "vendor.scan",
      "vendor.reprint",
      "vendor.todayList",
    ]);
  });
});

describe("evaluation", () => {
  const worker = {
    isOwner: false,
    deviceType: "desktop" as const,
    permissions: new Set(["device.desktop", "receiving.view", "receiving.scan", "catalog.view"]),
  };

  it("the owner passes everything on any device", () => {
    const owner = { isOwner: true, deviceType: "phone" as const, permissions: new Set<string>() };
    expect(isDeviceAllowed(owner)).toBe(true);
    expect(can(owner, "admin.activityLog")).toBe(true);
    expect(visibleScreens(owner)).toEqual(SCREEN_KEYS);
  });

  it("a worker sees only screens with at least one key", () => {
    expect(visibleScreens(worker)).toEqual(["catalog", "receiving"]);
    expect(canAccessScreen(worker, "inventory")).toBe(false);
    expect(can(worker, "receiving.scan")).toBe(true);
    expect(can(worker, "receiving.manual")).toBe(false);
  });

  it("the wrong device type blocks everything", () => {
    const onPhone = { ...worker, deviceType: "phone" as const };
    expect(isDeviceAllowed(onPhone)).toBe(false);
    expect(can(onPhone, "receiving.scan")).toBe(false);
    expect(visibleScreens(onPhone)).toEqual([]);
  });

  it("summarises a screen as none, view or edit", () => {
    expect(screenLevel(worker.permissions, "inventory")).toBe("none");
    expect(screenLevel(worker.permissions, "catalog")).toBe("view");
    expect(screenLevel(worker.permissions, "receiving")).toBe("edit");
  });
});

describe("permissions in the database", () => {
  let database: Database;

  beforeAll(async () => {
    database = createDatabase({ url: null, pgliteDataDir: null });
    await database.migrate();
    await seed(database.db, { email: "boss@example.com", password: "Temp-1234", name: "Boss" });
  }, 60_000);

  // No explicit close: see db.test.ts.

  it("stores the keys given at creation, deduplicated, and rejects unknown ones", async () => {
    const { id } = await createUser(
      database.db,
      {
        email: "packer@example.com",
        name: "Packer",
        displayName: "Packer",
        permissions: ["device.desktop", "catalog.view", "catalog.print", "catalog.print"],
      },
      { id: null, display: "test" },
    );
    const set = await loadPermissionSet(database.db, id);
    expect([...set].sort()).toEqual(["catalog.print", "catalog.view", "device.desktop"]);

    await expect(
      createUser(
        database.db,
        { email: "x@example.com", name: "X", displayName: "X", permissions: ["catalog.fly"] },
        { id: null, display: "test" },
      ),
    ).rejects.toMatchObject({ code: "INVALID_PERMISSION" });
  });

  it("ignores a key that belongs to a removed feature", async () => {
    const { id } = await createUser(
      database.db,
      { email: "old@example.com", name: "Old", displayName: "Old", permissions: ["catalog.view"] },
      { id: null, display: "test" },
    );
    await database.db.insert(userPermissions).values({ userId: id, permission: "inventory.move" });
    expect([...(await loadPermissionSet(database.db, id))]).toEqual(["catalog.view"]);
    const row = (await listUsers(database.db)).find((user) => user.id === id);
    expect(row?.permissions).toEqual(["catalog.view"]);
  });
});
