import {
  DEFAULT_STYLE,
  type BoxLine,
  type ElementStyle,
  type LabelElement,
  type LabelType,
} from "./model";

/**
 * The layouts a new installation starts with, so the designer never opens empty.
 * They are ordinary layouts: everything in them can be changed or deleted.
 */

export interface StarterLayout {
  name: string;
  type: LabelType;
  widthMm: number;
  heightMm: number;
  elements: LabelElement[];
}

const style = (overrides: Partial<ElementStyle>): ElementStyle => ({
  ...DEFAULT_STYLE,
  ...overrides,
});

function text(
  id: string,
  [x, y, w, h]: [number, number, number, number],
  value: string,
  overrides: Partial<ElementStyle> = {},
): LabelElement {
  return { id, type: "text", x, y, w, h, text: value, style: style(overrides) };
}

function field(
  id: string,
  [x, y, w, h]: [number, number, number, number],
  key: Extract<LabelElement, { type: "field" }>["field"],
  overrides: Partial<ElementStyle> = {},
): LabelElement {
  return { id, type: "field", x, y, w, h, field: key, style: style(overrides) };
}

export const STARTER_ITEM_LAYOUT: StarterLayout = {
  name: "תווית פריט",
  type: "item",
  widthMm: 100,
  heightMm: 60,
  elements: [
    { id: "frame", type: "box", x: 1, y: 1, w: 98, h: 58, borderMm: 0.4 },
    field("name", [4, 3, 92, 9], "name", {
      fontSize: 18,
      bold: true,
      align: "center",
      dir: "rtl",
      font: "serif",
    }),
    field("nameEn", [4, 12, 92, 5], "nameEn", { fontSize: 10, align: "center", dir: "ltr" }),
    { id: "rule", type: "line", x: 4, y: 19, w: 92, h: 0.3 },
    text("slaughterLabel", [66, 21, 30, 4], "תאריך שחיטה", {
      fontSize: 7,
      dir: "rtl",
      align: "end",
    }),
    field("slaughter", [66, 25, 30, 6], "slaughterDate", {
      fontSize: 11,
      bold: true,
      align: "end",
      dir: "ltr",
    }),
    text("productionLabel", [35, 21, 30, 4], "תאריך ייצור", {
      fontSize: 7,
      dir: "rtl",
      align: "center",
    }),
    field("production", [35, 25, 30, 6], "productionDate", {
      fontSize: 11,
      bold: true,
      align: "center",
      dir: "ltr",
    }),
    text("expiryLabel", [4, 21, 30, 4], "תאריך תפוגה", { fontSize: 7, dir: "rtl", align: "start" }),
    field("expiry", [4, 25, 30, 6], "expiryDate", {
      fontSize: 11,
      bold: true,
      align: "start",
      dir: "ltr",
    }),
    field("storage", [4, 34, 92, 6], "storageText", { fontSize: 10, align: "center", dir: "rtl" }),
    text("certificateLabel", [60, 46, 36, 4], "מספר תעודת יצור", {
      fontSize: 7,
      dir: "rtl",
      align: "end",
    }),
    field("certificate", [60, 50, 36, 6], "certificateNo", {
      fontSize: 11,
      bold: true,
      align: "end",
      dir: "ltr",
      font: "mono",
    }),
    field("itemNumber", [22, 50, 36, 6], "itemNumber", {
      fontSize: 11,
      align: "start",
      dir: "ltr",
      font: "mono",
    }),
    { id: "qr", type: "qr", x: 4, y: 41, w: 15, h: 15, source: "itemLabel" },
  ],
};

