"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AlertsError, setCategoryAlertDays } from "@/server/alerts";
import { setCategoryShelfLife, ShelfLifeError } from "@/server/shelf-lives";
import { setCategoryStorageText, StorageTextError } from "@/server/storage-texts";
import { db } from "@/server/db";
import {
  PackagingError,
  addPackagingType,
  deletePackagingType,
  updatePackagingType,
  type PackagingErrorCode,
} from "@/server/packaging";
import { assertPermission, PermissionError } from "@/server/permissions";
import { getPriorityClient, PriorityError } from "@/server/priority";
import { ReceivingError, setCategoryWarehouse, setVendorOrder } from "@/server/receiving";

export type ReceivingSettingsError =
  "NOT_ALLOWED" | "INVALID_INPUT" | "INVALID_ORDER" | "UNAVAILABLE" | "UNKNOWN" | "GENERIC";

type Result = { ok: true } | { ok: false; error: ReceivingSettingsError };

function failure(error: unknown, what: string): Result {
  if (error instanceof PermissionError) return { ok: false, error: "NOT_ALLOWED" };
  if (error instanceof z.ZodError) return { ok: false, error: "INVALID_INPUT" };
  if (error instanceof PriorityError && error.code === "UNAVAILABLE")
    return { ok: false, error: "UNAVAILABLE" };
  if (error instanceof ReceivingError && error.code === "INVALID_ORDER")
    return { ok: false, error: "INVALID_ORDER" };
  if (
    error instanceof ReceivingError &&
    (error.code === "UNKNOWN_WAREHOUSE" || error.code === "UNKNOWN_ORDER")
  )
    return { ok: false, error: "UNKNOWN" };
  console.error(`[settings] ${what} failed`, error);
  return { ok: false, error: "GENERIC" };
}

/** Chooses (or with an empty code clears) the storage room a category's boxes go into. */
export async function setCategoryWarehouseAction(
  category: string,
  warehouseCode: string,
): Promise<Result> {
  try {
    const access = await assertPermission("settings.categories.edit");
    const data = z
      .object({ category: z.string().max(200), warehouseCode: z.string().max(100) })
      .parse({ category, warehouseCode });
    await setCategoryWarehouse(
      db,
      getPriorityClient(),
      data.category,
      data.warehouseCode || null,
      access.actor,
    );
    revalidatePath("/settings");
    return { ok: true };
  } catch (error) {
    return failure(error, "choosing a storage room");
  }
}

/**
 * Chooses (or with an empty value clears) the order all vendor boxes go under. Any order number
 * can be typed; "listed" says whether Priority lists it right now.
 */
export async function setVendorOrderAction(
  docno: string,
): Promise<{ ok: true; listed: boolean | null } | { ok: false; error: ReceivingSettingsError }> {
  try {
    const access = await assertPermission("settings.vendorOrder.edit");
    const value = z.string().max(100).parse(docno);
    const { listed } = await setVendorOrder(
      db,
      getPriorityClient(),
      value.trim() || null,
      access.actor,
    );
    revalidatePath("/settings");
    return { ok: true, listed };
  } catch (error) {
    return failure(error, "choosing the vendor order") as {
      ok: false;
      error: ReceivingSettingsError;
    };
  }
}

/** Sets (or with null clears) how many days before expiry a category's boxes count as about to expire. */
export async function setCategoryAlertDaysAction(
  category: string,
  days: number | null,
): Promise<Result | { ok: false; error: "INVALID_DAYS" }> {
  try {
    const access = await assertPermission("settings.categories.edit");
    const data = z
      .object({ category: z.string().max(200), days: z.number().nullable() })
      .parse({ category, days });
    await setCategoryAlertDays(db, data.category, data.days, access.actor);
    revalidatePath("/settings");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    if (error instanceof AlertsError) return { ok: false, error: "INVALID_DAYS" };
    return failure(error, "setting the alert days");
  }
}

/** Sets (or with an empty text clears) the storage text a category's labels print. */
export async function setCategoryStorageTextAction(
  category: string,
  text: string,
): Promise<Result | { ok: false; error: "TOO_LONG" }> {
  try {
    const access = await assertPermission("settings.categories.edit");
    const data = z
      .object({ category: z.string().max(200), text: z.string().max(2000) })
      .parse({ category, text });
    await setCategoryStorageText(db, data.category, data.text, access.actor);
    revalidatePath("/settings");
    revalidatePath("/catalog");
    return { ok: true };
  } catch (error) {
    if (error instanceof StorageTextError) return { ok: false, error: "TOO_LONG" };
    return failure(error, "setting the storage text");
  }
}

/** Sets (or with null clears) the days from the slaughter date to the expiry date for a category. */
export async function setCategoryShelfLifeAction(
  category: string,
  days: number | null,
): Promise<Result | { ok: false; error: "INVALID_DAYS" }> {
  try {
    const access = await assertPermission("settings.categories.edit");
    const data = z
      .object({ category: z.string().max(200), days: z.number().nullable() })
      .parse({ category, days });
    await setCategoryShelfLife(db, data.category, data.days, access.actor);
    revalidatePath("/settings");
    revalidatePath("/catalog");
    return { ok: true };
  } catch (error) {
    if (error instanceof ShelfLifeError) return { ok: false, error: "INVALID_DAYS" };
    return failure(error, "setting the shelf life");
  }
}

type PackagingResult<T = object> =
  ({ ok: true } & T) | { ok: false; error: ReceivingSettingsError | PackagingErrorCode };

function packagingFailure(
  error: unknown,
  what: string,
): { ok: false; error: ReceivingSettingsError | PackagingErrorCode } {
  if (error instanceof PackagingError) return { ok: false, error: error.code };
  return failure(error, what) as { ok: false; error: ReceivingSettingsError };
}

const typeSchema = z.object({
  name: z.string().max(200),
  weightKg: z.number().finite(),
});

/** Adds a kind of carton with its weight. */
export async function addPackagingTypeAction(
  name: string,
  weightKg: number,
): Promise<PackagingResult> {
  try {
    const access = await assertPermission("settings.categories.edit");
    const data = typeSchema.parse({ name, weightKg });
    await addPackagingType(db, data, access.actor);
    revalidatePath("/settings");
    return { ok: true };
  } catch (error) {
    return packagingFailure(error, "adding a kind of carton");
  }
}

/** Changes the name and weight of a kind of carton. */
export async function updatePackagingTypeAction(
  id: string,
  name: string,
  weightKg: number,
): Promise<PackagingResult> {
  try {
    const access = await assertPermission("settings.categories.edit");
    const data = typeSchema.parse({ name, weightKg });
    await updatePackagingType(db, z.string().max(100).parse(id), data, access.actor);
    revalidatePath("/settings");
    revalidatePath("/receiving");
    return { ok: true };
  } catch (error) {
    return packagingFailure(error, "changing a kind of carton");
  }
}

/** Deletes a kind of packaging; the items that used it go back to none. */
export async function deletePackagingTypeAction(
  id: string,
): Promise<PackagingResult<{ items: number }>> {
  try {
    const access = await assertPermission("settings.categories.edit");
    const items = await deletePackagingType(db, z.string().max(100).parse(id), access.actor);
    revalidatePath("/settings");
    revalidatePath("/catalog");
    revalidatePath("/receiving");
    return { ok: true, items };
  } catch (error) {
    return packagingFailure(error, "deleting a kind of carton");
  }
}
