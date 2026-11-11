import { describe, expect, it } from "vitest";
import { splitReadings, weightFromReading } from "./scale";

describe("reading the scale", () => {
  it("reads the XK3190-A12's reversed readings", () => {
    expect(weightFromReading("=02.4100", true)).toBe(14.2);
    expect(weightFromReading("=00.0000", true)).toBe(0);
    expect(weightFromReading("=20.5-00", true)).toBe(-5.02);
    // Not reversed, when the scale is set that way.
    expect(weightFromReading("=0014.20", false)).toBe(14.2);
  });

  it("reads a line of text with the weight in it", () => {
    expect(weightFromReading("ST,GS,+0014.20kg", true)).toBe(14.2);
    expect(weightFromReading("  13,5 kg", true)).toBe(13.5);
    expect(weightFromReading("US,GS,-0000.40kg", true)).toBe(-0.4);
  });

  it("finds nothing in noise", () => {
    expect(weightFromReading("", true)).toBeNull();
    expect(weightFromReading("=", true)).toBeNull();
    expect(weightFromReading("OL", true)).toBeNull();
  });

  it("splits what arrives into whole readings and keeps the unfinished end", () => {
    expect(splitReadings("=02.4100=02.41")).toEqual({ readings: ["=02.4100"], rest: "=02.41" });
    expect(splitReadings("ST,GS,+0014.20kg\r\nST,GS,+00")).toEqual({
      readings: ["ST,GS,+0014.20kg"],
      rest: "ST,GS,+00",
    });
    expect(splitReadings("")).toEqual({ readings: [], rest: "" });
  });
});
