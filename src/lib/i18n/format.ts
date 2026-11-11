import { timeZone } from "@/lib/i18n/config";

/**
 * Display formats are the same in both languages: DD/MM/YYYY, Latin digits,
 * weights with two decimals. These helpers never depend on the UI locale.
 */

const dateParts = new Intl.DateTimeFormat("en-GB", {
  timeZone,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const timeParts = new Intl.DateTimeFormat("en-GB", {
  timeZone,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const weight = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 22/10/2026 */
export function formatDate(value: Date | string | number): string {
  return dateParts.format(toDate(value));
}

/** 22/10/2026 14:05 */
export function formatDateTime(value: Date | string | number): string {
  const d = toDate(value);
  return `${dateParts.format(d)} ${timeParts.format(d)}`;
}

/** 14:05 */
export function formatTime(value: Date | string | number): string {
  return timeParts.format(toDate(value));
}

/** 1402 -> "1,402" */
export function formatInteger(value: number): string {
  return number.format(value);
}

const packingWeight = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 3,
});

/** 0.5 -> "0.50", 0.015 -> "0.015" (kilograms, to the gram: for what a bag or box weighs) */
export function formatPackingWeight(kg: number): string {
  return packingWeight.format(kg);
}

/** 14.0 -> "14.00" (kilograms) */
export function formatWeight(kg: number): string {
  return weight.format(kg);
}

/** Today's calendar date in the factory time zone, as YYYY-MM-DD. */
export function todayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export type DayPeriod = "morning" | "afternoon" | "evening" | "night";

/** For the greeting: morning 5-11, afternoon 12-16, evening 17-20, night otherwise (factory time). */
export function dayPeriod(now: Date = new Date()): DayPeriod {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" })
      .format(now)
      .slice(0, 2),
  );
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

/** A date written out in words in the UI language: "Thursday, 22 October 2026". */
export function formatLongDate(value: Date | string | number, locale: "he" | "en"): string {
  return new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-GB", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(toDate(value));
}

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}
