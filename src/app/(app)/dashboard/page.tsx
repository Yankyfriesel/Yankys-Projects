import { Archive, CloudOff, Layers, Moon, Scale, Sun, Sunset } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { SCREEN_ICONS } from "@/components/screen-icons";
import { Card } from "@/components/ui/card";
import {
  dayPeriod,
  formatInteger,
  formatLongDate,
  formatTime,
  formatWeight,
  todayIso,
} from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";
import { alertDaysFor, getAlertSettings } from "@/server/alerts";
import { db } from "@/server/db";
import { requireScreen } from "@/server/permissions";
import { getPriorityClient, PriorityError } from "@/server/priority";
import { summarize } from "@/server/priority/summary";
import { getRoomOrder, inRoomOrder } from "@/server/room-order";
import { AttentionTile, type AttentionItem } from "./attention-tile";
import { RefreshButton } from "./refresh-button";
import { StatTile } from "./stat-tile";
import { RoomGrid } from "./room-grid";
import { WarehouseCard } from "./warehouse-card";

const PERIOD_ICON = { morning: Sun, afternoon: Sun, evening: Sunset, night: Moon } as const;

/**
 * The first screen after login: a warm greeting, four numbers that say how the
 * factory stands, and one card per warehouse. Stock comes from Priority (the
 * stand-in until phase 6) every time the page is opened or refreshed.
 */
export default async function DashboardPage() {
  const access = await requireScreen("dashboard");
  const t = await getTranslations("dashboard");
  const locale = (await getLocale()) as Locale;
  const now = new Date();

  const period = dayPeriod(now);
  const PeriodIcon = PERIOD_ICON[period];
  const Icon = SCREEN_ICONS.dashboard;
  const common = await getTranslations("common");

  const header = (
    <PageHeader
      icon={<Icon />}
      eyebrow={formatLongDate(now, locale)}
      title={t("welcome", { greeting: t(`greeting.${period}`), name: access.user.displayName })}
      description={t("subtitle")}
      help="dashboard"
      actions={
        <div className="flex flex-col items-end gap-1.5">
          {access.can("dashboard.refresh") ? <RefreshButton /> : null}
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <PeriodIcon className="size-3.5 text-gold" />
            {t("updatedAt", { time: formatTime(now) })}
          </span>
        </div>
      }
    />
  );

  const client = getPriorityClient();
  let warehouses: Awaited<ReturnType<typeof client.getWarehouses>>;
  let boxes: Awaited<ReturnType<typeof client.getStockBoxes>>;
  let items: Awaited<ReturnType<typeof client.getItems>>;
  try {
    [warehouses, boxes, items] = await Promise.all([
      client.getWarehouses(),
      client.getStockBoxes(),
      client.getItems(),
    ]);
  } catch (error) {
    if (!(error instanceof PriorityError) || error.code !== "UNAVAILABLE") throw error;
    return (
      <>
        {header}
        <Card className="rise" style={{ "--i": 2 } as React.CSSProperties}>
          <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-14 text-center">
            <span className="grid size-20 place-items-center rounded-full border border-warning/30 bg-warning-soft text-warning [&_svg]:size-9">
              <CloudOff />
            </span>
            <h2 className="font-serif text-2xl font-semibold">{t("unavailable.title")}</h2>
            <p className="text-muted-foreground">{t("unavailable.body")}</p>
            <RefreshButton />
          </div>
        </Card>
      </>
    );
  }

  // The days before expiry that count as "about to expire" are chosen per item category.
  const alerts = await getAlertSettings(db);
  const categoryOf = new Map(items.map((item) => [item.itemNumber, item.category]));
  const summaries = inRoomOrder(
    summarize(warehouses, boxes, todayIso(now), (box) =>
      alertDaysFor(alerts, categoryOf.get(box.itemNumber) ?? ""),
    ),
    await getRoomOrder(db, access.user.id),
  );
  const kg = summaries.reduce((sum, w) => sum + w.kg, 0);
  const boxCount = boxes.length;
  const itemCount = new Set(boxes.map((b) => b.itemNumber)).size;
  const attention = summaries.reduce((sum, w) => sum + w.soon + w.expired, 0);
  // Every item with boxes expired or about to expire, in every warehouse, the most urgent first.
  const attentionItems: AttentionItem[] = summaries
    .flatMap((w) =>
      w.attention.map((line) => ({
        warehouseCode: w.code,
        warehouseName: w.name,
        itemNumber: line.itemNumber,
        itemName: line.itemName,
        expired: line.expired,
        soon: line.soon,
        boxes: line.boxes,
      })),
    )
    .sort(
      (a, b) =>
        b.expired - a.expired ||
        a.boxes[0].expiryDate.localeCompare(b.boxes[0].expiryDate) ||
        a.itemName.localeCompare(b.itemName, "he"),
    );

  return (
    <>
      {header}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label={t("stats.title")}>
        <StatTile
          index={1}
          icon={<Scale />}
          label={t("stats.weight")}
          value={formatWeight(kg)}
          unit={common("kg")}
        />
        <StatTile
          index={2}
          icon={<Archive />}
          label={t("stats.boxes")}
          value={formatInteger(boxCount)}
        />
        <StatTile
          index={3}
          icon={<Layers />}
          label={t("stats.items")}
          value={formatInteger(itemCount)}
        />
        <AttentionTile
          index={4}
          count={attention}
          label={t("stats.attention")}
          value={formatInteger(attention)}
          items={attentionItems}
        />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-serif text-2xl font-semibold">{t("warehouses.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("warehouses.subtitle")}</p>
        </div>
        <RoomGrid
          canArrange={access.can("dashboard.reorder")}
          rooms={summaries.map((summary, i) => ({
            code: summary.code,
            name: summary.name,
            card: <WarehouseCard summary={summary} index={5 + i} />,
          }))}
        />
      </section>
    </>
  );
}
