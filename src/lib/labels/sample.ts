import { addDays, buildBoxBarcode, itemNumberDigits } from "../barcodes";
import { formatDate, formatWeight } from "../i18n/format";
import type { PriorityItem } from "@/server/priority/types";
import { buildItemLabelQr } from "./codes";
import type { LabelValues } from "./model";
import { sampleOrderValues } from "./shipping";

/**
 * What a label looks like with real-looking data, for the designer's preview and
 * the test print. Item fields come from a real item; the label's own data (dates,
 * weight, certificate number) is made up but follows the real formats.
 */
export function sampleValues(item: PriorityItem, today: Date): LabelValues {
  const slaughter = addDays(today, -3);
  const expiry = addDays(slaughter, item.shelfLifeDays);
  const weightKg = 14.02;
  const digits = itemNumberDigits(item.itemNumber);

  let boxBarcode = "";
  try {
    boxBarcode = buildBoxBarcode({
      running: 2,
      itemDigits: digits,
      slaughterDate: slaughter,
      expiryDate: expiry,
      weightKg,
    });
  } catch {
    // An item number without 4 or 5 digits cannot have a box barcode yet.
  }

  const certificateNo = "123456";
  let qrItemLabel = "";
  try {
    qrItemLabel = buildItemLabelQr({
      itemNumber: item.itemNumber,
      certificateNo,
      slaughterDate: slaughter,
      productionDate: today,
      expiryDate: expiry,
    });
  } catch {
    // An item number with a space or "|" cannot go in the QR text.
  }

  return {
    qrItemLabel,
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
    slaughterDate: formatDate(slaughter),
    productionDate: formatDate(today),
    expiryDate: formatDate(expiry),
    weightKg: formatWeight(weightKg),
    certificateNo,
    runningNumber: "0002",
    boxBarcode,
    // A made-up pallet, so a pallet layout previews with real-looking data.
    palletNumber: "12",
    palletBoxes: "24",
    palletWeight: formatWeight(336.5),
    palletDate: formatDate(today),
    palletContents: `${item.name} × 24`,
    qrPallet: "NFP1|12",
    ...sampleOrderValues(today),
  };
}
