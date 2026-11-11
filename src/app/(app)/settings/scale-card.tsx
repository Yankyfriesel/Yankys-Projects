"use client";

import { Scale } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { RealScale } from "@/components/scale/real-scale";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Connecting and disconnecting the scale of this computer. The receiving screen uses the scale
 * connected here; disconnecting gives it back to the old program.
 */
export function ScaleCard({ canConnect }: { canConnect: boolean }) {
  const t = useTranslations("settings.scaleCard");
  const [weight, setWeight] = useState("");

  return (
    <Card className="rise" style={{ "--i": 2 } as React.CSSProperties}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-2xl">
          <Scale className="size-6" aria-hidden />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <RealScale
          controls
          canConnect={canConnect}
          onWeight={setWeight}
          onStateChange={() => undefined}
        />
        <p className="text-sm text-muted-foreground" data-testid="scale-live-weight">
          {t("weight")}:{" "}
          <span dir="ltr" className="font-mono text-foreground tabular-nums">
            {weight ? `${weight} kg` : "—"}
          </span>
        </p>
      </CardContent>
    </Card>
  );
}
