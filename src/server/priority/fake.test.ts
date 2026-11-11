import { beforeAll, describe, expect, it } from "vitest";
import { listActivity } from "../auth/admin-queries";
import { createDatabase, type Database } from "../db/connection";
import { fakePriorityItems, fakePriorityOrders, fakePriorityWarehouses } from "../db/schema";
import { seed } from "../db/seed";
import { writeSetting } from "../settings";
import { getStandInBehaviour, setStandInMode } from "./behaviour";
import { FakePriorityClient } from "./fake";
import { summarize } from "./summary";
import { PriorityError, type ReceiveBoxInput } from "./types";

const actor = { id: null, display: "test" };

let database: Database;
let client: FakePriorityClient;
let valid: ReceiveBoxInput;

beforeAll(async () => {
  database = createDatabase({ url: null, pgliteDataDir: null });
  await database.migrate();
  await seed(database.db, { email: "boss@example.com", password: "Temp-1234", name: "Boss" });
  client = new FakePriorityClient(database.db);

  const [order] = await database.db.select().from(fakePriorityOrders).limit(1);
  const [item] = await database.db.select().from(fakePriorityItems).limit(1);
  valid = {
    source: "production",
    docno: order.docno,
    barcode: "TEST-BOX-0001",
    itemNumber: item.partname,
    weightKg: 12.34,
    expiryDate: "2030-01-31",
    warehouseCode: "Main",
  };
}, 60_000);

async function errorCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(PriorityError);
    return (error as PriorityError).code;
  }
  throw new Error("expected a PriorityError");
}

describe("receiving a box", () => {
  it("adds it to stock in the chosen warehouse", async () => {
    const before = (await client.getStockBoxes()).length;
    await client.receiveBox(valid);
    const boxes = await client.getStockBoxes();
    expect(boxes).toHaveLength(before + 1);
    const created = boxes.find((b) => b.barcode === valid.barcode)!;
    expect(created).toMatchObject({
      itemNumber: valid.itemNumber,
      warehouseCode: "Main",
      weightKg: 12.34,
      expiryDate: "2030-01-31",
    });
  });

  it("refuses the same box twice", async () => {
    expect(await errorCode(client.receiveBox(valid))).toBe("DUPLICATE_BOX");
  });

  it("refuses an unknown order, item or warehouse and stores nothing", async () => {
    const before = (await client.getStockBoxes()).length;
    expect(await errorCode(client.receiveBox({ ...valid, barcode: "X1", docno: "NOPE" }))).toBe(
      "UNKNOWN_ORDER",
    );
    expect(
      await errorCode(client.receiveBox({ ...valid, barcode: "X2", itemNumber: "NOPE" })),
    ).toBe("UNKNOWN_ITEM");
    expect(
      await errorCode(client.receiveBox({ ...valid, barcode: "X3", warehouseCode: "NOPE" })),
    ).toBe("UNKNOWN_WAREHOUSE");
    expect(await client.getStockBoxes()).toHaveLength(before);
  });
});

describe("stand-in behaviour", () => {
  it("starts normal and reads whatever was stored", async () => {
    expect(await getStandInBehaviour(database.db)).toEqual({ mode: "normal", delayMs: 5000 });
  });

  it("slow mode waits before answering", async () => {
    await writeSetting(database.db, "fakePriority.behaviour", { mode: "slow", delayMs: 120 }, null);
    const started = performance.now();
    await client.getWarehouses();
    expect(performance.now() - started).toBeGreaterThanOrEqual(100);
  });

  it("down mode makes every call fail as unavailable, and normal restores them", async () => {
    await setStandInMode(database.db, "down", actor);
    expect(await errorCode(client.getWarehouses())).toBe("UNAVAILABLE");
    expect(await errorCode(client.getStockBoxes())).toBe("UNAVAILABLE");
    expect(await errorCode(client.getItems())).toBe("UNAVAILABLE");
    expect(await errorCode(client.receiveBox({ ...valid, barcode: "D1" }))).toBe("UNAVAILABLE");

    await setStandInMode(database.db, "normal", actor);
    expect((await client.getWarehouses()).length).toBeGreaterThan(0);
  });

  it("logs each change with the old and new mode, and keeps the delay", async () => {
    const log = await listActivity(database.db, { action: "settings.standInChanged", page: 1 });
    expect(log.rows.map((r) => r.details)).toEqual([
      { from: "down", to: "normal" },
      { from: "slow", to: "down" },
    ]);
    expect((await getStandInBehaviour(database.db)).delayMs).toBe(120);
  });
});

describe("reading the catalog", () => {
  it("returns every seeded item with its Priority fields, ordered by item number", async () => {
    const items = await client.getItems();
    expect(items.length).toBeGreaterThan(0);
    expect(items.map((i) => i.itemNumber)).toEqual([...items.map((i) => i.itemNumber)].sort());

    const burger = items.find((i) => i.itemNumber === "N2015D-S");
    expect(burger).toMatchObject({
      nameEn: "Classic beef burger 150 g",
      barcode: "2000000002015",
      category: "קציצות",
      shelfLifeDays: 12,
      inventoryManaged: true,
    });
    expect(burger?.weightKg).toBe(12);
  });
});

describe("a warehouse added to the stand-in", () => {
  it("gets its own dashboard summary, empty until it holds boxes", async () => {
    const today = "2026-10-26";
    const before = summarize(await client.getWarehouses(), await client.getStockBoxes(), today);

    await database.db
      .insert(fakePriorityWarehouses)
      .values({ warhsname: "Annex", warhsdes: "Annex test warehouse" });

    const after = summarize(await client.getWarehouses(), await client.getStockBoxes(), today);
    expect(after).toHaveLength(before.length + 1);
    expect(after.find((w) => w.code === "Annex")?.boxes).toBe(0);
    // The others are unchanged.
    for (const warehouse of before) {
      expect(after.find((w) => w.code === warehouse.code)).toEqual(warehouse);
    }
  });
});
