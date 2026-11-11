import type { Db } from "../db/connection";
import { getCooldown, startCooldown, startsCooldown } from "./cooldown";
import { readSetting } from "../settings";
import { OdataError, OdataHttp } from "./odata";
import { postReceiptLine } from "./write";
import { getPriorityConnection, readPriorityCredentials } from "./settings";
import {
  PriorityError,
  type PriorityClient,
  type PriorityItem,
  type PriorityOrder,
  type PriorityStockBox,
  type PriorityWarehouse,
  type ReceiveBoxInput,
} from "./types";

const PAGE = 500;
/** The statuses of a receipt document that is still open for boxes (a draft, or to be done). */
const OPEN_STATUSES = ["טיוטא", "טיוטה", "לביצוע"];
/** How much of a box's barcode the stock list keeps. */
const LOT_LENGTH = 16;
const MAX_PAGES = 100;
/** Pages ask Priority only this often; the factory's own program uses the same API. */
const KEEP_MS = 60_000;
/** An answer older than KEEP_MS but younger than this is still shown while a new one is fetched. */
const STALE_MS = 30 * 60_000;

type Row = Record<string, unknown>;

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const number = (value: unknown): number => (typeof value === "number" ? value : 0);
/** "2026-10-22T00:00:00Z" becomes "2026-10-22". */
const day = (value: unknown): string => text(value).slice(0, 10);

/**
 * Reads items, warehouses and stock from the real Priority (read only). Orders and writing boxes
 * are not live yet: orders come from the stand-in, and a write is refused so a box is never
 * pretended to be sent. Never retries a refusal by itself: after one, Priority is left alone.
 */
export class LiveReadPriorityClient implements PriorityClient {
  private readonly kept = new Map<string, { at: number; rows: Promise<Row[]> }>();
  private readonly refreshing = new Map<string, Promise<Row[]>>();

