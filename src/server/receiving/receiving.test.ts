import { beforeAll, describe, expect, it } from "vitest";
import { buildBoxBarcode, fromDDMMYY, localDate, parseBoxBarcode } from "@/lib/barcodes";
import { createDatabase, type Database } from "../db/connection";
import {
  boxes,
  fakePriorityInventory,
  fakePriorityReceivedLines,
  prioritySends,
} from "../db/schema";
import { seed } from "../db/seed";
import { addPackagingType, setItemPackaging } from "../packaging";
import { setStandInMode } from "../priority/behaviour";
import { FakePriorityClient } from "../priority/fake";
import { PriorityError } from "../priority/types";
import {
  MAX_SEND_ATTEMPTS,
  listUnsent,
  sendBox,
  getCategoryWarehouses,
  getVendorOrder,
  setCategoryWarehouse,
  setVendorOrder,
  listTodayBoxes,
  ReceivingError,
  receiveInHouseBox,
  receiveVendorBox,
  retryDelayMs,
  retryFailed,
  sendDue,
} from "./index";
import { eq } from "drizzle-orm";

const actor = { id: null, display: "Wanda Weigher" };

let database: Database;
let priority: FakePriorityClient;

beforeAll(async () => {
  database = createDatabase({ url: null, pgliteDataDir: null });
  await database.migrate();
  await seed(database.db, { email: "boss@example.com", password: "Temp-1234", name: "Boss" });
  priority = new FakePriorityClient(database.db);
}, 60_000);

const input = {
  itemNumber: "N2015D-S", // has an open production order in the seed
  certificateNo: "CERT-1",
  slaughterDate: localDate(2026, 10, 18),
  productionDate: localDate(2026, 10, 19),
  expiryDate: localDate(2026, 10, 30),
  weightKg: 14.02,
};

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ReceivingError);
    return (error as ReceivingError).code;
  }
  throw new Error("expected a ReceivingError");
}

/** A vendor barcode for the given item barcode tail, with a vendor running number. */
function vendorCode(tail: string, running: string) {
  return `38${tail}100726090728${running}1998`;
}

