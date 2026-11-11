/** The stand-in's behaviours, shared by the server and the settings screen (no server-only imports here). */
export const STAND_IN_MODES = ["normal", "slow", "down"] as const;
export type StandInMode = (typeof STAND_IN_MODES)[number];
