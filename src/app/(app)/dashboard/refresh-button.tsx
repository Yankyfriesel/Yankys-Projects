"use client";

import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";

/** Re-reads the stock from Priority and redraws the dashboard. */
export function RefreshButton() {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
    >
      <RefreshCw data-icon="inline-start" className={pending ? "animate-spin" : undefined} />
      {pending ? t("refreshing") : t("refresh")}
    </Button>
  );
}
