import { formatDate } from "../i18n/format";
import { EMPTY_ORDER_VALUES, FIELD_KEYS, type LabelValues } from "./model";

/**
 * Shipping labels. After an order is picked and confirmed in Priority, Priority sends the order's
 * details to this system; the details become labels to put on the order's boxes ("3 / 10").
 * Nothing here picks or counts goods: it only reads what Priority sent and prints it.
 */

/** What is kept of an order Priority sent. */
export interface ShippingOrder {
  orderNumber: string;
  customerName: string;
  customerNumber: string;
  address: string;
  city: string;
  phone: string;
  /** DD/MM/YYYY when it could be read as a date, otherwise the text as sent. */
  shipDate: string;
  notes: string;
  /** How many labels Priority asked for (for example the number of cartons); null when it did not say. */
  labelCount: number | null;
}

export const MAX_LABELS = 200;

/** A pallet's number is printed on several labels (one for each side of the pallet). */
export const DEFAULT_PALLET_COPIES = 4;
export const MAX_PALLET_COPIES = 10;
/** The most labels one print may make (boxes or pallets times the labels of each). */
export const MAX_PRINT_LABELS = 1000;

/** Labels for each box or pallet: one for a box, `palletCopies` for a pallet. */
export function copiesFor(unit: "box" | "pallet", palletCopies: number): number {
  return unit === "pallet" ? palletCopies : 1;
}

export function isValidPrint(total: number, copies: number): boolean {
  return (
    Number.isInteger(total) &&
    total >= 1 &&
    total <= MAX_LABELS &&
    Number.isInteger(copies) &&
    copies >= 1 &&
    copies <= MAX_PALLET_COPIES &&
    total * copies <= MAX_PRINT_LABELS
  );
}

const MAX_TEXT = 200;
const MAX_NOTES = 500;

/**
 * The names Priority (or anything else) may send each detail under, written without spaces,
 * underscores or capitals. Priority's own column names are here too: ORDNAME is the order number,
 * CUSTNAME the customer number and CDES the customer's name.
 */
export const ORDER_ALIASES = {
  orderNumber: [
    "ordname",
    "ordernumber",
    "orderno",
    "ordernum",
    "orderid",
    "order",
    "ordno",
    "docno",
    "ordnumber",
    "מספרהזמנה",
    "הזמנה",
  ],
  customerName: [
    "cdes",
    "custdes",
    "customername",
    "customerdes",
    "customer",
    "clientname",
    "client",
    "name",
    "שםלקוח",
    "לקוח",
  ],
  customerNumber: [
    "custname",
    "customernumber",
    "customerno",
    "customercode",
    "customerid",
    "custno",
    "custnumber",
    "clientnumber",
    "מספרלקוח",
  ],
  address: [
    "address",
    "address1",
    "addr",
    "street",
    "shiptoaddress",
    "deliveryaddress",
    "כתובת",
    "רחוב",
  ],
  city: ["city", "town", "state", "statename", "shiptocity", "deliverycity", "עיר", "ישוב"],
  phone: ["phone", "tel", "telephone", "mobile", "cellphone", "phonenum", "phonenumber", "טלפון"],
  shipDate: [
    "shipdate",
    "curdate",
    "duedate",
    "deliverydate",
    "supplydate",
    "supplydate",
    "date",
    "תאריך",
    "תאריךאספקה",
  ],
  notes: ["notes", "note", "remarks", "remark", "details", "comments", "comment", "הערות"],
  labelCount: [
    "labels",
    "labelcount",
    "numlabels",
    "numberoflabels",
    "copies",
    "boxes",
    "cartons",
    "packages",
    "packagecount",
    "מספרמדבקות",
    "מספרארגזים",
  ],
} as const;

/** Names written the same way for comparison: lower case, letters and digits only. */
export function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

const SECOND_ADDRESS = ["address2", "addr2"];

/** Every plain value of what was sent, with its name; objects inside are searched too. */
function flatten(input: unknown, found: Map<string, string>, depth = 0): void {
  if (depth > 4 || input === null || input === undefined) return;
  if (Array.isArray(input)) {
    // Priority sends a list of one order; the first is the one.
    if (input.length > 0) flatten(input[0], found, depth + 1);
    return;
  }
  if (typeof input !== "object") return;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      const name = normalizeKey(key);
      const text = String(value).trim();
      if (name && text && !found.has(name)) found.set(name, text);
    } else {
      flatten(value, found, depth + 1);
    }
  }
}

function pick(found: Map<string, string>, names: readonly string[]): string {
  for (const name of names) {
    const value = found.get(name);
    if (value) return value;
  }
  return "";
}

/** 2026-11-09 or 2026-11-09T00:00:00+02:00 becomes 09/11/2026; anything else is kept as sent. */
export function readShipDate(text: string): string {
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/.exec(text);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const dots = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(text);
  if (dots) return `${dots[1].padStart(2, "0")}/${dots[2].padStart(2, "0")}/${dots[3]}`;
  return text;
}

