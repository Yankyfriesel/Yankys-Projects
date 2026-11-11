import { OdataError, type OdataHttp } from "./odata";
import { PriorityError, type ReceiveBoxInput } from "./types";

const DOCNO = /^[A-Za-z0-9._-]{1,40}$/;
const BARCODE = /^[A-Za-z0-9._-]{1,60}$/;

/** The line of one box, the way the current program writes it. */
function lineOf(input: ReceiveBoxInput) {
  return {
    PARTNAME: input.itemNumber,
    // The weight is the quantity put into the box. The composed quantity stays zero, otherwise
    // Priority asks for component issues. The taken-in quantity is left out: Priority fills it
    // itself, and naming it makes Priority look for a lot that already exists.
    TQUANT: input.weightKg,
    PQUANT: 0,
    PTQUANT: 0,
    // Only the box (pallet) name: Priority creates the lot itself. Naming the lot too makes it
    // look for one that already exists.
    TOPALLETNAME: input.barcode,
    TOPP_EXPIRYDATE: `${input.expiryDate}T00:00:00Z`,
  };
}

const linesOf = (docno: string) => `DOCUMENTS_H(DOCNO='${docno}',TYPE='H')/TRANSORDER_H_SUBFORM`;

/** True when the document already holds a line for this box. */
async function lineExists(http: OdataHttp, docno: string, barcode: string): Promise<boolean> {
  const found = await http.get<{ value?: unknown[] }>(linesOf(docno), {
    $select: "KLINE",
    $filter: `TOPALLETNAME eq '${barcode}'`,
  });
  return (found.value?.length ?? 0) > 0;
}

/**
 * Adds one box as a line to a receipt document in Priority, the way the current program does:
 * the box barcode (as the pallet), the item, the weight and the expiry date, under the document's
 * number. Priority creates the lot itself, and answers with a complaint about the "composed
 * quantity" even though it saved the line, so the answer alone is not trusted: the document is
 * asked whether the line is there. A box already in the document is never added twice.
 * Throws PriorityError; the words Priority gave are in OdataError.detail.
 */
export async function postReceiptLine(http: OdataHttp, input: ReceiveBoxInput): Promise<void> {
  if (!DOCNO.test(input.docno)) throw new PriorityError("UNKNOWN_ORDER");
  if (!BARCODE.test(input.barcode)) throw new PriorityError("BAD_REQUEST");
  if (await lineExists(http, input.docno, input.barcode)) return;
  try {
    await http.post(linesOf(input.docno), lineOf(input));
  } catch (error) {
    if (!(error instanceof OdataError)) throw error;
    // No permission to write: the box waits instead of failing.
    if (error.status === 403) throw new PriorityError("WRITE_NOT_OPEN");
    // Priority complained but kept the line: that is a box received.
    if (error.status !== null && (await lineExists(http, input.docno, input.barcode))) return;
    const words = error.detail;
    if (/מק.?ט|PARTNAME/.test(words)) throw new PriorityError("UNKNOWN_ITEM");
    if (/כבר קיים|already exists|duplicate/i.test(words)) throw new PriorityError("DUPLICATE_BOX");
    throw error;
  }
}
