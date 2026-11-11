import { formatDate, formatWeight } from "./i18n/format";
import { EMPTY_ORDER_VALUES, type LabelValues } from "./labels/model";

/**
 * Pallets: a summary of boxes that stand together, made so that one scan of one QR code names
 * all of them. A pallet never changes stock; it is only a list of box barcodes.
 */

/** A pallet's QR code holds its number: NFP1|12 (version 1 of the pallet code). */
const PREFIX = "NFP1";

export function buildPalletQr(number: number): string {
  if (!Number.isInteger(number) || number < 1)
    throw new RangeError(`not a pallet number: ${number}`);
  return `${PREFIX}|${number}`;
}

/** The pallet number in a scanned text, or null when the text is not a pallet's QR code. */
export function parsePalletQr(text: string): number | null {
  const match = /^NFP1\|(\d{1,9})$/.exec(text.trim());
  if (!match) return null;
  const number = Number(match[1]);
  return number >= 1 ? number : null;
}

export const MAX_PALLET_BOXES = 500;

/** What the label of a pallet is made from. Dates are YYYY-MM-DD. */
export interface PalletLabelData {
  number: number;
  /** YYYY-MM-DD */
  createdDate: string;
  boxes: { itemName: string; weightKg: number }[];
}

const MAX_CONTENTS_CHARS = 300;

/** "Beef burger × 12, Fresh ground beef × 4": each item with how many boxes of it, the biggest group first. */
export function palletContents(boxes: PalletLabelData["boxes"]): string {
  const counts = new Map<string, number>();
  for (const box of boxes) counts.set(box.itemName, (counts.get(box.itemName) ?? 0) + 1);
  const text = [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "he"))
    .map(([name, count]) => `${name} × ${count}`)
    .join(", ");
  return text.length > MAX_CONTENTS_CHARS ? `${text.slice(0, MAX_CONTENTS_CHARS - 1)}…` : text;
}

/** The values a pallet layout is drawn with; the fields of item and box labels stay empty. */
export function palletLabelValues(pallet: PalletLabelData): LabelValues {
  let grams = 0;
  for (const box of pallet.boxes) grams += Math.round(box.weightKg * 1000);
  return {
    qrItemLabel: "",
    itemNumber: "",
    name: "",
    nameEn: "",
    itemBarcode: "",
    category: "",
    weightAvg: "",
    shelfLife: "",
    storageText: "",
    packingCode: "",
    origin: "",
    slaughterDate: "",
    productionDate: "",
    expiryDate: "",
    weightKg: "",
    certificateNo: "",
    runningNumber: "",
    boxBarcode: "",
    palletNumber: String(pallet.number),
    palletBoxes: String(pallet.boxes.length),
    palletWeight: formatWeight(grams / 1000),
    palletDate: formatDate(pallet.createdDate),
    palletContents: palletContents(pallet.boxes),
    qrPallet: buildPalletQr(pallet.number),
    ...EMPTY_ORDER_VALUES,
  };
}