describe("in-house boxes", () => {
  it("saves the box, gives running numbers 1, 2, 3 and sends it to Priority", async () => {
    const a = await receiveInHouseBox(database.db, priority, input, actor);
    const b = await receiveInHouseBox(database.db, priority, input, actor);
    expect([a.running, b.running]).toEqual(["0001", "0002"]);
    expect(a.sent).toBe("sent");
    expect(a.barcode).toBe(
      buildBoxBarcode({
        running: 1,
        itemDigits: "2015",
        slaughterDate: input.slaughterDate,
        expiryDate: input.expiryDate,
        weightKg: 14.02,
      }),
    );
    expect(parseBoxBarcode(a.barcode)?.weightKg).toBe(14.02);
    expect(a.docno).toBe("PO26000310");
    const stock = await priority.getStockBoxes();
    expect(stock.some((s) => s.barcode === a.barcode && s.warehouseCode === "Main")).toBe(true);
  });

  it("refuses weights outside 0.01 to 99.99 kg and impossible dates", async () => {
    expect(
      await code(receiveInHouseBox(database.db, priority, { ...input, weightKg: 0 }, actor)),
    ).toBe("INVALID_WEIGHT");
    expect(
      await code(receiveInHouseBox(database.db, priority, { ...input, weightKg: 100 }, actor)),
    ).toBe("INVALID_WEIGHT");
    expect(
      await code(
        receiveInHouseBox(
          database.db,
          priority,
          { ...input, expiryDate: localDate(2026, 10, 1) },
          actor,
        ),
      ),
    ).toBe("INVALID_DATES");
  });

  it("keeps the weight less the packaging chosen for the item", async () => {
    const carton = await addPackagingType(database.db, { name: "Carton", weightKg: 0.5 }, actor);
    await setItemPackaging(database.db, input.itemNumber, carton.id, actor);
    const packed = await receiveInHouseBox(
      database.db,
      priority,
      { ...input, weightKg: 15 },
      actor,
    );
    expect(packed.weightKg).toBe(14.5);
    expect(parseBoxBarcode(packed.barcode)?.weightKg).toBe(14.5);
    const stock = await priority.getStockBoxes();
    expect(stock.find((s) => s.barcode === packed.barcode)?.weightKg).toBe(14.5);

    // Nothing left after the carton: refused. A scale reading above 99.99 is fine when the
    // goods themselves are under it.
    expect(
      await code(receiveInHouseBox(database.db, priority, { ...input, weightKg: 0.5 }, actor)),
    ).toBe("INVALID_WEIGHT");
    const heavy = await receiveInHouseBox(
      database.db,
      priority,
      { ...input, weightKg: 100.2 },
      actor,
    );
    expect(heavy.weightKg).toBe(99.7);

    // Without a choice for the item the scale reading is kept as it is.
    await setItemPackaging(database.db, input.itemNumber, null, actor);
    const plain = await receiveInHouseBox(database.db, priority, { ...input, weightKg: 15 }, actor);
    expect(plain.weightKg).toBe(15);
  });

  it("refuses an unknown item and an item with no open order", async () => {
    expect(
      await code(receiveInHouseBox(database.db, priority, { ...input, itemNumber: "NOPE" }, actor)),
    ).toBe("UNKNOWN_ITEM");
    const items = await priority.getItems();
    const orders = await priority.getOrders();
    const without = items.find(
      (i) => !orders.some((o) => o.kind === "production" && o.itemNumber === i.itemNumber),
    )!;
    expect(
      await code(
        receiveInHouseBox(
          database.db,
          priority,
          { ...input, itemNumber: without.itemNumber },
          actor,
        ),
      ),
    ).toBe("NO_ORDER");
  });

  it("records the box under the open order whose number is the certificate number", async () => {
    const orders = await priority.getOrders();
    const other = orders.find(
      (o) => o.kind === "production" && o.status === "open" && o.itemNumber !== input.itemNumber,
    )!;
    // Any item may go under an open order that is named by its certificate number.
    const box = await receiveInHouseBox(
      database.db,
      priority,
      { ...input, certificateNo: other.docno },
      actor,
    );
    expect(box.docno).toBe(other.docno);
    // A number that is not an open order falls back to the item's own open order.
    const usual = await receiveInHouseBox(
      database.db,
      priority,
      { ...input, certificateNo: "NOT-AN-ORDER" },
      actor,
    );
    expect(usual.docno).not.toBe("NOT-AN-ORDER");
  });

  it("still saves the box when Priority is down (from the saved catalog), and sends it later", async () => {
    // The earlier receipts read the catalog and saved a copy of it.
    await setStandInMode(database.db, "down", actor);
    const box = await receiveInHouseBox(database.db, priority, input, actor);
    expect(box.sent).toBe("pending");
    await setStandInMode(database.db, "normal", actor);

    expect(
      await sendDue(database.db, priority, new Date(Date.now() + 60 * 60_000)),
    ).toBeGreaterThanOrEqual(1);
    const [row] = await database.db
      .select()
      .from(prioritySends)
      .where(eq(prioritySends.boxId, box.id));
    expect(row.status).toBe("sent");
  });

  it("lists the boxes received since 21:00 with their send state, newest first", async () => {
    const list = await listTodayBoxes(database.db, "production");
    expect(list.length).toBeGreaterThanOrEqual(3);
    expect(list[0].receivedAt.getTime()).toBeGreaterThanOrEqual(list[1].receivedAt.getTime());
    expect(list.every((b) => ["sent", "pending", "failed"].includes(b.sent))).toBe(true);
    // From the next 21:00 on, the list starts empty again.
    const tomorrow = new Date(Date.now() + 25 * 60 * 60_000);
    expect(await listTodayBoxes(database.db, "production", tomorrow)).toEqual([]);
  });
});

