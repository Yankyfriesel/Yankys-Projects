import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../db/connection";
import { fakePriorityInventory, pallets } from "../db/schema";
import { seed } from "../db/seed";
import { setStandInMode } from "../priority/behaviour";
import { FakePriorityClient } from "../priority/fake";
import { PalletError, createPallet, getPalletLabelData, listPallets, viewPallet } from "./index";

const actor = { id: null, display: "Pia Pallet" };

let database: Database;
let priority: FakePriorityClient;
let barcodes: string[];

beforeAll(async () => {
  database = createDatabase({ url: null, pgliteDataDir: null });
  await database.migrate();
  await seed(database.db, { email: "boss@example.com", password: "Temp-1234", name: "Boss" });
  priority = new FakePriorityClient(database.db);
  barcodes = (await priority.getStockBoxes()).map((box) => box.barcode);
}, 60_000);

async function code(promise: Promise<unknown>): Promise<PalletError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(PalletError);
    return error as PalletError;
  }
  throw new Error("expected a PalletError");
}

describe("pallets", () => {
  it("are numbered one after another, keep the boxes in the order given, and change no stock", async () => {
    const before = (await priority.getStockBoxes()).length;
    const first = await createPallet(
      database.db,
      priority,
      [barcodes[3], barcodes[1], barcodes[2]],
      actor,
    );
    const second = await createPallet(database.db, priority, [barcodes[4]], actor);
    expect(first).toEqual({ number: 1, boxes: 3 });
    expect(second.number).toBe(2);
    expect((await priority.getStockBoxes()).length).toBe(before);

    const view = await viewPallet(database.db, priority, 1);
    expect(view.boxes.map((b) => b.barcode)).toEqual([barcodes[3], barcodes[1], barcodes[2]]);
    expect(view.createdBy).toBe("Pia Pallet");
    expect(view.boxes.every((b) => b.inStock && b.warehouseCode && b.expiryDate)).toBe(true);
  });

  it("count a barcode once, and refuse nothing, too many, or a box Priority does not have", async () => {
    const pallet = await createPallet(
      database.db,
      priority,
      [barcodes[5], ` ${barcodes[5]} `],
      actor,
    );
    expect(pallet.boxes).toBe(1);

    expect((await code(createPallet(database.db, priority, [" "], actor))).code).toBe(
      "NOTHING_SELECTED",
    );
    const many = Array.from({ length: 501 }, (_, i) => `B${i}`);
    expect((await code(createPallet(database.db, priority, many, actor))).code).toBe("TOO_MANY");

    const missing = await code(
      createPallet(database.db, priority, [barcodes[6], "NOPE-1", "NOPE-2"], actor),
    );
    expect(missing.code).toBe("NOT_IN_STOCK");
    expect(missing.barcodes).toEqual(["NOPE-1", "NOPE-2"]);
    // Nothing was made by the refused tries.
    expect((await listPallets(database.db)).length).toBe(3);
  });

  it("show where each box is now, and mark a box that is no longer in stock", async () => {
    const [moved, gone] = [barcodes[7], barcodes[8]];
    const made = await createPallet(database.db, priority, [moved, gone], actor);
    const target =
      (await priority.getStockBoxes()).find((b) => b.barcode === moved)!.warehouseCode === "Main"
        ? "200"
        : "Main";
    await database.db
      .update(fakePriorityInventory)
      .set({ warhsname: target })
      .where(eq(fakePriorityInventory.actname, moved));
    await database.db.delete(fakePriorityInventory).where(eq(fakePriorityInventory.actname, gone));

    const view = await viewPallet(database.db, priority, made.number);
    expect(view.boxes[0]).toMatchObject({ barcode: moved, inStock: true, warehouseCode: target });
    expect(view.boxes[1]).toMatchObject({
      barcode: gone,
      inStock: false,
      warehouseCode: null,
      expiryDate: null,
    });
  });

  it("cannot be looked at when there is no such pallet, or Priority is not answering", async () => {
    expect((await code(viewPallet(database.db, priority, 999))).code).toBe("NOT_FOUND");
    await setStandInMode(database.db, "down", actor);
    expect((await code(viewPallet(database.db, priority, 1))).code).toBe("PRIORITY_UNAVAILABLE");
    expect((await code(createPallet(database.db, priority, [barcodes[9]], actor))).code).toBe(
      "PRIORITY_UNAVAILABLE",
    );
    await setStandInMode(database.db, "normal", actor);
  });

  it("give the label what was on the pallet, and are listed newest first with their totals", async () => {
    const label = await getPalletLabelData(database.db, 1);
    expect(label?.number).toBe(1);
    expect(label?.boxes).toHaveLength(3);
    expect(label?.createdDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(await getPalletLabelData(database.db, 999)).toBeNull();

    const list = await listPallets(database.db);
    expect(list.map((p) => p.number)).toEqual([...list.map((p) => p.number)].sort((a, b) => b - a));
    expect(list.find((p) => p.number === 1)).toMatchObject({ boxes: 3, createdBy: "Pia Pallet" });
    expect(list.find((p) => p.number === 1)!.kg).toBeGreaterThan(0);
    expect((await database.db.select().from(pallets)).length).toBe(list.length);
  });
});
