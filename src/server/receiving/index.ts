import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { todayListStart } from "../../lib/receiving/today";
import {
  MAX_BOX_WEIGHT_KG,
  buildBoxBarcode,
  itemNumberDigits,
  parseVendorBarcode,
  toISODate,
} from "../../lib/barcodes";
import { logFor, type Actor } from "../activity-log";
import type { Db } from "../db/connection";
import { boxCounters, boxes, prioritySends } from "../db/schema";
import {
  PriorityError,
  type PriorityClient,
  type PriorityItem,
  type PriorityOrder,
} from "../priority/types";
import { getTare, netWeight } from "../packaging";
import { readSetting, writeSetting } from "../settings";

/**
 * Receiving (phase 4): a box is saved here first, with its barcode and running number,
 * then sent to Priority from a queue. If Priority is slow or down the box is still
 * saved (and its label can print); the send retries on its own.
 */

export type ReceivingErrorCode =
  | "INVALID_WEIGHT"
  | "INVALID_DATES"
  | "UNKNOWN_ITEM"
  | "UNKNOWN_WAREHOUSE"
  | "UNKNOWN_ORDER"
  | "INVALID_ORDER"
  | "NO_ORDER"
  | "RUNNING_EXHAUSTED"
  | "NOT_VENDOR"
  | "BAD_VENDOR_BARCODE"
  | "ITEM_NOT_FOUND"
  | "AMBIGUOUS_ITEM"
  | "ALREADY_RECEIVED"
  | "PRIORITY_UNAVAILABLE";

export class ReceivingError extends Error {
  constructor(
    public readonly code: ReceivingErrorCode,
    /** For ALREADY_RECEIVED: when and by whom the barcode was received. */
    public readonly existing?: { receivedAt: Date; receivedBy: string },
  ) {
    super(code);
    this.name = "ReceivingError";
  }
}

export const DEFAULT_WAREHOUSE = "Main";
/** After this many failed tries (about a day of retrying) a send is marked failed for an admin. */
export const MAX_SEND_ATTEMPTS = 20;

// ---------------------------------------------------------------------------
// Settings the screens depend on
// ---------------------------------------------------------------------------

const CATEGORY_WAREHOUSES_KEY = "receiving.categoryWarehouses";
const VENDOR_ORDER_KEY = "receiving.vendorOrder";

/** Priority's category text to the warehouse code its boxes go into. */
export async function getCategoryWarehouses(db: Db): Promise<Record<string, string>> {
  return (await readSetting<Record<string, string>>(db, CATEGORY_WAREHOUSES_KEY))?.value ?? {};
}

/** The one order all vendor boxes go under; null until the owner picks it. */
export async function getVendorOrder(db: Db): Promise<string | null> {
  return (await readSetting<string>(db, VENDOR_ORDER_KEY))?.value || null;
}

/** Chooses (or with null clears) the warehouse a category's boxes go into. Checked against Priority. */
export async function setCategoryWarehouse(
  db: Db,
  priority: PriorityClient,
  category: string,
  warehouseCode: string | null,
  actor: Actor,
): Promise<void> {
  if (warehouseCode !== null) {
    const warehouses = await priority.getWarehouses();
    if (!warehouses.some((w) => w.code === warehouseCode))
      throw new ReceivingError("UNKNOWN_WAREHOUSE");
  }
  const current = await getCategoryWarehouses(db);
  const next = { ...current };
  if (warehouseCode === null) delete next[category];
  else next[category] = warehouseCode;
  await writeSetting(db, CATEGORY_WAREHOUSES_KEY, next, actor.id);
  await logFor(
    actor,
    "settings.categoryWarehouseChanged",
    {
      entityType: "settings",
      entityId: CATEGORY_WAREHOUSES_KEY,
      details: { category, from: current[category] ?? null, to: warehouseCode },
    },
    db,
  );
}

/** What an order number may be made of: letters, digits, dots, dashes and underscores. */
const ORDER_NUMBER = /^[A-Za-z0-9._-]{1,40}$/;

