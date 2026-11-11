import { logFor, type Actor } from "../activity-log";
import type { Db } from "../db/connection";
import type { PriorityItem } from "../priority/types";
import { readSetting, writeSetting } from "../settings";

/**
 * The days a box keeps from its slaughter date, set per item category. The expiry date on a label
 * is the slaughter date plus these days. An item whose own shelf life in Priority is more than
 * nothing keeps it; the category's days fill in for the items Priority gives none.
 */

export const MIN_SHELF_LIFE_DAYS = 1;
export const MAX_SHELF_LIFE_DAYS = 3650;

const KEY = "receiving.shelfLifeDaysByCategory";

export class ShelfLifeError extends Error {
  constructor(public readonly code: "INVALID_DAYS") {
    super(code);
    this.name = "ShelfLifeError";
  }
}

/** Category text to its days; categories not in here have none of their own. */
export async function getShelfLives(db: Db): Promise<Record<string, number>> {
  const stored = await readSetting<Record<string, number>>(db, KEY);
  return stored?.value ?? {};
}

/** Sets (or with null clears) the shelf life of a category. Whole days from 1 to 3650. */
export async function setCategoryShelfLife(
  db: Db,
  category: string,
  days: number | null,
  actor: Actor,
): Promise<void> {
  if (
    days !== null &&
    (!Number.isInteger(days) || days < MIN_SHELF_LIFE_DAYS || days > MAX_SHELF_LIFE_DAYS)
  )
    throw new ShelfLifeError("INVALID_DAYS");
  const current = await getShelfLives(db);
  const next = { ...current };
  if (days === null) delete next[category];
  else next[category] = days;
  await writeSetting(db, KEY, next, actor.id);
  await logFor(
    actor,
    "settings.shelfLifeChanged",
    {
      entityType: "settings",
      entityId: KEY,
      details: { category, from: current[category] ?? null, to: days },
    },
    db,
  );
}

/** The items, each with its category's days where Priority gives it none. */
export function withShelfLives(
  items: PriorityItem[],
  days: Record<string, number>,
): PriorityItem[] {
  return items.map((item) =>
    item.shelfLifeDays > 0 || !days[item.category]
      ? item
      : { ...item, shelfLifeDays: days[item.category] },
  );
}
