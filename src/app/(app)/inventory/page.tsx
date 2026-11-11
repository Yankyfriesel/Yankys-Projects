import { CloudOff, Package } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { SCREEN_ICONS } from "@/components/screen-icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { todayIso } from "@/lib/i18n/format";
import { buildRows, sortRows } from "@/lib/inventory";
import { alertDaysFor, getAlertSettings } from "@/server/alerts";
import { db } from "@/server/db";
import { requireScreen } from "@/server/permissions";
import { getPriorityClient, PriorityError } from "@/server/priority";
import { getRoomOrder, inRoomOrder } from "@/server/room-order";
import { RefreshButton } from "../dashboard/refresh-button";
import { BuildPalletButton } from "./build-pallet-button";
import { InventoryBrowser } from "./inventory-browser";

/**
 * The stock down to the single box, read from Priority (the stand-in until phase 6) every time
 * the page is opened or refreshed. Read only: nothing here changes stock.
 */
export default async function InventoryPage() {
  const access = await requireScreen("inventory");
  const t = await getTranslations();
  const Icon = SCREEN_ICONS.inventory;
  const now = new Date();
  const today = todayIso(now);

  // Either way of building pallets gives the button that starts one, and the pallets screen.
  const canBuild = access.can("inventory.pallets") || access.can("inventory.palletsScan");

  const header = (
    <PageHeader
      icon={<Icon />}
      eyebrow={t("shell.groups.operations")}
      title={t("nav.inventory")}
      description={t("screens.inventory")}
      help="inventory"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {canBuild ? <BuildPalletButton /> : null}
          {canBuild ? (
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/inventory/pallets" />}
            >
              <Package data-icon="inline-start" />
              {t("pallets.open")}
            </Button>
          ) : null}
          <RefreshButton />
        </div>
      }
    />
  );

  const client = getPriorityClient();
  let loaded;
  try {
    loaded = await Promise.all([client.getStockBoxes(), client.getItems(), client.getWarehouses()]);
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
            <h2 className="font-serif text-2xl font-semibold">
              {t("inventory.unavailable.title")}
            </h2>
            <p className="text-muted-foreground">{t("inventory.unavailable.body")}</p>
            <RefreshButton />
          </div>
        </Card>
      </>
    );
  }
  const [boxes, items, warehouses] = loaded;

  const alerts = await getAlertSettings(db);
  const rows = sortRows(
    buildRows(boxes, items, warehouses, today, (category) => alertDaysFor(alerts, category)),
  );

  return (
    <>
      {header}
      <InventoryBrowser
        rows={rows}
        warehouses={inRoomOrder(warehouses, await getRoomOrder(db, access.user.id))}
        canArrange={access.can("dashboard.reorder")}
        today={today}
        can={{
          filters: access.can("inventory.filters"),
          export: access.can("inventory.export"),
          pallets: access.can("inventory.pallets"),
          palletsScan: access.can("inventory.palletsScan"),
        }}
      />
    </>
  );
}
