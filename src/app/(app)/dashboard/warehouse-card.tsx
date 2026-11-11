import { AlertTriangle, CheckCircle2, ChevronDown, Warehouse } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { AttentionLine } from "./attention-line";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatWeight } from "@/lib/i18n/format";
import type { WarehouseSummary } from "@/server/priority/summary";

/**
 * One warehouse: how much is in it, how much of that is in date, and which
 * items need attention. Names and codes come from Priority and are shown as is.
 */
export async function WarehouseCard({
  summary,
  index,
}: {
  summary: WarehouseSummary;
  index: number;
}) {
  const t = await getTranslations("dashboard.warehouse");
  const common = await getTranslations("common");
  const { boxes, valid, soon, expired } = summary;
  const percent = (n: number) => (boxes === 0 ? 0 : (n / boxes) * 100);
  const lines = summary.attention;

  return (
    <Card className="rise" style={{ "--i": index } as React.CSSProperties}>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-2xl">{summary.name}</CardTitle>
            <p dir="ltr" className="text-start font-mono text-xs text-muted-foreground">
              {t("code", { code: summary.code })}
            </p>
          </div>
          <span className="grid size-12 shrink-0 place-items-center rounded-full border border-gold/40 bg-gold-soft text-gold">
            <Warehouse className="size-5" />
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="font-serif text-5xl leading-none font-semibold tabular-nums">
            {formatWeight(summary.kg)}
            <span className="ms-2 font-sans text-base font-medium text-muted-foreground">
              {common("kg")}
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{t("boxes", { count: boxes })}</Badge>
            <Badge variant="outline">{t("items", { count: summary.items })}</Badge>
          </div>
        </div>

        {boxes === 0 ? (
          <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          <>
            <div>
              <div
                className="flex h-2.5 overflow-hidden rounded-full bg-muted"
                role="img"
                aria-label={`${t("legend.valid")} ${valid}, ${t("legend.soon")} ${soon}, ${t("legend.expired")} ${expired}`}
              >
                <span className="bg-success" style={{ width: `${percent(valid)}%` }} />
                <span className="bg-warning" style={{ width: `${percent(soon)}%` }} />
                <span className="bg-destructive" style={{ width: `${percent(expired)}%` }} />
              </div>
              <ul className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                <li className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-success" />
                  {t("legend.valid")}{" "}
                  <b className="font-semibold text-foreground tabular-nums">{valid}</b>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-warning" />
                  {t("legend.soon")}{" "}
                  <b className="font-semibold text-foreground tabular-nums">{soon}</b>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-destructive" />
                  {t("legend.expired")}{" "}
                  <b className="font-semibold text-foreground tabular-nums">{expired}</b>
                </li>
              </ul>
            </div>

            {lines.length === 0 ? (
              <div className="flex items-center gap-2.5 rounded-xl border border-success/20 bg-success-soft px-4 py-3 text-sm font-semibold text-success">
                <CheckCircle2 className="size-4 shrink-0" />
                {t("allValid")}
              </div>
            ) : (
              <details
                data-testid="attention-list"
                className="group/list overflow-hidden rounded-xl border border-border"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-muted/60 px-4 py-3 text-sm font-semibold outline-none marker:hidden hover:bg-muted focus-visible:bg-muted [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="size-4 shrink-0 text-destructive" />
                    {t("attentionItems", { count: lines.length })}
                  </span>
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open/list:rotate-180" />
                </summary>
                <ul className="divide-y divide-border border-t border-border">
                  {lines.map((line) => (
                    <li key={line.itemNumber}>
                      <AttentionLine line={line} />
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
