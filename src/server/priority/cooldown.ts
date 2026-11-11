import type { Db } from "../db/connection";
import { deleteSetting, readSetting, writeSetting } from "../settings";
import type { PriorityErrorCode } from "./types";

/**
 * A rest after Priority refuses us. A wrong key counts as a failed sign-in, and after a few of
 * them Priority locks the account, so after the first refusal nothing asks Priority again for a
 * while: not a second click, not the other forms of the same check. Kept in the database so it
 * holds across restarts and across the two processes of `pnpm dev`.
 */

const KEY = "priority.cooldown";

/** How long to leave Priority alone after it said "no" or "locked". */
export const COOLDOWN_MINUTES: Partial<Record<PriorityErrorCode, number>> = {
  AUTH_FAILED: 10,
  RATE_LIMITED: 30,
};

export interface Cooldown {
  /** ISO time until which Priority is left alone. */
  until: string;
  code: PriorityErrorCode;
}

/** Whether this answer from Priority should start a rest. */
export function startsCooldown(code: PriorityErrorCode | null): code is PriorityErrorCode {
  return code !== null && COOLDOWN_MINUTES[code] !== undefined;
}

export async function getCooldown(db: Db, now: Date = new Date()): Promise<Cooldown | null> {
  const stored = await readSetting<Cooldown>(db, KEY);
  if (!stored || new Date(stored.value.until) <= now) return null;
  return stored.value;
}

export async function startCooldown(
  db: Db,
  code: PriorityErrorCode,
  now: Date = new Date(),
): Promise<Cooldown> {
  const minutes = COOLDOWN_MINUTES[code] ?? 10;
  const cooldown: Cooldown = {
    until: new Date(now.getTime() + minutes * 60_000).toISOString(),
    code,
  };
  await writeSetting(db, KEY, cooldown, null);
  return cooldown;
}

/** New credentials deserve a fresh try. */
export async function clearCooldown(db: Db): Promise<void> {
  await deleteSetting(db, KEY);
}

export function minutesLeft(cooldown: Cooldown, now: Date = new Date()): number {
  return Math.max(1, Math.ceil((new Date(cooldown.until).getTime() - now.getTime()) / 60_000));
}
