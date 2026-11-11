"use client";

import { AlertCircle, CheckCircle2, Clock3, FileSpreadsheet, History, Printer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ReportPrintSheet, printReport } from "@/components/report-print";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDate, formatWeight, todayIso } from "@/lib/i18n/format";
import { LIST_RESET_TIME } from "@/lib/receiving/today";
import { cn } from "@/lib/utils";

export interface VendorRow {
  barcode: string;
  itemNumber: string;
  itemName: string;
  weightKg: number;
  /** YYYY-MM-DD */
  slaughterDate: string;
  /** YYYY-MM-DD */
  expiryDate: string;
  receivedAt: string;
  receivedBy: string;
  sent: "sent" | "pending" | "failed";
}

interface Group {
  itemNumber: string;
  itemName: string;
  /** The 7 digits of the vendor barcode that name the item. */
  digits: string;
  rows: VendorRow[];
  kg: number;
}

/** The boxes in item groups, the item received last on top. */
function groupRows(rows: readonly VendorRow[]): Group[] {
  const groups = new Map<string, Group>();
  for (const row of rows) {
    let group = groups.get(row.itemNumber);
    if (!group) {
      group = {
        itemNumber: row.itemNumber,
        itemName: row.itemName,
        digits: row.barcode.slice(2, 9),
        rows: [],
        kg: 0,
      };
      groups.set(row.itemNumber, group);
    }
    group.rows.push(row);
    group.kg = Math.round((group.kg + row.weightKg) * 100) / 100;
  }
  return [...groups.values()];
}

/** "2026-10-22" as the Date it names (a calendar day, with no time of day). */
function day(iso: string): Date {
  const [year, month, date] = iso.split("-").map(Number);
  return new Date(year, month - 1, date);
}

/**
 * The vendor boxes received since 21:00, grouped by catalog item, with each box's barcode,
 * dates and weight. Saved as an Excel file or printed (and saved as a PDF from the print window).
 */
