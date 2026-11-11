import { CheckCircle2 } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, formatWeight } from "@/lib/i18n/format";
import { db } from "@/server/db";
import { listUnsent } from "@/server/receiving";
import { RetryButton } from "./retry-button";

/**
 * What is saved here but not in Priority yet: boxes received. The
 * ones still retrying go by themselves; the ones Priority refused (or that ran out of tries)
 * wait for a person to look and send them again.
 */
export async function SendsPanel({ canRetry }: { canRetry: boolean }) {
  const t = await getTranslations("admin.sends");
  const rows = await listUnsent(db);
  const failed = rows.filter((row) => row.status === "failed");

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="space-y-1">
          <h2 className="font-serif text-2xl font-semibold">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {canRetry && failed.length > 0 ? (
          <RetryButton ids={failed.map((row) => row.id)} all />
        ) : null}
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center text-muted-foreground">
          <CheckCircle2 className="size-8 text-success" aria-hidden />
          <p data-testid="sends-empty">{t("empty")}</p>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <Table data-testid="sends-table">
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.received")}</TableHead>
              <TableHead>{t("columns.item")}</TableHead>
              <TableHead>{t("columns.barcode")}</TableHead>
              <TableHead>{t("columns.weight")}</TableHead>
              <TableHead>{t("columns.state")}</TableHead>
              <TableHead>{t("columns.why")}</TableHead>
              {canRetry ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="tabular-nums" dir="ltr">
                  {formatDateTime(row.receivedAt)}
                  <div className="text-xs text-muted-foreground">{row.receivedBy}</div>
                </TableCell>
                <TableCell dir="ltr" className="text-start">
                  {row.itemNumber}
                </TableCell>
                <TableCell dir="ltr" className="text-start font-mono text-xs">
                  {row.barcode}
                </TableCell>
                <TableCell className="tabular-nums" dir="ltr">
                  {formatWeight(row.weightKg)}
                </TableCell>
                <TableCell>
                  <State status={row.status} attempts={row.attempts} lastError={row.lastError} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {row.lastError ? t(`reasons.${reason(row.lastError)}`) : "—"}
                </TableCell>
                {canRetry ? (
                  <TableCell>
                    {row.status === "failed" ? <RetryButton ids={[row.id]} all={false} /> : null}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </Card>
  );
}

async function State({
  status,
  attempts,
  lastError,
}: {
  status: "pending" | "failed";
  attempts: number;
  lastError: string | null;
}) {
  const t = await getTranslations("admin.sends");
  return status === "failed" ? (
    <Badge className="bg-destructive text-white">{t("states.failed")}</Badge>
  ) : lastError === "WRITE_NOT_OPEN" ? (
    <Badge variant="warning">{t("states.writeClosed")}</Badge>
  ) : (
    <Badge variant="warning">{t("states.pending", { attempts })}</Badge>
  );
}

const KNOWN = [
  "UNAVAILABLE",
  "WRITE_NOT_OPEN",
  "UNKNOWN_ITEM",
  "UNKNOWN_WAREHOUSE",
  "UNKNOWN_ORDER",
  "UNKNOWN_BOX",
  "DUPLICATE_BOX",
] as const;

function reason(code: string): (typeof KNOWN)[number] | "OTHER" {
  return (KNOWN as readonly string[]).includes(code) ? (code as (typeof KNOWN)[number]) : "OTHER";
}
