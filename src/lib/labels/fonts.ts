/**
 * The typefaces a label can use besides the three the screens use (sans, serif, mono). Every one
 * of them covers Hebrew as well as Latin letters. The key is what a layout stores; `family` is
 * the name shown in the designer; the font itself is loaded in src/app/label-fonts.ts.
 */
export const EXTRA_FONT_KEYS = [
  "assistant",
  "rubik",
  "alef",
  "open-sans",
  "noto-sans-hebrew",
  "noto-serif-hebrew",
  "plex-sans-hebrew",
  "arimo",
  "tinos",
  "david-libre",
  "miriam-libre",
  "secular-one",
  "suez-one",
  "varela-round",
  "fredoka",
  "karantina",
  "amatic-sc",
  "bellefair",
  "playpen-sans-hebrew",
  "gveret-levin",
] as const;

export type ExtraFontKey = (typeof EXTRA_FONT_KEYS)[number];

export const EXTRA_FONTS: Record<ExtraFontKey, { family: string; variable: string }> = {
  assistant: { family: "Assistant", variable: "--font-label-assistant" },
  rubik: { family: "Rubik", variable: "--font-label-rubik" },
  alef: { family: "Alef", variable: "--font-label-alef" },
  "open-sans": { family: "Open Sans", variable: "--font-label-open-sans" },
  "noto-sans-hebrew": { family: "Noto Sans Hebrew", variable: "--font-label-noto-sans" },
  "noto-serif-hebrew": { family: "Noto Serif Hebrew", variable: "--font-label-noto-serif" },
  "plex-sans-hebrew": { family: "IBM Plex Sans Hebrew", variable: "--font-label-plex" },
  arimo: { family: "Arimo", variable: "--font-label-arimo" },
  tinos: { family: "Tinos", variable: "--font-label-tinos" },
  "david-libre": { family: "David Libre", variable: "--font-label-david" },
  "miriam-libre": { family: "Miriam Libre", variable: "--font-label-miriam" },
  "secular-one": { family: "Secular One", variable: "--font-label-secular" },
  "suez-one": { family: "Suez One", variable: "--font-label-suez" },
  "varela-round": { family: "Varela Round", variable: "--font-label-varela" },
  fredoka: { family: "Fredoka", variable: "--font-label-fredoka" },
  karantina: { family: "Karantina", variable: "--font-label-karantina" },
  "amatic-sc": { family: "Amatic SC", variable: "--font-label-amatic" },
  bellefair: { family: "Bellefair", variable: "--font-label-bellefair" },
  "playpen-sans-hebrew": { family: "Playpen Sans Hebrew", variable: "--font-label-playpen" },
  "gveret-levin": { family: "Gveret Levin", variable: "--font-label-gveret" },
};

/** The CSS font-family for a typeface a label stores, or null for the three the screens use. */
export function extraFontFamily(key: string): string | null {
  const font = (EXTRA_FONTS as Record<string, { family: string; variable: string }>)[key];
  return font ? `var(${font.variable}), "${font.family}", sans-serif` : null;
}
