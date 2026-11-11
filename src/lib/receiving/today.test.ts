import { describe, expect, it } from "vitest";
import { todayListStart } from "./today";

describe("today's list", () => {
  // Israel is UTC+3 in summer (until the last Sunday of October) and UTC+2 in winter.
  it("starts at 21:00 of the day before until 21:00 comes", () => {
    // 28 Oct 2026, 09:00 in Israel (UTC+2 by then) = 07:00 UTC
    expect(todayListStart(new Date("2026-10-28T07:00:00Z")).toISOString()).toBe(
      "2026-10-27T19:00:00.000Z",
    );
  });

  it("starts over at 21:00 sharp", () => {
    expect(todayListStart(new Date("2026-10-28T18:59:59Z")).toISOString()).toBe(
      "2026-10-27T19:00:00.000Z",
    );
    expect(todayListStart(new Date("2026-10-28T19:00:00Z")).toISOString()).toBe(
      "2026-10-28T19:00:00.000Z",
    );
    expect(todayListStart(new Date("2026-10-28T20:00:00Z")).toISOString()).toBe(
      "2026-10-28T19:00:00.000Z",
    );
  });

  it("follows the summer clock too", () => {
    // 15 July 2026, 10:00 in Israel (UTC+3) = 07:00 UTC; the reset before it was 21:00 on the 14th.
    expect(todayListStart(new Date("2026-07-15T07:00:00Z")).toISOString()).toBe(
      "2026-07-14T18:00:00.000Z",
    );
  });
});
