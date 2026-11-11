"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parsePalletQr, palletLabelValues } from "@/lib/pallets";
import { db } from "@/server/db";
import { getPalletLayout } from "@/server/labels";
import { assertPermission, getAccess, PermissionError } from "@/server/permissions";
import {
  PalletError,
  createPallet,
  getPalletLabelData,
  viewPallet,
  type PalletBox,
  type PalletErrorCode,
} from "@/server/pallets";
import { getPriorityClient } from "@/server/priority";
import type { PrintJobData } from "../../catalog/actions";

export type PalletActionError =
  | PalletErrorCode
  | "NOT_ALLOWED"
  | "INVALID_INPUT"
  | "NOT_A_PALLET"
  | "NO_PALLET_LAYOUT"
  | "GENERIC";

type Failure = { ok: false; error: PalletActionError; barcodes?: string[] };

/** The label of a pallet, ready to print: the pallet layout drawn with this pallet's values. */
async function labelJob(number: number): Promise<PrintJobData | Failure> {
  const [layout, data] = await Promise.all([getPalletLayout(db), getPalletLabelData(db, number)]);
  if (!layout) return { ok: false, error: "NO_PALLET_LAYOUT" };
  if (!data) return { ok: false, error: "NOT_FOUND" };
  return {
    widthMm: layout.widthMm,
    heightMm: layout.heightMm,
    elements: layout.elements,
    values: palletLabelValues(data),
    copies: 1,
  };
}

/** Seeing a pallet and printing its label is open to whoever may build pallets in either way. */
async function assertPalletAccess(): Promise<void> {
  const access = await getAccess();
  if (!access.can("inventory.pallets") && !access.can("inventory.palletsScan"))
    throw new PermissionError("inventory.pallets");
}

function failure(error: unknown): Failure {
  if (error instanceof PermissionError) return { ok: false, error: "NOT_ALLOWED" };
  if (error instanceof z.ZodError) return { ok: false, error: "INVALID_INPUT" };
  if (error instanceof PalletError)
    return { ok: false, error: error.code, barcodes: error.barcodes.slice(0, 20) };
  console.error("[pallets] failed", error);
  return { ok: false, error: "GENERIC" };
}

/**
 * Makes a pallet of the boxes picked and hands back its label to print. Boxes picked by ticking
 * them in the list need "pallets"; boxes scanned with the scanner need "palletsScan".
 * Checked before anything is made: there must be a pallet layout to print with.
 */
export async function createPalletAction(
  barcodes: string[],
  how: "select" | "scan" = "select",
): Promise<{ ok: true; number: number; boxes: number; job: PrintJobData } | Failure> {
  try {
    const access = await assertPermission(
      z.enum(["select", "scan"]).parse(how) === "scan"
        ? "inventory.palletsScan"
        : "inventory.pallets",
    );
    const list = z.array(z.string().max(100)).max(1000).parse(barcodes);
    if (!(await getPalletLayout(db))) return { ok: false, error: "NO_PALLET_LAYOUT" };
    const made = await createPallet(db, getPriorityClient(), list, access.actor);
    const job = await labelJob(made.number);
    if ("ok" in job) return job;
    revalidatePath("/inventory/pallets");
    return { ok: true, ...made, job };
  } catch (error) {
    return failure(error);
  }
}

/** The label of an existing pallet, printed again. */
export async function palletLabelAction(
  number: number,
): Promise<{ ok: true; job: PrintJobData } | Failure> {
  try {
    await assertPalletAccess();
    const job = await labelJob(z.number().int().min(1).parse(number));
    return "ok" in job ? job : { ok: true, job };
  } catch (error) {
    return failure(error);
  }
}

export interface PalletViewData {
  number: number;
  createdAt: string;
  createdBy: string;
  boxes: PalletBox[];
}

/** What is on a pallet now, from a scanned pallet QR code (or just its number). */
export async function openPalletAction(
  text: string,
): Promise<{ ok: true; pallet: PalletViewData } | Failure> {
  try {
    await assertPalletAccess();
    const scanned = z.string().max(100).parse(text).trim();
    const number = parsePalletQr(scanned) ?? (/^\d{1,9}$/.test(scanned) ? Number(scanned) : null);
    if (number === null || number < 1) return { ok: false, error: "NOT_A_PALLET" };
    const view = await viewPallet(db, getPriorityClient(), number);
    return {
      ok: true,
      pallet: {
        number: view.number,
        createdAt: view.createdAt.toISOString(),
        createdBy: view.createdBy,
        boxes: view.boxes,
      },
    };
  } catch (error) {
    return failure(error);
  }
}
