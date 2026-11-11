import { desc, sql } from "drizzle-orm";
import { timeZone } from "../../lib/i18n/config";
import type { Db } from "../db/connection";
import { boxes } from "../db/schema";
import type { PriorityStockBox } from "./types";

/** How much of a box's barcode Priority's stock list keeps (see live.ts). */
const LOT_LENGTH = 16;

const lotKey = (itemNumber: string, weightKg: number, barcode: string) =>
  `${itemNumber}|${weightKg.toFixed(2)}|${barcode.slice(0, LOT_LENGTH)}`;

/**
 * The "date entered" of a box is the day it was received here (factory time), not Priority's
 * "last date", which moves whenever anything happens to the stock line and is the load date for
 * stock that was brought in all at once. Boxes this system did not receive keep Priority's date.
 *
 * A stock line normally carries the box's full barcode. When Priority only gives the short lot
 * (the first 16 characters, as happens for vendor boxes, whose running number sits at the end),
 * the line is matched to a box received here by item, lot and weight; boxes that match the same
 * way are interchangeable, so each takes the newest not yet used (the oldest leave stock first).
 */
export async function withReceivedDates(
  db: Db,
  stock: PriorityStockBox[],
): Promise<PriorityStockBox[]> {
  if (stock.length === 0) return stock;
  const rows = await db
    .select({
      barcode: boxes.barcode,
      itemNumber: boxes.itemNumber,
      weightKg: boxes.weightKg,
      day: sql<string>`to_char(${boxes.receivedAt} at time zone ${timeZone}, 'YYYY-MM-DD')`,
    })
    .from(boxes)
    .orderBy(desc(boxes.receivedAt));

  const exact = new Map(rows.map((row) => [row.barcode, row.day]));
  const inStock = new Set(stock.map((box) => box.barcode));

  // Boxes received here that no stock line names in full, grouped by lot, newest first.
  const byLot = new Map<string, string[]>();
  for (const row of rows) {
    if (inStock.has(row.barcode)) continue;
    const key = lotKey(row.itemNumber, row.weightKg, row.barcode);
    byLot.set(key, [...(byLot.get(key) ?? []), row.day]);
  }

  return stock.map((box) => {
    const day =
      exact.get(box.barcode) ??
      byLot.get(lotKey(box.itemNumber, box.weightKg, box.barcode))?.shift();
    return day ? { ...box, enteredDate: day } : box;
  });
}
