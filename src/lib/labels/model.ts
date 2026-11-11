import { z } from "zod";
import { EXTRA_FONT_KEYS } from "./fonts";

/**
 * A label layout: a size in millimetres and a list of elements placed on it, all
 * positions in millimetres from the top-left corner of the label. The label is a
 * physical object, so its coordinates do not mirror in right-to-left screens.
 */

export const LABEL_TYPES = ["item", "box", "pallet", "shipping"] as const;
export type LabelType = (typeof LABEL_TYPES)[number];

/** Fields from Priority's item record (read only, shown exactly as Priority has them). */
export const ITEM_FIELDS = [
  "itemNumber",
  "name",
  "nameEn",
  "itemBarcode",
  "category",
  "weightAvg",
  "shelfLife",
  "storageText",
  "packingCode",
  "origin",
] as const;

/** The label's own data: filled in when a label is printed. */
export const LABEL_FIELDS = [
  "slaughterDate",
  "productionDate",
  "expiryDate",
  "weightKg",
  "certificateNo",
  "runningNumber",
  "boxBarcode",
  // A pallet label's own data (see src/lib/pallets.ts).
  "palletNumber",
  "palletBoxes",
  "palletWeight",
  "palletDate",
  "palletContents",
] as const;

/** A shipping label's own data: the order Priority sent, and which label of the set this is. */
export const ORDER_FIELDS = [
  "orderNumber",
  "customerName",
  "customerNumber",
  "address",
  "city",
  "phone",
  "shipDate",
  "orderNotes",
  "labelNumber",
  "labelCount",
  "labelOf",
  "unitName",
] as const;

/** The order fields, all empty: what every label that is not a shipping label is drawn with. */
export const EMPTY_ORDER_VALUES: Record<(typeof ORDER_FIELDS)[number], string> = {
  orderNumber: "",
  customerName: "",
  customerNumber: "",
  address: "",
  city: "",
  phone: "",
  shipDate: "",
  orderNotes: "",
  labelNumber: "",
  labelCount: "",
  labelOf: "",
  unitName: "",
};

export const FIELD_KEYS = [...ITEM_FIELDS, ...LABEL_FIELDS, ...ORDER_FIELDS] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];

/** The three typefaces of the screens, then the Hebrew-capable ones added for labels (fonts.ts). */
export const FONTS = ["sans", "serif", "mono", ...EXTRA_FONT_KEYS] as const;
export const ALIGNS = ["start", "center", "end"] as const;
/** The language of a text: right to left, left to right, or decided by its own letters. */
export const DIRECTIONS = ["auto", "rtl", "ltr"] as const;

export const MIN_LABEL_MM = 10;
export const MAX_LABEL_MM = 300;
/** Smallest size a layout may hold (a thin line); dragging stops at half a millimetre. */
export const MIN_ELEMENT_MM = 0.2;
export const MAX_ELEMENTS = 100;

const mm = z.number().finite().min(-MAX_LABEL_MM).max(MAX_LABEL_MM);
const size = z.number().finite().min(MIN_ELEMENT_MM).max(MAX_LABEL_MM);

export const styleSchema = z.object({
  /** Points (1 pt = 0.3528 mm). */
  fontSize: z.number().finite().min(4).max(120),
  bold: z.boolean(),
  font: z.enum(FONTS),
  align: z.enum(ALIGNS),
  dir: z.enum(DIRECTIONS),
});
export type ElementStyle = z.infer<typeof styleSchema>;

const base = {
  id: z.string().min(1).max(64),
  x: mm,
  y: mm,
  w: size,
  h: size,
};

/**
 * What a QR code holds: the whole item label (see codes.ts), the box or item barcode digits, or
 * a pallet's code (see src/lib/pallets.ts).
 */
export const QR_SOURCES = ["itemLabel", "boxBarcode", "itemBarcode", "pallet"] as const;
export type QrSource = (typeof QR_SOURCES)[number];

