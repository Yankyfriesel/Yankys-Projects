import { describe, expect, it } from "vitest";
import { daysBetween, expiryStatus, summarize } from "./summary";
import type { PriorityStockBox, PriorityWarehouse } from "./types";

const warehouses: PriorityWarehouse[] = [
  { code: "Main", name: "מקרר ראשי" },
  { code: "200", name: "מקפיא ראשי" },
  { code: "Empty", name: "מחסן ריק" },
];

function box(over: Partial<PriorityStockBox>): PriorityStockBox {
  return {
    barcode: "000000000000000000000000",
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

describe("expiry status", () => {
  const today = "2026-10-22";

  it("counts whole days between dates, across month ends", () => {
    expect(daysBetween("2026-10-22", "2026-10-29")).toBe(7);
    expect(daysBetween("2026-10-30", "2026-11-02")).toBe(3);
    expect(daysBetween("2026-10-22", "2026-10-21")).toBe(-1);
  });

  it("is expired before today, soon from today through the alert window, valid after", () => {
    expect(expiryStatus("2026-10-21", today, 7)).toBe("expired");
    expect(expiryStatus("2026-10-22", today, 7)).toBe("soon");
    expect(expiryStatus("2026-10-29", today, 7)).toBe("soon");
    expect(expiryStatus("2026-10-30", today, 7)).toBe("valid");
  });
});

describe("warehouse summaries", () => {
  const today = "2026-10-22";
  const boxes = [
    box({ weightKg: 10.25 }),
    box({ weightKg: 9.5, expiryDate: "2026-10-25" }),
    box({ weightKg: 8, expiryDate: "2026-10-01" }),
    box({ weightKg: 8, expiryDate: "2026-10-02" }),
    box({
      itemNumber: "N3001F-C",
      itemName: "בקר טחון טרי",
      weightKg: 14,
      expiryDate: "2026-10-23",
    }),
    box({ warehouseCode: "200", itemNumber: "N2020F-S", itemName: "שיפודי בקר מתובלים", weightKg: 12.1 }),
  ];
  const result = summarize(warehouses, boxes, today, 7);

  it("keeps the warehouse order and includes empty warehouses", () => {
    expect(result.map((w) => w.code)).toEqual(["Main", "200", "Empty"]);
    expect(result[2]).toMatchObject({ boxes: 0, kg: 0, items: 0, attention: [] });
  });

  it("totals kilograms exactly, without floating point drift", () => {
    expect(result[0].kg).toBe(49.75);
    expect(result[1].kg).toBe(12.1);
  });

  it("splits boxes into valid, soon and expired", () => {
    expect(result[0]).toMatchObject({ boxes: 5, items: 2, valid: 1, soon: 2, expired: 2 });
    expect(result[1]).toMatchObject({ boxes: 1, valid: 1, soon: 0, expired: 0, attention: [] });
  });

  it("groups attention by item, most urgent first", () => {
    expect(
      result[0].attention.map(({ itemNumber, itemName, expired, soon }) => ({
        itemNumber,
        itemName,
        expired,
        soon,
      })),
    ).toEqual([
      { itemNumber: "N2015D-S", itemName: "המבורגר בקר", expired: 2, soon: 1 },
      { itemNumber: "N3001F-C", itemName: "בקר טחון טרי", expired: 0, soon: 1 },
    ]);
  });

  it("lists the boxes behind each line, the ones expiring first on top", () => {
    const burgers = result[0].attention[0];
    expect(burgers.boxes.map((b) => [b.expiryDate, b.status])).toEqual([
      ["2026-10-01", "expired"],
      ["2026-10-02", "expired"],
      ["2026-10-25", "soon"],
    ]);
    expect(burgers.boxes[0]).toMatchObject({ weightKg: 8, enteredDate: "2026-10-20" });
  });

  it("takes the alert days per box when given a function", () => {
    // Beef burgers warn 2 days ahead only, the ground beef 30 days ahead.
    const custom = summarize(warehouses, boxes, today, (b) =>
      b.itemNumber === "N2015D-S" ? 2 : 30,
    );
    expect(custom[0]).toMatchObject({ soon: 1, expired: 2, valid: 2 });
  });
});
