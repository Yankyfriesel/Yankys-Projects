export interface AgentInfo {
  /** For example "Chrome"; null when the browser is not known. */
  browser: string | null;
  /** For example "Windows"; null when the system is not known. */
  system: string | null;
}

const BROWSERS: [string, RegExp][] = [
  ["Edge", /Edg(?:e|A|iOS)?\//],
  ["Opera", /OPR\/|Opera/],
  ["Firefox", /Firefox\/|FxiOS\//],
  ["Chrome", /Chrome\/|CriOS\//],
  ["Safari", /Safari\//],
];

const SYSTEMS: [string, RegExp][] = [
  ["Android", /Android/],
  ["iPhone", /iPhone|iPod/],
  ["iPad", /iPad/],
  ["Windows", /Windows/],
  ["Mac", /Macintosh|Mac OS X/],
  ["Linux", /Linux|X11/],
];

/** A short, readable description of a browser from its user-agent text. */
export function describeAgent(userAgent: string | null | undefined): AgentInfo {
  if (!userAgent) return { browser: null, system: null };
  const browser = BROWSERS.find(([, pattern]) => pattern.test(userAgent))?.[0] ?? null;
  const system = SYSTEMS.find(([, pattern]) => pattern.test(userAgent))?.[0] ?? null;
  return { browser, system };
}
