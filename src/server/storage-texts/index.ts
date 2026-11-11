import { logFor, type Actor } from "../activity-log";
import type { Db } from "../db/connection";
import type { PriorityItem } from "../priority/types";
import { readSetting, writeSetting } from "../settings";

/**
 * The storage text a label prints ("keep frozen at -18°C ..."), set per item category. An item
 * whose own storage text in Priority is empty takes its category's; Priority's own text wins.
 */

export const MAX_STORAGE_TEXT = 300;

const KEY = "labels.storageTextByCategory";

export class StorageTextError extends Error {
  constructor(public readonly code: "TOO_LONG") {
    super(code);
    this.name = "StorageTextError";
  }
}

/** Category text to its storage text; categories not in here have none of their own. */
export async function getStorageTexts(db: Db): Promise<Record<string, string>> {
  const stored = await readSetting<Record<string, string>>(db, KEY);
  return stored?.value ?? {};
}

/** Sets (or with an empty text clears) the storage text of a category. */
export async function setCategoryStorageText(
  db: Db,
  category: string,
  text: string,
  actor: Actor,
): Promise<void> {
  const value = text.trim();
  if (value.length > MAX_STORAGE_TEXT) throw new StorageTextError("TOO_LONG");
  const current = await getStorageTexts(db);
  const next = { ...current };
  if (value === "") delete next[category];
  else next[category] = value;
  await writeSetting(db, KEY, next, actor.id);
  await logFor(
    actor,
    "settings.storageTextChanged",
    {
      entityType: "settings",
      entityId: KEY,
      details: { category, from: current[category] ?? null, to: value || null },
    },
    db,
  );
}

/** The items, each with its category's storage text where Priority gives none. */
export function withStorageTexts(
  items: PriorityItem[],
  texts: Record<string, string>,
): PriorityItem[] {
  return items.map((item) =>
    item.storageText || !texts[item.category]
      ? item
      : { ...item, storageText: texts[item.category] },
  );
}
