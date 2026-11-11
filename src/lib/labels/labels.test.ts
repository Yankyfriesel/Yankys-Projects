import { describe, expect, it } from "vitest";
import type { PriorityItem } from "@/server/priority/types";
import { parseBoxBarcode } from "../barcodes";
import { EXTRA_FONT_KEYS, extraFontFamily } from "./fonts";
import { moveBox, moveBoxes, resizeBox, snap } from "./geometry";
import {
  DEFAULT_STYLE,
  FONTS,
  layoutSchema,
  lineText,
  type BoxLine,
  type LabelElement,
} from "./model";
import { sampleValues } from "./sample";

const bounds = { width: 100, height: 60 };

describe("snap", () => {
  it("rounds to half a millimetre", () => {
    expect(snap(10.24)).toBe(10);
    expect(snap(10.26)).toBe(10.5);
    expect(snap(-0.2)).toBe(-0);
    expect(snap(3.33, 1)).toBe(3);
  });
});

describe("moveBox", () => {
  const box = { x: 10, y: 10, w: 20, h: 10 };

  it("moves by the distance, snapped", () => {
    expect(moveBox(box, 5.2, -3.1, bounds)).toEqual({ x: 15, y: 7, w: 20, h: 10 });
  });

  it("stays inside the label on every side", () => {
    expect(moveBox(box, -50, -50, bounds)).toMatchObject({ x: 0, y: 0 });
    expect(moveBox(box, 500, 500, bounds)).toMatchObject({ x: 80, y: 50 });
  });
});

describe("moveBoxes", () => {
  const a = { x: 10, y: 10, w: 20, h: 10 };
  const b = { x: 40, y: 30, w: 30, h: 10 };

  it("moves every box by the same distance", () => {
    expect(moveBoxes([a, b], 5, -3, bounds)).toEqual([
      { x: 15, y: 7, w: 20, h: 10 },
      { x: 45, y: 27, w: 30, h: 10 },
    ]);
  });

  it("stops the group at an edge, so the boxes keep their distance from each other", () => {
    // b reaches the right edge (70 + 30 = 100) first, so a stops with it.
    const [movedA, movedB] = moveBoxes([a, b], 500, 0, bounds);
    expect(movedB.x + movedB.w).toBe(100);
    expect(movedB.x - movedA.x).toBe(b.x - a.x);
    const [upA, upB] = moveBoxes([a, b], 0, -500, bounds);
    expect(upA.y).toBe(0);
    expect(upB.y - upA.y).toBe(b.y - a.y);
  });

  it("does nothing for no boxes", () => {
    expect(moveBoxes([], 5, 5, bounds)).toEqual([]);
  });
});

describe("resizeBox", () => {
  const box = { x: 10, y: 10, w: 20, h: 10 };

  it("moves only the dragged edges and keeps the opposite ones", () => {
    expect(resizeBox(box, "e", 5, 99, bounds)).toEqual({ x: 10, y: 10, w: 25, h: 10 });
    expect(resizeBox(box, "w", -4, 0, bounds)).toEqual({ x: 6, y: 10, w: 24, h: 10 });
    expect(resizeBox(box, "s", 0, 2, bounds)).toEqual({ x: 10, y: 10, w: 20, h: 12 });
    expect(resizeBox(box, "n", 0, -3, bounds)).toEqual({ x: 10, y: 7, w: 20, h: 13 });
  });

  it("moves two edges for a corner", () => {
    expect(resizeBox(box, "se", 5, 5, bounds)).toEqual({ x: 10, y: 10, w: 25, h: 15 });
    expect(resizeBox(box, "nw", -5, -5, bounds)).toEqual({ x: 5, y: 5, w: 25, h: 15 });
  });

  it("never gets smaller than the minimum or leaves the label", () => {
    expect(resizeBox(box, "e", -100, 0, bounds)).toMatchObject({ w: 0.5 });
    expect(resizeBox(box, "n", 0, 100, bounds)).toMatchObject({ h: 0.5 });
    expect(resizeBox(box, "e", 500, 0, bounds)).toEqual({ x: 10, y: 10, w: 90, h: 10 });
    expect(resizeBox(box, "w", -500, 0, bounds)).toEqual({ x: 0, y: 10, w: 30, h: 10 });
  });
});