export const STARTER_BOX_LAYOUT: StarterLayout = {
  name: "תווית ארגז",
  type: "box",
  widthMm: 100,
  heightMm: 100,
  elements: [
    { id: "frame", type: "box", x: 1, y: 1, w: 98, h: 98, borderMm: 0.5 },
    field("name", [4, 4, 92, 12], "name", {
      fontSize: 20,
      bold: true,
      align: "center",
      dir: "rtl",
      font: "serif",
    }),
    field("itemNumber", [4, 17, 92, 6], "itemNumber", {
      fontSize: 12,
      align: "center",
      dir: "ltr",
      font: "mono",
    }),
    { id: "rule", type: "line", x: 4, y: 25, w: 92, h: 0.3 },
    text("weightLabel", [50, 28, 46, 4], "משקל נטו (ק״ג)", {
      fontSize: 8,
      dir: "rtl",
      align: "end",
    }),
    field("weight", [4, 32, 92, 18], "weightKg", {
      fontSize: 48,
      bold: true,
      align: "end",
      dir: "ltr",
      font: "serif",
    }),
    text("slaughterLabel", [60, 56, 36, 4], "תאריך שחיטה", {
      fontSize: 7,
      dir: "rtl",
      align: "end",
    }),
    field("slaughter", [60, 60, 36, 6], "slaughterDate", {
      fontSize: 12,
      bold: true,
      align: "end",
      dir: "ltr",
    }),
    text("expiryLabel", [4, 56, 36, 4], "תאריך תפוגה", { fontSize: 7, dir: "rtl", align: "start" }),
    field("expiry", [4, 60, 36, 6], "expiryDate", {
      fontSize: 12,
      bold: true,
      align: "start",
      dir: "ltr",
    }),
    field("production", [4, 70, 40, 5], "productionDate", {
      fontSize: 9,
      align: "start",
      dir: "ltr",
    }),
    field("storage", [4, 77, 92, 5], "storageText", { fontSize: 9, align: "center", dir: "rtl" }),
    {
      id: "barcode",
      type: "barcode",
      x: 4,
      y: 84,
      w: 92,
      h: 12,
      field: "boxBarcode",
      showText: true,
    },
  ],
};

/** A5 across the page, so it prints on an ordinary office printer as well as a label printer. */
export const STARTER_PALLET_LAYOUT: StarterLayout = {
  name: "תווית משטח",
  type: "pallet",
  widthMm: 210,
  heightMm: 148,
  elements: [
    { id: "frame", type: "box", x: 3, y: 3, w: 204, h: 142, borderMm: 0.8 },
    { id: "logo", type: "logo", x: 8, y: 8, w: 52, h: 26, variant: "full" },
    text("numberLabel", [70, 9, 128, 8], "משטח מספר", {
      fontSize: 16,
      dir: "rtl",
      align: "end",
    }),
    field("number", [70, 17, 128, 30], "palletNumber", {
      fontSize: 72,
      bold: true,
      align: "end",
      dir: "ltr",
      font: "serif",
    }),
    { id: "rule", type: "line", x: 8, y: 52, w: 194, h: 0.5 },
    { id: "qr", type: "qr", x: 8, y: 58, w: 70, h: 70, source: "pallet" },
    text("boxesLabel", [86, 58, 116, 7], "ארגזים", { fontSize: 14, dir: "rtl", align: "end" }),
    field("boxes", [86, 65, 116, 18], "palletBoxes", {
      fontSize: 44,
      bold: true,
      align: "end",
      dir: "ltr",
    }),
    text("weightLabel", [86, 86, 116, 7], "משקל כולל (ק״ג)", {
      fontSize: 14,
      dir: "rtl",
      align: "end",
    }),
    field("weight", [86, 93, 116, 18], "palletWeight", {
      fontSize: 44,
      bold: true,
      align: "end",
      dir: "ltr",
    }),
    field("contents", [86, 114, 116, 14], "palletContents", {
      fontSize: 12,
      align: "end",
      dir: "rtl",
    }),
    field("date", [8, 132, 90, 8], "palletDate", { fontSize: 14, align: "start", dir: "ltr" }),
  ],
};

/** One line, or several lines, of a frameless lines box. */
function lines(
  id: string,
  [x, y, w, h]: [number, number, number, number],
  rows: [string, BoxLine["source"]][],
  overrides: Partial<ElementStyle> = {},
): LabelElement {
  return {
    id,
    type: "lines",
    x,
    y,
    w,
    h,
    borderMm: 0,
    radiusMm: 0,
    separator: "none",
    lines: rows.map(([label, source]) => ({ label, source, text: "", style: style(overrides) })),
  };
}

/**
 * The premium item label, printed onto ready-printed stock (77 × 245 mm): the logo, the black
 * and red backgrounds and the factory's details are already on the paper, so only the wording,
 * the barcode, the storage text, the origin and the dates are printed, each in its place.
 */
