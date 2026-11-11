import { describe, expect, it } from "vitest";
import type { PriorityItem } from "@/server/priority/types";
import { categoryCounts, filterItems, sortByName } from "./catalog";

function item(itemNumber: string, name: string, nameEn: string, category: string): PriorityItem {
  return {
    itemNumber,
    name,
    nameEn,
    barcode: `729010${itemNumber.replace(/\D/g, "")}`,
    category,
    weightKg: 12,
    shelfLifeDays: 10,
    storageText: "",
    packingCode: "",
    origin: "",
    inventoryManaged: true,
  };
}

const items = [
  item("N2015D-S", "המבורגר בקר קלאסי 150 גר׳", "Classic beef burger 150 g", "קציצות"),
  item("N2016D-S", "המבורגר עוף קלאסי 150 גר׳", "Classic chicken burger 150 g", "קציצות"),
  item("N2020F-S", "שיפודי בקר מתובלים", "Seasoned beef skewers", "שיפודי בקר"),
  item("M9000D-S", "פריט בלי קטגוריה", "", ""),
];

describe("sortByName", () => {
  it("puts the items in alphabetical order of their name, numbers by value", () => {
    const sorted = sortByName([
      item("M1", "שיפודי בקר מתובלים", "", "x"),
      item("M2", "המבורגר בקר קלאסי 150 גר׳", "", "x"),
      item("M3", "אסאדו", "", "x"),
      item("M4", "המבורגר בקר 90 גר׳", "", "x"),
      item("M5", "בריסקט (3)", "", "x"),
    ]);
    expect(sorted.map((i) => i.name)).toEqual([
      "אסאדו",
      "בריסקט (3)",
      "המבורגר בקר 90 גר׳",
      "המבורגר בקר קלאסי 150 גר׳",
      "שיפודי בקר מתובלים",
    ]);
  });

  it("keeps items with the same name in order of item number, and does not change the list it was given", () => {
    const given = [item("M20", "צלעות", "", "x"), item("M3", "צלעות", "", "x")];
    expect(sortByName(given).map((i) => i.itemNumber)).toEqual(["M3", "M20"]);
    expect(given.map((i) => i.itemNumber)).toEqual(["M20", "M3"]);
  });
});

describe("categoryCounts", () => {
  it("counts items per category, alphabetically, with uncategorized items last", () => {
    expect(categoryCounts(items)).toEqual([
      { category: "קציצות", count: 2 },
      { category: "שיפודי בקר", count: 1 },
      { category: "", count: 1 },
    ]);
  });

  it("is empty for an empty catalog", () => {
    expect(categoryCounts([])).toEqual([]);
  });
});

describe("filterItems", () => {
  it("returns everything with no category and no search", () => {
    expect(filterItems(items, { category: null, query: "" })).toHaveLength(4);
    expect(filterItems(items, { category: null, query: "   " })).toHaveLength(4);
  });

  it("limits to one category, including the uncategorized one", () => {
    expect(filterItems(items, { category: "שיפודי בקר", query: "" }).map((i) => i.itemNumber)).toEqual([
      "N2020F-S",
    ]);
    expect(filterItems(items, { category: "", query: "" }).map((i) => i.itemNumber)).toEqual([
      "M9000D-S",
    ]);
  });

  it("finds by item number, Hebrew name, English name or barcode, ignoring case", () => {
    expect(filterItems(items, { category: null, query: "n2015" }).map((i) => i.itemNumber)).toEqual(
      ["N2015D-S"],
    );
    expect(filterItems(items, { category: null, query: "שיפודי בקר" }).map((i) => i.itemNumber)).toEqual([
      "N2020F-S",
    ]);
    expect(
      filterItems(items, { category: null, query: "CHICKEN" }).map((i) => i.itemNumber),
    ).toEqual(["N2016D-S"]);
    expect(
      filterItems(items, { category: null, query: "7290102016" }).map((i) => i.itemNumber),
    ).toEqual(["N2016D-S"]);
  });

  it("needs every typed word to match, in any order", () => {
    expect(filterItems(items, { category: null, query: "burger 150" })).toHaveLength(2);
    expect(filterItems(items, { category: null, query: "150 chicken" })).toHaveLength(1);
    expect(filterItems(items, { category: null, query: "chicken kebab" })).toHaveLength(0);
  });

  it("combines category and search", () => {
    expect(filterItems(items, { category: "שיפודי בקר", query: "burger" })).toHaveLength(0);
  });
});