/** Which form of the company logo: the full dark logo, or the small mark. */
export const LOGO_VARIANTS = ["full", "mark"] as const;
export type LogoVariant = (typeof LOGO_VARIANTS)[number];

/** How the lines of a lines box are told apart. */
export const LINE_SEPARATORS = ["none", "dotted", "solid"] as const;
export type LineSeparator = (typeof LINE_SEPARATORS)[number];

/** What a line of a lines box shows: one of the label's fields, or a text typed in the designer. */
export const LINE_SOURCES = [...FIELD_KEYS, "text"] as const;
export type LineSource = (typeof LINE_SOURCES)[number];

export const MAX_BOX_LINES = 12;

/** One line of a lines box: the words before the value, the value, and how the line is written. */
export const boxLineSchema = z.object({
  /** The words before the value ("Slaughter date:"); empty for the value alone. */
  label: z.string().max(100),
  source: z.enum(LINE_SOURCES),
  /** The value when `source` is "text". */
  text: z.string().max(500),
  style: styleSchema,
});
export type BoxLine = z.infer<typeof boxLineSchema>;

/**
 * What a layout is drawn with: the preview values of every field, and the text an
 * item label's QR code holds. A real print fills the same shape with real data.
 */
export type LabelValues = Record<FieldKey, string> & { qrItemLabel: string; qrPallet: string };

export const elementSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("text"), text: z.string().max(500), style: styleSchema }),
  z.object({ ...base, type: z.literal("field"), field: z.enum(FIELD_KEYS), style: styleSchema }),
  /** A Code 128 barcode of a field's text, optionally with the text printed under the bars. */
  z.object({
    ...base,
    type: z.literal("barcode"),
    field: z.enum(FIELD_KEYS),
    showText: z.boolean(),
  }),
  z.object({ ...base, type: z.literal("qr"), source: z.enum(QR_SOURCES) }),
  z.object({ ...base, type: z.literal("logo"), variant: z.enum(LOGO_VARIANTS) }),
  /** A solid bar; its height is the thickness. */
  z.object({ ...base, type: z.literal("line") }),
  /**
   * One frame holding several lines, each a label and a value (for example the three dates). The
   * lines share the height of the frame equally; the frame, its rounded corners and the line
   * between the lines are set here, and every line has its own typeface, size and language.
   */
  z.object({
    ...base,
    type: z.literal("lines"),
    /** 0 draws no frame. */
    borderMm: z.number().finite().min(0).max(5),
    radiusMm: z.number().finite().min(0).max(20),
    separator: z.enum(LINE_SEPARATORS),
    lines: z.array(boxLineSchema).min(1).max(MAX_BOX_LINES),
  }),
  /** An empty rectangle with a border of `borderMm`. */
  z.object({
    ...base,
    type: z.literal("box"),
    borderMm: z.number().finite().min(0.1).max(5),
  }),
]);
export type LabelElement = z.infer<typeof elementSchema>;
export type ElementType = LabelElement["type"];

export const layoutNameSchema = z.string().trim().min(1).max(80);

export const layoutSchema = z.object({
  name: layoutNameSchema,
  widthMm: z.number().finite().min(MIN_LABEL_MM).max(MAX_LABEL_MM),
  heightMm: z.number().finite().min(MIN_LABEL_MM).max(MAX_LABEL_MM),
  elements: z.array(elementSchema).max(MAX_ELEMENTS),
});
export type LayoutContent = z.infer<typeof layoutSchema>;

export const DEFAULT_STYLE: ElementStyle = {
  fontSize: 10,
  bold: false,
  font: "sans",
  align: "start",
  dir: "auto",
};

/** What a line of a lines box shows, from the label's values. */
export function lineText(line: BoxLine, values: LabelValues): string {
  return line.source === "text" ? line.text : values[line.source];
}

export function newElementId(): string {
  return crypto.randomUUID().slice(0, 8);
}
