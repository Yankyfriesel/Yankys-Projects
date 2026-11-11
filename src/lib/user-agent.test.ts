import { describe, expect, it } from "vitest";
import { describeAgent } from "./user-agent";

describe("describeAgent", () => {
  it("reads Chrome on Windows", () => {
    const agent =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
    expect(describeAgent(agent)).toEqual({ browser: "Chrome", system: "Windows" });
  });

  it("reads Edge before Chrome", () => {
    const agent =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0";
    expect(describeAgent(agent).browser).toBe("Edge");
  });

  it("reads Safari on an iPhone", () => {
    const agent =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
    expect(describeAgent(agent)).toEqual({ browser: "Safari", system: "iPhone" });
  });

  it("reads Chrome on Android", () => {
    const agent =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
    expect(describeAgent(agent)).toEqual({ browser: "Chrome", system: "Android" });
  });

  it("gives nothing for an empty text", () => {
    expect(describeAgent(null)).toEqual({ browser: null, system: null });
  });
});
