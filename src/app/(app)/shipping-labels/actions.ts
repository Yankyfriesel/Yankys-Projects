"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { LabelElement, LabelValues } from "@/lib/labels/model";
import { getLocale } from "next-intl/server";
import {
  copiesFor,
  isValidPrint,
  MAX_LABELS,
  MAX_PALLET_COPIES,
  SHIPPING_UNITS,
  shippingLabelPages,
} from "@/lib/labels/shipping";
import { db } from "@/server/db";
import { assertPermission, PermissionError } from "@/server/permissions";
import {
  deleteOrder,
  getOrder,
  getShippingLayout,
  markPrinted,
  ShippingError,
  toShippingOrder,
} from "@/server/shipping-labels";

export type ShippingErrorCode =
  "NOT_FOUND" | "NO_LAYOUT" | "INVALID_INPUT" | "NOT_ALLOWED" | "GENERIC";

export interface ShippingJobData {
  widthMm: number;
  heightMm: number;
  elements: LabelElement[];
  pages: LabelValues[];
}

export type ShippingPrintResult =
  { ok: true; job: ShippingJobData } | { ok: false; error: ShippingErrorCode };

function failure(error: unknown, what: string): { ok: false; error: ShippingErrorCode } {
  if (error instanceof PermissionError) return { ok: false, error: "NOT_ALLOWED" };
  if (error instanceof z.ZodError) return { ok: false, error: "INVALID_INPUT" };
  if (error instanceof ShippingError && error.code === "NOT_FOUND")
    return { ok: false, error: "NOT_FOUND" };
  console.error(`[shipping] ${what} failed`, error);
  return { ok: false, error: "GENERIC" };
}

/**
 * The labels of an order, ready to print: `count` labels numbered 1 / count up to count / count.
 * Printing is noted on the order, so the list shows which orders still wait for their labels.
 */
export async function shippingPrintAction(
  id: string,
  count: number,
  unit: "box" | "pallet",
  palletCopies: number,
): Promise<ShippingPrintResult> {
  try {
    const access = await assertPermission("shipping.print");
    const data = z
      .object({ id: z.string().min(1).max(64), count: z.number().int().min(1).max(MAX_LABELS),
        unit: z.enum(SHIPPING_UNITS),
        palletCopies: z.number().int().min(1).max(MAX_PALLET_COPIES),
      })
      .parse({ id, count, unit, palletCopies });
    // A box gets one label; a pallet gets the number of labels asked for.
    const copies = copiesFor(data.unit, data.palletCopies);
    if (!isValidPrint(data.count, copies)) return { ok: false, error: "INVALID_INPUT" };
    const order = await getOrder(db, data.id);
    if (!order) return { ok: false, error: "NOT_FOUND" };
    const layout = await getShippingLayout(db);
    if (!layout) return { ok: false, error: "NO_LAYOUT" };

    await markPrinted(db, order.id, data.count * copies, access.actor);
    revalidatePath("/shipping-labels");
    return {
      ok: true,
      job: {
        widthMm: layout.widthMm,
        heightMm: layout.heightMm,
        elements: layout.elements,
        pages: shippingLabelPages(
          toShippingOrder(order),
          data.count,
          data.unit,
          (await getLocale()) === "en" ? "en" : "he",
          copies,
        ),
      },
    };
  } catch (error) {
    return failure(error, "printing shipping labels");
  }
}

export async function deleteShippingOrderAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: ShippingErrorCode }> {
  try {
    const access = await assertPermission("shipping.delete");
    await deleteOrder(db, z.string().min(1).max(64).parse(id), access.actor);
    revalidatePath("/shipping-labels");
    return { ok: true };
  } catch (error) {
    return failure(error, "deleting a shipping order");
  }
}
