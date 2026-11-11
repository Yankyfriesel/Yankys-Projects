import type { DeviceType } from "../db/schema";

const PHONE_USER_AGENT = /Mobi|Android|iPhone|iPad|iPod|Tablet|Silk|Kindle|Opera Mini/i;

/**
 * Device class for permissions: "phone" for phones and tablets, "desktop" for
 * laptops and desktops. Decided once at login from the user agent and stored on
 * the session. (An iPad in "desktop site" mode reports itself as a Mac and is
 * treated as a desktop.)
 */
export function detectDeviceType(userAgent: string | null | undefined): DeviceType {
  if (!userAgent) return "desktop";
  return PHONE_USER_AGENT.test(userAgent) ? "phone" : "desktop";
}

export function clientIp(headers: Headers | null | undefined): string | null {
  if (!headers) return null;
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip");
}
