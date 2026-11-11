import { count, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { itemNumberDigits, parseBoxBarcode } from "../../lib/barcodes";
import { verifyPassword } from "../auth/password";
import { createDatabase, type Database } from "./connection";
import {
  accounts,
  fakePriorityInventory,
  fakePriorityItems,
  fakePriorityOrders,
  fakePriorityWarehouses,
  settings,
  users,
} from "./schema";
import { seed } from "./seed";

const owner = { email: "Boss@Example.com", password: "Temp-1234", name: "Boss" };
const now = new Date("2026-10-22T10:00:00Z");

let database: Database;

beforeAll(async () => {
  database = createDatabase({ url: null, pgliteDataDir: null });
  await database.migrate();
}, 60_000);

// No explicit close: the in-memory PGlite ends with the test process, and
// closing it right after a burst of writes can abort inside the WASM runtime
// (a dangling rejection that Vitest reports as an unhandled error).

describe("migrations and seed on an in-memory PGlite", () => {
  it("creates the owner with a hashed password that must be changed", async () => {
    const report = await seed(database.db, owner, now);
    expect(report.ownerCreated).toBe(true);

    const [u] = await database.db.select().from(users);
    expect(u.email).toBe("boss@example.com");
    expect(u.isOwner).toBe(true);
    expect(u.mustChangePassword).toBe(true);
    expect(u.locale).toBe("he");

    const [a] = await database.db.select().from(accounts).where(eq(accounts.userId, u.id));
    expect(a.providerId).toBe("credential");
    expect(a.password).not.toContain("Temp-1234");
    expect(await verifyPassword(a.password!, "Temp-1234")).toBe(true);
  });

  it("seeds the stand-in with warehouses, items, orders and boxes", async () => {
    const [{ value: warehouses }] = await database.db
      .select({ value: count() })
      .from(fakePriorityWarehouses);
    const [{ value: items }] = await database.db.select({ value: count() }).from(fakePriorityItems);
    const [{ value: orders }] = await database.db
      .select({ value: count() })
      .from(fakePriorityOrders);
    const boxes = await database.db.select().from(fakePriorityInventory);

    expect(warehouses).toBe(2);
    expect(items).toBe(14);
    expect(orders).toBeGreaterThan(1);
    expect(boxes.length).toBeGreaterThan(14 * 3 - 1);

    // Every box barcode parses and agrees with its row.
    for (const box of boxes) {
      const parsed = parseBoxBarcode(box.actname);
      expect(parsed, box.actname).not.toBeNull();
      expect(parsed!.itemDigits).toBe(itemNumberDigits(box.partname));
      expect(parsed!.weightKg).toBe(box.tbalance);
      expect(parsed!.expiryDate.toISOString().slice(0, 10)).toBe(box.expirydate);
    }

    // Some boxes are expired and some are not, so the dashboard has something to show.
    const expired = boxes.filter((b) => b.expirydate < "2026-10-22").length;
    expect(expired).toBeGreaterThan(0);
    expect(expired).toBeLessThan(boxes.length);
  });

  it("stores default settings and is idempotent", async () => {
    const [{ value: before }] = await database.db.select({ value: count() }).from(settings);
    expect(before).toBeGreaterThanOrEqual(2);

    const again = await seed(database.db, owner, now);
    expect(again).toEqual({
      ownerCreated: false,
      settingsAdded: 0,
      standInSeeded: false,
      boxes: 0,
    });

    const [{ value: userCount }] = await database.db.select({ value: count() }).from(users);
    expect(userCount).toBe(1);
  });
});
