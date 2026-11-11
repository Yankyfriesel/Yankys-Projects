import { logFor, type Actor } from "../activity-log";
import type { Db } from "../db/connection";
import { readSetting, writeSetting } from "../settings";
import { STAND_IN_MODES, type StandInMode } from "./modes";
import { PriorityError } from "./types";

/**
 * How the Priority stand-in behaves, so the system can be tried when Priority
 * is slow or not answering. Only the stand-in reads this; the real client of
 * phase 6 simply meets the real thing.
 */

export { STAND_IN_MODES, type StandInMode } from "./modes";

export interface StandInBehaviour {
  mode: StandInMode;
  /** Pause added to every call in "slow" mode. */
  delayMs: number;
}

/** Same key the seed writes. */
const KEY = "fakePriority.behaviour";

export const DEFAULT_BEHAVIOUR: StandInBehaviour = { mode: "normal", delayMs: 5000 };

export function isStandInMode(value: unknown): value is StandInMode {
  return typeof value === "string" && (STAND_IN_MODES as readonly string[]).includes(value);
}

export async function getStandInBehaviour(db: Db): Promise<StandInBehaviour> {
  const stored = await readSetting<Partial<StandInBehaviour>>(db, KEY);
  const mode = isStandInMode(stored?.value.mode) ? stored.value.mode : DEFAULT_BEHAVIOUR.mode;
  const delayMs =
    typeof stored?.value.delayMs === "number" && stored.value.delayMs >= 0
      ? stored.value.delayMs
      : DEFAULT_BEHAVIOUR.delayMs;
  return { mode, delayMs };
}

export async function setStandInMode(db: Db, mode: StandInMode, actor: Actor): Promise<void> {
  const current = await getStandInBehaviour(db);
  await writeSetting(db, KEY, { ...current, mode }, actor.id);
  await logFor(
    actor,
    "settings.standInChanged",
    { entityType: "settings", entityId: KEY, details: { from: current.mode, to: mode } },
    db,
  );
}

/** Called at the start of every stand-in call: waits when slow, throws when down. */
export async function applyBehaviour(db: Db): Promise<void> {
  const { mode, delayMs } = await getStandInBehaviour(db);
  if (mode === "down") throw new PriorityError("UNAVAILABLE");
  if (mode === "slow") await new Promise((resolve) => setTimeout(resolve, delayMs));
}