/**
 * Chooses (or with null clears) the order vendor boxes go under. It can be any order number: the
 * owner may want a different order later, one Priority does not offer in a list yet. The answer says
 * whether Priority lists the number right now (null: not asked, or Priority did not answer); a
 * number it does not list is still saved, and the boxes wait in the send queue until it exists.
 */
export async function setVendorOrder(
  db: Db,
  priority: PriorityClient,
  docno: string | null,
  actor: Actor,
): Promise<{ listed: boolean | null }> {
  const number = docno === null ? null : docno.trim();
  let listed: boolean | null = null;
  if (number !== null) {
    if (!ORDER_NUMBER.test(number)) throw new ReceivingError("INVALID_ORDER");
    try {
      listed = (await priority.getOrders()).some((o) => o.docno === number);
    } catch {
      listed = null;
    }
  }
  const current = await getVendorOrder(db);
  await writeSetting(db, VENDOR_ORDER_KEY, number ?? "", actor.id);
  await logFor(
    actor,
    "settings.vendorOrderChanged",
    { entityType: "settings", entityId: VENDOR_ORDER_KEY, details: { from: current, to: number } },
    db,
  );
  return { listed };
}

// ---------------------------------------------------------------------------
// The catalog, with a saved copy for when Priority does not answer
// ---------------------------------------------------------------------------

const SNAPSHOT_KEY = "receiving.catalogSnapshot";
/** The saved copy is refreshed at most this often. */
const SNAPSHOT_EVERY_MS = 10 * 60_000;

interface CatalogSnapshot {
  items: PriorityItem[];
  orders: PriorityOrder[];
  savedAt: string;
}

export interface Catalog {
  items: PriorityItem[];
  orders: PriorityOrder[];
  /** True when Priority did not answer and the last saved copy is used. */
  saved: boolean;
}

/**
 * Items and orders from Priority. Every good read refreshes a saved copy; when Priority
 * is unreachable that copy is used instead, so boxes can still be weighed, saved and
 * labelled (the send to Priority retries later). Without a saved copy there is nothing to
 * go on and PRIORITY_UNAVAILABLE is thrown.
 */
export async function readCatalog(db: Db, priority: PriorityClient): Promise<Catalog> {
  try {
    const [items, orders] = await Promise.all([priority.getItems(), priority.getOrders()]);
    const snapshot = await readSetting<CatalogSnapshot>(db, SNAPSHOT_KEY);
    const age = snapshot ? Date.now() - new Date(snapshot.value.savedAt).getTime() : Infinity;
    if (age > SNAPSHOT_EVERY_MS) {
      const copy: CatalogSnapshot = { items, orders, savedAt: new Date().toISOString() };
      await writeSetting(db, SNAPSHOT_KEY, copy, null);
    }
    return { items, orders, saved: false };
  } catch (error) {
    if (!(error instanceof PriorityError && error.code === "UNAVAILABLE")) throw error;
    const snapshot = await readSetting<CatalogSnapshot>(db, SNAPSHOT_KEY);
    if (!snapshot) throw new ReceivingError("PRIORITY_UNAVAILABLE");
    return { items: snapshot.value.items, orders: snapshot.value.orders, saved: true };
  }
}

// ---------------------------------------------------------------------------
// Receiving a box
// ---------------------------------------------------------------------------

export interface ReceivedBox {
  /** The item as Priority (or the saved copy) described it, for the label. */
  item: PriorityItem;
  id: string;
  barcode: string;
  itemNumber: string;
  itemName: string;
  running: string;
  weightKg: number;
  slaughterDate: string;
  productionDate: string | null;
  expiryDate: string;
  certificateNo: string | null;
  docno: string;
  warehouseCode: string;
  /** Whether Priority has the box yet; "pending" means the send is queued and will retry; "failed" needs an admin. */
  sent: "sent" | "pending" | "failed";
}

function checkWeight(weightKg: number): void {
  const units = Math.round(weightKg * 100);
  if (!Number.isFinite(weightKg) || units < 1 || units > Math.round(MAX_BOX_WEIGHT_KG * 100))
    throw new ReceivingError("INVALID_WEIGHT");
}

