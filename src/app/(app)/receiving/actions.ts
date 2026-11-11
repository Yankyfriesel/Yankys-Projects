"use server";

import { z } from "zod";
import { addDays } from "@/lib/barcodes";
import { parseItemLabelQr } from "@/lib/labels/codes";
import { checkItemLabelInput, parseIsoDate } from "@/lib/labels/item-label";
import { boxLabelValues } from "@/lib/receiving/box-label";
import { logFor } from "@/server/activity-log";
import { db } from "@/server/db";
import { boxes } from "@/server/db/schema";
import { getBoxLayout } from "@/server/labels";
import { assertPermission, PermissionError } from "@/server/permissions";
import { getPriorityClient } from "@/server/priority";
import {
  readCatalog,
  receiveInHouseBox,
  ReceivingError,
  type ReceivedBox,
  type ReceivingErrorCode,
} from "@/server/receiving";
import { eq } from "drizzle-orm";
import type { PrintJobData } from "../catalog/actions";
import { revalidatePath } from "next/cache";

export type ReceiveErrorCode =
  | ReceivingErrorCode
  | "INVALID_INPUT"
  | "NOT_ALLOWED"
  | "NOT_ITEM_QR"
  | "NO_BOX_LAYOUT"
  | "BOX_NOT_FOUND"
  | "GENERIC";

export type ReceiveResult =
  | { ok: true; box: Omit<ReceivedBox, "item">; job: PrintJobData }
  | { ok: false; error: ReceiveErrorCode };

const weight = z.number().finite();

const inputSchema = z.discriminatedUnion("mode", [
  /** The text a scanner read from an item label's QR code. */
  z.object({ mode: z.literal("scan"), qr: z.string().max(500), weightKg: weight }),
  z.object({
    mode: z.literal("manual"),
    itemNumber: z.string().min(1).max(100),
    certificateNo: z.string().max(100),
    slaughterDate: z.string().max(10),
    productionDate: z.string().max(10),
    weightKg: weight,
  }),
]);

/**
 * Saves a weighed box and hands back its label to print. A scan needs "scan", typing the
 * box in by hand needs "manual"; both are decided here, not by the screen. The box is
 * saved even when Priority does not answer (the send retries later).
 */
export async function receiveBoxAction(input: z.input<typeof inputSchema>): Promise<ReceiveResult> {
  try {
    const data = inputSchema.parse(input);
    const access = await assertPermission(
      data.mode === "scan" ? "receiving.scan" : "receiving.manual",
    );

    let fields: {
      itemNumber: string;
      certificateNo: string;
      slaughterDate: Date;
      productionDate: Date;
      expiryDate: Date | null;
    };
    if (data.mode === "scan") {
      const qr = parseItemLabelQr(data.qr);
      if (!qr) return { ok: false, error: "NOT_ITEM_QR" };
      fields = { ...qr, expiryDate: qr.expiryDate };
    } else {
      const problems = checkItemLabelInput({ ...data, copies: 1 });
      const slaughterDate = parseIsoDate(data.slaughterDate);
      const productionDate = parseIsoDate(data.productionDate);
      if (problems.length > 0 || !slaughterDate || !productionDate)
        return { ok: false, error: "INVALID_INPUT" };
      fields = {
        itemNumber: data.itemNumber,
        certificateNo: data.certificateNo.trim(),
        slaughterDate,
        productionDate,
        expiryDate: null, // worked out below from the item's shelf life
      };
    }

    const layout = await getBoxLayout(db);
    if (!layout) return { ok: false, error: "NO_BOX_LAYOUT" };

    const priority = getPriorityClient();
    let expiryDate = fields.expiryDate;
    if (!expiryDate) {
      const { items } = await readCatalog(db, priority);
      const item = items.find((i) => i.itemNumber === fields.itemNumber);
      if (!item) return { ok: false, error: "UNKNOWN_ITEM" };
      expiryDate = addDays(fields.slaughterDate, item.shelfLifeDays);
    }

    const { item, ...box } = await receiveInHouseBox(
      db,
      priority,
      {
        itemNumber: fields.itemNumber,
        certificateNo: fields.certificateNo,
        slaughterDate: fields.slaughterDate,
        productionDate: fields.productionDate,
        expiryDate,
        weightKg: data.weightKg,
      },
      access.actor,
    );
    revalidatePath("/receiving");
    return {
      ok: true,
      box,
      job: {
        widthMm: layout.widthMm,
        heightMm: layout.heightMm,
        elements: layout.elements,
        values: boxLabelValues(item, box),
        copies: 1,
      },
    };
  } catch (error) {
    return failure(error);
  }
}

/** The label of a box already received, printed again. Needs "reprint". */
export async function reprintBoxAction(barcode: string): Promise<ReceiveResult> {
  try {
    const access = await assertPermission("receiving.reprint");
    z.string().min(1).max(60).parse(barcode);
    const [row] = await db.select().from(boxes).where(eq(boxes.barcode, barcode)).limit(1);
    if (!row) return { ok: false, error: "BOX_NOT_FOUND" };
    const layout = await getBoxLayout(db);
    if (!layout) return { ok: false, error: "NO_BOX_LAYOUT" };
    const { items } = await readCatalog(db, getPriorityClient());
    const item = items.find((i) => i.itemNumber === row.itemNumber);
    if (!item) return { ok: false, error: "UNKNOWN_ITEM" };
    await logFor(
      access.actor,
      "receiving.labelReprinted",
      { entityType: "box", entityId: row.barcode, details: { item: row.itemNumber } },
      db,
    );
    return {
      ok: true,
      box: {
        id: row.id,
        barcode: row.barcode,
        itemNumber: row.itemNumber,
        itemName: item.name,
        running: row.running,
        weightKg: row.weightKg,
        slaughterDate: row.slaughterDate,
        productionDate: row.productionDate,
        expiryDate: row.expiryDate,
        certificateNo: row.certificateNo,
        docno: row.docno,
        warehouseCode: row.warehouseCode,
        sent: "sent",
      },
      job: {
        widthMm: layout.widthMm,
        heightMm: layout.heightMm,
        elements: layout.elements,
        values: boxLabelValues(item, row),
        copies: 1,
      },
    };
  } catch (error) {
    return failure(error);
  }
}

function failure(error: unknown): { ok: false; error: ReceiveErrorCode } {
  if (error instanceof PermissionError) return { ok: false, error: "NOT_ALLOWED" };
  if (error instanceof z.ZodError) return { ok: false, error: "INVALID_INPUT" };
  if (error instanceof ReceivingError) return { ok: false, error: error.code };
  console.error("[receiving] failed", error);
  return { ok: false, error: "GENERIC" };
}
