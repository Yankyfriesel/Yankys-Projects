"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { assertPermission, PermissionError } from "@/server/permissions";
import { getPriorityClient } from "@/server/priority";
import { receiveVendorBox, ReceivingError, type ReceivingErrorCode } from "@/server/receiving";

export type VendorErrorCode = ReceivingErrorCode | "INVALID_INPUT" | "NOT_ALLOWED" | "GENERIC";

export type VendorResult =
  | {
      ok: true;
      box: {
        itemName: string;
        itemNumber: string;
        weightKg: number;
        expiryDate: string;
        sent: "sent" | "pending" | "failed";
      };
    }
  | {
      ok: false;
      error: VendorErrorCode;
      /** For ALREADY_RECEIVED: when (ISO) and by whom the box was first received. */
      existing?: { receivedAt: string; receivedBy: string };
    };

/**
 * Receives a box by the barcode the vendor printed on it. Needs "scan"; a barcode that was
 * received before is refused for good, with when and by whom.
 */
export async function receiveVendorBoxAction(scanned: string): Promise<VendorResult> {
  try {
    const access = await assertPermission("vendor.scan");
    const barcode = z.string().min(1).max(100).parse(scanned);
    const box = await receiveVendorBox(db, getPriorityClient(), barcode, access.actor);
    revalidatePath("/vendor-receiving");
    return {
      ok: true,
      box: {
        itemName: box.item.name,
        itemNumber: box.itemNumber,
        weightKg: box.weightKg,
        expiryDate: box.expiryDate,
        sent: box.sent,
      },
    };
  } catch (error) {
    if (error instanceof PermissionError) return { ok: false, error: "NOT_ALLOWED" };
    if (error instanceof z.ZodError) return { ok: false, error: "INVALID_INPUT" };
    if (error instanceof ReceivingError) {
      return {
        ok: false,
        error: error.code,
        existing: error.existing && {
          receivedAt: error.existing.receivedAt.toISOString(),
          receivedBy: error.existing.receivedBy,
        },
      };
    }
    console.error("[vendor receiving] failed", error);
    return { ok: false, error: "GENERIC" };
  }
}
