import { readFile } from "node:fs/promises";
import path from "node:path";
import { logFor, type Actor } from "../activity-log";
import type { Db } from "../db/connection";
import { deleteSetting, readSetting, writeSetting } from "../settings";
import { BRAND_VARIANTS, MAX_LOGO_BYTES, type BrandVariant } from "./shared";

/**
 * The company logo in the three forms the interface needs. The originals are
 * the default files in public/brand; an administrator can replace each
 * one, and the replacement is kept in the database (so it survives a deploy)
 * and served from /api/brand/<variant>.
 */

export { BRAND_VARIANTS, MAX_LOGO_BYTES, type BrandVariant } from "./shared";

export function isBrandVariant(value: string): value is BrandVariant {
  return (BRAND_VARIANTS as readonly string[]).includes(value);
}

const DEFAULT_FILES: Record<BrandVariant, string> = {
  light: "logo-light.png",
  full: "logo.png",
  mark: "logo-mark.png",
};

export type BrandMime = "image/png" | "image/jpeg" | "image/webp";

export class BrandError extends Error {
  constructor(public readonly code: "INVALID_TYPE" | "TOO_LARGE" | "EMPTY") {
    super(code);
    this.name = "BrandError";
  }
}

/** The real type from the file's first bytes; the name and the browser's claim are not trusted. SVG is refused on purpose (it can carry scripts). */
export function detectImage(bytes: Uint8Array): BrandMime | null {
  const startsWith = (...signature: number[]) => signature.every((b, i) => bytes[i] === b);
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (startsWith(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (startsWith(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return "image/webp";
  }
  return null;
}

interface StoredLogo {
  mime: BrandMime;
  /** base64 */
  data: string;
}

const key = (variant: BrandVariant) => `brand.${variant}`;

export interface BrandImage {
  bytes: Buffer;
  mime: BrandMime;
  custom: boolean;
  /** Changes whenever the image does; used as the ETag. */
  version: string;
}

export async function getBrandImage(db: Db, variant: BrandVariant): Promise<BrandImage> {
  const stored = await readSetting<StoredLogo>(db, key(variant));
  if (stored) {
    return {
      bytes: Buffer.from(stored.value.data, "base64"),
      mime: stored.value.mime,
      custom: true,
      version: String(stored.updatedAt.getTime()),
    };
  }
  const file = DEFAULT_FILES[variant];
  const bytes = await readFile(path.join(process.cwd(), "public", "brand", file));
  return { bytes, mime: file.endsWith(".png") ? "image/png" : "image/jpeg", custom: false, version: "original" };
}

/** Which of the three have been replaced. */
export async function brandStatus(db: Db): Promise<Record<BrandVariant, { custom: boolean; updatedAt: Date | null }>> {
  const entries = await Promise.all(
    BRAND_VARIANTS.map(async (variant) => {
      const stored = await readSetting<StoredLogo>(db, key(variant));
      return [variant, { custom: stored !== null, updatedAt: stored?.updatedAt ?? null }] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<BrandVariant, { custom: boolean; updatedAt: Date | null }>;
}

export async function setBrandImage(
  db: Db,
  variant: BrandVariant,
  bytes: Uint8Array,
  actor: Actor,
): Promise<void> {
  if (bytes.length === 0) throw new BrandError("EMPTY");
  if (bytes.length > MAX_LOGO_BYTES) throw new BrandError("TOO_LARGE");
  const mime = detectImage(bytes);
  if (!mime) throw new BrandError("INVALID_TYPE");

  const value: StoredLogo = { mime, data: Buffer.from(bytes).toString("base64") };
  await writeSetting(db, key(variant), value, actor.id);
  await logFor(actor, "settings.logoChanged", { entityType: "logo", entityId: variant, details: { variant } }, db);
}

export async function resetBrandImage(db: Db, variant: BrandVariant, actor: Actor): Promise<void> {
  await deleteSetting(db, key(variant));
  await logFor(actor, "settings.logoRestored", { entityType: "logo", entityId: variant, details: { variant } }, db);
}