describe("layoutSchema", () => {
  const text: LabelElement = {
    id: "a1",
    type: "text",
    x: 2,
    y: 2,
    w: 40,
    h: 8,
    text: "מוצר",
    style: DEFAULT_STYLE,
  };
  const valid = { name: "  Item label  ", widthMm: 100, heightMm: 60, elements: [text] };

  it("accepts a layout and trims the name", () => {
    const parsed = layoutSchema.parse(valid);
    expect(parsed.name).toBe("Item label");
    expect(parsed.elements).toHaveLength(1);
  });

  it("accepts every element type", () => {
    const elements: LabelElement[] = [
      text,
      {
        id: "f",
        type: "field",
        field: "expiryDate",
        x: 0,
        y: 0,
        w: 10,
        h: 5,
        style: DEFAULT_STYLE,
      },
      { id: "l", type: "line", x: 0, y: 20, w: 90, h: 0.3 },
      { id: "b", type: "box", x: 1, y: 1, w: 98, h: 58, borderMm: 0.4 },
      { id: "bc", type: "barcode", x: 4, y: 40, w: 60, h: 12, field: "boxBarcode", showText: true },
      { id: "q", type: "qr", x: 70, y: 40, w: 20, h: 20, source: "itemLabel" },
      { id: "lg", type: "logo", x: 4, y: 4, w: 24, h: 12, variant: "full" },
    ];
    expect(layoutSchema.parse({ ...valid, elements }).elements).toHaveLength(7);
  });

  it("rejects bad sizes, names, fields and numbers", () => {
    expect(() => layoutSchema.parse({ ...valid, widthMm: 5 })).toThrow();
    expect(() => layoutSchema.parse({ ...valid, heightMm: 301 })).toThrow();
    expect(() => layoutSchema.parse({ ...valid, name: "   " })).toThrow();
    expect(() =>
      layoutSchema.parse({ ...valid, elements: [{ ...text, type: "field", field: "nope" }] }),
    ).toThrow();
    expect(() =>
      layoutSchema.parse({ ...valid, elements: [{ ...text, x: Number.NaN }] }),
    ).toThrow();
    expect(() =>
      layoutSchema.parse({
        ...valid,
        elements: [{ ...text, style: { ...DEFAULT_STYLE, fontSize: 2 } }],
      }),
    ).toThrow();
  });

  it("rejects a barcode of an unknown field, a QR of an unknown source and an unknown logo", () => {
    const bad = (element: object) => () =>
      layoutSchema.parse({ ...valid, elements: [{ ...text, ...element }] });
    expect(bad({ type: "barcode", field: "nope", showText: true })).toThrow();
    expect(bad({ type: "barcode", field: "name" })).toThrow();
    expect(bad({ type: "qr", source: "everything" })).toThrow();
    expect(bad({ type: "logo", variant: "light" })).toThrow();
  });

  describe("a lines box", () => {
    const line = (over: Partial<BoxLine> = {}): BoxLine => ({
      label: "תאריך שחיטה:",
      source: "slaughterDate",
      text: "",
      style: DEFAULT_STYLE,
      ...over,
    });
    const box = {
      id: "d",
      type: "lines",
      x: 4,
      y: 4,
      w: 46,
      h: 15,
      borderMm: 0.4,
      radiusMm: 2,
      separator: "dotted",
      lines: [line(), line({ label: "", source: "text", text: "שמור בקירור" })],
    };
    const parse = (element: object) =>
      layoutSchema.parse({ ...valid, elements: [{ ...box, ...element }] });

    it("is accepted, with its lines in order", () => {
      const parsed = parse({}).elements[0];
      expect(parsed.type).toBe("lines");
      if (parsed.type === "lines")
        expect(parsed.lines.map((l) => l.source)).toEqual(["slaughterDate", "text"]);
    });

    it("may have no frame and square corners", () => {
      expect(() => parse({ borderMm: 0, radiusMm: 0, separator: "none" })).not.toThrow();
    });

    it("needs at least one line, and holds no more than twelve", () => {
      expect(() => parse({ lines: [] })).toThrow();
      expect(() => parse({ lines: Array.from({ length: 13 }, () => line()) })).toThrow();
      expect(() => parse({ lines: Array.from({ length: 12 }, () => line()) })).not.toThrow();
    });

    it("rejects an unknown separator, a negative frame and a line that shows an unknown field", () => {
      expect(() => parse({ separator: "wavy" })).toThrow();
      expect(() => parse({ borderMm: -1 })).toThrow();
      expect(() => parse({ lines: [line({ source: "nope" as never })] })).toThrow();
    });

    it("shows a field of the label, or the text typed for the line", () => {
      const values = sampleValues(
        {
          itemNumber: "N2015D-S",
          name: "המבורגר",
          nameEn: "Burger",
          barcode: "7290001",
          category: "x",
          weightKg: 1,
          shelfLifeDays: 12,
          storageText: "שמור בקירור",
          packingCode: "",
          origin: "",
          inventoryManaged: true,
        } as PriorityItem,
        new Date(Date.UTC(2026, 9, 29)),
      );
      // The dates are always written day, month, year.
      expect(lineText(line(), values)).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
      expect(lineText(line({ source: "expiryDate" }), values)).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
      expect(lineText(line({ source: "storageText" }), values)).toBe("שמור בקירור");
      expect(lineText(line({ source: "text", text: "אזהרה" }), values)).toBe("אזהרה");
    });
  });

  it("rejects more than 100 elements", () => {
    const many = Array.from({ length: 101 }, (_, i) => ({ ...text, id: `e${i}` }));
    expect(() => layoutSchema.parse({ ...valid, elements: many })).toThrow();
  });
});

