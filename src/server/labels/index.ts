import { and, asc, eq, ne, sql } from "drizzle-orm";
import { logFor, type Actor } from "../activity-log";
import type { Db } from "../db/connection";
import { labelLayouts } from "../db/schema";
import { readSetting, writeSetting } from "../settings";
import {
  layoutSchema,
  type LabelElement,
  type LabelType,
  type LayoutContent,
} from "@/lib/labels/model";

export type LabelLayoutErrorCode = "NOT_FOUND" | "NAME_TAKEN" | "BOX_EXISTS";

export class LabelLayoutError extends Error {
  constructor(public readonly code: LabelLayoutErrorCode) {
    super(code);
    this.name = "LabelLayoutError";
  }
}

export interface LabelLayout {
  id: string;
  name: string;
  type: LabelType;
  widthMm: number;
  heightMm: number;
  elements: LabelElement[];
  createdAt: Date;
  updatedAt: Date;
}

export type LabelLayoutSummary = Omit<LabelLayout, "elements"> & { elementCount: number };

function toLayout(row: typeof labelLayouts.$inferSelect): LabelLayout {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    widthMm: row.widthMm,
    heightMm: row.heightMm,
    elements: row.elements,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const TYPE_ORDER: Record<LabelType, number> = { item: 0, box: 1, pallet: 2, shipping: 3 };

/** All layouts, item labels first, then the box label, then pallet labels; by name within a type. */
export async function listLayouts(db: Db): Promise<LabelLayoutSummary[]> {
  const rows = await db.select().from(labelLayouts).orderBy(asc(labelLayouts.name));
  return rows
    .map((row) => {
      const { elements, ...rest } = toLayout(row);
      return { ...rest, elementCount: elements.length };
    })
    .sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type]);
}

/** The one box label layout, or null when it was deleted. */
export async function getBoxLayout(db: Db): Promise<LabelLayout | null> {
  const [row] = await db.select().from(labelLayouts).where(eq(labelLayouts.type, "box")).limit(1);
  return row ? toLayout(row) : null;
}

/** The pallet layout a pallet label prints with: the oldest one, or null when none exists. */
export async function getPalletLayout(db: Db): Promise<LabelLayout | null> {
  const [row] = await db
    .select()
    .from(labelLayouts)
    .where(eq(labelLayouts.type, "pallet"))
    .orderBy(asc(labelLayouts.createdAt))
    .limit(1);
  return row ? toLayout(row) : null;
}

/** All layouts of one type with their elements, oldest first. */
export async function listLayoutsOfType(db: Db, type: LabelType): Promise<LabelLayout[]> {
  const rows = await db
    .select()
    .from(labelLayouts)
    .where(eq(labelLayouts.type, type))
    .orderBy(asc(labelLayouts.createdAt), asc(labelLayouts.name));
  return rows.map(toLayout);
}

export async function getLayout(db: Db, id: string): Promise<LabelLayout | null> {
  const [row] = await db.select().from(labelLayouts).where(eq(labelLayouts.id, id)).limit(1);
  return row ? toLayout(row) : null;
}

async function assertNameFree(db: Db, name: string, exceptId?: string): Promise<void> {
  const same = sql`lower(${labelLayouts.name}) = lower(${name})`;
  const [taken] = await db
    .select({ id: labelLayouts.id })
    .from(labelLayouts)
    .where(exceptId ? and(same, ne(labelLayouts.id, exceptId)) : same)
    .limit(1);
  if (taken) throw new LabelLayoutError("NAME_TAKEN");
}

async function assertNoBoxLayout(db: Db): Promise<void> {
  const [existing] = await db
    .select({ id: labelLayouts.id })
    .from(labelLayouts)
    .where(eq(labelLayouts.type, "box"))
    .limit(1);
  if (existing) throw new LabelLayoutError("BOX_EXISTS");
}

export interface NewLayout {
  name: string;
  type: LabelType;
  widthMm: number;
  heightMm: number;
  elements?: LabelElement[];
}

