"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { LABEL_TYPES, layoutSchema, type LayoutContent } from "@/lib/labels/model";
import { db } from "@/server/db";
import {
  createLayout,
  deleteLayout,
  duplicateLayout,
  LabelLayoutError,
  saveLayout,
  setDefaultItemLayout,
} from "@/server/labels";
import { assertPermission, PermissionError } from "@/server/permissions";

export type LabelsErrorCode =
  "NAME_TAKEN" | "BOX_EXISTS" | "NOT_FOUND" | "NOT_ALLOWED" | "INVALID_INPUT" | "GENERIC";

type Failure = { ok: false; error: LabelsErrorCode };

function failure(error: unknown, what: string): Failure {
  if (error instanceof LabelLayoutError) return { ok: false, error: error.code };
  if (error instanceof PermissionError) return { ok: false, error: "NOT_ALLOWED" };
  if (error instanceof z.ZodError) return { ok: false, error: "INVALID_INPUT" };
  console.error(`[labels] ${what} failed`, error);
  return { ok: false, error: "GENERIC" };
}

const newLayoutSchema = layoutSchema
  .pick({ name: true, widthMm: true, heightMm: true })
  .extend({ type: z.enum(LABEL_TYPES) });

export async function createLayoutAction(
  input: z.input<typeof newLayoutSchema>,
): Promise<{ ok: true; id: string } | Failure> {
  try {
    const access = await assertPermission("settings.labels.edit");
    const layout = await createLayout(db, newLayoutSchema.parse(input), access.actor);
    revalidatePath("/settings/labels");
    return { ok: true, id: layout.id };
  } catch (error) {
    return failure(error, "creating a layout");
  }
}

export async function saveLayoutAction(
  id: string,
  input: LayoutContent,
): Promise<{ ok: true; savedAt: string } | Failure> {
  try {
    const access = await assertPermission("settings.labels.edit");
    const layout = await saveLayout(db, id, layoutSchema.parse(input), access.actor);
    revalidatePath("/settings/labels");
    return { ok: true, savedAt: layout.updatedAt.toISOString() };
  } catch (error) {
    return failure(error, "saving a layout");
  }
}

export async function duplicateLayoutAction(
  id: string,
): Promise<{ ok: true; id: string } | Failure> {
  try {
    const access = await assertPermission("settings.labels.edit");
    const copy = await duplicateLayout(db, id, access.actor);
    revalidatePath("/settings/labels");
    return { ok: true, id: copy.id };
  } catch (error) {
    return failure(error, "duplicating a layout");
  }
}

export async function deleteLayoutAction(id: string): Promise<{ ok: true } | Failure> {
  try {
    const access = await assertPermission("settings.labels.edit");
    await deleteLayout(db, id, access.actor);
    revalidatePath("/settings/labels");
    return { ok: true };
  } catch (error) {
    return failure(error, "deleting a layout");
  }
}

/** Makes an item layout the one chosen in advance when printing (null for none). */
export async function setDefaultItemLayoutAction(
  id: string | null,
): Promise<{ ok: true } | Failure> {
  try {
    const access = await assertPermission("settings.labels.edit");
    await setDefaultItemLayout(db, z.string().max(64).nullable().parse(id), access.actor);
    revalidatePath("/settings/labels");
    revalidatePath("/catalog");
    return { ok: true };
  } catch (error) {
    return failure(error, "choosing the default item layout");
  }
}