export const STARTER_PREMIUM_ITEM_LAYOUT: StarterLayout = {
  name: "תווית פרימיום (על נייר מודפס)",
  type: "item",
  widthMm: 77,
  heightMm: 245,
  elements: [
    field("name", [18.5, 49, 55.5, 19], "name", {
      fontSize: 18,
      bold: true,
      align: "start",
      dir: "rtl",
    }),
    field("nameEn", [18.5, 91.5, 55.5, 8], "nameEn", { fontSize: 15, align: "center", dir: "ltr" }),
    {
      id: "barcode",
      type: "barcode",
      x: 11.5,
      y: 152,
      w: 54,
      h: 21,
      field: "itemBarcode",
      showText: true,
    },
    lines("storage", [6, 176.5, 65, 18], [["", "storageText"]], {
      fontSize: 9,
      bold: true,
      align: "center",
      dir: "rtl",
    }),
    lines("origin", [19, 199, 39, 5], [["ארץ מקור:", "origin"]], {
      fontSize: 8.5,
      bold: true,
      dir: "rtl",
    }),
    lines(
      "dates",
      [19, 206, 39, 13],
      [
        ["תאריך שחיטה:", "slaughterDate"],
        ["תאריך יצור:", "productionDate"],
        ["לשימוש עד:", "expiryDate"],
      ],
      { fontSize: 8.5, bold: true, dir: "rtl" },
    ),
  ],
};

/**
 * The meat item label, printed onto ready-printed stock (100 × 160 mm): the picture, the brand,
 * the kosher details and the storage text are already on the paper, so only the item name, the
 * barcode, the country of origin and the dates are printed, in the white middle of the label.
 */
export const STARTER_MEAT_ITEM_LAYOUT: StarterLayout = {
  name: "תווית בשר 100×160 (על נייר מודפס)",
  type: "item",
  widthMm: 100,
  heightMm: 160,
  elements: [
    field("name", [6, 44, 88, 20], "name", {
      fontSize: 22,
      bold: true,
      align: "center",
      dir: "rtl",
    }),
    {
      id: "barcode",
      type: "barcode",
      x: 30,
      y: 71,
      w: 40,
      h: 17,
      field: "itemBarcode",
      showText: true,
    },
    lines("origin", [25, 89, 50, 5], [["ארץ מקור:", "origin"]], {
      fontSize: 10,
      align: "center",
      dir: "rtl",
    }),
    lines(
      "dates",
      [28, 95, 44, 14],
      [
        ["תאריך שחיטה:", "slaughterDate"],
        ["תאריך יצור:", "productionDate"],
        ["לשימוש עד:", "expiryDate"],
      ],
      { fontSize: 10, bold: true, dir: "rtl" },
    ),
  ],
};

export const STARTER_LAYOUTS: StarterLayout[] = [STARTER_ITEM_LAYOUT, STARTER_BOX_LAYOUT];

/** 100 x 150 mm, the usual shipping label: the order, the customer and "3 / 10" in large type. */
export const STARTER_SHIPPING_LAYOUT: StarterLayout = {
  name: "תווית משלוח",
  type: "shipping",
  widthMm: 100,
  heightMm: 150,
  elements: [
    { id: "frame", type: "box", x: 1, y: 1, w: 98, h: 148, borderMm: 0.5 },
    { id: "logo", type: "logo", x: 5, y: 5, w: 40, h: 16, variant: "full" },
    field("date", [50, 7, 45, 7], "shipDate", { fontSize: 12, align: "end", dir: "ltr" }),
    { id: "rule1", type: "line", x: 5, y: 24, w: 90, h: 0.4 },
    text("orderLabel", [59, 26, 36, 5], "הזמנה", { fontSize: 9, dir: "rtl", align: "end" }),
    field("order", [5, 31, 90, 12], "orderNumber", {
      fontSize: 26,
      bold: true,
      align: "center",
      dir: "ltr",
    }),
    {
      id: "barcode",
      type: "barcode",
      x: 14,
      y: 44,
      w: 72,
      h: 18,
      field: "orderNumber",
      showText: false,
    },
    { id: "rule2", type: "line", x: 5, y: 65, w: 90, h: 0.4 },
    text("customerLabel", [59, 67, 36, 5], "לקוח", { fontSize: 9, dir: "rtl", align: "end" }),
    field("customer", [5, 72, 90, 12], "customerName", {
      fontSize: 20,
      bold: true,
      align: "end",
      dir: "rtl",
    }),
    field("address", [5, 86, 90, 8], "address", { fontSize: 14, align: "end", dir: "rtl" }),
    field("city", [5, 95, 90, 8], "city", { fontSize: 14, bold: true, align: "end", dir: "rtl" }),
    field("phone", [5, 104, 90, 7], "phone", { fontSize: 12, align: "end", dir: "ltr" }),
    field("notes", [5, 113, 90, 13], "orderNotes", { fontSize: 10, align: "end", dir: "rtl" }),
    { id: "rule3", type: "line", x: 5, y: 128, w: 90, h: 0.4 },
    field("count", [5, 131, 90, 16], "labelOf", {
      fontSize: 30,
      bold: true,
      align: "center",
      dir: "ltr",
      font: "serif",
    }),
  ],
};
