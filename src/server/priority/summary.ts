import type { PriorityStockBox, PriorityWarehouse } from "./types";

/**
 * Days before expiry that count as "about to expire" for a category with no choice of its own.
 * The choice per category is made in settings (see src/server/alerts).
 */
export const DEFAULT_ALERT_DAYS = 7;

/** One box that needs attention, for the details that open under its item's line. */
export interface AttentionBox {
  barcode: string;
  weightKg: number;
  /** YYYY-MM-DD */
  expiryDate: string;
  /** YYYY-MM-DD */
  enteredDate: string;
  status: "soon" | "expired";
}

export interface AttentionLine {
  itemNumber: string;
  /** Hebrew item name from Priority, shown as is. */
  itemName: string;
  expired: number;
  soon: number;
  /** The boxes behind the counts, the ones expiring first on top. */
  boxes: AttentionBox[];
}

export interface WarehouseSummary {
  code: string;
  name: string;
  kg: number;
  boxes: number;
  items: number;
  valid: number;
  soon: number;
  expired: number;
  /** Items with expired or about-to-expire boxes, most urgent first. */
  attention: AttentionLine[];
}

export type ExpiryStatus = "valid" | "soon" | "expired";

/** Whole days from one YYYY-MM-DD date to another (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function expiryStatus(expiryDate: string, today: string, alertDays: number): ExpiryStatus {
  const days = daysBetween(today, expiryDate);
  if (days < 0) return "expired";
  if (days <= alertDays) return "soon";
  return "valid";
}

/** One summary per warehouse, in the order given; a warehouse with no boxes still appears. */
export function summarize(
  warehouses: PriorityWarehouse[],
  boxes: PriorityStockBox[],
  today: string,
  /** One number for every box, or a function that gives the days for each box (per category). */
  alertDays: number | ((box: PriorityStockBox) => number) = DEFAULT_ALERT_DAYS,
): WarehouseSummary[] {
  const daysFor = typeof alertDays === "function" ? alertDays : () => alertDays;
  return warehouses.map((warehouse) => {
    const here = boxes.filter((b) => b.warehouseCode === warehouse.code);
    let valid = 0;
    let soon = 0;
    let expired = 0;
    let grams = 0;
    const byItem = new Map<string, AttentionLine>();

    for (const box of here) {
      grams += Math.round(box.weightKg * 1000);
      const status = expiryStatus(box.expiryDate, today, daysFor(box));
      if (status === "valid") {
        valid++;
        continue;
      }
      if (status === "soon") soon++;
      else expired++;
      const line = byItem.get(box.itemNumber) ?? {
        itemNumber: box.itemNumber,
        itemName: box.itemName,
        expired: 0,
        soon: 0,
        boxes: [],
      };
      line[status]++;
      line.boxes.push({
        barcode: box.barcode,
        weightKg: box.weightKg,
        expiryDate: box.expiryDate,
        enteredDate: box.enteredDate,
        status,
      });
      byItem.set(box.itemNumber, line);
    }

    for (const line of byItem.values()) {
      line.boxes.sort(
        (a, b) => a.expiryDate.localeCompare(b.expiryDate) || a.barcode.localeCompare(b.barcode),
      );
    }
    const attention = [...byItem.values()].sort(
      (a, b) =>
        b.expired - a.expired || b.soon - a.soon || a.itemName.localeCompare(b.itemName, "he"),
    );

    return {
      code: warehouse.code,
      name: warehouse.name,
      kg: grams / 1000,
      boxes: here.length,
      items: new Set(here.map((b) => b.itemNumber)).size,
      valid,
      soon,
      expired,
      attention,
    };
  });
}
