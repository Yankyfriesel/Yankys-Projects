import { timeZone } from "../i18n/config";

/** Today's list starts over at this hour (local time) every day. */
export const LIST_RESET_HOUR = 21;

/** The same hour as text, for the screens ("21:00"). */
export const LIST_RESET_TIME = `${String(LIST_RESET_HOUR).padStart(2, "0")}:00`;

/** The wall clock in the factory's time zone at an instant. */
function wallClock(at: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
    })
      .formatToParts(at)
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<"year" | "month" | "day" | "hour" | "minute", number>;
  return parts;
}

/** The instant a local wall-clock time happens in the factory's time zone. */
function instantOf(year: number, month: number, day: number, hour: number): Date {
  const guess = Date.UTC(year, month - 1, day, hour);
  // How far the zone is ahead of UTC at that moment (also right across a clock change).
  const seen = wallClock(new Date(guess));
  const asUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute);
  return new Date(guess - (asUtc - guess));
}

/**
 * The start of today's list: the latest 21:00 (factory time) that is not in the future.
 * Boxes received since then are on the list; at 21:00 it starts empty again.
 */
export function todayListStart(now: Date = new Date()): Date {
  const clock = wallClock(now);
  const todayReset = instantOf(clock.year, clock.month, clock.day, LIST_RESET_HOUR);
  if (now >= todayReset) return todayReset;
  const yesterday = new Date(Date.UTC(clock.year, clock.month - 1, clock.day - 1));
  return instantOf(
    yesterday.getUTCFullYear(),
    yesterday.getUTCMonth() + 1,
    yesterday.getUTCDate(),
    LIST_RESET_HOUR,
  );
}
