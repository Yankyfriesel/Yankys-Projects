"use client";

import { RotateCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { retrySendsAction } from "./actions";

/** Puts failed sends back in the queue; `all` is the button above the table, otherwise one row's. */
export function RetryButton({ ids, all }: { ids: number[]; all: boolean }) {
  const t = useTranslations("admin.sends");
  const [pending, startTransition] = useTransition();

  function retry() {
    startTransition(async () => {
      const result = await retrySendsAction(ids);
      if (!result.ok) return void toast.error(t("retryFailed"));
      toast.success(t("retried", { count: result.count }));
    });
  }

  return (
    <Button
      type="button"
      variant={all ? "default" : "outline"}
      size={all ? "default" : "sm"}
      disabled={pending}
      onClick={retry}
    >
      <RotateCw data-icon="inline-start" />
      {all ? t("retryAll", { count: ids.length }) : t("retry")}
    </Button>
  );
}
