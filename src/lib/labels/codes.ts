// The browser build is plain JavaScript (no canvas or DOM needed for SVG), so it also runs on the server.
import { toSVG } from "bwip-js/browser";
import { fromDDMMYY, toDDMMYY } from "../barcodes";

/**
 * Barcodes and QR codes as SVG, and the text an item label's QR code holds.
 * Everything here is pure: the same text always gives the same picture.
 */

const MAX_BARCODE_CHARS = 80;
const MAX_QR_CHARS = 500;
const PRINTABLE_ASCII = /^[\x20-\x7e]+$/;

/** Makes the picture fill its box: bars stretch, a QR code stays square. */
function fitted(svg: string, aspect: "none" | "xMidYMid meet"): string {
  return svg.replace("<svg ", `<svg width="100%" height="100%" preserveAspectRatio="${aspect}" `);
}

/** A Code 128 barcode, or null when the text cannot be one (empty, too long, not plain ASCII). */
export function barcodeSvg(text: string, showText: boolean): string | null {
  if (text.length === 0 || text.length > MAX_BARCODE_CHARS || !PRINTABLE_ASCII.test(text))
    return null;
  try {
    const svg = toSVG({
      bcid: "code128",
      text,
      includetext: showText,
      textxalign: "center",
      textsize: 9,
      textgaps: 1,
      height: 12,
      paddingwidth: 0,
      paddingheight: 0,
    });
    return fitted(svg, "none");
  } catch {
    return null;
  }
}

/** A QR code, or null for empty or very long text. */
export function qrSvg(text: string): string | null {
  if (text.length === 0 || text.length > MAX_QR_CHARS) return null;
  try {
    // `eclevel` (error correction: L, M, Q or H) is a valid option the library's types leave out.
    const options = Object.assign(
      { bcid: "qrcode", text, paddingwidth: 0, paddingheight: 0 },
      { eclevel: "M" },
    );
    return fitted(toSVG(options), "xMidYMid meet");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The QR code on an item label
// ---------------------------------------------------------------------------

/**
 * What the QR code on an item label holds, so that receiving can fill in the item,
 * the production certificate and the dates by one scan. A fresh format (nothing is
 * carried over from the old system), versioned so it can grow:
 *
 *   NF1|<item number>|<certificate number>|<slaughter DDMMYY>|<production DDMMYY>|<expiry DDMMYY>
 *
 * Example: NF1|N2015D-S|123456|231026|261026|041126
 */
export interface ItemLabelQr {
  itemNumber: string;
  certificateNo: string;
  slaughterDate: Date;
  productionDate: Date;
  expiryDate: Date;
}

const QR_PREFIX = "NF1";
const QR_FIELD = /^[^|\s]+$/;

export function buildItemLabelQr(f: ItemLabelQr): string {
  for (const [name, value] of [
    ["item number", f.itemNumber],
    ["certificate number", f.certificateNo],
  ] as const) {
    if (!QR_FIELD.test(value))
      throw new RangeError(`${name} must be one word without "|": "${value}"`);
  }
  return [
    QR_PREFIX,
    f.itemNumber,
    f.certificateNo,
    toDDMMYY(f.slaughterDate),
    toDDMMYY(f.productionDate),
    toDDMMYY(f.expiryDate),
  ].join("|");
}

/** The fields of an item label's QR text, or null when the text is not one. */
export function parseItemLabelQr(text: string): ItemLabelQr | null {
  const parts = text.trim().split("|");
  if (parts.length !== 6 || parts[0] !== QR_PREFIX) return null;
  const [, itemNumber, certificateNo, slaughter, production, expiry] = parts;
  if (!QR_FIELD.test(itemNumber) || !QR_FIELD.test(certificateNo)) return null;
  const slaughterDate = fromDDMMYY(slaughter);
  const productionDate = fromDDMMYY(production);
  const expiryDate = fromDDMMYY(expiry);
  if (!slaughterDate || !productionDate || !expiryDate) return null;
  return { itemNumber, certificateNo, slaughterDate, productionDate, expiryDate };
}
