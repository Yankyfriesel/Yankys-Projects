import { describe, expect, it } from "vitest";
import { directionOf, isLocale, otherLocale } from "./config";
import {
  dayPeriod,
  formatDate,
  formatDateTime,
  formatInteger,
  formatLongDate,
  formatTime,
  formatWeight,
  todayIso,
} from "./format";

describe("greeting helpers", () => {
  it("names the part of the day in factory time", () => {
    expect(dayPeriod(new Date("2026-10-22T05:30:00Z"))).toBe("morning"); // 08:30
    expect(dayPeriod(new Date("2026-10-22T10:00:00Z"))).toBe("afternoon"); // 13:00
    expect(dayPeriod(new Date("2026-10-22T15:00:00Z"))).toBe("evening"); // 18:00
    expect(dayPeriod(new Date("2026-10-22T21:30:00Z"))).toBe("night"); // 00:30 next day
    expect(dayPeriod(new Date("2026-10-22T00:30:00Z"))).toBe("night"); // 03:30
    expect(dayPeriod(new Date("2026-10-22T02:00:00Z"))).toBe("morning"); // 05:00
  });

  it("gives today's date in the factory time zone", () => {
    expect(todayIso(new Date("2026-10-22T11:05:00Z"))).toBe("2026-10-22");
    expect(todayIso(new Date("2026-10-22T22:30:00Z"))).toBe("2026-10-23");
  });

  it("writes a long date in both languages", () => {
    const d = new Date("2026-10-22T11:05:00Z");
    expect(formatLongDate(d, "en")).toBe("Thursday, 22 October 2026");
    expect(formatLongDate(d, "he")).toContain("22");
    expect(formatLongDate(d, "he")).toContain("2026");
  });
});

describe("locale config", () => {
  it("accepts only he and en", () => {
    expect(isLocale("he")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it("maps Hebrew to RTL and English to LTR", () => {
    expect(directionOf("he")).toBe("rtl");
    expect(directionOf("en")).toBe("ltr");
  });

  it("toggles between the two languages", () => {
    expect(otherLocale("he")).toBe("en");
    expect(otherLocale("en")).toBe("he");
  });
});

describe("display formats (same in both languages)", () => {
  // 2026-10-22 14:05 in Asia/Jerusalem (UTC+3 in October)
  const d = new Date("2026-10-22T11:05:00Z");

  it("formats dates as DD/MM/YYYY in the factory time zone", () => {
    expect(formatDate(d)).toBe("22/10/2026");
    expect(formatDate("2026-01-05T22:30:00Z")).toBe("06/01/2026");
  });

  it("formats times as 24-hour HH:MM", () => {
    expect(formatTime(d)).toBe("14:05");
    expect(formatDateTime(d)).toBe("22/10/2026 14:05");
  });

  it("formats weights with two decimals and Latin digits", () => {
    expect(formatWeight(14.02)).toBe("14.02");
    expect(formatWeight(14)).toBe("14.00");
    expect(formatWeight(1234.5)).toBe("1,234.50");
  });

  it("formats integers with thousands separators", () => {
    expect(formatInteger(1402)).toBe("1,402");
  });
});
