import { beforeAll, describe, expect, it } from "vitest";
import { sampleOrder } from "@/lib/labels/shipping";
import { listActivity } from "../auth/admin-queries";
import { createDatabase, type Database } from "../db/connection";
import { seed } from "../db/seed";
import { listLayoutsOfType } from "../labels";
import {
  deleteOrder,
  getOrder,
  getShippingLayout,
  getShippingSettings,
  getShippingToken,
  listOrders,
  makeTestOrder,
  markPrinted,
  receiveOrder,
  regenerateShippingToken,
  saveShippingSettings,
  shippingStats,
  ShippingError,
  tokenMatches,
  toShippingOrder,
} from "./index";

const actor = { id: null, display: "test" };

let database: Database;

beforeAll(async () => {
  database = createDatabase({ url: null, pgliteDataDir: null });
  await database.migrate();
  await seed(database.db, { email: "boss@example.com", password: "Temp-1234", name: "Boss" });
}, 60_000);

const base = sampleOrder(new Date("2026-11-09T10:00:00Z"));

describe("the key in the address", () => {
  it("is made once, long, and recognised only when exact", async () => {
    const db = database.db;
    const token = await getShippingToken(db);
    expect(token.length).toBeGreaterThanOrEqual(30);
    expect(await getShippingToken(db)).toBe(token);
    expect(await tokenMatches(db, token)).toBe(true);
    expect(await tokenMatches(db, token + "x")).toBe(false);
    expect(await tokenMatches(db, token.slice(0, -1))).toBe(false);
    expect(await tokenMatches(db, "")).toBe(false);
  });

  it("can be replaced, and then the old one no longer works", async () => {
    const db = database.db;
    const old = await getShippingToken(db);
    const fresh = await regenerateShippingToken(db, actor);
    expect(fresh).not.toBe(old);
    expect(await tokenMatches(db, old)).toBe(false);
    expect(await tokenMatches(db, fresh)).toBe(true);
    const log = await listActivity(db, { action: "settings.shippingKeyChanged", page: 1 });
    expect(log.rows.length).toBe(1);
  });
});

describe("orders from Priority", () => {
  it("keeps an order, and the same order sent again updates it instead of adding another", async () => {
    const db = database.db;
    const first = await receiveOrder(db, { ...base, orderNumber: "SO100" }, { a: 1 });
    expect(first.updated).toBe(false);
    const again = await receiveOrder(
      db,
      { ...base, orderNumber: "SO100", city: "חיפה", labelCount: 7 },
      { a: 2 },
    );
    expect(again.id).toBe(first.id);
    expect(again.updated).toBe(true);

    const row = await getOrder(db, first.id);
    expect(row?.city).toBe("חיפה");
    expect(row?.labelCount).toBe(7);
    expect(row?.timesReceived).toBe(2);
    expect(row?.raw).toEqual({ a: 2 });
    expect((await listOrders(db, "SO100")).length).toBe(1);
  });

  it("searches by order number, customer, customer number and city", async () => {
    const db = database.db;
    await receiveOrder(
      db,
      {
        ...base,
        orderNumber: "SO200",
        customerName: "Zeta Foods",
        customerNumber: "ZZ9",
        city: "Eilat",
      },
      {},
    );
    expect((await listOrders(db, "so200")).map((o) => o.orderNumber)).toEqual(["SO200"]);
    expect((await listOrders(db, "zeta")).length).toBe(1);
    expect((await listOrders(db, "ZZ9")).length).toBe(1);
    expect((await listOrders(db, "eilat")).length).toBe(1);
    expect((await listOrders(db, "no such thing")).length).toBe(0);
    // The characters of a search pattern are plain text here.
    expect((await listOrders(db, "%")).length).toBe(0);
  });

  it("notes each print and the number of labels, and can delete an order", async () => {
    const db = database.db;
    const { id } = await receiveOrder(db, { ...base, orderNumber: "SO300" }, {});
    expect((await getOrder(db, id))?.timesPrinted).toBe(0);
    await markPrinted(db, id, 10, actor);
    await markPrinted(db, id, 3, actor);
    const printed = await getOrder(db, id);
    expect(printed?.timesPrinted).toBe(2);
    expect(printed?.lastPrintedAt).toBeInstanceOf(Date);
    expect(toShippingOrder(printed!).orderNumber).toBe("SO300");

    const log = await listActivity(db, { action: "shipping.labelsPrinted", page: 1 });
    expect(log.rows.length).toBeGreaterThanOrEqual(2);

    await deleteOrder(db, id, actor);
    expect(await getOrder(db, id)).toBeNull();
    await expect(deleteOrder(db, id, actor)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(markPrinted(db, id, 1, actor)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("counts what Priority sent, not the test order", async () => {
    const db = database.db;
    const before = await shippingStats(db);
    await makeTestOrder(db);
    await makeTestOrder(db);
    const after = await shippingStats(db);
    expect(after.received).toBe(before.received);
    expect((await listOrders(db, "TEST-0001")).length).toBe(1);
    expect(before.received).toBe(2);
    expect(after.lastReceivedAt).toBeInstanceOf(Date);
  });
});

describe("settings and the layout", () => {
  it("starts at one label and the first shipping layout", async () => {
    const db = database.db;
    expect(await getShippingSettings(db)).toEqual({
      defaultCount: 1,
      defaultUnit: "box",
      palletCopies: 4,
      layoutId: "",
    });
    const layouts = await listLayoutsOfType(db, "shipping");
    expect(layouts.length).toBe(1);
    expect((await getShippingLayout(db))?.id).toBe(layouts[0].id);
  });

  it("saves the number and the layout, and refuses what is not valid", async () => {
    const db = database.db;
    const [layout] = await listLayoutsOfType(db, "shipping");
    await saveShippingSettings(
      db,
      { defaultCount: 12, defaultUnit: "pallet", palletCopies: 6, layoutId: layout.id },
      actor,
    );
    expect(await getShippingSettings(db)).toEqual({
      defaultCount: 12,
      defaultUnit: "pallet",
      palletCopies: 6,
      layoutId: layout.id,
    });

    for (const bad of [0, -1, 1.5, 201]) {
      await expect(
        saveShippingSettings(
          db,
          { defaultCount: bad, defaultUnit: "box", palletCopies: 4, layoutId: "" },
          actor,
        ),
      ).rejects.toMatchObject({ code: "INVALID_COUNT" });
    }
    for (const bad of [0, 11, 2.5]) {
      await expect(
        saveShippingSettings(
          db,
          { defaultCount: 2, defaultUnit: "box", palletCopies: bad, layoutId: "" },
          actor,
        ),
      ).rejects.toMatchObject({ code: "INVALID_COPIES" });
    }
    // An item layout is not a shipping layout.
    const { listLayouts } = await import("../labels");
    const item = (await listLayouts(db)).find((l) => l.type === "item")!;
    await expect(
      saveShippingSettings(
        db,
        { defaultCount: 2, defaultUnit: "box", palletCopies: 4, layoutId: item.id },
        actor,
      ),
    ).rejects.toBeInstanceOf(ShippingError);
    await expect(
      saveShippingSettings(
        db,
        { defaultCount: 2, defaultUnit: "box", palletCopies: 4, layoutId: "missing" },
        actor,
      ),
    ).rejects.toMatchObject({ code: "INVALID_LAYOUT" });
    expect((await getShippingSettings(db)).defaultCount).toBe(12);
  });
});
