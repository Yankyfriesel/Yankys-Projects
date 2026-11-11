export const locales = ["he", "en"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "he";

/** Cookie that remembers the language before login and for the login page. */
export const LOCALE_COOKIE = "locale";

export const timeZone = "Asia/Jerusalem";

export type Direction = "rtl" | "ltr";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

export function directionOf(locale: Locale): Direction {
  return locale === "he" ? "rtl" : "ltr";
}

export function otherLocale(locale: Locale): Locale {
  return locale === "he" ? "en" : "he";
}
