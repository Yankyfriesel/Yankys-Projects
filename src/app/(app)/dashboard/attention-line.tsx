import { ChevronDown, TriangleAlert, XCircle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { slaughterDateOf } from "@/lib/barcodes";
import { formatDate, formatWeight } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";
import type { AttentionLine as Line } from "@/server/priority/summary";

/**
 * One item that has boxes close to expiry or past it. Closed, it says how many; opened, it lists
 * each box with its barcode, weight, dates and when it came in. Uses the browser's own
 * open/close, so it needs no script.
 */
export async function AttentionLine({ line }: { line: Line }) {
  const t = await getTranslations("dashboard.warehouse");
  const common = await getTranslations("common");

  return (
    <details className="group bg-card" data-testid="attention-line">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 py-2.5 outline-none marker:hidden focus-visible:bg-muted/60 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2">
          <ChevronDown
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          />
          <span dir="auto" className="min-w-0 truncate text-sm font-medium">
            {line.itemName}
          </span>
        </span>
        <span className="flex flex-wrap gap-1.5">
          {line.expired > 0 ? (
            <Badge variant="destructive">
              <XCircle /> {t("expiredBoxes", { count: line.expired })}
            </Badge>
          ) : null}
          {line.soon > 0 ? (
            <Badge variant="warning">
              <TriangleAlert /> {t("soonBoxes", { count: line.soon })}
            </Badge>
          ) : null}
        </span>
      </summary>

      <ul
        data-testid="attention-boxes"
        className="divide-y divide-border/70 border-t border-border bg-muted/30"
      >
        {line.boxes.map((box, index) => {
          const slaughter = slaughterDateOf(box.barcode);
          return (
            <li key={`${box.barcode}-${index}`} className="space-y-2 px-4 py-3">
              <p dir="ltr" className="text-start font-mono text-xs break-all">
                {box.barcode}
              </p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                <Fact label={t("details.weight")}>
                  {formatWeight(box.weightKg)} {common("kg")}
                </Fact>
                <Fact label={t("details.slaughter")}>
                  {slaughter ? formatDate(slaughter) : "—"}
                </Fact>
                <Fact label={t("details.entered")}>{formatDate(box.enteredDate)}</Fact>
                <Fact
                  label={t("details.expiry")}
                  className={cn(
                    "font-medium",
                    box.status === "expired" ? "text-destructive" : "text-warning",
                  )}
                >
                  {formatDate(box.expiryDate)}
                </Fact>
              </dl>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function Fact({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd dir="ltr" className={cn("text-start tabular-nums", className)}>
        {children}
      </dd>
    </div>
  );
}
