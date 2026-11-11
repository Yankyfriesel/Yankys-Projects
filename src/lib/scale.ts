import { MAX_BOX_WEIGHT_KG } from "./barcodes";

/**
 * Reading the weight out of what the scale sends over its cable. The factory's indicator is a
 * Yaohua XK3190-A12, which in its continuous mode sends "=" followed by the weight with its
 * characters in reverse order ("=02.4100" is 14.20 kg). Other indicators send a line of text
 * with the weight in it ("ST,GS,+0014.20kg"). Both are understood; which one is used is decided
 * by the "=" at the start of each reading.
 */

/** The speeds a scale usually talks at; 9600 is the XK3190-A12's own setting. */
export const BAUD_RATES = [1200, 2400, 4800, 9600, 19200] as const;
export const DEFAULT_BAUD_RATE = 9600;

/** One reading as text ("=02.4100" or "ST,GS,+0014.20kg") to kilograms, or null when it has none. */
export function weightFromReading(reading: string, reversed: boolean): number | null {
  const text = reading.trim();
  if (text === "") return null;
  let digits: string;
  if (text.startsWith("=")) {
    const body = text.slice(1).replace(/[^\d.-]/g, "");
    digits = reversed ? [...body].reverse().join("") : body;
  } else {
    const match = /[-+]?\d+(?:[.,]\d+)?/.exec(text);
    if (!match) return null;
    digits = match[0].replace(",", ".");
  }
  // A minus sign the reversal put at the end belongs at the front.
  const negative = digits.includes("-");
  const value = Number(digits.replace(/-/g, ""));
  if (!Number.isFinite(value) || digits.replace(/[-.]/g, "") === "") return null;
  const kg = negative ? -value : value;
  if (kg > MAX_BOX_WEIGHT_KG * 10) return null;
  return Math.round(kg * 100) / 100;
}

/**
 * Splits what has arrived so far into whole readings: each "=" starts one, and so does each new
 * line. Gives the readings and what is left over, which waits for the next piece.
 */
export function splitReadings(buffer: string): { readings: string[]; rest: string } {
  const parts = buffer.split(/(?==)|\r\n|\r|\n/);
  const rest = parts.pop() ?? "";
  return { readings: parts.filter((part) => part.trim() !== ""), rest };
}
