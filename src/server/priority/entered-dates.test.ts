import { beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../db/connection";
import { boxes } from "../db/schema";
import { withReceivedDates } from "./entered-dates";
import type { PriorityStockBox } from "./types";

let database: Database;

beforeAll(async () => {
  database = createDatabase({ url: null, pgliteDataDir: null });
  await database.migrate();
}, 60_000);

function stockBox(barcode: string): PriorityStockBox {
  return {
    barcode,
    itemNumber: "I1",
    itemName: "x",
    itemNameEn: "",
    warehouseCode: "Main",
    weightKg: 1,
    expiryDate: "2026-12-01",
    enteredDate: "2026-08-19",
  };
}

describe("withReceivedDates", () => {
  it("shows the day a box was received here, in factory time, and leaves other boxes alone", async () => {
    await database.db.insert(boxes).values({
      barcode: "OURS",
      source: "production",
      itemNumber: "I1",
      running: "0001",
      slaughterDate: "2026-11-01",
      expiryDate: "2026-12-01",
      weightKg: 1,
      docno: "D1",
      warehouseCode: "Main",
      receivedByDisplay: "Wanda",
      // 22:30 UTC on the 3rd is already the 4th in Israel (winter time, UTC+2).
      receivedAt: new Date("2026-11-03T22:30:00Z"),
    });
    const result = await withReceivedDates(database.db, [stockBox("OURS"), stockBox("THEIRS")]);
    expect(result.map((b) => b.enteredDate)).toEqual(["2026-11-04", "2026-08-19"]);
  });

  it("finds a vendor box when the stock list only gives the short lot", async () => {
    const full = "3812345678901234567890123401998"; // first 16 characters are the lot
    await database.db.insert(boxes).values({
      barcode: full,
      source: "vendor",
      itemNumber: "I1",
      running: "12345",
      slaughterDate: "2026-11-01",
      expiryDate: "2026-12-01",
      weightKg: 1,
      docno: "D1",
      warehouseCode: "Main",
      receivedByDisplay: "Wanda",
      receivedAt: new Date("2026-11-04T08:00:00Z"),
    });
    const short = { ...stockBox(full.slice(0, 16)), enteredDate: "2026-08-19" };
    const result = await withReceivedDates(database.db, [short]);
    expect(result[0].enteredDate).toBe("2026-11-04");
  });
});
