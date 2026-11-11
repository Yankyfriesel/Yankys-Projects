"use client";

import { Printer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ReportPrintSheet, printReport } from "@/components/report-print";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime } from "@/lib/i18n/format";
import { activityReportAction, type ActivityReportRow } from "./actions";

interface Report {
  rows: ActivityReportRow[];
  total: number;
}

/**
 * Prints the activity log as a report: every entry that matches the filters on the page (not
 * only the page shown), on A4 across the page. Choosing "Save as PDF" in the print window makes a file.
 */
export function PrintLogButton({
  filter,
  actionLabels,
  filterText,
}: {
  filter: { user?: string; action?: string; from?: string; to?: string };
  /** Action key to its words, for every action in the log. */
  actionLabels: Record<string, string>;
  /** The filters in use, in words, printed under the heading. */
  filterText: string;
}) {
  const t = useTranslations("admin.log");
  const device = useTranslations("auth.device");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [report, setReport] = useState<Report | null>(null);

  function print() {
    startTransition(async () => {
      const result = await activityReportAction(filter);
      if (!result.ok) return void toast.error(t("printFailed"));
      if (result.rows.length === 0) return void toast.error(t("empty"));
      setReport({ rows: result.rows, total: result.total });
      // Let the report reach the page, then open the print window.
      requestAnimationFrame(() => printReport(() => setReport(null)));
    });
  }

  const cell = "border border-neutral-400 px-2 py-1 text-start align-top";
  return (
    <>
      <Button type="button" variant="outline" disabled={pending} onClick={print}>
        <Printer data-icon="inline-start" />
        {pending ? t("preparing") : t("print")}
      </Button>
      {report ? (
        <ReportPrintSheet dir={locale === "he" ? "rtl" : "ltr"}>
          <div style={{ fontSize: "10pt", fontFamily: "inherit" }}>
            <h1 style={{ fontSize: "16pt", fontWeight: 700 }}>{t("title")}</h1>
            <p>
              {formatDate(new Date())} · {t("count", { count: report.rows.length })}
              {filterText ? ` · ${filterText}` : ""}
            </p>
            {report.total > report.rows.length ? (
              <p style={{ fontWeight: 700 }}>
                {t("truncated", { shown: report.rows.length, total: report.total })}
              </p>
            ) : null}
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "6mm" }}>
              <thead>
                <tr style={{ background: "#eee" }}>
                  <th className={cell}>{t("columns.when")}</th>
                  <th className={cell}>{t("columns.user")}</th>
                  <th className={cell}>{t("columns.action")}</th>
                  <th className={cell}>{t("columns.subject")}</th>
                  <th className={cell}>{t("columns.device")}</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row, index) => (
                  <tr key={index}>
                    <td className={cell} dir="ltr">
                      {formatDateTime(row.at)}
                    </td>
                    <td className={cell}>{row.user || t("system")}</td>
                    <td className={cell}>{actionLabels[row.action] ?? row.action}</td>
                    <td className={cell} dir="ltr">
                      {row.subject}
                    </td>
                    <td className={cell}>{row.device ? device(row.device) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ReportPrintSheet>
      ) : null}
    </>
  );
}
