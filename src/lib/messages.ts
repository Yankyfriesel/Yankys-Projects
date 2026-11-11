/** What a message to the administrators is made of: pure lists, shared by the form and the server. */

export const MESSAGE_KINDS = ["question", "request", "problem", "suggestion"] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

/** The screens a message can be about (the same keys as the menu), then the sign-in and "something else". */
export const MESSAGE_SCREENS = [
  "dashboard",
  "catalog",
  "receiving",
  "vendor",
  "shipping",
  "inventory",
  "settings",
  "admin",
  "account",
  "signin",
  "other",
] as const;
export type MessageScreen = (typeof MESSAGE_SCREENS)[number];

/** What about it, for each kind. */
export const MESSAGE_SUBJECTS = {
  question: ["howTo", "meaning", "whyThis", "other"],
  request: ["permission", "user", "password", "data", "label", "feature", "other"],
  problem: ["notWorking", "wrongData", "printing", "scale", "slow", "other"],
  suggestion: ["screen", "report", "feature", "other"],
} as const satisfies Record<MessageKind, readonly string[]>;

export const MAX_DETAILS = 1000;
export const MIN_DETAILS = 5;
/** Messages one person can send in an hour. */
export const MESSAGES_PER_HOUR = 10;
