import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { defaultLocale, isLocale, LOCALE_COOKIE, timeZone } from "@/lib/i18n/config";
import { getSession } from "@/server/auth/session";

/**
 * Resolves the language for the current request: the logged-in user's saved
 * choice first, then the locale cookie (login page, before the first login).
 */
export default getRequestConfig(async () => {
  const session = await getSession().catch(() => null);
  const store = await cookies();
  const fromUser = session?.user.locale;
  const fromCookie = store.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(fromUser) ? fromUser : isLocale(fromCookie) ? fromCookie : defaultLocale;

  return {
    locale,
    timeZone,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
