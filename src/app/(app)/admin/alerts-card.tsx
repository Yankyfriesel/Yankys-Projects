"use client";

import { CircleCheck, ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";
import type { AlertKind } from "@/server/security/alerts";
import { markAlertsSeenAction } from "./actions";

export interface AlertRow {
  kind: AlertKind;
  subject: string;
  count: number;
  /** ISO time of the newest attempt. */
  lastAt: string;
  ips: string[];
  /** Newer than the last time the warnings were marked as seen. */
  unseen: boolean;
}

/** Sign-in attempts that look like a break-in, from the last days, with the new ones marked. */
export function AlertsCard({ alerts }: { alerts: AlertRow[] }) {
  const t = useTranslations("admin.alerts");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const unseen = alerts.filter((alert) => alert.unseen).length;

  function markSeen() {
    startTransition(async () => {
      const result = await markAlertsSeenAction();
      if (!result.ok) return void toast.error(t("failed"));
      toast.success(t("marked"));
      // Stay on this tab: without it the screen would open on the first tab.
      router.replace("/admin?tab=security");
      router.refresh();
    });
  }

  return (
    <Card className="rise" style={{ "--i": 1 } as React.CSSProperties}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-2xl">
          {alerts.length === 0 ? (
            <CircleCheck className="size-6 text-success" />
          ) : (
            <ShieldAlert className="size-6 text-destructive" />
          )}
          {t("title")}
          {unseen > 0 ? (
            <Badge variant="destructive" data-testid="alerts-new">
              {t("new", { count: unseen })}
            </Badge>
          ) : null}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="alerts-empty">
            {t("none")}
          </p>
        ) : (
          <ul className="space-y-2" data-testid="alerts-list">
            {alerts.map((alert) => (
              <li
                key={`${alert.kind}-${alert.subject}`}
                className={cn(
                  "rounded-xl border px-4 py-3",
                  alert.unseen
                    ? "border-destructive/40 bg-destructive/5"
                    : "border-border bg-muted/30",
                )}
              >
                <p className="text-sm font-semibold">{t(`kinds.${alert.kind}.title`)}</p>
                <p className="text-sm text-muted-foreground">
                  {t(`kinds.${alert.kind}.body`, { subject: alert.subject, count: alert.count })}
                </p>
                <p className="mt-1 text-xs text-muted-foreground" dir="auto">
                  {t("last", { time: formatDateTime(alert.lastAt) })}
                  {alert.ips.length > 0 ? ` · ${t("from")} ${alert.ips.join(", ")}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
        {unseen > 0 ? (
          <Button type="button" onClick={markSeen} disabled={pending} data-testid="alerts-seen">
            {t("markSeen")}
          </Button>
        ) : null}
        <p className="text-xs text-muted-foreground">{t("hint")}</p>
      </CardContent>
    </Card>
  );
}
