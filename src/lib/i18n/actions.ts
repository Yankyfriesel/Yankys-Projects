"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE, type Locale } from "@/lib/i18n/config";
import { logFor } from "@/server/activity-log";
import { getOptionalUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Remembers the chosen language: in the cookie always, and on the user when
 * logged in (so it follows them to any device).
 */
export async function setLocale(locale: Locale): Promise<void> {
  if (!isLocale(locale)) throw new Error("Unsupported locale");

  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: ONE_YEAR,
    sameSite: "lax",
    httpOnly: true,
  });

  const current = await getOptionalUser();
  if (current && current.user.locale !== locale) {
    await db.update(users).set({ locale }).where(eq(users.id, current.user.id));
    await logFor(current.actor, "user.languageChanged", {
      entityType: "user",
      entityId: current.user.id,
      details: { locale },
    });
  }
}
