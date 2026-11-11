/** Constants shared by the server and the settings screen; no server-only imports here. */

export const BRAND_VARIANTS = ["light", "full", "mark"] as const;
export type BrandVariant = (typeof BRAND_VARIANTS)[number];

export const MAX_LOGO_BYTES = 1024 * 1024;