describe("sampleValues", () => {
  const item: PriorityItem = {
    itemNumber: "N2015D-S",
    name: "המבורגר בקר קלאסי 150 גר׳",
    nameEn: "Classic beef burger 150 g",
    barcode: "2000000002015",
    category: "קציצות",
    weightKg: 12,
    shelfLifeDays: 12,
    storageText: "לשמור בקירור 0–4°C",
    packingCode: "קרטון",
    origin: "ישראל",
    inventoryManaged: true,
  };
  const today = new Date(Date.UTC(2026, 9, 26));

  it("copies Priority's item fields exactly", () => {
    const values = sampleValues(item, today);
    expect(values.name).toBe(item.name);
    expect(values.itemNumber).toBe("N2015D-S");
    expect(values.itemBarcode).toBe("2000000002015");
    expect(values.storageText).toBe(item.storageText);
    expect(values.weightAvg).toBe("12.00");
  });

  it("makes dates that follow the item's shelf life, and a box barcode that parses back", () => {
    const values = sampleValues(item, today);
    expect(values.productionDate).toBe("26/10/2026");
    expect(values.slaughterDate).toBe("23/10/2026");
    expect(values.expiryDate).toBe("04/11/2026");

    const parsed = parseBoxBarcode(values.boxBarcode);
    expect(parsed?.itemDigits).toBe("2015");
    expect(parsed?.weightKg).toBe(14.02);
    expect(parsed?.running).toBe(2);
  });

  it("leaves the box barcode empty for an item number without 4 or 5 digits", () => {
    expect(sampleValues({ ...item, itemNumber: "AB1" }, today).boxBarcode).toBe("");
  });

  it("makes the text an item label's QR code holds, from the same dates", () => {
    const values = sampleValues(item, today);
    expect(values.qrItemLabel).toBe("NF1|N2015D-S|123456|231026|261026|041126");
    expect(sampleValues({ ...item, itemNumber: "M 1" }, today).qrItemLabel).toBe("");
  });
});

describe("the typefaces of a label", () => {
  it("are the three of the screens and twenty more with Hebrew, each one known to the designer", () => {
    expect(FONTS).toHaveLength(23);
    expect(new Set(FONTS).size).toBe(23);
    for (const font of EXTRA_FONT_KEYS) {
      expect(extraFontFamily(font)).toMatch(/^var\(--font-label-[a-z-]+\), ".+", sans-serif$/);
    }
    expect(extraFontFamily("sans")).toBeNull();
    expect(extraFontFamily("comic")).toBeNull();
  });

  it("are checked when a layout is saved", () => {
    const element = (font: string) => ({
      id: "t",
      type: "text" as const,
      x: 1,
      y: 1,
      w: 10,
      h: 5,
      text: "x",
      style: { ...DEFAULT_STYLE, font },
    });
    const layout = (font: string) => ({
      name: "Fonts",
      widthMm: 50,
      heightMm: 30,
      elements: [element(font)],
    });
    expect(layoutSchema.safeParse(layout("rubik")).success).toBe(true);
    expect(layoutSchema.safeParse(layout("comic")).success).toBe(false);
  });
});