export type ParsedOrder = { ok: true; order: ShippingOrder } | { ok: false };

/**
 * Reads the order out of whatever Priority sent (JSON, form fields or the address line), whatever
 * it calls the details. Fails only when there is no order number.
 */
export function parseOrderPayload(input: unknown): ParsedOrder {
  const found = new Map<string, string>();
  flatten(input, found);

  const orderNumber = pick(found, ORDER_ALIASES.orderNumber).slice(0, 60);
  if (!orderNumber) return { ok: false };

  const secondLine = pick(found, SECOND_ADDRESS);
  const address = [pick(found, ORDER_ALIASES.address), secondLine].filter(Boolean).join(", ");
  const asked = Number.parseInt(pick(found, ORDER_ALIASES.labelCount), 10);

  return {
    ok: true,
    order: {
      orderNumber,
      customerName: pick(found, ORDER_ALIASES.customerName).slice(0, MAX_TEXT),
      customerNumber: pick(found, ORDER_ALIASES.customerNumber).slice(0, 60),
      address: address.slice(0, MAX_TEXT),
      city: pick(found, ORDER_ALIASES.city).slice(0, MAX_TEXT),
      phone: pick(found, ORDER_ALIASES.phone).slice(0, 60),
      shipDate: readShipDate(pick(found, ORDER_ALIASES.shipDate)).slice(0, 40),
      notes: pick(found, ORDER_ALIASES.notes).slice(0, MAX_NOTES),
      labelCount: Number.isInteger(asked) && asked >= 1 ? Math.min(asked, MAX_LABELS) : null,
    },
  };
}

/** What the labels of an order are for: one per box, or one per pallet. */
export const SHIPPING_UNITS = ["box", "pallet"] as const;
export type ShippingUnit = (typeof SHIPPING_UNITS)[number];

export function isShippingUnit(value: unknown): value is ShippingUnit {
  return value === "box" || value === "pallet";
}

type Language = "he" | "en";

const WORDS: Record<Language, { box: string; pallet: string; of: string }> = {
  he: { box: "ארגז", pallet: "משטח", of: "מתוך" },
  en: { box: "Box", pallet: "Pallet", of: "of" },
};

/** The word on the label: "Box" or "Pallet" (in Hebrew, "ארגז" or "משטח"). */
export function unitWord(unit: ShippingUnit, language: Language): string {
  return WORDS[language][unit];
}

/** "Box 3 of 10", "Pallet 1 of 4" (in Hebrew, "ארגז 3 מתוך 10"). */
export function labelOf(
  number: number,
  total: number,
  unit: ShippingUnit = "box",
  language: Language = "en",
): string {
  const words = WORDS[language];
  return `${words[unit]} ${number} ${words.of} ${total}`;
}

function blankValues(): LabelValues {
  const values = { qrItemLabel: "", qrPallet: "" } as LabelValues;
  for (const key of FIELD_KEYS) values[key] = "";
  return values;
}

/** The values a shipping layout is drawn with for one label of a set. */
export function shippingLabelValues(
  order: ShippingOrder,
  number: number,
  total: number,
  unit: ShippingUnit = "box",
  language: Language = "en",
): LabelValues {
  return {
    ...blankValues(),
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    customerNumber: order.customerNumber,
    address: order.address,
    city: order.city,
    phone: order.phone,
    shipDate: order.shipDate,
    orderNotes: order.notes,
    labelNumber: String(number),
    labelCount: String(total),
    labelOf: labelOf(number, total, unit, language),
    unitName: unitWord(unit, language),
  };
}

/**
 * Every label of a set, in print order: Box 1 of total, Box 2 of total, and so on. With `copies`
 * more than one (the labels of a pallet), each number is printed that many times in a row:
 * Pallet 1 of 10 four times, then Pallet 2 of 10 four times.
 */
export function shippingLabelPages(
  order: ShippingOrder,
  total: number,
  unit: ShippingUnit = "box",
  language: Language = "en",
  copies = 1,
): LabelValues[] {
  return Array.from({ length: total }, (_, index) =>
    Array.from({ length: copies }, () =>
      shippingLabelValues(order, index + 1, total, unit, language),
    ),
  ).flat();
}

/** A made-up order, for the designer's preview and the test order. */
export function sampleOrder(today: Date): ShippingOrder {
  return {
    orderNumber: "SO26000123",
    customerName: "מרכול הגליל בע״מ",
    customerNumber: "C1042",
    address: "הרצל 15",
    city: "טבריה",
    phone: "04-6712345",
    shipDate: formatDate(today),
    notes: "לשמור בקירור. לפרוק בדלת האחורית.",
    // No number of labels of its own: the print window starts from 1 (the default).
    labelCount: null,
  };
}

export function sampleOrderValues(today: Date): Record<keyof typeof EMPTY_ORDER_VALUES, string> {
  const values = shippingLabelValues(sampleOrder(today), 1, 10);
  const result = { ...EMPTY_ORDER_VALUES };
  for (const key of Object.keys(result) as (keyof typeof result)[]) result[key] = values[key];
  return result;
}
