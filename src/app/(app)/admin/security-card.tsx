"use client";

import { Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { setIdleMinutesAction } from "./actions";

/** The times to choose from, in minutes; 0 is "never". */
const CHOICES = [5, 10, 15, 30, 60, 120, 240, 480, 0];

const SELECT_CLASS =
  "h-11 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 sm:max-w-xs";

/** After how long without touching the screen a person is signed out. */
export function SecurityCard({ minutes }: { minutes: number }) {
  const t = useTranslations("admin.security");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [chosen, setChosen] = useState(minutes);
  // A time saved some other way stays in the list.
  const choices = CHOICES.includes(minutes) ? CHOICES : [minutes, ...CHOICES].sort(order);

  function label(value: number): string {
    if (value === 0) return t("never");
    if (value % 60 === 0) return t("hours", { count: value / 60 });
    return t("minutes", { count: value });
  }

  function save() {
    startTransition(async () => {
      const result = await setIdleMinutesAction(chosen);
      if (!result.ok) return void toast.error(t("failed"));
      toast.success(t("saved"));
      router.refresh();
    });
  }

  return (
    <Card className="rise" style={{ "--i": 2 } as React.CSSProperties}>
      <CardHeader>
        <CardTitle className="text-2xl">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="idle-minutes">{t("label")}</Label>
          <select
            id="idle-minutes"
            data-testid="idle-minutes"
            className={SELECT_CLASS}
            disabled={pending}
            value={chosen}
            onChange={(event) => setChosen(Number(event.target.value))}
          >
            {choices.map((value) => (
              <option key={value} value={value}>
                {label(value)}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            {chosen === 0 ? t("neverHint") : t("hint")}
          </p>
        </div>
        <Button type="button" onClick={save} disabled={pending || chosen === minutes}>
          <Save data-icon="inline-start" />
          {t("save")}
        </Button>
      </CardContent>
    </Card>
  );
}

/** Shortest first, with "never" last. */
function order(a: number, b: number): number {
  return (a === 0 ? Infinity : a) - (b === 0 ? Infinity : b);
}
