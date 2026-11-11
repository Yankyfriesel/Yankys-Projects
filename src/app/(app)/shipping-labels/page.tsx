import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { SCREEN_ICONS } from "@/components/screen-icons";
import { db } from "@/server/db";
import { requireScreen } from "@/server/permissions";
import {
  getShippingLayout,
  getShippingSettings,
  listOrders,
} from "@/server/shipping-labels";
import { ShippingScreen, type OrderRow } from "./shipping-screen";

/**
 * Orders that Priority has sent after they were picked and confirmed: choose one, choose how many
 * labels, and print them as 1 / 10, 2 / 10 and so on.
 */
export default async function ShippingLabelsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const access = await requireScreen("shipping");
  const t = await getTranslations();
  const Icon = SCREEN_ICONS.shipping;
  const { q } = await searchParams;
  const search = (q ?? "").slice(0, 100);

  const [orders, settings, layout] = await Promise.all([
    listOrders(db, search),
    getShippingSettings(db),
    getShippingLayout(db),
  ]);

  const rows: OrderRow[] = orders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    customerNumber: order.customerNumber,
    address: order.address,
    city: order.city,
    phone: order.phone,
    shipDate: order.shipDate,
    notes: order.notes,
    labelCount: order.labelCount,
    isTest: order.isTest,
    receivedAt: order.receivedAt.toISOString(),
    timesReceived: order.timesReceived,
    timesPrinted: order.timesPrinted,
    lastPrintedAt: order.lastPrintedAt?.toISOString() ?? null,
    lastPrintedBy: order.lastPrintedBy,
  }));

  return (
    <>
      <PageHeader
        icon={<Icon />}
        eyebrow={t("shell.groups.operations")}
        title={t("nav.shipping")}
        description={t("screens.shipping")}
        help="shipping"
      />
      <ShippingScreen
        orders={rows}
        search={search}
        defaultCount={settings.defaultCount}
        defaultUnit={settings.defaultUnit}
        palletCopies={settings.palletCopies}
        layout={
          layout
            ? {
                widthMm: layout.widthMm,
                heightMm: layout.heightMm,
                elements: layout.elements,
              }
            : null
        }
        canPrint={access.can("shipping.print")}
        canDelete={access.can("shipping.delete")}
        canSetUp={access.can("settings.labels.view")}
      />
    </>
  );
}
