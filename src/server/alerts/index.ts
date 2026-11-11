import { logFor, type Actor } from "../activity-log";
import type { Db } from "../db/connection";
import { DEFAULT_ALERT_DAYS } from "../priority/summary";
import { readSetting, writeSetting } from "../settings";

/**
 * Expiry alerts: how many days before the expiry date a box counts as "about to expire".
 * Set per item category (Priority's own category text); a category with no choice of its
 * own uses DEFAULT_ALERT_DAYS.
 */

export const MIN_ALERT_DAYS = 1;
export const MAX_ALERT_DAYS = 365;

const KEY = "alerts.daysByCategory";

export class AlertsError extends Error {
  constructor(public readonly code: "INVALID_DAYS") {
    super(code);
    this.name = "AlertsError";
  }
}

export interface AlertSettings {
  defaultDays: number;
  /** Category text to its days; categories not in here use the default. */
  byCategory: Record<string, number>;
}

export async function getAlertSettings(db: Db): Promise<AlertSettings> {
  const stored = await readSetting<Record<string, number>>(db, KEY);
  return { defaultDays: DEFAULT_ALERT_DAYS, byCategory: stored?.value ?? {} };
}

export function alertDaysFor(settings: AlertSettings, category: string): number {
  return settings.byCategory[category] ?? settings.defaultDays;
}

/** Sets (or with null clears) the days for a category. Whole days from 1 to 365. */
export async function setCategoryAlertDays(
  db: Db,
  category: string,
  days: number | null,
  actor: Actor,
): Promise<void> {
  if (days !== null && (!Number.isInteger(days) || days < MIN_ALERT_DAYS || days > MAX_ALERT_DAYS))
    throw new AlertsError("INVALID_DAYS");
  const current = await getAlertSettings(db);
  const next = { ...current.byCategory };
  if (days === null) delete next[category];
  else next[category] = days;
  await writeSetting(db, KEY, next, actor.id);
  await logFor(
    actor,
    "settings.alertDaysChanged",
    {
      entityType: "settings",
      entityId: KEY,
      details: { category, from: current.byCategory[category] ?? null, to: days },
    },
    db,
  );
}