/** Creates a layout. A new one starts empty unless given elements. There is only ever one box layout. */
export async function createLayout(db: Db, input: NewLayout, actor: Actor): Promise<LabelLayout> {
  const content = layoutSchema.parse({ ...input, elements: input.elements ?? [] });
  await assertNameFree(db, content.name);
  if (input.type === "box") await assertNoBoxLayout(db);

  const [row] = await db
    .insert(labelLayouts)
    .values({
      name: content.name,
      type: input.type,
      widthMm: content.widthMm,
      heightMm: content.heightMm,
      elements: content.elements,
      createdBy: actor.id,
    })
    .returning();
  await logFor(
    actor,
    "settings.labelLayoutCreated",
    { entityType: "label_layout", entityId: row.id, details: { name: row.name, type: row.type } },
    db,
  );
  return toLayout(row);
}

/** Replaces a layout's name, size and elements. Its type never changes. */
export async function saveLayout(
  db: Db,
  id: string,
  input: LayoutContent,
  actor: Actor,
): Promise<LabelLayout> {
  const content = layoutSchema.parse(input);
  if (!(await getLayout(db, id))) throw new LabelLayoutError("NOT_FOUND");
  await assertNameFree(db, content.name, id);

  const [row] = await db
    .update(labelLayouts)
    .set({
      name: content.name,
      widthMm: content.widthMm,
      heightMm: content.heightMm,
      elements: content.elements,
    })
    .where(eq(labelLayouts.id, id))
    .returning();
  if (!row) throw new LabelLayoutError("NOT_FOUND");
  await logFor(
    actor,
    "settings.labelLayoutSaved",
    {
      entityType: "label_layout",
      entityId: id,
      details: { name: row.name, elements: content.elements.length },
    },
    db,
  );
  return toLayout(row);
}

/** A copy named "<name> (copy)", or "(copy 2)" and so on. Not for the box layout: there is only one. */
export async function duplicateLayout(db: Db, id: string, actor: Actor): Promise<LabelLayout> {
  const source = await getLayout(db, id);
  if (!source) throw new LabelLayoutError("NOT_FOUND");
  if (source.type === "box") throw new LabelLayoutError("BOX_EXISTS");

  let name = `${source.name} (copy)`;
  for (let n = 2; ; n++) {
    try {
      await assertNameFree(db, name);
      break;
    } catch (error) {
      if (!(error instanceof LabelLayoutError)) throw error;
      name = `${source.name} (copy ${n})`;
    }
  }
  const copy = await createLayout(
    db,
    {
      name,
      type: source.type,
      widthMm: source.widthMm,
      heightMm: source.heightMm,
      elements: source.elements,
    },
    actor,
  );
  return copy;
}

export async function deleteLayout(db: Db, id: string, actor: Actor): Promise<void> {
  const [row] = await db.delete(labelLayouts).where(eq(labelLayouts.id, id)).returning();
  if (!row) throw new LabelLayoutError("NOT_FOUND");
  await logFor(
    actor,
    "settings.labelLayoutDeleted",
    { entityType: "label_layout", entityId: id, details: { name: row.name, type: row.type } },
    db,
  );
}

// ---------------------------------------------------------------------------
// Item layouts, for the print window
// ---------------------------------------------------------------------------

/** All item layouts with their elements (what a print window needs), oldest first. */
export async function listItemLayouts(db: Db): Promise<LabelLayout[]> {
  const rows = await db
    .select()
    .from(labelLayouts)
    .where(eq(labelLayouts.type, "item"))
    .orderBy(asc(labelLayouts.createdAt), asc(labelLayouts.name));
  return rows.map(toLayout);
}

const DEFAULT_ITEM_LAYOUT_KEY = "labels.defaultItemLayout";

/** The item layout chosen in advance when printing from the catalog; it can still be changed. */
export async function getDefaultItemLayout(db: Db): Promise<string | null> {
  const stored = await readSetting<string>(db, DEFAULT_ITEM_LAYOUT_KEY);
  return stored?.value || null;
}

/** Makes an item layout the default (null for none). Only an item layout can be the default. */
export async function setDefaultItemLayout(db: Db, id: string | null, actor: Actor): Promise<void> {
  let name: string | null = null;
  if (id !== null) {
    const layout = await getLayout(db, id);
    if (!layout || layout.type !== "item") throw new LabelLayoutError("NOT_FOUND");
    name = layout.name;
  }
  // A setting cannot hold null: no default is kept as an empty text.
  await writeSetting(db, DEFAULT_ITEM_LAYOUT_KEY, id ?? "", actor.id);
  await logFor(
    actor,
    "settings.labelDefaultChanged",
    { entityType: "settings", entityId: DEFAULT_ITEM_LAYOUT_KEY, details: { layout: name } },
    db,
  );
}
