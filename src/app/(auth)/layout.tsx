import { getTranslations } from "next-intl/server";
import { LogoLight } from "@/components/brand-logo";
import { IdleReset } from "@/components/idle-reset";
import { LanguageSwitcher } from "@/components/language-switcher";

/**
 * Login and change password. One box: a dark band with the logo and a
 * accent frame on top, the language button, then the form card. On a phone the
 * box fills the screen; on a larger screen the same box sits in the middle of
 * the page at the same width.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("app");

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted sm:px-8 sm:py-4">
      <div className="rise flex min-h-dvh w-full flex-col overflow-hidden bg-background sm:min-h-0 sm:max-w-[27rem] sm:rounded-3xl sm:shadow-pop sm:ring-1 sm:ring-border">
        <header className="lattice relative shrink-0 bg-sidebar text-sidebar-foreground">
          <div className="pointer-events-none absolute inset-3 rounded-2xl border border-sidebar-primary/30" />
          <div className="pointer-events-none absolute inset-5 rounded-xl border border-sidebar-primary/10" />
          <div className="relative flex items-center justify-center px-8 py-10 sm:py-8">
            <LogoLight alt={t("company")} className="w-52 sm:w-56" />
          </div>
        </header>

        <div className="flex justify-end px-5 pt-4 sm:pt-3">
          <LanguageSwitcher />
        </div>

        <main className="flex-1 px-5 pt-5 pb-8 sm:pt-4 sm:pb-6">{children}</main>
        <IdleReset />

        <footer className="pb-6 text-center text-xs text-muted-foreground sm:pb-5">
          {t("name")}
        </footer>
      </div>
    </div>
  );
}
