"use client";

import { LogOut, Monitor, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/i18n/format";
import { describeAgent } from "@/lib/user-agent";
import { cn } from "@/lib/utils";
import { endSessionAction } from "./actions";

export interface SessionRow {
  id: string;
  name: string;
  email: string;
  isOwner: boolean;
  deviceType: "desktop" | "phone";
  ip: string | null;
  userAgent: string | null;
  /** ISO times */
  signedInAt: string;
  lastSeenAt: string;
  /** The device this screen is open on. */
  current: boolean;
}

/** Every place where someone is signed in right now, with a button to sign a place out. */
export function SessionsCard({ sessions }: { sessions: SessionRow[] }) {
  const t = useTranslations("admin.sessions");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [asking, setAsking] = useState<string | null>(null);

  function signOut(row: SessionRow) {
    startTransition(async () => {
      const result = await endSessionAction(row.id);
      setAsking(null);
      if (!result.ok) return void toast.error(t("failed"));
      toast.success(t("ended"));
      router.refresh();
    });
  }

  return (
    <Card className="rise" style={{ "--i": 2 } as React.CSSProperties}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-2xl">
          {t("title")}
          <Badge variant="secondary" data-testid="sessions-count">
            {t("count", { count: sessions.length })}
          </Badge>
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("none")}</p>
        ) : (
          <ul className="space-y-2" data-testid="sessions-list">
            {sessions.map((row) => {
              const agent = describeAgent(row.userAgent);
              const Icon = row.deviceType === "phone" ? Smartphone : Monitor;
              const device =
                [agent.browser, agent.system].filter(Boolean).join(" · ") || t("unknown");
              return (
                <li
                  key={row.id}
                  data-testid="session-row"
                  className={cn(
                    "flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3",
                    row.current ? "border-primary/40 bg-primary/5" : "border-border bg-muted/30",
                  )}
                >
                  <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      <span>{row.name}</span>
                      <span className="text-xs font-normal text-muted-foreground" dir="ltr">
                        {row.email}
                      </span>
                      {row.isOwner ? <Badge variant="outline">{t("owner")}</Badge> : null}
                      {row.current ? <Badge>{t("thisOne")}</Badge> : null}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t(row.deviceType)} · {device}
                      {row.ip ? ` · ${t("address")} ` : ""}
                      {row.ip ? <bdi>{shortAddress(row.ip)}</bdi> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("signedIn")}: {formatDateTime(row.signedInAt)} · {t("lastSeen")}:{" "}
                      {formatDateTime(row.lastSeenAt)}
                    </p>
                  </div>
                  {row.current ? null : asking === row.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm">{t("confirm", { name: row.name })}</span>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={pending}
                        onClick={() => signOut(row)}
                        data-testid="session-confirm"
                      >
                        {t("signOut")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() => setAsking(null)}
                      >
                        {t("cancel")}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setAsking(row.id)}
                      data-testid="session-signout"
                    >
                      <LogOut data-icon="inline-start" />
                      {t("signOut")}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">{t("hint")}</p>
      </CardContent>
    </Card>
  );
}

/** Long IPv6 addresses written out in full are shortened, for example 0000:…:0001 becomes ::1. */
function shortAddress(address: string): string {
  if (!address.includes(":")) return address;
  try {
    return new URL(`http://[${address}]`).hostname.replace(/^[|]$/g, "");
  } catch {
    return address;
  }
}
