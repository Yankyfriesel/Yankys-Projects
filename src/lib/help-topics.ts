/** The pages that have their own help text (messages: help.pages.<topic>). */
export const HELP_TOPICS = [
  "dashboard",
  "catalog",
  "receiving",
  "vendor",
  "shipping",
  "inventory",
  "pallets",
  "settingsCompany",
  "settingsPriority",
  "settingsReceiving",
  "settingsScale",
  "labels",
  "labelEditor",
  "adminUsers",
  "adminLog",
  "adminSends",
  "adminSecurity",
  "adminMessages",
  "account",
] as const;

export type HelpTopic = (typeof HELP_TOPICS)[number];

export function isHelpTopic(value: unknown): value is HelpTopic {
  return typeof value === "string" && (HELP_TOPICS as readonly string[]).includes(value);
}

/** The screen a page belongs to, for a message sent from it. */
export function screenOfTopic(
  topic: HelpTopic,
):
  | "dashboard"
  | "catalog"
  | "receiving"
  | "vendor"
  | "shipping"
  | "inventory"
  | "settings"
  | "admin"
  | "account" {
  if (topic === "pallets") return "inventory";
  if (topic.startsWith("settings") || topic === "labels" || topic === "labelEditor") {
    return "settings";
  }
  if (topic.startsWith("admin")) return "admin";
  return topic as
    | "dashboard"
    | "catalog"
    | "receiving"
    | "vendor"
    | "shipping"
    | "inventory"
    | "account";
}
