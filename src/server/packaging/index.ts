import { randomUUID } from "node:crypto";
import { grams, netWeight } from "../../lib/packaging";
import { logFor, type Actor } from "../activity-log";
import type { Db } from "../db/connection";
import { readSetting, writeSetting } from "../settings";

/**
 * The packaging an item is packed in: kinds of packaging, each with its own weight. A box is
 * weighed on the scale with its packaging, so the weight kept in the inventory (and printed on
 * the label, and sent to Priority) is the scale reading less the packaging. The kind is chosen
 * for each item, in the catalog.
 */

export { netWeight };

export interface PackagingType {
  id: string;
  name: string;
  /** What one empty carton weighs, in kilograms (to the gram). */
  weightKg: number;
}

export const MAX_PACKAGING_KG = 20;
export const MAX_PACKAGING_NAME = 60;
export const MAX_PACKAGING_TYPES = 200;

export type PackagingErrorCode = "INVALID_NAME" | "INVALID_WEIGHT" | "NOT_FOUND" | "TOO_MANY";

export class PackagingError extends Error {
  constructor(public readonly code: PackagingErrorCode) {
    super(code);
    this.name = "PackagingError";
  }
}

const TYPES_KEY = "packaging.types";
/** Item number to the id of its packaging. */
const ITEMS_KEY = "packaging.byItem";

function checkWeight(weightKg: number): void {
  if (!Number.isFinite(weightKg) || weightKg < 0 || grams(weightKg) > MAX_PACKAGING_KG * 1000)
    throw new PackagingError("INVALID_WEIGHT");
}

function cleanName(name: string): string {
  const text = name.trim();
  if (text.length === 0 || text.length > MAX_PACKAGING_NAME)
    throw new PackagingError("INVALID_NAME");
  return text;
}

export async function getPackagingTypes(db: Db): Promise<PackagingType[]> {
  const stored = (await readSetting<(PackagingType & { kind?: string })[]>(db, TYPES_KEY))?.value;
  // An earlier version also kept bags; only cartons are used now.
  const types = (stored ?? []).filter((type) => type.kind !== "bag");
  return types
    .map(({ id, name, weightKg }) => ({ id, name, weightKg }))
    .sort((a, b) => a.name.localeCompare(b.name, "he"));
}

async function saveTypes(db: Db, types: PackagingType[], actor: Actor): Promise<void> {
  await writeSetting(db, TYPES_KEY, types, actor.id);
}

/** The packaging chosen for each item (only those that have one). */
export async function getItemPackaging(db: Db): Promise<Record<string, string>> {
  const stored = (await readSetting<Record<string, string>>(db, ITEMS_KEY))?.value ?? {};
  return Object.fromEntries(
    Object.entries(stored).filter(([, id]) => typeof id === "string" && id),
  );
}

export async function addPackagingType(
  db: Db,
  input: { name: string; weightKg: number },
  actor: Actor,
): Promise<PackagingType> {
  checkWeight(input.weightKg);
  const name = cleanName(input.name);
  const types = await getPackagingTypes(db);
  if (types.length >= MAX_PACKAGING_TYPES) throw new PackagingError("TOO_MANY");
  const created: PackagingType = {
    id: randomUUID(),
    name,
    weightKg: grams(input.weightKg) / 1000,
  };
  await saveTypes(db, [...types, created], actor);
  await logFor(
    actor,
    "settings.packagingTypeAdded",
    {
      entityType: "settings",
      entityId: created.id,
      details: { name, weightKg: created.weightKg },
    },
    db,
  );
  return created;
}

export async function updatePackagingType(
  db: Db,
  id: string,
  input: { name: string; weightKg: number },
  actor: Actor,
): Promise<void> {
  checkWeight(input.weightKg);
  const name = cleanName(input.name);
  const types = await getPackagingTypes(db);
  const before = types.find((type) => type.id === id);
  if (!before) throw new PackagingError("NOT_FOUND");
  const weightKg = grams(input.weightKg) / 1000;
  await saveTypes(
    db,
    types.map((type) => (type.id === id ? { ...type, name, weightKg } : type)),
    actor,
  );
  await logFor(
    actor,
    "settings.packagingTypeChanged",
    {
      entityType: "settings",
      entityId: id,
      details: {
        name,
        from: { name: before.name, weightKg: before.weightKg },
        to: { name, weightKg },
      },
    },
    db,
  );
}

/** Removes a packaging type, and from every item that used it. Boxes already received keep their weight. */
export async function deletePackagingType(db: Db, id: string, actor: Actor): Promise<number> {
  const types = await getPackagingTypes(db);
  const before = types.find((type) => type.id === id);
  if (!before) throw new PackagingError("NOT_FOUND");
  await saveTypes(
    db,
    types.filter((type) => type.id !== id),
    actor,
  );

  const chosen = await getItemPackaging(db);
  const next = Object.fromEntries(Object.entries(chosen).filter(([, typeId]) => typeId !== id));
  const items = Object.keys(chosen).length - Object.keys(next).length;
  if (items > 0) await writeSetting(db, ITEMS_KEY, next, actor.id);

  await logFor(
    actor,
    "settings.packagingTypeDeleted",
    {
      entityType: "settings",
      entityId: id,
      details: { name: before.name, weightKg: before.weightKg, items },
    },
    db,
  );
  return items;
}

/** Chooses (or with null clears) the packaging of an item. */
export async function setItemPackaging(
  db: Db,
  itemNumber: string,
  typeId: string | null,
  actor: Actor,
): Promise<void> {
  if (typeId !== null) {
    const types = await getPackagingTypes(db);
    if (!types.some((type) => type.id === typeId)) throw new PackagingError("NOT_FOUND");
  }
  const chosen = await getItemPackaging(db);
  const next = { ...chosen };
  if (typeId === null) delete next[itemNumber];
  else next[itemNumber] = typeId;
  await writeSetting(db, ITEMS_KEY, next, actor.id);
  await logFor(
    actor,
    "catalog.packagingChanged",
    {
      entityType: "item",
      entityId: itemNumber,
      details: { item: itemNumber, from: chosen[itemNumber] ?? null, to: typeId },
    },
    db,
  );
}

export interface Tare {
  box: PackagingType | null;
  /** What the packaging weighs, in kilograms. */
  totalKg: number;
}

export const NO_TARE: Tare = { box: null, totalKg: 0 };

/** The packaging of every item that has one, for the screens that need to show its weight. */
export async function getTares(db: Db): Promise<Record<string, Tare>> {
  const [types, chosen] = await Promise.all([getPackagingTypes(db), getItemPackaging(db)]);
  const byId = new Map(types.map((type) => [type.id, type]));
  const out: Record<string, Tare> = {};
  for (const [itemNumber, typeId] of Object.entries(chosen)) {
    const box = byId.get(typeId);
    if (box) out[itemNumber] = { box, totalKg: box.weightKg };
  }
  return out;
}

export async function getTare(db: Db, itemNumber: string): Promise<Tare> {
  return (await getTares(db))[itemNumber] ?? NO_TARE;
}
