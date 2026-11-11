"use client";

import { AlertTriangle, ChevronDown, TriangleAlert, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { DialogTitleBlock } from "@/components/dialog-parts";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { slaughterDateOf } from "@/lib/barcodes";
import { formatDate, formatWeight } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";
import type { AttentionBox } from "@/server/priority/summary";
import { StatTile } from "./stat-tile";

/** One item with boxes close to expiry or past it, in one warehouse. */
export interface AttentionItem {
  warehouseCode: string;
  warehouseName: string;
  itemNumber: string;
  itemName: string;
  expired: number;
  soon: number;
  boxes: AttentionBox[];
}

/**
 * The "need attention" number. With something to look at it is a button: pressing it opens a
 * window with every item that has boxes expired or about to expire, the most urgent first, and
 * each item opens to its boxes. The numbers come from the same stock as the warehouse cards.
 */
export function AttentionTile({
  count,
  value,
  label,
  items,
  index,
}: {
  count: number;
  value: string;
  label: string;
  items: AttentionItem[];
  index: number;
}) {
  const t = useTranslations("dashboard.attentionList");
  const [open, setOpen] = useState(false);
  const tile = (
    <StatTile
      index={index}
      icon={<AlertTriangle />}
      tone={count > 0 ? "warning" : "success"}
      label={label}
      value={value}
    />
  );
  if (count === 0) return tile;

  return (
    <>
      <button
        type="button"
        aria-label={t("open", { count })}
        onClick={() => setOpen(true)}
        className="block w-full cursor-pointer rounded-2xl text-start transition-shadow outline-none hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {tile}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogTitleBlock
            icon={<AlertTriangle />}
            title={t("title")}
            description={t("subtitle", { items: items.length, boxes: count })}
          />
          <ul
            className="divide-y divide-border rounded-xl border border-border"
            data-testid="attention-popup"
          >
            {items.map((item) => (
              <ItemRow key={`${item.warehouseCode}|${item.itemNumber}`} item={item} />
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ItemRow({ item }: { item: AttentionItem }) {
  const t = useTranslations("dashboard.warehouse");
  const common = useTranslations("common");
  const kg = item.boxes.reduce((sum, box) => sum + box.weightKg, 0);

  return (
    <li>
      <details className="group" data-testid="attention-popup-item">
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 py-3 outline-none focus-visible:bg-muted/60 [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 items-center gap-2">
            <ChevronDown
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
            />
            <span className="min-w-0">
              <span dir="auto" className="block truncate text-sm font-semibold">
                {item.itemName}
              </span>
              <span className="block text-xs text-muted-foreground">
                <span dir="ltr">{item.itemNumber}</span>
                {" · "}
                <span dir="auto">{item.warehouseName}</span>
                {" · "}
                <span dir="ltr">
                  {formatWeight(kg)} {common("kg")}
                </span>
              </span>
            </span>
          </span>
          <span className="flex flex-wrap gap-1.5">
            {item.expired > 0 ? (
              <Badge variant="destructive">
                <XCircle /> {t("expiredBoxes", { count: item.expired })}
              </Badge>
            ) : null}
            {item.soon > 0 ? (
              <Badge variant="warning">
                <TriangleAlert /> {t("soonBoxes", { count: item.soon })}
              </Badge>
            ) : null}
          </span>
        </summary>
        <ul className="divide-y divide-border/70 border-t border-border bg-muted/30">
          {item.boxes.map((box, index) => {
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
    </li>
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
