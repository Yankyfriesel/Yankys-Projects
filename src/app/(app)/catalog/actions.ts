"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  MAX_BATCH_ITEMS,
  MAX_BATCH_LABELS,
  MAX_COPIES,
  checkItemLabelInput,
  itemLabelDates,
  itemLabelValues,
} from "@/lib/labels/item-label";
import type { ItemLabelProblem } from "@/lib/labels/item-label";
import type { LabelElement, LabelValues } from "@/lib/labels/model";
import { logFor } from "@/server/activity-log";
import { db } from "@/server/db";
import { getLayout } from "@/server/labels";
import { PackagingError, setItemPackaging } from "@/server/packaging";
import { assertPermission, PermissionError } from "@/server/permissions";
import { getPriorityClient, PriorityError } from "@/server/priority";
import { formatDate } from "@/lib/i18n/format";

export type PrintErrorCode =
  | "INVALID_INPUT"
  | "NOT_ALLOWED"
  | "UNAVAILABLE"
  | "ITEM_NOT_FOUND"
  | "ITEM_NOT_PRINTABLE"
  | "LAYOUT_NOT_FOUND"
  | "TOO_MANY"
  | "GENERIC";

export interface PrintJobData {
  widthMm: number;
  heightMm: number;
  elements: LabelElement[];
  values: LabelValues;
  copies: number;
}

/** Several items on one label type: each item's values and copies, in the order they print. */
export interface BatchPrintJobData {
  widthMm: number;
  heightMm: number;
  elements: LabelElement[];
  groups: { values: LabelValues; copies: number }[];
}

export type BatchPrintResult =
  | { ok: true; job: BatchPrintJobData }
  /** `itemNumber` names the item that stopped the print, when it is one item's doing. */
  | { ok: false; error: PrintErrorCode; itemNumber?: string };

export type PrintResult =
  | { ok: true; job: PrintJobData }
  | { ok: false; error: PrintErrorCode; problems?: ItemLabelProblem[] };

const inputSchema = z.object({
  itemNumber: z.string().min(1).max(100),
  slaughterDate: z.string().max(10),
  productionDate: z.string().max(10),
  certificateNo: z.string().max(100),
  origin: z.string().max(200).optional(),
  /** The item label type to print with. */
  layoutId: z.string().min(1).max(64),
  copies: z.number().max(MAX_COPIES * 10),
});

/**
 * Checks everything again on the server, then hands back what the print window should
 * draw: the layout, the values for this item, and the number of copies. The checks do not
 * trust the screen: a different layout needs "change the layout", other than one copy
 * needs "change the number of copies". The request is written to the activity log.
 */
export async function prepareItemLabelsAction(
  input: z.input<typeof inputSchema>,
): Promise<PrintResult> {
  try {
    const access = await assertPermission("catalog.print");
    const data = inputSchema.parse(input);

    const problems = checkItemLabelInput(data, { originRequired: true });
    if (problems.length > 0) return { ok: false, error: "INVALID_INPUT", problems };

    const items = await getPriorityClient().getItems();
    const item = items.find((candidate) => candidate.itemNumber === data.itemNumber);
    if (!item) return { ok: false, error: "ITEM_NOT_FOUND" };

    // The label type is chosen every time, and only an item label layout can be chosen.
    const layout = await getLayout(db, data.layoutId);
    if (!layout || layout.type !== "item") return { ok: false, error: "LAYOUT_NOT_FOUND" };
    if (data.copies !== 1) await assertPermission("catalog.changeCopies");

    let values: LabelValues;
    try {
      values = itemLabelValues(item, data);
    } catch {
      // The item number has a space or "|", which the QR text cannot hold.
      return { ok: false, error: "ITEM_NOT_PRINTABLE" };
    }
    const dates = itemLabelDates(item, data)!;
    await logFor(
      access.actor,
      "catalog.itemLabelPrinted",
      {
        entityType: "item",
        entityId: item.itemNumber,
        details: {
          item: item.itemNumber,
          layout: layout.name,
          copies: data.copies,
          certificateNo: values.certificateNo,
          slaughterDate: formatDate(dates.slaughter),
          productionDate: formatDate(dates.production),
          expiryDate: formatDate(dates.expiry),
        },
      },
      db,
    );

    return {
      ok: true,
      job: {
        widthMm: layout.widthMm,
        heightMm: layout.heightMm,
        elements: layout.elements,
        values,
        copies: data.copies,
      },
    };
  } catch (error) {
    if (error instanceof PermissionError) return { ok: false, error: "NOT_ALLOWED" };
    if (error instanceof z.ZodError) return { ok: false, error: "INVALID_INPUT" };
    if (error instanceof PriorityError && error.code === "UNAVAILABLE") {
      return { ok: false, error: "UNAVAILABLE" };
    }
    console.error("[catalog] preparing item labels failed", error);
    return { ok: false, error: "GENERIC" };
  }
}