function isUniqueViolation(error: unknown): boolean {
  // Drizzle wraps the driver error; the Postgres code is on the error or its cause.
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

async function alreadyReceived(db: Db, barcode: string): Promise<ReceivingError | null> {
  const [row] = await db
    .select({ at: boxes.receivedAt, by: boxes.receivedByDisplay })
    .from(boxes)
    .where(eq(boxes.barcode, barcode))
    .limit(1);
  return row
    ? new ReceivingError("ALREADY_RECEIVED", { receivedAt: row.at, receivedBy: row.by })
    : null;
}

async function warehouseFor(db: Db, item: PriorityItem): Promise<string> {
  return (await getCategoryWarehouses(db))[item.category] || DEFAULT_WAREHOUSE;
}

export interface InHouseBoxInput {
  itemNumber: string;
  certificateNo: string;
  slaughterDate: Date;
  productionDate: Date;
  expiryDate: Date;
  /** What the scale showed: the box with its packing. The weight kept is this less the packing. */
  weightKg: number;
}

/**
 * A box packed in-house: gets the next running number for its item, its 24 or 25 digit
 * barcode, and goes under the item's latest open production order.
 */
export async function receiveInHouseBox(
  db: Db,
  priority: PriorityClient,
  input: InHouseBoxInput,
  actor: Actor,
): Promise<ReceivedBox> {
  if (!Number.isFinite(input.weightKg) || input.weightKg <= 0)
    throw new ReceivingError("INVALID_WEIGHT");
  if (input.expiryDate < input.slaughterDate || input.productionDate < input.slaughterDate)
    throw new ReceivingError("INVALID_DATES");

  const { items, orders } = await readCatalog(db, priority);
  const item = items.find((i) => i.itemNumber === input.itemNumber);
  if (!item) throw new ReceivingError("UNKNOWN_ITEM");
  // The scale shows the box with its bag and carton: what is kept is the goods alone.
  const tare = await getTare(db, item.itemNumber);
  const weightKg = netWeight(input.weightKg, tare.totalKg);
  if (weightKg === null) throw new ReceivingError("INVALID_WEIGHT");
  checkWeight(weightKg);
  // The certificate number on the item label is the number of the open order the box goes under;
  // without a match, the item's latest open order (the practice data names an item per order).
  const order =
    orders.find(
      (o) =>
        o.kind === "production" && o.status === "open" && o.docno === input.certificateNo.trim(),
    ) ??
    orders.find(
      (o) => o.kind === "production" && o.itemNumber === item.itemNumber && o.status === "open",
    );
  if (!order) throw new ReceivingError("NO_ORDER");
  // The order's own storage room when Priority names one, else the item category's.
  const warehouseCode = order.warehouseCode || (await warehouseFor(db, item));
  const itemDigits = itemNumberDigits(item.itemNumber);

  const box = await db.transaction(async (tx) => {
    const [counter] = await tx
      .insert(boxCounters)
      .values({ itemDigits, last: 1 })
      .onConflictDoUpdate({
        target: boxCounters.itemDigits,
        set: { last: sql`${boxCounters.last} + 1` },
      })
      .returning({ last: boxCounters.last });
    if (counter.last > 9999) throw new ReceivingError("RUNNING_EXHAUSTED");

    const barcode = buildBoxBarcode({
      running: counter.last,
      itemDigits,
      slaughterDate: input.slaughterDate,
      expiryDate: input.expiryDate,
      weightKg,
    });
    const [row] = await tx
      .insert(boxes)
      .values({
        barcode,
        source: "production",
        itemNumber: item.itemNumber,
        running: String(counter.last).padStart(4, "0"),
        slaughterDate: toISODate(input.slaughterDate),
        productionDate: toISODate(input.productionDate),
        expiryDate: toISODate(input.expiryDate),
        certificateNo: input.certificateNo,
        weightKg,
        docno: order.docno,
        warehouseCode,
        receivedBy: actor.id,
        receivedByDisplay: actor.display,
      })
      .returning();
    await tx.insert(prioritySends).values({ boxId: row.id, nextAttemptAt: firstTryAfter() });
    return row;
  });

  await logFor(
    actor,
    "receiving.boxReceived",
    {
      entityType: "box",
      entityId: box.barcode,
      details: {
        source: "production",
        item: item.itemNumber,
        weightKg: box.weightKg,
        ...(tare.totalKg > 0 ? { scaleKg: input.weightKg, packagingKg: tare.totalKg } : {}),
        docno: box.docno,
      },
    },
    db,
  );
  const sent = await sendBox(db, priority, box.id);
  return toReceived(box, item, sent);
}

/**
 * A box bought from the vendor, stocked as is. The vendor's barcode is the box barcode;
 * one already received is refused for good, with when and by whom.
 */
export async function receiveVendorBox(
  db: Db,
  priority: PriorityClient,
  scanned: string,
  actor: Actor,
): Promise<ReceivedBox> {
  const parsed = parseVendorBarcode(scanned);
  if (!parsed.ok)
    throw new ReceivingError(parsed.problem === "NOT_VENDOR" ? "NOT_VENDOR" : "BAD_VENDOR_BARCODE");
  const vendor = parsed.value;
  const barcode = scanned.trim();
  checkWeight(vendor.weightKg);
  if (vendor.expiryDate < vendor.slaughterDate) throw new ReceivingError("INVALID_DATES");

  const known = await alreadyReceived(db, barcode);
  if (known) throw known;

  const { items, orders } = await readCatalog(db, priority);
  const matches = items.filter((i) => i.barcode.endsWith(vendor.itemBarcodeTail));
  if (matches.length === 0) throw new ReceivingError("ITEM_NOT_FOUND");
  if (matches.length > 1) throw new ReceivingError("AMBIGUOUS_ITEM");
  const item = matches[0];

  // The owner's choice in settings; until one is made, the vendor order Priority has (if only one).
  let docno = await getVendorOrder(db);
  if (!docno) {
    const vendorOrders = orders.filter((o) => o.kind === "vendor");
    docno = vendorOrders.length === 1 ? vendorOrders[0].docno : null;
  }
  if (!docno) throw new ReceivingError("NO_ORDER");
  const warehouseCode = await warehouseFor(db, item);

  let box;
  try {
    box = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(boxes)
        .values({
          barcode,
          source: "vendor",
          itemNumber: item.itemNumber,
          running: vendor.vendorRunning,
          slaughterDate: toISODate(vendor.slaughterDate),
          expiryDate: toISODate(vendor.expiryDate),
          weightKg: vendor.weightKg,
          docno,
          warehouseCode,
          receivedBy: actor.id,
          receivedByDisplay: actor.display,
        })
        .returning();
      await tx.insert(prioritySends).values({ boxId: row.id, nextAttemptAt: firstTryAfter() });
      return row;
    });
  } catch (error) {
    // Two scans at the same moment: the second hits the unique barcode.
    if (isUniqueViolation(error)) {
      const raced = await alreadyReceived(db, barcode);
      if (raced) throw raced;
    }
    throw error;
  }

  await logFor(
    actor,
    "receiving.boxReceived",
    {
      entityType: "box",
      entityId: box.barcode,
      details: { source: "vendor", item: item.itemNumber, weightKg: box.weightKg, docno },
    },
    db,
  );
  const sent = await sendBox(db, priority, box.id);
  return toReceived(box, item, sent);
}

