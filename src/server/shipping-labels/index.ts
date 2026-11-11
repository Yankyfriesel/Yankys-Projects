import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { count, desc, eq, ilike, max, or, sql } from "drizzle-orm";
import {
  DEFAULT_PALLET_COPIES,
  isShippingUnit,
  MAX_PALLET_COPIES,
  MAX_LABELS,
  sampleOrder,
  type ShippingOrder,
  type ShippingUnit,
} from "../../lib/labels/shipping";
import { logFor, SYSTEM_ACTOR, type Actor } from "../activity-log";
import type { Db } from "../db/connection";
import { settings, shippingOrders } from "../db/schema";
import { getLayout, listLayoutsOfType, type LabelLayout } from "../labels";
import { readSetting, writeSetting } from "../settings";

/**
 * Shipping labels. Priority sends an order here once it is picked and confirmed there; the order
 * is kept, and its labels are printed from the Shipping labels screen. This system never picks,
 * counts or changes anything in Priority.
 */

export type ShippingErrorCode = "NOT_FOUND" | "INVALID_COUNT" | "INVALID_COPIES" | "INVALID_LAYOUT";

export class ShippingError extends Error {
  constructor(public readonly code: ShippingErrorCode) {
    super(code);
    this.name = "ShippingError";
  }
}

export type ShippingRow = typeof shippingOrders.$inferSelect;

// ---------------------------------------------------------------------------
// The secret in the address Priority calls
// ---------------------------------------------------------------------------

const TOKEN_KEY = "shippingLabels.token";

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

/** The secret part of the address. Made the first time it is needed. */
export async function getShippingToken(db: Db): Promise<string> {
  const stored = await readSetting<string>(db, TOKEN_KEY);
  if (stored?.value) return stored.value;
  // Two requests at the same moment must end up with the same secret.
  await db.insert(settings).values({ key: TOKEN_KEY, value: newToken() }).onConflictDoNothing();
  const again = await readSetting<string>(db, TOKEN_KEY);
  if (!again?.value) throw new Error("could not make the shipping labels key");
  return again.value;
}

