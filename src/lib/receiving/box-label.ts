import { formatDate, formatWeight } from "../i18n/format";
import { EMPTY_ORDER_VALUES, type LabelValues } from "../labels/model";
import type { PriorityItem } from "@/server/priority/types";

/** What a received box is, as far as its label is concerned (dates are YYYY-MM-DD). */
export interface BoxLabelData {
  barcode: string;
  running: string;
  weightKg: number;
  slaughterDate: string;
  productionDate: string | null;
  expiryDate: string;
  certificateNo: string | null;
}

/**
 * The values the one box layout is drawn with: Priority's item fields exactly as they are,
 * and the box's own weight, dates, certificate, running number and barcode. The item label's
 * QR is empty (a box label carries the box barcode instead).
 */
export function boxLabelValues(item: PriorityItem, box: BoxLabelData): LabelValues {
  return {
    qrItemLabel: "",
    itemNumber: item.itemNumber,
    name: item.name,
    nameEn: item.nameEn,
    itemBarcode: item.barcode,
    category: item.category,
    weightAvg: item.weightKg === null ? "" : formatWeight(item.weightKg),
    shelfLife: String(item.shelfLifeDays),
    storageText: item.storageText,
    packingCode: item.packingCode,
    origin: item.origin,
    slaughterDate: formatDate(box.slaughterDate),
    productionDate: box.productionDate ? formatDate(box.productionDate) : "",
    expiryDate: formatDate(box.expiryDate),
    weightKg: formatWeight(box.weightKg),
    certificateNo: box.certificateNo ?? "",
    runningNumber: box.running,
    boxBarcode: box.barcode,
    palletNumber: "",
    palletBoxes: "",
    palletWeight: "",
    palletDate: "",
    palletContents: "",
    qrPallet: "",
    ...EMPTY_ORDER_VALUES,
  };
}