function toReceived(
  box: typeof boxes.$inferSelect,
  item: PriorityItem,
  sent: "sent" | "pending" | "failed",
): ReceivedBox {
  return {
    item,
    id: box.id,
    barcode: box.barcode,
    itemNumber: box.itemNumber,
    itemName: item.name,
    running: box.running,
    weightKg: box.weightKg,
    slaughterDate: box.slaughterDate,
    productionDate: box.productionDate,
    expiryDate: box.expiryDate,
    certificateNo: box.certificateNo,
    docno: box.docno,
    warehouseCode: box.warehouseCode,
    sent,
  };
}

// ---------------------------------------------------------------------------
// Today's list
// ---------------------------------------------------------------------------

export interface TodayBox {
  id: string;
  barcode: string;
  source: "production" | "vendor";
  itemNumber: string;
  running: string;
  weightKg: number;
  /** YYYY-MM-DD */
  slaughterDate: string;
  /** YYYY-MM-DD */
  expiryDate: string;
  receivedAt: Date;
  receivedBy: string;
  sent: "sent" | "pending" | "failed";
}

/**
 * The boxes received since the list last started over at 21:00, newest first. It is a view
 * of the box records the system keeps anyway, the same for every user and computer.
 */
export async function listTodayBoxes(
  db: Db,
  source: "production" | "vendor",
  now: Date = new Date(),
): Promise<TodayBox[]> {
  const rows = await db
    .select({
      id: boxes.id,
      barcode: boxes.barcode,
      source: boxes.source,
      itemNumber: boxes.itemNumber,
      running: boxes.running,
      weightKg: boxes.weightKg,
      slaughterDate: boxes.slaughterDate,
      expiryDate: boxes.expiryDate,
      receivedAt: boxes.receivedAt,
      receivedBy: boxes.receivedByDisplay,
      sent: prioritySends.status,
    })
    .from(boxes)
    .innerJoin(prioritySends, eq(prioritySends.boxId, boxes.id))
    .where(and(gte(boxes.receivedAt, todayListStart(now)), eq(boxes.source, source)))
    .orderBy(desc(boxes.receivedAt))
    .limit(500);
  return rows;
}