const batchSchema = z.object({
  /** One label type for the whole print: a print job has one paper size. */
  layoutId: z.string().min(1).max(64),
  items: z
    .array(
      z.object({
        itemNumber: z.string().min(1).max(100),
        slaughterDate: z.string().max(10),
        productionDate: z.string().max(10),
        certificateNo: z.string().max(100),
        origin: z.string().max(200).optional(),
        copies: z.number().max(MAX_COPIES * 10),
      }),
    )
    .min(1)
    .max(MAX_BATCH_ITEMS),
});

/**
 * Several items printed together on one label type, each with its own dates, certificate number
 * and copies. Everything is checked first and nothing is logged unless the whole print is good.
 * The labels of one item come together, with an empty label between one item and the next
 * (drawn by the print sheet). Other than one copy of an item needs "change the number of copies".
 */
export async function prepareBatchLabelsAction(
  input: z.input<typeof batchSchema>,
): Promise<BatchPrintResult> {
  try {
    const access = await assertPermission("catalog.print");
    const data = batchSchema.parse(input);

    for (const entry of data.items) {
      if (checkItemLabelInput(entry, { originRequired: true }).length > 0) {
        return { ok: false, error: "INVALID_INPUT", itemNumber: entry.itemNumber };
      }
    }
    if (data.items.reduce((sum, entry) => sum + entry.copies, 0) > MAX_BATCH_LABELS) {
      return { ok: false, error: "TOO_MANY" };
    }

    const layout = await getLayout(db, data.layoutId);
    if (!layout || layout.type !== "item") return { ok: false, error: "LAYOUT_NOT_FOUND" };
    if (data.items.some((entry) => entry.copies !== 1)) {
      await assertPermission("catalog.changeCopies");
    }

    const catalog = await getPriorityClient().getItems();
    const groups: BatchPrintJobData["groups"] = [];
    const logs: { item: string; values: LabelValues; entry: (typeof data.items)[number] }[] = [];
    for (const entry of data.items) {
      const item = catalog.find((candidate) => candidate.itemNumber === entry.itemNumber);
      if (!item) return { ok: false, error: "ITEM_NOT_FOUND", itemNumber: entry.itemNumber };
      let values: LabelValues;
      try {
        values = itemLabelValues(item, entry);
      } catch {
        // The item number has a space or "|", which the QR text cannot hold.
        return { ok: false, error: "ITEM_NOT_PRINTABLE", itemNumber: entry.itemNumber };
      }
      groups.push({ values, copies: entry.copies });
      logs.push({ item: item.itemNumber, values, entry });
    }

    for (const { item, values, entry } of logs) {
      const dates = itemLabelDates(
        catalog.find((c) => c.itemNumber === item)!,
        entry,
      )!;
      await logFor(
        access.actor,
        "catalog.itemLabelPrinted",
        {
          entityType: "item",
          entityId: item,
          details: {
            item,
            layout: layout.name,
            copies: entry.copies,
            certificateNo: values.certificateNo,
            slaughterDate: formatDate(dates.slaughter),
            productionDate: formatDate(dates.production),
            expiryDate: formatDate(dates.expiry),
            together: data.items.length,
          },
        },
        db,
      );
    }

    return {
      ok: true,
      job: {
        widthMm: layout.widthMm,
        heightMm: layout.heightMm,
        elements: layout.elements,
        groups,
      },
    };
  } catch (error) {
    if (error instanceof PermissionError) return { ok: false, error: "NOT_ALLOWED" };
    if (error instanceof z.ZodError) return { ok: false, error: "INVALID_INPUT" };
    if (error instanceof PriorityError && error.code === "UNAVAILABLE") {
      return { ok: false, error: "UNAVAILABLE" };
    }
    console.error("[catalog] preparing several item labels failed", error);
    return { ok: false, error: "GENERIC" };
  }
}

/** Chooses (or with an empty id clears) the packaging an item is packed in. Needs "packaging". */
export async function setItemPackagingAction(
  itemNumber: string,
  typeId: string,
): Promise<
  { ok: true } | { ok: false; error: "NOT_ALLOWED" | "INVALID_INPUT" | "NOT_FOUND" | "GENERIC" }
> {
  try {
    const access = await assertPermission("catalog.packaging");
    const data = z
      .object({ itemNumber: z.string().min(1).max(100), typeId: z.string().max(100) })
      .parse({ itemNumber, typeId });
    await setItemPackaging(db, data.itemNumber, data.typeId || null, access.actor);
    revalidatePath("/catalog");
    revalidatePath("/receiving");
    return { ok: true };
  } catch (error) {
    if (error instanceof PermissionError) return { ok: false, error: "NOT_ALLOWED" };
    if (error instanceof z.ZodError) return { ok: false, error: "INVALID_INPUT" };
    if (error instanceof PackagingError) return { ok: false, error: "NOT_FOUND" };
    console.error("[catalog] choosing the packaging of an item failed", error);
    return { ok: false, error: "GENERIC" };
  }
}
