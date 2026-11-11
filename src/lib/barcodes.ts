/**
 * In-house box barcode (PLAN.md, "Barcode formats"):
 *   running(4) + item digits(4 or 5) + slaughter DDMMYY + expiry DDMMYY + weight(4, kg x 100)
 * Example: 0002 2015 181026 151126 1402 -> 24 digits (25 with a 5-digit item number).
 */

export interface BoxBarcodeFields {
  running: number;
  itemDigits: string;
  slaughterDate: Date;
  expiryDate: Date;
  weightKg: number;
}

export const MAX_BOX_WEIGHT_KG = 99.99;

/** "N2015D-S" -> "3015", "N15234F-C" -> "10234". Priority item numbers carry letters; barcodes hold only the digits. */
export function itemNumberDigits(partname: string): string {
  return partname.replace(/\D/g, "");
}

export function buildBoxBarcode(f: BoxBarcodeFields): string {
  if (!Number.isInteger(f.running) || f.running < 1 || f.running > 9999) {
    throw new RangeError(`running number out of range: ${f.running}`);
  }
  if (!/^\d{4,5}$/.test(f.itemDigits)) {
    throw new RangeError(`item digits must be 4 or 5 digits: ${f.itemDigits}`);
  }
  const weightUnits = Math.round(f.weightKg * 100);
  if (weightUnits < 0 || weightUnits > 9999) {
    throw new RangeError(`weight out of range: ${f.weightKg}`);
  }
  return (
    String(f.running).padStart(4, "0") +
    f.itemDigits +
    toDDMMYY(f.slaughterDate) +
    toDDMMYY(f.expiryDate) +
    String(weightUnits).padStart(4, "0")
  );
}

export interface ParsedBoxBarcode {
  running: number;
  itemDigits: string;
  slaughterDate: Date;
  expiryDate: Date;
  weightKg: number;
}

/** First 4 = running, last 16 = dates and weight, whatever is between = item digits. */
export function parseBoxBarcode(code: string): ParsedBoxBarcode | null {
  if (!/^\d{24,25}$/.test(code)) return null;
  const running = Number(code.slice(0, 4));
  const itemDigits = code.slice(4, -16);
  const tail = code.slice(-16);
  const slaughterDate = fromDDMMYY(tail.slice(0, 6));
  const expiryDate = fromDDMMYY(tail.slice(6, 12));
  if (!slaughterDate || !expiryDate) return null;
  return { running, itemDigits, slaughterDate, expiryDate, weightKg: Number(tail.slice(12)) / 100 };
}

/**
 * Vendor box barcode (PLAN.md, "Vendor barcode"), 30 digits:
 *   38 + last 7 digits of our item barcode + slaughter DDMMYY + expiry DDMMYY + vendor running(5) + net weight(4, kg x 100)
 * Example: 38 0009001 100726 090728 63430 1998
 */
export interface ParsedVendorBarcode {
  /** The 7 digits to match against the end of an item's barcode. */
  itemBarcodeTail: string;
  slaughterDate: Date;
  expiryDate: Date;
  vendorRunning: string;
  weightKg: number;
}

export type VendorBarcodeProblem = "NOT_VENDOR" | "BAD_SHAPE" | "BAD_DATE";

/** The fields of a vendor barcode, or why the scan is not one. Only prefix 38 is accepted. */
export function parseVendorBarcode(
  code: string,
): { ok: true; value: ParsedVendorBarcode } | { ok: false; problem: VendorBarcodeProblem } {
  const text = code.trim();
  if (!text.startsWith("38")) return { ok: false, problem: "NOT_VENDOR" };
  if (!/^\d{30}$/.test(text)) return { ok: false, problem: "BAD_SHAPE" };
  const slaughterDate = fromDDMMYY(text.slice(9, 15));
  const expiryDate = fromDDMMYY(text.slice(15, 21));
  if (!slaughterDate || !expiryDate) return { ok: false, problem: "BAD_DATE" };
  return {
    ok: true,
    value: {
      itemBarcodeTail: text.slice(2, 9),
      slaughterDate,
      expiryDate,
      vendorRunning: text.slice(21, 26),
      weightKg: Number(text.slice(26)) / 100,
    },
  };
}

/**
 * The slaughter date a box's barcode carries (Priority does not store it), as YYYY-MM-DD:
 * from our own box barcode or from a vendor's. Null for any other barcode.
 */
export function slaughterDateOf(barcode: string): string | null {
  const own = parseBoxBarcode(barcode);
  if (own) return toISODate(own.slaughterDate);
  const vendor = parseVendorBarcode(barcode);
  return vendor.ok ? toISODate(vendor.value.slaughterDate) : null;
}

/** Date -> "DDMMYY" using the date's calendar day (UTC fields, see `localDate`). */
export function toDDMMYY(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yy = String(d.getUTCFullYear() % 100).padStart(2, "0");
  return dd + mm + yy;
}

/** "DDMMYY" -> Date at UTC midnight, or null when not a real calendar date. */
export function fromDDMMYY(s: string): Date | null {
  if (!/^\d{6}$/.test(s)) return null;
  const dd = Number(s.slice(0, 2));
  const mm = Number(s.slice(2, 4));
  const yy = Number(s.slice(4, 6));
  const d = new Date(Date.UTC(2000 + yy, mm - 1, dd));
  const valid = d.getUTCDate() === dd && d.getUTCMonth() === mm - 1;
  return valid ? d : null;
}

/** A calendar date with no time of day, stored as UTC midnight so arithmetic is DST-proof. */
export function localDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

/** Date -> "YYYY-MM-DD" (Postgres date columns). */
export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
