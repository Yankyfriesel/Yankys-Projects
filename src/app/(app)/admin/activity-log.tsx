import { ChevronLeft, ChevronRight, Filter, Monitor, Smartphone } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, formatInteger } from "@/lib/i18n/format";
import {
  listActivity,
  listActivityActions,
  type ActivityFilter,
} from "@/server/auth/admin-queries";
import { db } from "@/server/db";
import { PrintLogButton } from "./print-log-button";
import { users } from "@/server/db/schema";

const SELECT_CLASS =
  "h-11 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export type LogSearch = Partial<Record<"user" | "action" | "from" | "to" | "page", string>>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseLogSearch(search: LogSearch): ActivityFilter {
  return {
    userId: search.user || undefined,
    action: search.action || undefined,
    from: search.from && ISO_DATE.test(search.from) ? search.from : undefined,
    to: search.to && ISO_DATE.test(search.to) ? search.to : undefined,
    page: Math.max(1, Number.parseInt(search.page ?? "1", 10) || 1),
  };
}

function href(search: LogSearch, page: number): string {
  const params = new URLSearchParams({ tab: "log" });
  for (const key of ["user", "action", "from", "to"] as const) {
    if (search[key]) params.set(key, search[key]);
  }
  if (page > 1) params.set("page", String(page));
  return `/admin?${params.toString()}`;
}

/** The activity log: filters on top, newest entries first, 25 per page. Read only. */
export async function ActivityLog({ search }: { search: LogSearch }) {
  const t = await getTranslations("admin");
  const device = await getTranslations("auth.device");
  const filter = parseLogSearch(search);
  const [{ rows, total, pageCount }, actions, people] = await Promise.all([
    listActivity(db, filter),
    listActivityActions(db),
    db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .orderBy(users.displayName),
  ]);
  const page = Math.min(filter.page, pageCount);
  const filtered = Boolean(filter.userId || filter.action || filter.from || filter.to);

  function actionLabel(action: string): string {
    return t.has(`log.actions.${action}` as never) ? t(`log.actions.${action}` as never) : action;
  }

  const actionLabels = Object.fromEntries(actions.map((a) => [a, actionLabel(a)]));
  const filterText = [
    filter.userId
      ? `${t("log.filters.user")}: ${people.find((p) => p.id === filter.userId)?.displayName ?? ""}`
      : "",
    filter.action ? `${t("log.filters.action")}: ${actionLabel(filter.action)}` : "",
    filter.from ? `${t("log.filters.from")} ${filter.from}` : "",
    filter.to ? `${t("log.filters.to")} ${filter.to}` : "",
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Card className="rise gap-0 overflow-hidden p-0" style={{ "--i": 1 } as React.CSSProperties}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
        <div>
          <h2 className="font-serif text-2xl font-semibold">{t("log.title")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("log.count", { count: total })}
            {" · "}
            {t("log.subtitle")}
          </p>
        </div>
        {total > 0 ? (
          <PrintLogButton
            filter={{
              user: filter.userId,
              action: filter.action,
              from: filter.from,
              to: filter.to,
            }}
            actionLabels={actionLabels}
            filterText={filterText}
          />
        ) : null}
      </div>
      {/* The filters are always shown, above the entries. */}
      <div className="border-t border-border">
        <div className="flex items-center gap-2 bg-muted/40 px-5 py-3 text-sm font-semibold">
          <Filter className="size-4 text-gold" aria-hidden />
          {t("log.filters.title")}
          {filtered ? <Badge variant="soft">{t("log.filters.active")}</Badge> : null}
        </div>
        <form method="get" className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
          <input type="hidden" name="tab" value="log" />
          <div className="space-y-2">
            <Label htmlFor="log-user">{t("log.filters.user")}</Label>
            <select
              id="log-user"
              name="user"
              defaultValue={filter.userId ?? ""}
              className={SELECT_CLASS}
            >
              <option value="">{t("log.filters.allUsers")}</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="log-action">{t("log.filters.action")}</Label>
            <select
              id="log-action"
              name="action"
              defaultValue={filter.action ?? ""}
              className={SELECT_CLASS}
            >
              <option value="">{t("log.filters.allActions")}</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {actionLabel(a)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="log-from">{t("log.filters.from")}</Label>
            <Input
              id="log-from"
              name="from"
              type="date"
              defaultValue={filter.from ?? ""}
              dir="ltr"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="log-to">{t("log.filters.to")}</Label>
            <Input id="log-to" name="to" type="date" defaultValue={filter.to ?? ""} dir="ltr" />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="lg" className="flex-1">
              {t("log.filters.apply")}
            </Button>
            {filtered ? (
              <Button
                size="lg"
                variant="outline"
                nativeButton={false}
                render={<Link href="/admin?tab=log" />}
              >
                {t("log.filters.clear")}
              </Button>
            ) : null}
          </div>
        </form>
      </div>

      {rows.length === 0 ? (
        <p className="border-t px-5 py-10 text-center text-muted-foreground">{t("log.empty")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="ps-5">{t("log.columns.when")}</TableHead>
              <TableHead>{t("log.columns.user")}</TableHead>
              <TableHead>{t("log.columns.action")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("log.columns.subject")}</TableHead>
              <TableHead className="hidden pe-5 xl:table-cell">{t("log.columns.device")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const subject = typeof row.details?.email === "string" ? row.details.email : "";
              const DeviceIcon = row.deviceType === "phone" ? Smartphone : Monitor;
              return (
                <TableRow key={row.id}>
                  <TableCell
                    dir="ltr"
                    className="ps-5 text-start text-muted-foreground tabular-nums"
                  >
                    {formatDateTime(row.at)}
                  </TableCell>
                  <TableCell className="font-medium">
                    {row.userId === null && row.userDisplay === "system"
                      ? t("log.system")
                      : row.userDisplay}
                  </TableCell>
                  <TableCell>{actionLabel(row.action)}</TableCell>
                  <TableCell
                    dir="ltr"
                    className="hidden text-start text-muted-foreground md:table-cell"
                  >
                    {subject}
                  </TableCell>
                  <TableCell className="hidden pe-5 xl:table-cell">
                    {row.deviceType ? (
                      <span title={device(row.deviceType)} className="inline-flex">
                        <DeviceIcon aria-hidden className="size-4 text-gold" />
                        <span className="sr-only">{device(row.deviceType)}</span>
                      </span>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {pageCount > 1 ? (
        <nav className="flex items-center justify-between gap-3 border-t px-5 py-3">
          <Button
            variant="outline"
            disabled={page <= 1}
            nativeButton={page <= 1}
            render={page <= 1 ? undefined : <Link href={href(search, page - 1)} />}
          >
            <ChevronLeft data-icon="inline-start" className="rtl:rotate-180" />
            {t("log.previous")}
          </Button>
          <span className="text-sm text-muted-foreground tabular-nums">
            {t("log.page", { page: formatInteger(page), pages: formatInteger(pageCount) })}
          </span>
          <Button
            variant="outline"
            disabled={page >= pageCount}
            nativeButton={page >= pageCount}
            render={page >= pageCount ? undefined : <Link href={href(search, page + 1)} />}
          >
            {t("log.next")}
            <ChevronRight data-icon="inline-end" className="rtl:rotate-180" />
          </Button>
        </nav>
      ) : null}
    </Card>
  );
}