  constructor(
    private readonly db: Db,
    private readonly secret: () => string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async ask(
    form: string,
    select: string,
    filter?: string,
    expand?: string,
  ): Promise<Row[]> {
    const key = `${form}|${select}|${filter ?? ""}|${expand ?? ""}`;
    const hit = this.kept.get(key);
    const age = hit ? Date.now() - hit.at : Infinity;
    if (hit && age < KEEP_MS) return hit.rows;
    // An older answer is shown at once while a fresh one is fetched for the next page.
    if (hit && age < STALE_MS) {
      void this.refresh(key, form, select, filter, expand).catch(() => {});
      return hit.rows;
    }
    return this.refresh(key, form, select, filter, expand);
  }

  private async refresh(
    key: string,
    form: string,
    select: string,
    filter?: string,
    expand?: string,
  ): Promise<Row[]> {
    const pending = this.refreshing.get(key);
    if (pending) return pending;
    const rows = this.fetchAll(form, select, filter, expand);
    const run = rows.then(
      (value) => {
        this.kept.set(key, { at: Date.now(), rows });
        this.refreshing.delete(key);
        return value;
      },
      (error) => {
        this.refreshing.delete(key);
        throw error;
      },
    );
    this.refreshing.set(key, run);
    return run;
  }

  private async fetchAll(
    form: string,
    select: string,
    filter?: string,
    expand?: string,
  ): Promise<Row[]> {
    const credentials = readPriorityCredentials(
      await getPriorityConnection(this.db),
      this.secret(),
    );
    if (!credentials) throw new PriorityError("UNAVAILABLE");
    if (await getCooldown(this.db)) throw new PriorityError("AUTH_FAILED");
    const http = new OdataHttp(credentials, this.fetchImpl);
    const all: Row[] = [];
    try {
      for (let page = 0; page < MAX_PAGES; page++) {
        const query: Record<string, string> = {
          $select: select,
          $top: String(PAGE),
          $skip: String(page * PAGE),
        };
        if (filter) query.$filter = filter;
        if (expand) query.$expand = expand;
        const data = await http.get<{ value?: Row[] }>(form, query);
        const rows = Array.isArray(data.value) ? data.value : [];
        all.push(...rows);
        if (rows.length < PAGE) break;
      }
    } catch (error) {
      if (error instanceof OdataError) {
        if (startsCooldown(error.code)) await startCooldown(this.db, error.code);
        throw new PriorityError(error.code);
      }
      throw error;
    }
    return all;
  }

  async getItems(): Promise<PriorityItem[]> {
    const rows = await this.ask(
      "LOGPART",
      "PARTNAME,PARTDES,EPARTDES,BARCODE,FAMILYDES,PRIZ_WKARTON,PRIZ_LABTEXT,STATDES,INVFLAG",
    );
    return rows
      .filter((row) => text(row.PARTNAME) && text(row.STATDES) === "פעיל")
      .map((row) => ({
        itemNumber: text(row.PARTNAME),
        name: text(row.PARTDES),
        nameEn: text(row.EPARTDES),
        barcode: text(row.BARCODE),
        category: text(row.FAMILYDES),
        weightKg: number(row.PRIZ_WKARTON) > 0 ? number(row.PRIZ_WKARTON) : null,
        // The dates of a box come from its order; no shelf-life days are kept on the item.
        shelfLifeDays: 0,
        storageText: text(row.PRIZ_LABTEXT),
        packingCode: "",
        origin: "",
        inventoryManaged: text(row.INVFLAG) === "Y",
      }))
      .sort((a, b) => a.itemNumber.localeCompare(b.itemNumber));
  }

  /**
   * The form WAREHOUSES is not open to the API, so the rooms are gathered from the screens that
   * name them: stock lines (even empty ones) and receipt documents, which also carry the room's
   * description. A room that has never had stock or a document cannot be seen this way.
   */
  async getWarehouses(): Promise<PriorityWarehouse[]> {
    const [everyLine, documents] = await Promise.all([
      this.ask("PARTBAL", "WARHSNAME"),
      this.ask("DOCUMENTS_H", "WARHSNAME,WARHSDES"),
    ]);
    const names = new Map<string, string>();
    for (const row of documents) {
      const code = text(row.WARHSNAME);
      if (code && !names.get(code)) names.set(code, text(row.WARHSDES));
    }
    for (const row of everyLine) {
      const code = text(row.WARHSNAME);
      if (code && !names.has(code)) names.set(code, "");
    }
    return [...names.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, description]) => ({ code, name: description || code }));
  }

  private stockRows(): Promise<Row[]> {
    return this.ask(
      "PARTBAL",
      "ACTNAME,PARTNAME,PARTDES,WARHSNAME,BALANCE,TOPP_EXPIRYDATE,LASTDATE",
      "BALANCE gt 0",
    );
  }

  /**
   * The stock list keeps only the first 16 characters of a box's barcode, so every box of one
   * lot looks the same there. The full barcode is on the goods receipt line (TOPALLETNAME). A
   * stock line is matched to its receipt line by item, lot prefix and weight; boxes that match
   * the same way are interchangeable, so each takes the next unused barcode.
   */
  private async fullBarcodes(): Promise<Map<string, string[]>> {
    const found = new Map<string, string[]>();
    let documents: Row[];
    try {
      documents = await this.ask(
        "DOCUMENTS_H",
        "DOCNO",
        undefined,
        "TRANSORDER_H_SUBFORM($select=PARTNAME,TQUANT,TOPALLETNAME,TOACTNAME)",
      );
    } catch (error) {
      // Without the receipt lines the short number is still better than no stock at all.
      if (error instanceof PriorityError && error.code !== "AUTH_FAILED") {
        console.warn(`[priority] the receipt lines could not be read (${error.code})`);
        return found;
      }
      throw error;
    }
    for (const document of documents) {
      const lines = document.TRANSORDER_H_SUBFORM;
      if (!Array.isArray(lines)) continue;
      for (const line of lines as Row[]) {
        const full = text(line.TOPALLETNAME) || text(line.TOACTNAME);
        const part = text(line.PARTNAME);
        if (!full || !part) continue;
        const key = `${part}|${number(line.TQUANT).toFixed(2)}|${full.slice(0, LOT_LENGTH)}`;
        found.set(key, [...(found.get(key) ?? []), full]);
      }
    }
    return found;
  }

  async getStockBoxes(): Promise<PriorityStockBox[]> {
    const [rows, full] = await Promise.all([this.stockRows(), this.fullBarcodes()]);
    console.log(`[priority] ${full.size} receipt line groups read for ${rows.length} stock lines`);
    const unused = new Map([...full].map(([key, barcodes]) => [key, [...barcodes]]));
    return rows
      .filter((row) => text(row.ACTNAME) && text(row.PARTNAME))
      .map((row) => ({
        barcode:
          unused
            .get(
              `${text(row.PARTNAME)}|${number(row.BALANCE).toFixed(2)}|${text(row.ACTNAME).slice(0, LOT_LENGTH)}`,
            )
            ?.shift() ?? text(row.ACTNAME),
        itemNumber: text(row.PARTNAME),
        itemName: text(row.PARTDES),
        itemNameEn: "",
        warehouseCode: text(row.WARHSNAME),
        weightKg: number(row.BALANCE),
        expiryDate: day(row.TOPP_EXPIRYDATE),
        enteredDate: day(row.LASTDATE),
      }));
  }

  /**
   * The open receipt documents in Priority: the ones still a draft or waiting to be done. A box is
   * recorded under the document whose number is the certificate number on its item label, in that
   * document's storage room. The vendor document is the one chosen in the settings.
   */
  async getOrders(): Promise<PriorityOrder[]> {
    const [rows, vendor] = await Promise.all([
      this.ask("DOCUMENTS_H", "DOCNO,CURDATE,WARHSNAME,ASSCODESTATUS"),
      readSetting<string>(this.db, "receiving.vendorOrder"),
    ]);
    return rows
      .filter((row) => text(row.DOCNO))
      .map((row) => ({
        docno: text(row.DOCNO),
        kind:
          text(row.DOCNO) === (vendor?.value ?? "") ? ("vendor" as const) : ("production" as const),
        itemNumber: null,
        date: day(row.CURDATE),
        status: OPEN_STATUSES.includes(text(row.ASSCODESTATUS)) ? "open" : text(row.ASSCODESTATUS),
        warehouseCode: text(row.WARHSNAME) || undefined,
      }))
      .sort((a, b) => b.date.localeCompare(a.date) || b.docno.localeCompare(a.docno));
  }

  async receiveBox(input: ReceiveBoxInput): Promise<void> {
    // Writing into the real Priority is switched on on purpose (PRIORITY_WRITE=on), after a test.
    // Until then the box waits and goes by itself once writing is on.
    if (process.env.PRIORITY_WRITE !== "on") throw new PriorityError("WRITE_NOT_OPEN");
    const credentials = readPriorityCredentials(
      await getPriorityConnection(this.db),
      this.secret(),
    );
    if (!credentials) throw new PriorityError("UNAVAILABLE");
    const http = new OdataHttp(credentials, this.fetchImpl);
    await postReceiptLine(http, input);
  }
}
