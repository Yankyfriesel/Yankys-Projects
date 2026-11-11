"use client";

import { History, Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatTime, formatWeight } from "@/lib/i18n/format";
import { LIST_RESET_TIME } from "@/lib/receiving/today";
import { cn } from "@/lib/utils";

export interface TodayRow {
  barcode: string;
  itemName: string;
  running: string;
  weightKg: number;
  receivedAt: string;
  receivedBy: string;
  sent: "sent" | "pending" | "failed";
}

/** The boxes received since 21:00, shared by the receiving and vendor screens. */
export function TodayList({
  rows,
  canReprint,
  busy,
  onReprint,
}: {
  rows: TodayRow[];
  canReprint: boolean;
  busy: boolean;
  onReprint: (barcode: string) => void;
}) {
  const t = useTranslations("receiving.today");
  const common = useTranslations("common");
  const total = rows.reduce((sum, row) => sum + row.weightKg, 0);
  return (
    <Card className="gap-0 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div className="space-y-1">
          <h2 className="font-serif text-xl font-semibold">{t("title")}</h2>
          <p className="text-xs text-muted-foreground">{t("note", { time: LIST_RESET_TIME })}</p>
        </div>
        <Badge variant="outline" dir="ltr" className="tabular-nums">
          {formatDate(new Date())}
        </Badge>
      </div>
      <p className="sr-only" data-testid="today-total">
        {t("summary", { count: rows.length, weight: formatWeight(total) })}
      </p>
      <dl className="my-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-center">
          <dt className="text-xs text-muted-foreground">{t("totalBoxes")}</dt>
          <dd className="font-serif text-2xl font-semibold tabular-nums">{rows.length}</dd>
        </div>
        <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-center">
          <dt className="text-xs text-muted-foreground">{t("totalWeight")}</dt>
          <dd className="font-serif text-2xl font-semibold tabular-nums">
            {formatWeight(total)}{" "}
            <span className="font-sans text-sm font-normal text-muted-foreground">
              {common("kg")}
            </span>
          </dd>
        </div>
      </dl>
      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
            <History className="size-5" />
          </span>
          <p className="font-semibold">{t("empty")}</p>
          <p className="text-sm text-muted-foreground">{t("emptyHint")}</p>
        </div>
      ) : (
        <Table data-testid="today-table">
          <TableHeader>
            <TableRow>
              <TableHead>{t("time")}</TableHead>
              <TableHead>{t("item")}</TableHead>
              <TableHead>{t("running")}</TableHead>
              <TableHead>{t("barcode")}</TableHead>
              <TableHead>{t("weight")}</TableHead>
              <TableHead>{t("by")}</TableHead>
              <TableHead>{t("state")}</TableHead>
              {canReprint ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.barcode}>
                <TableCell className="tabular-nums" dir="ltr">
                  {formatTime(row.receivedAt)}
                </TableCell>
                <TableCell dir="auto">{row.itemName}</TableCell>
                <TableCell className="tabular-nums" dir="ltr">
                  {row.running}
                </TableCell>
                <TableCell className="font-mono text-xs" dir="ltr" data-testid="today-barcode">
                  {row.barcode}
                </TableCell>
                <TableCell className="tabular-nums" dir="ltr">
                  {formatWeight(row.weightKg)}
                </TableCell>
                <TableCell>{row.receivedBy}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      row.sent === "sent"
                        ? "success"
                        : row.sent === "pending"
                          ? "warning"
                          : "default"
                    }
                    className={cn(row.sent === "failed" && "bg-destructive text-white")}
                  >
                    {t(`states.${row.sent}`)}
                  </Badge>
                </TableCell>
                {canReprint ? (
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => onReprint(row.barcode)}
                      aria-label={t("reprint", { name: row.itemName, running: row.running })}
                    >
                      <Printer data-icon="inline-start" />
                      {t("reprintShort")}
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