/** Replaces the secret: the address Priority has stops working until Priority is given the new one. */
export async function regenerateShippingToken(db: Db, actor: Actor): Promise<string> {
  const token = newToken();
  await writeSetting(db, TOKEN_KEY, token, actor.id);
  await logFor(
    actor,
    "settings.shippingKeyChanged",
    { entityType: "settings", entityId: TOKEN_KEY },
    db,
  );
  return token;
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Whether `given` is the secret of the address (compared in constant time). */
export async function tokenMatches(db: Db, given: string): Promise<boolean> {
  const real = await getShippingToken(db);
  return timingSafeEqual(digest(given), digest(real));
}

// ---------------------------------------------------------------------------
// Settings: how many labels by default, and which layout
// ---------------------------------------------------------------------------

const COUNT_KEY = "shippingLabels.defaultCount";
const LAYOUT_KEY = "shippingLabels.layout";
const UNIT_KEY = "shippingLabels.defaultUnit";
const PALLET_COPIES_KEY = "shippingLabels.palletCopies";

export interface ShippingSettings {
  defaultCount: number;
  /** What the labels are for when printing starts: boxes or pallets. */
  defaultUnit: ShippingUnit;
  /** How many labels each pallet number gets. */
  palletCopies: number;
  /** The chosen shipping layout, or "" for the oldest one. */
  layoutId: string;
}

export async function getShippingSettings(db: Db): Promise<ShippingSettings> {
  const [count, layout, unit, copies] = await Promise.all([
    readSetting<number>(db, COUNT_KEY),
    readSetting<string>(db, LAYOUT_KEY),
    readSetting<string>(db, UNIT_KEY),
    readSetting<number>(db, PALLET_COPIES_KEY),
  ]);
  const c = Number(copies?.value);
  const n = Number(count?.value);
  return {
    defaultCount: Number.isInteger(n) && n >= 1 && n <= MAX_LABELS ? n : 1,
    layoutId: layout?.value ?? "",
    defaultUnit: isShippingUnit(unit?.value) ? unit.value : "box",
    palletCopies:
      Number.isInteger(c) && c >= 1 && c <= MAX_PALLET_COPIES ? c : DEFAULT_PALLET_COPIES,
  };
}

export async function saveShippingSettings(
  db: Db,
  input: ShippingSettings,
  actor: Actor,
): Promise<void> {
  if (
    !Number.isInteger(input.defaultCount) ||
    input.defaultCount < 1 ||
    input.defaultCount > MAX_LABELS
  )
    throw new ShippingError("INVALID_COUNT");
  if (
    !Number.isInteger(input.palletCopies) ||
    input.palletCopies < 1 ||
    input.palletCopies > MAX_PALLET_COPIES
  )
    throw new ShippingError("INVALID_COPIES");
  if (input.layoutId) {
    const layout = await getLayout(db, input.layoutId);
    if (!layout || layout.type !== "shipping") throw new ShippingError("INVALID_LAYOUT");
  }
  await writeSetting(db, COUNT_KEY, input.defaultCount, actor.id);
  await writeSetting(db, LAYOUT_KEY, input.layoutId, actor.id);
  await writeSetting(db, UNIT_KEY, input.defaultUnit, actor.id);
  await writeSetting(db, PALLET_COPIES_KEY, input.palletCopies, actor.id);
  await logFor(
    actor,
    "settings.shippingLabelsChanged",
    {
      entityType: "settings",
      entityId: LAYOUT_KEY,
      details: {
        defaultCount: input.defaultCount,
        unit: input.defaultUnit,
        palletCopies: input.palletCopies,
        layout: input.layoutId || null,
      },
    },
    db,
  );
}

/** The layout the shipping labels print with: the chosen one, else the oldest; null when none exists. */
export async function getShippingLayout(db: Db): Promise<LabelLayout | null> {
  const { layoutId } = await getShippingSettings(db);
  if (layoutId) {
    const chosen = await getLayout(db, layoutId);
    if (chosen && chosen.type === "shipping") return chosen;
  }
  return (await listLayoutsOfType(db, "shipping"))[0] ?? null;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

/** The new text, or the stored one when the new one is empty. */
function keep(value: string, column: AnyPgColumn) {
  return sql`coalesce(nullif(${value}, ''), ${column})`;
}

/**
 * Keeps an order Priority sent. The same order number again updates the earlier row (the newest
 * details win) and counts one more time received.
 */
export async function receiveOrder(
  db: Db,
  order: ShippingOrder,
  raw: unknown,
  options: { isTest?: boolean } = {},
): Promise<{ id: string; updated: boolean }> {
  const values = {
    customerName: order.customerName,
    customerNumber: order.customerNumber,
    address: order.address,
    city: order.city,
    phone: order.phone,
    shipDate: order.shipDate,
    notes: order.notes,
    labelCount: order.labelCount,
    raw: raw ?? null,
    isTest: options.isTest ?? false,
    receivedAt: new Date(),
  };
  const [row] = await db
    .insert(shippingOrders)
    .values({ orderNumber: order.orderNumber, ...values })
    .onConflictDoUpdate({
      target: shippingOrders.orderNumber,
      // A resend that leaves a detail out keeps what the order had before.
      set: {
        ...values,
        customerName: keep(values.customerName, shippingOrders.customerName),
        customerNumber: keep(values.customerNumber, shippingOrders.customerNumber),
        address: keep(values.address, shippingOrders.address),
        city: keep(values.city, shippingOrders.city),
        phone: keep(values.phone, shippingOrders.phone),
        shipDate: keep(values.shipDate, shippingOrders.shipDate),
        notes: keep(values.notes, shippingOrders.notes),
        labelCount: sql`coalesce(${values.labelCount}, ${shippingOrders.labelCount})`,
        timesReceived: sql`${shippingOrders.timesReceived} + 1`,
      },
    })
    .returning({ id: shippingOrders.id, timesReceived: shippingOrders.timesReceived });
  await logFor(
    SYSTEM_ACTOR,
    options.isTest ? "shipping.testOrder" : "shipping.orderReceived",
    {
      entityType: "shipping_order",
      entityId: row.id,
      details: { order: order.orderNumber, times: row.timesReceived },
    },
    db,
  );
  return { id: row.id, updated: row.timesReceived > 1 };
}

const LIST_LIMIT = 200;

/** The newest orders first; `search` looks in the order number, customer and city. */
export async function listOrders(db: Db, search = ""): Promise<ShippingRow[]> {
  const text = search.trim();
  const like = `%${text.replace(/[\\%_]/g, "\\$&")}%`;
  return db
    .select()
    .from(shippingOrders)
    .where(
      text
        ? or(
            ilike(shippingOrders.orderNumber, like),
            ilike(shippingOrders.customerName, like),
            ilike(shippingOrders.customerNumber, like),
            ilike(shippingOrders.city, like),
          )
        : undefined,
    )
    .orderBy(desc(shippingOrders.receivedAt))
    .limit(LIST_LIMIT);
}

/** How many orders Priority has sent (not the test order), and when the last one came. */
export async function shippingStats(
  db: Db,
): Promise<{ received: number; lastReceivedAt: Date | null }> {
  const [row] = await db
    .select({ received: count(), last: max(shippingOrders.receivedAt) })
    .from(shippingOrders)
    .where(eq(shippingOrders.isTest, false));
  return { received: row?.received ?? 0, lastReceivedAt: row?.last ?? null };
}

export async function getOrder(db: Db, id: string): Promise<ShippingRow | null> {
  const [row] = await db.select().from(shippingOrders).where(eq(shippingOrders.id, id)).limit(1);
  return row ?? null;
}

export function toShippingOrder(row: ShippingRow): ShippingOrder {
  return {
    orderNumber: row.orderNumber,
    customerName: row.customerName,
    customerNumber: row.customerNumber,
    address: row.address,
    city: row.city,
    phone: row.phone,
    shipDate: row.shipDate,
    notes: row.notes,
    labelCount: row.labelCount,
  };
}

/** Notes that `count` labels of an order were sent to the printer. */
export async function markPrinted(db: Db, id: string, count: number, actor: Actor): Promise<void> {
  const [row] = await db
    .update(shippingOrders)
    .set({
      lastPrintedAt: new Date(),
      lastPrintedBy: actor.display,
      timesPrinted: sql`${shippingOrders.timesPrinted} + 1`,
    })
    .where(eq(shippingOrders.id, id))
    .returning({ orderNumber: shippingOrders.orderNumber });
  if (!row) throw new ShippingError("NOT_FOUND");
  await logFor(
    actor,
    "shipping.labelsPrinted",
    {
      entityType: "shipping_order",
      entityId: id,
      details: { order: row.orderNumber, labels: count },
    },
    db,
  );
}

export async function deleteOrder(db: Db, id: string, actor: Actor): Promise<void> {
  const [row] = await db
    .delete(shippingOrders)
    .where(eq(shippingOrders.id, id))
    .returning({ orderNumber: shippingOrders.orderNumber });
  if (!row) throw new ShippingError("NOT_FOUND");
  await logFor(
    actor,
    "shipping.orderDeleted",
    { entityType: "shipping_order", entityId: id, details: { order: row.orderNumber } },
    db,
  );
}

/** A made-up order, so the setup can be tried before Priority sends anything real. */
export async function makeTestOrder(db: Db): Promise<{ id: string }> {
  const order = sampleOrder(new Date());
  const { id } = await receiveOrder(
    db,
    { ...order, orderNumber: "TEST-0001" },
    { test: true },
    { isTest: true },
  );
  return { id };
}
