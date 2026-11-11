"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MAX_LABELS, MAX_PALLET_COPIES, SHIPPING_UNITS } from "@/lib/labels/shipping";
import { db } from "@/server/db";
import { assertPermission, PermissionError } from "@/server/permissions";
import {
  makeTestOrder,
  regenerateShippingToken,
  saveShippingSettings,
  ShippingError,
} from "@/server/shipping-labels";

export type ShippingSettingsError =
  "NOT_ALLOWED" | "INVALID_INPUT" | "INVALID_COUNT" | "INVALID_COPIES" | "INVALID_LAYOUT" | "GENERIC";

type Failure = { ok: false; error: ShippingSettingsError };

function failure(error: unknown, what: string): Failure {
  if (error instanceof PermissionError) return { ok: false, error: "NOT_ALLOWED" };
  if (error instanceof z.ZodError) return { ok: false, error: "INVALID_INPUT" };
  if (error instanceof ShippingError && error.code === "INVALID_COUNT")
    return { ok: false, error: "INVALID_COUNT" };
  if (error instanceof ShippingError && error.code === "INVALID_COPIES")
    return { ok: false, error: "INVALID_COPIES" };
  if (error instanceof ShippingError && error.code === "INVALID_LAYOUT")
    return { ok: false, error: "INVALID_LAYOUT" };
  console.error(`[settings] ${what} failed`, error);
  return { ok: false, error: "GENERIC" };
}

/** How many labels a print starts with, and which shipping layout prints (empty: the oldest). */
export async function saveShippingSettingsAction(input: {
  defaultCount: number;
  defaultUnit: "box" | "pallet";
  palletCopies: number;
  layoutId: string;
}): Promise<{ ok: true } | Failure> {
  try {
    const access = await assertPermission("settings.labels.edit");
    const data = z
      .object({
        defaultCount: z.number().int().min(1).max(MAX_LABELS),
        defaultUnit: z.enum(SHIPPING_UNITS),
        palletCopies: z.number().int().min(1).max(MAX_PALLET_COPIES),
        layoutId: z.string().max(64),
      })
      .parse(input);
    await saveShippingSettings(db, data, access.actor);
    revalidatePath("/settings");
    revalidatePath("/shipping-labels");
    return { ok: true };
  } catch (error) {
    return failure(error, "saving the shipping label settings");
  }
}

/** A new secret for the address: the old address stops working at once. */
export async function regenerateShippingKeyAction(): Promise<
  { ok: true; token: string } | Failure
> {
  try {
    const access = await assertPermission("settings.labels.edit");
    const token = await regenerateShippingToken(db, access.actor);
    revalidatePath("/settings");
    return { ok: true, token };
  } catch (error) {
    return failure(error, "changing the shipping labels key");
  }
}

/** Puts a made-up order in the Shipping labels list, to try the labels before Priority sends one. */
export async function makeTestOrderAction(): Promise<{ ok: true } | Failure> {
  try {
    await assertPermission("settings.labels.edit");
    await makeTestOrder(db);
    revalidatePath("/shipping-labels");
    return { ok: true };
  } catch (error) {
    return failure(error, "making a test order");
  }
}
