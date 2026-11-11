"use client";

import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setLocale } from "@/lib/i18n/actions";
import { otherLocale, type Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

/**
 * One button that switches the whole UI to the other language.
 * The label always names the language you will get, in that language.
 * `sidebar` is the dark-menu look; `iconOnly` hides the label (collapsed menu).
 */
export function LanguageSwitcher({
  className,
  tone = "light",
  iconOnly = false,
}: {
  className?: string;
  tone?: "light" | "sidebar";
  iconOnly?: boolean;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations("language");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      await setLocale(otherLocale(locale));
      router.refresh();
    });
  }

  return (
    <Button
      variant={tone === "sidebar" ? "ghost" : "outline"}
      size={iconOnly ? "icon-sm" : "sm"}
      onClick={onClick}
      disabled={pending}
      aria-label={t("label")}
      title={t("switchTo")}
      className={cn(
        tone === "sidebar" &&
          "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        className,
      )}
    >
      <Languages data-icon={iconOnly ? undefined : "inline-start"} />
      {iconOnly ? null : t("switchTo")}
    </Button>
  );
}