// ---------------------------------------------------------------------------
// The send queue
// ---------------------------------------------------------------------------

/**
 * A new box is sent at once by the request that saved it; the background timer only picks it
 * up if that did not happen within this time, so the two never send the same box together.
 */
export const FIRST_TRY_GRACE_MS = 60_000;
/** How long a send that the timer picked up is left alone, in case it is still on its way. */
export const CLAIM_MS = 2 * 60_000;

function firstTryAfter(): Date {
  return new Date(Date.now() + FIRST_TRY_GRACE_MS);
}

/** How often a box waiting for Priority to open writing is tried again. */
export const WRITE_CLOSED_RETRY_MS = 5 * 60_000;

/** Wait before the next try: 30 s, 1 min, 2 min ... at most 15 minutes. */
export function retryDelayMs(attempts: number): number {
  return Math.min(30_000 * 2 ** Math.max(0, attempts - 1), 15 * 60_000);
}

/**
 * Sends one queued box to Priority. Returns "sent" when Priority has it, "pending" when it
 * could not be reached (it will retry), and "failed" when Priority refused it for good.
 */
export async function sendBox(
  db: Db,
  priority: PriorityClient,
  boxId: string,
  now: Date = new Date(),
): Promise<"sent" | "pending" | "failed"> {
  const [row] = await db
    .select({ send: prioritySends, box: boxes })
    .from(prioritySends)
    .innerJoin(boxes, eq(boxes.id, prioritySends.boxId))
    .where(eq(prioritySends.boxId, boxId))
    .limit(1);
  if (!row) return "failed";
  if (row.send.status === "sent") return "sent";
  if (row.send.status === "failed") return "failed";

  try {
    await priority.receiveBox({
      source: row.box.source,
      docno: row.box.docno,
      barcode: row.box.barcode,
      itemNumber: row.box.itemNumber,
      weightKg: row.box.weightKg,
      expiryDate: row.box.expiryDate,
      warehouseCode: row.box.warehouseCode,
    });
    await db
      .update(prioritySends)
      .set({ status: "sent", attempts: row.send.attempts + 1, lastError: null, sentAt: now })
      .where(eq(prioritySends.id, row.send.id));
    return "sent";
  } catch (error) {
    const code = error instanceof PriorityError ? error.code : "ERROR";
    // Priority already has this box: an earlier send got through but was not recorded here.
    if (code === "DUPLICATE_BOX") {
      await db
        .update(prioritySends)
        .set({
          status: "sent",
          attempts: row.send.attempts + 1,
          lastError: "DUPLICATE_BOX",
          sentAt: now,
        })
        .where(eq(prioritySends.id, row.send.id));
      return "sent";
    }
    // Writing to Priority is not open yet: the box simply waits, without counting as a failed try.
    if (code === "WRITE_NOT_OPEN") {
      await db
        .update(prioritySends)
        .set({
          status: "pending",
          lastError: code,
          nextAttemptAt: new Date(now.getTime() + WRITE_CLOSED_RETRY_MS),
        })
        .where(eq(prioritySends.id, row.send.id));
      return "pending";
    }
    const attempts = row.send.attempts + 1;
    // Only "cannot reach Priority" is worth retrying; anything else needs a person.
    const retry = code === "UNAVAILABLE" && attempts < MAX_SEND_ATTEMPTS;
    await db
      .update(prioritySends)
      .set({
        status: retry ? "pending" : "failed",
        attempts,
        lastError: code,
        nextAttemptAt: new Date(now.getTime() + retryDelayMs(attempts)),
      })
      .where(eq(prioritySends.id, row.send.id));
    return retry ? "pending" : "failed";
  }
}

