"use client";

import { CircleCheck, CloudOff, Hourglass, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { STAND_IN_MODES, type StandInMode } from "@/server/priority/modes";
import { setStandInModeAction } from "./actions";

const ICONS: Record<StandInMode, LucideIcon> = {
  normal: CircleCheck,
  slow: Hourglass,
  down: CloudOff,
};

/** Try the system when Priority is slow or not answering. Only the stand-in obeys this. */
export function StandInCard({
  mode,
  delaySeconds,
  canEdit,
}: {
  mode: StandInMode;
  delaySeconds: number;
  canEdit: boolean;
}) {
  const t = useTranslations("settings.standIn");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [chosen, setChosen] = useState(mode);

  function choose(next: StandInMode) {
    if (!canEdit || pending || next === chosen) return;
    const previous = chosen;
    setChosen(next);
    startTransition(async () => {
      const result = await setStandInModeAction(next);
      if (!result.ok) {
        setChosen(previous);
        toast.error(t("failed"));
        return;
      }
      toast.success(t("changed"));
      router.refresh();
    });
  }

  return (
    <Card className="rise" style={{ "--i": 3 } as React.CSSProperties}>
      <CardHeader>
        <CardTitle className="text-2xl">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div role="radiogroup" aria-label={t("title")} className="grid gap-3 md:grid-cols-3">
          {STAND_IN_MODES.map((option) => {
            const Icon = ICONS[option];
            const selected = chosen === option;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={!canEdit || pending}
                onClick={() => choose(option)}
                className={cn(
                  "flex items-start gap-3 rounded-2xl border p-4 text-start transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default",
                  selected
                    ? "border-gold bg-gold-soft"
                    : "border-border bg-card enabled:hover:border-gold/60",
                )}
              >
                <span
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-full border [&_svg]:size-5",
                    selected ? "border-gold/50 text-gold" : "border-border text-muted-foreground",
                  )}
                >
                  <Icon />
                </span>
                <span className="min-w-0 space-y-0.5">
                  <span className="block font-medium">{t(`modes.${option}.name`)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t(`modes.${option}.hint`, { seconds: delaySeconds })}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {!canEdit ? <p className="text-xs text-muted-foreground">{t("readOnly")}</p> : null}
      </CardContent>
    </Card>
  );
}