export function VendorHistory({ rows }: { rows: VendorRow[] }) {
  const t = useTranslations("vendor.history");
  const today = useTranslations("receiving.today");
  const common = useTranslations("common");
  const locale = useLocale();
  const [printing, setPrinting] = useState(false);
  const groups = useMemo(() => groupRows(rows), [rows]);
  const total = rows.reduce((sum, row) => sum + row.weightKg, 0);

  async function excel() {
    try {
      const { default: writeExcelFile } = await import("write-excel-file/browser");
      const header = [
        t("columns.itemNumber"),
        t("columns.item"),
        t("columns.barcode"),
        t("columns.weight"),
        t("columns.slaughter"),
        t("columns.expiry"),
        t("columns.received"),
      ].map((value) => ({ value, fontWeight: "bold" as const, backgroundColor: "#f4ede0" }));
      const date = (iso: string) => ({ value: day(iso), type: Date, format: "dd/mm/yyyy" });
      await writeExcelFile(
        [
          header,
          ...rows.map((row) => [
            { value: row.itemNumber },
            { value: row.itemName },
            { value: row.barcode },
            { value: row.weightKg, type: Number, format: "0.00" },
            date(row.slaughterDate),
            date(row.expiryDate),
            { value: new Date(row.receivedAt), type: Date, format: "dd/mm/yyyy hh:mm" },
          ]),
        ],
        {
          sheet: t("title"),
          rightToLeft: locale === "he",
          stickyRowsCount: 1,
          columns: [
            { width: 14 },
            { width: 32 },
            { width: 34 },
            { width: 10 },
            { width: 14 },
            { width: 14 },
            { width: 18 },
          ],
        },
      ).toFile(`vendor-${todayIso()}.xlsx`);
    } catch (error) {
      console.error("[vendor] the Excel file could not be made", error);
      toast.error(t("exportFailed"));
    }
  }

  function print() {
    setPrinting(true);
    requestAnimationFrame(() => printReport(() => setPrinting(false)));
  }

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/40 px-5 py-4">
        <div className="space-y-0.5">
          <h2 className="font-serif text-xl font-semibold">{today("title")}</h2>
          <p className="text-xs text-muted-foreground">
            {t("subtitle", { time: LIST_RESET_TIME })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-success"
            disabled={rows.length === 0}
            onClick={excel}
          >
            <FileSpreadsheet data-icon="inline-start" />
            {t("excel")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={rows.length === 0 || printing}
            onClick={print}
          >
            <Printer data-icon="inline-start" />
            {t("print")}
          </Button>
          <Badge
            variant="outline"
            className="h-8 px-3 text-sm tabular-nums"
            data-testid="today-total"
          >
            {today("summary", { count: rows.length, weight: formatWeight(total) })}
          </Badge>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="m-5 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
            <History className="size-5" />
          </span>
          <p className="font-semibold">{today("empty")}</p>
          <p className="text-sm text-muted-foreground">{t("emptyHint")}</p>
        </div>
      ) : (
        <div className="space-y-4 p-5" data-testid="today-table">
          {groups.map((group) => (
            <section
              key={group.itemNumber}
              className="overflow-hidden rounded-xl border border-border"
              data-testid="vendor-group"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/50 px-4 py-3">
                <div className="min-w-0 space-y-1">
                  <h3 dir="auto" className="font-semibold">
                    {group.itemName}
                  </h3>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {t("itemNumber")}
                    <span
                      dir="ltr"
                      className="rounded bg-card px-1.5 py-0.5 font-mono text-foreground"
                    >
                      {group.itemNumber}
                    </span>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-lg border border-border bg-card px-2.5 py-1 font-mono">
                    {t("digits")} <span dir="ltr">{group.digits}</span>
                  </span>
                  <Badge variant="soft" className="tabular-nums">
                    {today("summary", { count: group.rows.length, weight: formatWeight(group.kg) })}
                  </Badge>
                </div>
              </div>
              <ul className="divide-y divide-border">
                {group.rows.map((row) => (
                  <li
                    key={row.barcode}
                    data-testid="today-box"
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <SentIcon sent={row.sent} label={today(`states.${row.sent}`)} />
                      <div className="min-w-0 space-y-0.5">
                        <p
                          dir="ltr"
                          className="text-start font-mono text-base font-semibold break-all"
                          data-testid="today-barcode"
                        >
                          {row.barcode}
                        </p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {t("expiry")} <span dir="ltr">{formatDate(row.expiryDate)}</span>
                          {" · "}
                          {t("slaughter")} <span dir="ltr">{formatDate(row.slaughterDate)}</span>
                          {" · "}
                          {row.receivedBy}
                        </p>
                      </div>
                    </div>
                    <p className="font-serif text-lg font-semibold tabular-nums">
                      <span dir="ltr">{formatWeight(row.weightKg)}</span>{" "}
                      <span className="font-sans text-sm font-normal text-muted-foreground">
                        {common("kg")}
                      </span>
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {printing ? (
        <ReportPrintSheet dir={locale === "he" ? "rtl" : "ltr"}>
          <VendorReport groups={groups} count={rows.length} kg={total} />
        </ReportPrintSheet>
      ) : null}
    </Card>
  );
}

function SentIcon({ sent, label }: { sent: VendorRow["sent"]; label: string }) {
  const Icon = sent === "sent" ? CheckCircle2 : sent === "pending" ? Clock3 : AlertCircle;
  return (
    <span
      className={cn(
        "flex shrink-0 flex-col items-center gap-0.5 text-[0.65rem]",
        sent === "sent" && "text-success",
        sent === "pending" && "text-warning",
        sent === "failed" && "text-destructive",
      )}
    >
      <Icon className="size-5" aria-hidden />
      {label}
    </span>
  );
}

/** What the print holds: a heading, the totals, and each item with its boxes, in plain black on white. */
function VendorReport({ groups, count, kg }: { groups: Group[]; count: number; kg: number }) {
  const t = useTranslations("vendor.history");
  const today = useTranslations("receiving.today");
  const cell = "border border-neutral-400 px-2 py-1 text-start align-top";
  return (
    <div style={{ fontSize: "10pt", fontFamily: "inherit" }}>
      <h1 style={{ fontSize: "16pt", fontWeight: 700 }}>{t("title")}</h1>
      <p>
        {formatDate(new Date())} · {today("summary", { count, weight: formatWeight(kg) })}
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "6mm" }}>
        <thead>
          <tr style={{ background: "#eee" }}>
            <th className={cell}>{t("columns.item")}</th>
            <th className={cell}>{t("columns.barcode")}</th>
            <th className={cell}>{t("columns.weight")}</th>
            <th className={cell}>{t("columns.slaughter")}</th>
            <th className={cell}>{t("columns.expiry")}</th>
          </tr>
        </thead>
        <tbody>
          {groups.flatMap((group) =>
            group.rows.map((row) => (
              <tr key={row.barcode}>
                <td className={cell}>
                  {group.itemName} <span dir="ltr">({group.itemNumber})</span>
                </td>
                <td className={cell} dir="ltr">
                  {row.barcode}
                </td>
                <td className={cell} dir="ltr">
                  {formatWeight(row.weightKg)}
                </td>
                <td className={cell} dir="ltr">
                  {formatDate(row.slaughterDate)}
                </td>
                <td className={cell} dir="ltr">
                  {formatDate(row.expiryDate)}
                </td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );
}
