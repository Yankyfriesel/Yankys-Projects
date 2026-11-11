import { slaughterDateOf } from "./barcodes";
import { daysBetween, expiryStatus, type ExpiryStatus } from "@/server/priority/summary";
import type { PriorityItem, PriorityStockBox, PriorityWarehouse } from "@/server/priority/types";

/**
 * The inventory screen's rows and filters. Pure, so the screen, the exports and the tests all
 * agree: one row per box in Priority's stock, with the item's names and category beside it.
 */

export interface InventoryRow {
  barcode: string;
  itemNumber: string;
  itemName: string;
  itemNameEn: string;
  category: string;
  warehouseCode: string;
  warehouseName: string;
  weightKg: number;
  /** YYYY-MM-DD, read out of the barcode; null when the barcode does not carry it. */
  slaughterDate: string | null;
  /** YYYY-MM-DD */
  expiryDate: string;
  /** YYYY-MM-DD */
  enteredDate: string;
  status: ExpiryStatus;
  /** Whole days until expiry; negative once expired. */
  daysLeft: number;
}

export function buildRows(
  boxes: readonly PriorityStockBox[],
  items: readonly PriorityItem[],
  warehouses: readonly PriorityWarehouse[],
  today: string,
  alertDaysFor: (category: string) => number,
): InventoryRow[] {
  const categoryOf = new Map(items.map((item) => [item.itemNumber, item.category]));
  const warehouseName = new Map(warehouses.map((w) => [w.code, w.name]));
  return boxes.map((box) => {
    const category = categoryOf.get(box.itemNumber) ?? "";
    return {
      barcode: box.barcode,
      itemNumber: box.itemNumber,
      itemName: box.itemName,
      itemNameEn: box.itemNameEn,
      category,
      warehouseCode: box.warehouseCode,
      warehouseName: warehouseName.get(box.warehouseCode) ?? box.warehouseCode,
      weightKg: box.weightKg,
      slaughterDate: slaughterDateOf(box.barcode),
      expiryDate: box.expiryDate,
      enteredDate: box.enteredDate,
      status: expiryStatus(box.expiryDate, today, alertDaysFor(category)),
      daysLeft: daysBetween(today, box.expiryDate),
    };
  });
}

export type StatusFilter = "all" | ExpiryStatus | "attention";

export interface InventoryFilters {
  /** Words matched against the item number and both names; every word must match. */
  item: string;
  /** Warehouse code, "" for all. */
  warehouse: string;
  /** Part of the box barcode. */
  barcode: string;
  /** Expiry between these dates (YYYY-MM-DD, either may be empty). */
  expiryFrom: string;
  expiryTo: string;
  /** Date entered between these dates. */
  enteredFrom: string;
  enteredTo: string;
  status: StatusFilter;
}

export const NO_FILTERS: InventoryFilters = {
  item: "",
  warehouse: "",
  barcode: "",
  expiryFrom: "",
  expiryTo: "",
  enteredFrom: "",
  enteredTo: "",
  status: "all",
};

export function hasFilters(filters: InventoryFilters): boolean {
  return (Object.keys(NO_FILTERS) as (keyof InventoryFilters)[]).some(
    (key) => filters[key] !== NO_FILTERS[key],
  );
}

export function filterRows(
  rows: readonly InventoryRow[],
  filters: InventoryFilters,
): InventoryRow[] {
  const words = filters.item.toLowerCase().split(/\s+/).filter(Boolean);
  const barcode = filters.barcode.trim();
  return rows.filter((row) => {
    if (filters.warehouse && row.warehouseCode !== filters.warehouse) return false;
    if (barcode && !row.barcode.includes(barcode)) return false;
    if (words.length > 0) {
      const haystack = [row.itemNumber, row.itemName, row.itemNameEn].join(" ").toLowerCase();
      if (!words.every((word) => haystack.includes(word))) return false;
    }
    if (filters.expiryFrom && row.expiryDate < filters.expiryFrom) return false;
    if (filters.expiryTo && row.expiryDate > filters.expiryTo) return false;
    if (filters.enteredFrom && row.enteredDate < filters.enteredFrom) return false;
    if (filters.enteredTo && row.enteredDate > filters.enteredTo) return false;
    if (filters.status === "attention") return row.status !== "valid";
    if (filters.status !== "all" && row.status !== filters.status) return false;
    return true;
  });
}

/** Expiring first, then by item name and barcode, so the most urgent boxes are on top. */
export function sortRows(rows: readonly InventoryRow[]): InventoryRow[] {
  return [...rows].sort(
    (a, b) =>
      a.expiryDate.localeCompare(b.expiryDate) ||
      a.itemName.localeCompare(b.itemName, "he") ||
      a.barcode.localeCompare(b.barcode),
  );
}

export interface ItemGroup {
  itemNumber: string;
  itemName: string;
  category: string;
  /** The item's boxes, in the order they came (the most urgent first). */
  rows: InventoryRow[];
  sums: InventoryTotals;
}

/** One group per item, the items in name order. */
export function groupByItem(rows: readonly InventoryRow[]): ItemGroup[] {
  const byItem = new Map<string, InventoryRow[]>();
  for (const row of rows) {
    const list = byItem.get(row.itemNumber);
    if (list) list.push(row);
    else byItem.set(row.itemNumber, [row]);
  }
  return [...byItem.values()]
    .map((list) => ({
      itemNumber: list[0].itemNumber,
      itemName: list[0].itemName,
      category: list[0].category,
      rows: list,
      sums: totals(list),
    }))
    .sort(
      (a, b) =>
        a.itemName.localeCompare(b.itemName, "he") || a.itemNumber.localeCompare(b.itemNumber),
    );
}

export interface InventoryTotals {
  boxes: number;
  kg: number;
  expired: number;
  soon: number;
}

export function totals(rows: readonly InventoryRow[]): InventoryTotals {
  let grams = 0;
  let expired = 0;
  let soon = 0;
  for (const row of rows) {
    grams += Math.round(row.weightKg * 1000);
    if (row.status === "expired") expired++;
    else if (row.status === "soon") soon++;
  }
  return { boxes: rows.length, kg: grams / 1000, expired, soon };
}