describe("the send queue", () => {
  it("retries a send that failed because Priority was down", async () => {
    const box = await receiveInHouseBox(database.db, priority, input, actor);
    // Put the box back as if Priority had been down when it was first sent.
    await database.db.delete(prioritySends).where(eq(prioritySends.boxId, box.id));
    await database.db.insert(prioritySends).values({ boxId: box.id });
    const stockBefore = (await priority.getStockBoxes()).length;
    await database.db
      .delete(fakePriorityInventory)
      .where(eq(fakePriorityInventory.actname, box.barcode));
    await database.db
      .delete(fakePriorityReceivedLines)
      .where(eq(fakePriorityReceivedLines.topalletname, box.barcode));
    expect((await priority.getStockBoxes()).length).toBe(stockBefore - 1);

    await setStandInMode(database.db, "down", actor);
    const now = new Date();
    expect(await sendDue(database.db, priority, now)).toBe(0);
    const [queued] = await database.db
      .select()
      .from(prioritySends)
      .where(eq(prioritySends.boxId, box.id));
    expect(queued.status).toBe("pending");
    expect(queued.attempts).toBe(1);
    expect(queued.lastError).toBe("UNAVAILABLE");

    // Not due yet: nothing is tried.
    expect(await sendDue(database.db, priority, now)).toBe(0);
    await setStandInMode(database.db, "normal", actor);
    expect(
      await sendDue(database.db, priority, new Date(now.getTime() + retryDelayMs(1) + 1000)),
    ).toBe(1);
    const [sent] = await database.db
      .select()
      .from(prioritySends)
      .where(eq(prioritySends.boxId, box.id));
    expect(sent.status).toBe("sent");
  });

  it("marks a send failed after too many tries, or when Priority refuses it, and an admin can retry", async () => {
    const box = await receiveInHouseBox(database.db, priority, input, actor);
    await database.db.update(boxes).set({ docno: "NOPE" }).where(eq(boxes.id, box.id));
    await database.db
      .update(prioritySends)
      .set({ status: "pending", attempts: 0 })
      .where(eq(prioritySends.boxId, box.id));
    await database.db
      .delete(fakePriorityInventory)
      .where(eq(fakePriorityInventory.actname, box.barcode));
    await database.db
      .delete(fakePriorityReceivedLines)
      .where(eq(fakePriorityReceivedLines.topalletname, box.barcode));

    await sendDue(database.db, priority, new Date(Date.now() + 5 * 60_000));
    const [failed] = await database.db
      .select()
      .from(prioritySends)
      .where(eq(prioritySends.boxId, box.id));
    expect(failed.status).toBe("failed");
    expect(failed.lastError).toBe("UNKNOWN_ORDER");

    await database.db.update(boxes).set({ docno: box.docno }).where(eq(boxes.id, box.id));
    expect(await retryFailed(database.db, [failed.id], actor)).toBe(1);
    expect(await sendDue(database.db, priority, new Date(Date.now() + 5 * 60_000))).toBe(1);
  });

  it("sends a box once even when two timers run at the same moment", async () => {
    const box = await receiveInHouseBox(database.db, priority, input, actor);
    await database.db
      .delete(fakePriorityInventory)
      .where(eq(fakePriorityInventory.actname, box.barcode));
    await database.db
      .delete(fakePriorityReceivedLines)
      .where(eq(fakePriorityReceivedLines.topalletname, box.barcode));
    await database.db
      .update(prioritySends)
      .set({ status: "pending", attempts: 0, nextAttemptAt: new Date(0) })
      .where(eq(prioritySends.boxId, box.id));

    const later = new Date(Date.now() + 60_000);
    const [a, b] = await Promise.all([
      sendDue(database.db, priority, later),
      sendDue(database.db, priority, later),
    ]);
    expect(a + b).toBe(1);
    const [row] = await database.db
      .select()
      .from(prioritySends)
      .where(eq(prioritySends.boxId, box.id));
    expect(row.status).toBe("sent");
    expect(row.lastError).toBeNull();
  });

  it("counts a box Priority already has as sent, and lists what is not in Priority yet", async () => {
    const box = await receiveInHouseBox(database.db, priority, input, actor);
    // Priority has the box, but this system lost the answer.
    await database.db
      .update(prioritySends)
      .set({ status: "pending", attempts: 0, sentAt: null })
      .where(eq(prioritySends.boxId, box.id));
    expect(await sendBox(database.db, priority, box.id)).toBe("sent");

    await setStandInMode(database.db, "down", actor);
    const waiting = await receiveInHouseBox(database.db, priority, input, actor);
    await setStandInMode(database.db, "normal", actor);
    const unsent = await listUnsent(database.db);
    const entry = unsent.find((u) => u.barcode === waiting.barcode)!;
    expect(entry.status).toBe("pending");
    expect(entry.lastError).toBe("UNAVAILABLE");
    expect(unsent.some((u) => u.barcode === box.barcode)).toBe(false);
    await sendDue(database.db, priority, new Date(Date.now() + 60 * 60_000));
    expect((await listUnsent(database.db)).some((u) => u.barcode === waiting.barcode)).toBe(false);
  });

  it("keeps a box waiting, not failed, while Priority does not accept writes yet", async () => {
    const closed = Object.create(priority) as FakePriorityClient;
    closed.receiveBox = async () => {
      throw new PriorityError("WRITE_NOT_OPEN");
    };
    const box = await receiveInHouseBox(database.db, closed, input, actor);
    expect(box.sent).toBe("pending");
    const entry = (await listUnsent(database.db)).find((u) => u.barcode === box.barcode)!;
    expect(entry.status).toBe("pending");
    expect(entry.attempts).toBe(0);
    expect(entry.lastError).toBe("WRITE_NOT_OPEN");
    // Once writing is open, the next round sends it by itself.
    await sendDue(database.db, priority, new Date(Date.now() + 60 * 60_000));
    expect((await listUnsent(database.db)).some((u) => u.barcode === box.barcode)).toBe(false);
  });

  it("waits longer after each failure, up to fifteen minutes", () => {
    expect(retryDelayMs(1)).toBe(30_000);
    expect(retryDelayMs(2)).toBe(60_000);
    expect(retryDelayMs(30)).toBe(15 * 60_000);
    expect(MAX_SEND_ATTEMPTS).toBeGreaterThan(5);
  });
});

