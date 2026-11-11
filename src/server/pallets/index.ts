import { desc, eq, sql } from "drizzle-orm";
import { MAX_PALLET_BOXES, type PalletLabelData } from "../../lib/pallets";
import { toISODate } from "../../lib/barcodes";
import { logFor, type Actor } from "../activity-log";
import type { Db } from "../db/connection";
import { palletBoxes, pallets } from "../db/schema";
import { PriorityError, type PriorityClient, type PriorityStockBox } from "../priority/types";

/**
 * Pallets. A pallet is a fixed list of boxes under one number, so one scan of one QR code names
 * them all (to see what is on a pallet, or to move them together). Making one never changes
 * stock, and what stands on a pallet is never edited afterwards.
 */

export type PalletErrorCode =
  "NOTHING_SELECTED" | "TOO_MANY" | "NOT_IN_STOCK" | "NOT_FOUND" | "PRIORITY_UNAVAILABLE";

export class PalletError extends Error {
  constructor(
    public readonly code: PalletErrorCode,
    /** For NOT_IN_STOCK: the barcodes Priority does not have in stock. */
    public readonly barcodes: string[] = [],
  ) {
    super(code);
    this.name = "PalletError";
  }
}

async function readStock(priority: PriorityClient): Promise<PriorityStockBox[]> {
  try {
    return await priority.getStockBoxes();
  } catch (error) {
    if (error instanceof PriorityError && error.code === "UNAVAILABLE")
      throw new PalletError("PRIORITY_UNAVAILABLE");
    throw error;
  }
}

/** Makes a pallet of the boxes, in the order given. Every box must be in stock in Priority now. */
export async function createPallet(
  db: Db,
  priority: PriorityClient,
  barcodes: string[],
  actor: Actor,
): Promise<{ number: number; boxes: number }> {
  const wanted = [...new Set(barcodes.map((b) => b.trim()).filter(Boolean))];
  if (wanted.length === 0) throw new PalletError("NOTHING_SELECTED");
  if (wanted.length > MAX_PALLET_BOXES) throw new PalletError("TOO_MANY");

  const stock = new Map((await readStock(priority)).map((box) => [box.barcode, box]));
  const missing = wanted.filter((barcode) => !stock.has(barcode));
  if (missing.length > 0) throw new PalletError("NOT_IN_STOCK", missing);

  const number = await db.transaction(async (tx) => {
    const [pallet] = await tx
      .insert(pallets)
      .values({ createdBy: actor.id, createdByDisplay: actor.display })
      .returning({ number: pallets.number });
    await tx.insert(palletBoxes).values(
      wanted.map((barcode, position) => {
        const box = stock.get(barcode)!;
        return {
          palletNumber: pallet.number,
          barcode,
          itemNumber: box.itemNumber,
          itemName: box.itemName,
          weightKg: box.weightKg,
          position,
        };
      }),
    );
    return pallet.number;
  });

  await logFor(
    actor,
    "inventory.palletCreated",
    {
      entityType: "pallet",
      entityId: String(number),
      details: { pallet: number, boxes: wanted.length },
    },
    db,
  );
  return { number, boxes: wanted.length };
}

/** What the label of a pallet is made from, or null when there is no such pallet. */
export async function getPalletLabelData(db: Db, number: number): Promise<PalletLabelData | null> {
  const [pallet] = await db.select().from(pallets).where(eq(pallets.number, number)).limit(1);
  if (!pallet) return null;
  const boxes = await db
    .select({ itemName: palletBoxes.itemName, weightKg: palletBoxes.weightKg })
    .from(palletBoxes)
    .where(eq(palletBoxes.palletNumber, number))
    .orderBy(palletBoxes.position);
  return { number, createdDate: toISODate(pallet.createdAt), boxes };
}

export interface PalletBox {
  barcode: string;
  itemNumber: string;
  itemName: string;
  /** The weight when the pallet was made. */
  weightKg: number;
  /** False when Priority no longer has the box in stock (it was picked, or moved out). */
  inStock: boolean;
  /** Where the box is now; null when it is not in stock. */
  warehouseCode: string | null;
  /** YYYY-MM-DD; null when not in stock. */
  expiryDate: string | null;
}

export interface PalletView {
  number: number;
  createdAt: Date;
  createdBy: string;
  boxes: PalletBox[];
}

/** A pallet with each of its boxes checked against Priority's stock as it is now. */
export async function viewPallet(
  db: Db,
  priority: PriorityClient,
  number: number,
): Promise<PalletView> {
  const [pallet] = await db.select().from(pallets).where(eq(pallets.number, number)).limit(1);
  if (!pallet) throw new PalletError("NOT_FOUND");
  const rows = await db
    .select()
    .from(palletBoxes)
    .where(eq(palletBoxes.palletNumber, number))
    .orderBy(palletBoxes.position);
  const stock = new Map((await readStock(priority)).map((box) => [box.barcode, box]));
  return {
    number,
    createdAt: pallet.createdAt,
    createdBy: pallet.createdByDisplay,
    boxes: rows.map((row) => {
      const live = stock.get(row.barcode);
      return {
        barcode: row.barcode,
        itemNumber: row.itemNumber,
        itemName: row.itemName,
        weightKg: row.weightKg,
        inStock: live !== undefined,
        warehouseCode: live?.warehouseCode ?? null,
        expiryDate: live?.expiryDate ?? null,
      };
    }),
  };
}

export interface PalletSummary {
  number: number;
  createdAt: Date;
  createdBy: string;
  boxes: number;
  kg: number;
}

/** The latest pallets, newest first. */
export async function listPallets(db: Db, limit = 50): Promise<PalletSummary[]> {
  const rows = await db
    .select({
      number: pallets.number,
      createdAt: pallets.createdAt,
      createdBy: pallets.createdByDisplay,
      boxes: sql<number>`count(${palletBoxes.barcode})`.mapWith(Number),
      grams: sql<number>`coalesce(sum(round(${palletBoxes.weightKg} * 1000)), 0)`.mapWith(Number),
    })
    .from(pallets)
    .leftJoin(palletBoxes, eq(palletBoxes.palletNumber, pallets.number))
    .groupBy(pallets.number)
    .orderBy(desc(pallets.number))
    .limit(limit);
  return rows.map(({ grams, ...row }) => ({ ...row, kg: grams / 1000 }));
}