/** Tries every queued send that is due. Safe to call often; returns how many were sent. */
export async function sendDue(
  db: Db,
  priority: PriorityClient,
  now: Date = new Date(),
  limit = 50,
): Promise<number> {
  const candidates = await db
    .select({ id: prioritySends.id })
    .from(prioritySends)
    .where(and(eq(prioritySends.status, "pending"), lte(prioritySends.nextAttemptAt, now)))
    .orderBy(asc(prioritySends.id))
    .limit(limit);
  if (candidates.length === 0) return 0;
  // Claim them first: a send that another process took in the meantime is no longer due.
  const due = await db
    .update(prioritySends)
    .set({ nextAttemptAt: new Date(now.getTime() + CLAIM_MS) })
    .where(
      and(
        inArray(
          prioritySends.id,
          candidates.map((c) => c.id),
        ),
        eq(prioritySends.status, "pending"),
        lte(prioritySends.nextAttemptAt, now),
      ),
    )
    .returning({ boxId: prioritySends.boxId });
  let sent = 0;
  for (const { boxId } of due) {
    if ((await sendBox(db, priority, boxId, now)) === "sent") sent += 1;
  }
  return sent;
}

export interface UnsentBox {
  id: number;
  barcode: string;
  source: "production" | "vendor";
  itemNumber: string;
  weightKg: number;
  docno: string;
  warehouseCode: string;
  receivedAt: Date;
  receivedBy: string;
  status: "pending" | "failed";
  attempts: number;
  lastError: string | null;
  nextAttemptAt: Date;
}

/** Boxes Priority does not have yet: the ones still retrying, and the ones that need a person. */
export async function listUnsent(db: Db): Promise<UnsentBox[]> {
  const rows = await db
    .select({
      id: prioritySends.id,
      barcode: boxes.barcode,
      source: boxes.source,
      itemNumber: boxes.itemNumber,
      weightKg: boxes.weightKg,
      docno: boxes.docno,
      warehouseCode: boxes.warehouseCode,
      receivedAt: boxes.receivedAt,
      receivedBy: boxes.receivedByDisplay,
      status: prioritySends.status,
      attempts: prioritySends.attempts,
      lastError: prioritySends.lastError,
      nextAttemptAt: prioritySends.nextAttemptAt,
    })
    .from(prioritySends)
    .innerJoin(boxes, eq(boxes.id, prioritySends.boxId))
    .where(inArray(prioritySends.status, ["pending", "failed"]))
    .orderBy(desc(prioritySends.status), asc(boxes.receivedAt))
    .limit(500);
  return rows.filter((r): r is typeof r & { status: "pending" | "failed" } => r.status !== "sent");
}

/** Puts failed sends back in the queue, for an admin who has fixed what was wrong. */
export async function retryFailed(db: Db, ids: number[], actor: Actor): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = await db
    .update(prioritySends)
    .set({ status: "pending", attempts: 0, nextAttemptAt: new Date() })
    .where(and(inArray(prioritySends.id, ids), eq(prioritySends.status, "failed")))
    .returning({ id: prioritySends.id });
  await logFor(actor, "receiving.sendRetried", { details: { count: rows.length } }, db);
  return rows.length;
}