describe("receiving settings", () => {
  it("sends a category's boxes to the warehouse chosen for it, and only a real warehouse can be chosen", async () => {
    const items = await priority.getItems();
    const item = items.find((i) => i.itemNumber === "N2015D-S")!;
    expect(
      await code(setCategoryWarehouse(database.db, priority, item.category, "NOPE", actor)),
    ).toBe("UNKNOWN_WAREHOUSE");
    await setCategoryWarehouse(database.db, priority, item.category, "200", actor);
    expect((await getCategoryWarehouses(database.db))[item.category]).toBe("200");
    const box = await receiveInHouseBox(database.db, priority, input, actor);
    expect(box.warehouseCode).toBe("200");
    await setCategoryWarehouse(database.db, priority, item.category, null, actor);
    expect(await getCategoryWarehouses(database.db)).toEqual({});
  });

  it("takes the vendor order from settings: any well-formed number can be chosen", async () => {
    expect(await code(setVendorOrder(database.db, priority, "bad number!", actor))).toBe(
      "INVALID_ORDER",
    );
    // A number Priority lists is saved and reported as listed.
    expect(await setVendorOrder(database.db, priority, "AS26000001", actor)).toEqual({
      listed: true,
    });
    expect(await getVendorOrder(database.db)).toBe("AS26000001");
    // Any other number is saved too, with a note that Priority does not list it.
    expect(await setVendorOrder(database.db, priority, " AS26000099 ", actor)).toEqual({
      listed: false,
    });
    expect(await getVendorOrder(database.db)).toBe("AS26000099");
    await setVendorOrder(database.db, priority, null, actor);
    expect(await getVendorOrder(database.db)).toBeNull();
  });
});

describe("vendor boxes", () => {
  it("accepts a vendor barcode once, and refuses it forever after with when and by whom", async () => {
    const items = await priority.getItems();
    const item = items.find((i) => i.barcode.length >= 7)!;
    const scan = vendorCode(item.barcode.slice(-7), "63430");
    const box = await receiveVendorBox(database.db, priority, scan, actor);
    expect(box.itemNumber).toBe(item.itemNumber);
    expect(box.weightKg).toBe(19.98);
    expect(box.docno).toBe("AS26000001");
    expect(box.sent).toBe("sent");
    expect(box.productionDate).toBeNull();

    try {
      await receiveVendorBox(database.db, priority, scan, { id: null, display: "Someone Else" });
      throw new Error("expected a refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(ReceivingError);
      const e = error as ReceivingError;
      expect(e.code).toBe("ALREADY_RECEIVED");
      expect(e.existing?.receivedBy).toBe("Wanda Weigher");
      expect(e.existing?.receivedAt).toBeInstanceOf(Date);
    }
  });

  it("refuses scans that are not a vendor barcode, or match no item", async () => {
    expect(
      await code(receiveVendorBox(database.db, priority, "000212345671234561234561402", actor)),
    ).toBe("NOT_VENDOR");
    expect(await code(receiveVendorBox(database.db, priority, "3812345", actor))).toBe(
      "BAD_VENDOR_BARCODE",
    );
    expect(
      await code(receiveVendorBox(database.db, priority, vendorCode("0000000", "00001"), actor)),
    ).toBe("ITEM_NOT_FOUND");
  });

  it("refuses a vendor barcode with a date that is not real", async () => {
    const items = await priority.getItems();
    const tail = items[0].barcode.slice(-7);
    expect(fromDDMMYY("311326")).toBeNull();
    expect(
      await code(receiveVendorBox(database.db, priority, `38${tail}311326090728634301998`, actor)),
    ).toBe("BAD_VENDOR_BARCODE");
  });
});
