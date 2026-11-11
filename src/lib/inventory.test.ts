import { describe, expect, it } from "vitest";
import {
  NO_FILTERS,
  buildRows,
  filterRows,
  hasFilters,
  sortRows,
  totals,
  type InventoryFilters,
} from "./inventory";
import type { PriorityItem, PriorityStockBox, PriorityWarehouse } from "@/server/priority/types";

const today = "2026-10-22";

const warehouses: PriorityWarehouse[] = [
  { code: "Main", name: "מקרר ראשי" },
  { code: "200", name: "מקפיא ראשי" },
];

function item(over: Partial<PriorityItem>): PriorityItem {
  return {
    itemNumber: "N2015D-S",
    name: "המבורגר בקר",
    nameEn: "Beef burger",
    barcode: "7291234567890",
    category: "קציצות",
    weightKg: null,
    shelfLifeDays: 12,
    storageText: "",
    packingCode: "",
    origin: "",
    inventoryManaged: true,
    ...over,
  };
}

const items = [
  item({}),
  item({ itemNumber: "N3001F-C", name: "בקר טחון טרי", nameEn: "Fresh ground beef", category: "נתחי בקר" }),
];

function box(over: Partial<PriorityStockBox>): PriorityStockBox {
  return {
    barcode: "000220151810261511261402",
    itemNumber: "N2015D-S",
    itemName: "המבורגר בקר",
    itemNameEn: "Beef burger",
    warehouseCode: "Main",
    weightKg: 10,
    expiryDate: "2026-12-01",
    enteredDate: "2026-10-20",
    ...over,
  };
}

const boxes = [
  box({ barcode: "A100", weightKg: 10.25 }),
  box({ barcode: "A200", weightKg: 9.5, expiryDate: "2026-10-25", enteredDate: "2026-10-21" }),
  box({ barcode: "A300", weightKg: 8, expiryDate: "2026-10-01", enteredDate: "2026-09-30" }),
  box({
    barcode: "B100",
    itemNumber: "N3001F-C",
    itemName: "בקר טחון טרי",
    itemNameEn: "Fresh ground beef",
    warehouseCode: "200",
    weightKg: 14,
    expiryDate: "2026-11-15",
    enteredDate: "2026-10-22",
  }),
];

const rows = buildRows(boxes, items, warehouses, today, (category) =>
  category === "נתחי בקר" ? 30 : 7,
);
const withFilters = (over: Partial<InventoryFilters>) => ({ ...NO_FILTERS, ...over });
const codes = (list: typeof rows) => list.map((r) => r.barcode);

describe("inventory rows", () => {
  it("add the category, the warehouse name, the status and the days remaining to each box", () => {
    expect(rows[0]).toMatchObject({
      category: "קציצות",
      warehouseName: "מקרר ראשי",
      status: "valid",
      daysLeft: 40,
    });
    expect(rows[1]).toMatchObject({ status: "soon", daysLeft: 3 });
    expect(rows[2]).toMatchObject({ status: "expired", daysLeft: -21 });
  });

  it("uses the alert days of the box's own category", () => {
    // The ground beef expires in 24 days: soon with its 30 alert days, valid with the default 7.
    expect(rows[3].status).toBe("soon");
  });

  it("read the slaughter date out of our own box barcode, and leave it empty otherwise", () => {
    expect(rows[0].slaughterDate).toBeNull(); // "A100" is not a box barcode
    const own = buildRows([box({})], items, warehouses, today, () => 7);
    expect(own[0].slaughterDate).toBe("2026-10-18");
  });

  it("show an unknown warehouse by its code", () => {
    const odd = buildRows([box({ warehouseCode: "X9" })], items, warehouses, today, () => 7);
    expect(odd[0].warehouseName).toBe("X9");
  });
});

describe("inventory filters", () => {
  it("start with everything shown", () => {
    expect(hasFilters(NO_FILTERS)).toBe(false);
    expect(filterRows(rows, NO_FILTERS)).toHaveLength(4);
  });

  it("find an item by number or by a Hebrew or English name, every word having to match", () => {
    expect(codes(filterRows(rows, withFilters({ item: "N3001" })))).toEqual(["B100"]);
    expect(codes(filterRows(rows, withFilters({ item: "ground" })))).toEqual(["B100"]);
    expect(codes(filterRows(rows, withFilters({ item: "המבורגר" })))).toEqual([
      "A100",
      "A200",
      "A300",
    ]);
    expect(filterRows(rows, withFilters({ item: "burger ground" }))).toEqual([]);
  });

  it("keep one warehouse", () => {
    expect(codes(filterRows(rows, withFilters({ warehouse: "200" })))).toEqual(["B100"]);
  });

  it("find a box by a part of its barcode", () => {
    expect(codes(filterRows(rows, withFilters({ barcode: "A2" })))).toEqual(["A200"]);
  });

  it("keep the boxes expiring or entered within the dates, both ends included", () => {
    expect(
      codes(filterRows(rows, withFilters({ expiryFrom: "2026-10-25", expiryTo: "2026-11-15" }))),
    ).toEqual(["A200", "B100"]);
    expect(codes(filterRows(rows, withFilters({ enteredFrom: "2026-10-21" })))).toEqual([
      "A200",
      "B100",
    ]);
    expect(codes(filterRows(rows, withFilters({ enteredTo: "2026-09-30" })))).toEqual(["A300"]);
  });

  it("keep one expiry status, or everything that needs attention", () => {
    expect(codes(filterRows(rows, withFilters({ status: "expired" })))).toEqual(["A300"]);
    expect(codes(filterRows(rows, withFilters({ status: "soon" })))).toEqual(["A200", "B100"]);
    expect(codes(filterRows(rows, withFilters({ status: "attention" })))).toEqual([
      "A200",
      "A300",
      "B100",
    ]);
  });

  it("combine", () => {
    const some = withFilters({ item: "burger", status: "attention" });
    expect(hasFilters(some)).toBe(true);
    expect(codes(filterRows(rows, some))).toEqual(["A200", "A300"]);
  });
});

describe("sorting and totals", () => {
  it("puts the boxes expiring first on top", () => {
    expect(codes(sortRows(rows))).toEqual(["A300", "A200", "B100", "A100"]);
  });

  it("adds up the boxes, the kilograms exactly, and the ones needing attention", () => {
    expect(totals(rows)).toEqual({ boxes: 4, kg: 41.75, expired: 1, soon: 2 });
    expect(totals([])).toEqual({ boxes: 0, kg: 0, expired: 0, soon: 0 });
  });
});
