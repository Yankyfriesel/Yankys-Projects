import { describe, expect, it } from "vitest";
import { buildPalletQr, palletContents, palletLabelValues, parsePalletQr } from "./pallets";

describe("pallet QR code", () => {
  it("holds the pallet number and reads back", () => {
    expect(buildPalletQr(12)).toBe("NFP1|12");
    expect(parsePalletQr("NFP1|12")).toBe(12);
    expect(parsePalletQr("  NFP1|7\n")).toBe(7);
  });

  it("is not made for a number that is not a pallet's", () => {
    expect(() => buildPalletQr(0)).toThrow(RangeError);
    expect(() => buildPalletQr(1.5)).toThrow(RangeError);
  });

  it("is recognised only when it really is one", () => {
    for (const text of [
      "",
      "NFP1|",
      "NFP1|0",
      "NFP1|-3",
      "NFP1|12|3",
      "NFP2|12",
      "NF1|N2015D-S|123456|231026|261026|041126", // an item label
      "000220151810261511261402", // a box barcode
      "nfp1|12",
    ]) {
      expect(parsePalletQr(text)).toBeNull();
    }
  });
});

describe("pallet label", () => {
  const boxes = [
    { itemName: "המבורגר בקר", weightKg: 10.25 },
    { itemName: "שיפודי בקר מתובלים", weightKg: 9.5 },
    { itemName: "המבורגר בקר", weightKg: 8 },
  ];

  it("names each item with how many boxes of it, the biggest group first", () => {
    expect(palletContents(boxes)).toBe("המבורגר בקר × 2, שיפודי בקר מתובלים × 1");
  });

  it("cuts a very long summary", () => {
    const many = Array.from({ length: 80 }, (_, i) => ({
      itemName: `פריט מספר ${i} בשם ארוך`,
      weightKg: 1,
    }));
    const text = palletContents(many);
    expect(text.length).toBeLessThanOrEqual(300);
    expect(text.endsWith("…")).toBe(true);
  });

  it("is drawn with the pallet's number, count, exact weight, date and QR", () => {
    const values = palletLabelValues({ number: 12, createdDate: "2026-10-28", boxes });
    expect(values).toMatchObject({
      palletNumber: "12",
      palletBoxes: "3",
      palletDate: "28/10/2026",
      qrPallet: "NFP1|12",
      name: "",
      boxBarcode: "",
    });
    expect(values.palletWeight).toBe("27.75");
  });
});
