import { addDays } from "../barcodes";
import { formatDate, formatWeight } from "../i18n/format";
import type { PriorityItem } from "@/server/priority/types";
import { buildItemLabelQr } from "./codes";
import { EMPTY_ORDER_VALUES, type LabelValues } from "./model";

/**
 * Printing an item label (catalog): what the person types, the rules for it, and the
 * values the layout is drawn with. Shared by the print window and the server, which
 * checks everything again before anything is printed.
 */

export const MAX_COPIES = 500;
export const MAX_CERTIFICATE_CHARS = 30;
export const MAX_ORIGIN_CHARS = 40;
/** Printing several items together: at most this many items, and this many labels in all. */
export const MAX_BATCH_ITEMS = 50;
export const MAX_BATCH_LABELS = 1000;

/** What is typed in the print window. Dates are YYYY-MM-DD, as a date input gives them. */
export interface ItemLabelInput {
  slaughterDate: string;
  productionDate: string;
  certificateNo: string;
  copies: number;
  /** The country of origin typed for this print; empty uses the item's own (if Priority has one). */
  origin?: string;
}

export type ItemLabelProblem =
  | "SLAUGHTER_DATE"
  | "PRODUCTION_DATE"
  | "DATES_ORDER"
  | "CERTIFICATE"
  | "COPIES"
  | "ORIGIN"
  | "ORIGIN_MISSING";

/** "2026-10-23" to that day at UTC midnight, or null when it is not a real calendar date. */
export function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  const real =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return real ? date : null;
}

/**
 * Everything wrong with the input, empty when it can be printed. When printing item labels the
 * country of origin must be filled in (originRequired); reading a label at receiving has none.
 */
export function checkItemLabelInput(
  input: ItemLabelInput,
  { originRequired = false }: { originRequired?: boolean } = {},
): ItemLabelProblem[] {
  const problems: ItemLabelProblem[] = [];
  const slaughter = parseIsoDate(input.slaughterDate);
  const production = parseIsoDate(input.productionDate);
  if (!slaughter) problems.push("SLAUGHTER_DATE");
  if (!production) problems.push("PRODUCTION_DATE");
  if (slaughter && production && production < slaughter) problems.push("DATES_ORDER");
  // The certificate goes into the QR text: one word, without the separator.
  const certificate = input.certificateNo.trim();
  if (
    certificate.length === 0 ||
    certificate.length > MAX_CERTIFICATE_CHARS ||
    !/^[^|\s]+$/.test(certificate)
  ) {
    problems.push("CERTIFICATE");
  }
  if (!Number.isInteger(input.copies) || input.copies < 1 || input.copies > MAX_COPIES) {
    problems.push("COPIES");
  }
  const origin = (input.origin ?? "").trim();
  if (originRequired && origin.length === 0) problems.push("ORIGIN_MISSING");
  else if (origin.length > MAX_ORIGIN_CHARS) problems.push("ORIGIN");
  return problems;
}

/** The slaughter, production and expiry dates; the expiry is the slaughter date plus the item's shelf life. */
export function itemLabelDates(
  item: PriorityItem,
  input: Pick<ItemLabelInput, "slaughterDate" | "productionDate">,
): { slaughter: Date; production: Date; expiry: Date } | null {
  const slaughter = parseIsoDate(input.slaughterDate);
  const production = parseIsoDate(input.productionDate);
  if (!slaughter || !production) return null;
  return { slaughter, production, expiry: addDays(slaughter, item.shelfLifeDays) };
}

/**
 * What a layout is drawn with for this item label. Priority's item fields are copied
 * exactly; the label's own fields that an item label does not have (weight, running
 * number, box barcode) are empty. Throws RangeError for input that does not pass
 * `checkItemLabelInput`.
 */
export function itemLabelValues(item: PriorityItem, input: ItemLabelInput): LabelValues {
  const problems = checkItemLabelInput(input);
  if (problems.length > 0)
    throw new RangeError(`item label input is not valid: ${problems.join(", ")}`);
  const { slaughter, production, expiry } = itemLabelDates(item, input)!;
  const certificateNo = input.certificateNo.trim();

  return {
    qrItemLabel: buildItemLabelQr({
      itemNumber: item.itemNumber,
      certificateNo,
      slaughterDate: slaughter,
      productionDate: production,
      expiryDate: expiry,
    }),
    itemNumber: item.itemNumber,
    name: item.name,
    nameEn: item.nameEn,
    itemBarcode: item.barcode,
    category: item.category,
    weightAvg: item.weightKg === null ? "" : formatWeight(item.weightKg),
    shelfLife: String(item.shelfLifeDays),
    storageText: item.storageText,
    packingCode: item.packingCode,
    origin: input.origin?.trim() || item.origin,
    slaughterDate: formatDate(slaughter),
    productionDate: formatDate(production),
    expiryDate: formatDate(expiry),
    weightKg: "",
    certificateNo,
    runningNumber: "",
    boxBarcode: "",
    palletNumber: "",
    palletBoxes: "",
    palletWeight: "",
    palletDate: "",
    palletContents: "",
    qrPallet: "",
    ...EMPTY_ORDER_VALUES,
  };
}
