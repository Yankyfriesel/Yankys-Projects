import { Building2, Cable, Printer, Truck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { PageHeader } from "@/components/page-header";
import { SectionLayout } from "@/components/section-menu";
import { SCREEN_ICONS } from "@/components/screen-icons";
import { brandStatus } from "@/server/brand";
import { getAlertSettings } from "@/server/alerts";
import { db } from "@/server/db";
import { requireScreen } from "@/server/permissions";
import { getStandInBehaviour } from "@/server/priority/behaviour";
import { getPriorityConnection } from "@/server/priority/settings";
import { categoryCounts } from "@/lib/catalog";
import { listLayouts, listLayoutsOfType } from "@/server/labels";
import { formatDateTime } from "@/lib/i18n/format";
import {
  getShippingSettings,
  getShippingToken,
  shippingStats,
} from "@/server/shipping-labels";
import { getPriorityClient, PriorityError } from "@/server/priority";
import { DEFAULT_WAREHOUSE, getCategoryWarehouses, getVendorOrder } from "@/server/receiving";
import { getPackagingTypes } from "@/server/packaging";
import { getShelfLives } from "@/server/shelf-lives";
import { getStorageTexts } from "@/server/storage-texts";
import { LabelsCard } from "./labels-card";
import { LogoCard } from "./logo-card";
import { PackagingTypesCard } from "./packaging-cards";
import { PriorityCard } from "./priority-card";
import { PriorityCheckCard } from "./priority-check-card";
import { CategoryWarehousesCard, VendorOrderCard } from "./receiving-cards";
import { ScaleCard } from "./scale-card";
import { ShippingCard } from "./shipping-card";
import { StandInCard } from "./stand-in-card";

const GROUPS = ["company", "priority", "receiving", "hardware"] as const;
type Group = (typeof GROUPS)[number];

const GROUP_ICONS: Record<Group, React.ComponentType> = {
  company: Building2,
  priority: Cable,
  receiving: Truck,
  hardware: Printer,
};

/**
 * System settings, in groups chosen from a side menu (a row of buttons on a
 * phone): the company logo and labels, the Priority connection, receiving, and
 * the scale and printer still to come. Each group appears for people allowed
 * to see something in it, and only the open group is loaded.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const access = await requireScreen("settings");
  const t = await getTranslations("settings");
  const nav = await getTranslations("nav");
  const screens = await getTranslations("screens");
  const shell = await getTranslations("shell.groups");
  const Icon = SCREEN_ICONS.settings;

  const showLogo = access.can("settings.labels.view") || access.can("settings.labels.edit");
  const showPriority = access.can("settings.priority.view") || access.can("settings.priority.edit");
  const showCategories =
    access.can("settings.categories.view") || access.can("settings.categories.edit");
  const showVendorOrder =
    access.can("settings.vendorOrder.view") || access.can("settings.vendorOrder.edit");
  const showHardware =
    access.can("settings.hardware.view") ||
    access.can("settings.hardware.edit") ||
    access.can("settings.hardware.scale");

  const allowed: Record<Group, boolean> = {
    company: showLogo,
    priority: showPriority,
    receiving: showCategories || showVendorOrder,
    hardware: showHardware,
  };
  const available = GROUPS.filter((group) => allowed[group]);
  const { section } = await searchParams;
  const open: Group | undefined = available.find((group) => group === section) ?? available[0];
  const href = (group: Group) =>
    group === available[0] ? "/settings" : `/settings?section=${group}`;

  return (
    <>
      <PageHeader
        icon={<Icon />}
        eyebrow={shell("system")}
        title={nav("settings")}
        description={screens("settings")}
        help={
          open === "company"
            ? "settingsCompany"
            : open === "priority"
              ? "settingsPriority"
              : open === "receiving"
                ? "settingsReceiving"
                : "settingsScale"
        }
      />

      {open ? (
        <SectionLayout
          label={t("groups.menu")}
          current={open}
          items={available.map((group) => {
            const GroupIcon = GROUP_ICONS[group];
            return {
              key: group,
              href: href(group),
              title: t(`groups.${group}.title`),
              hint: t(`groups.${group}.hint`),
              icon: <GroupIcon />,
            };
          })}
        >
          <section aria-labelledby="settings-group-title" className="space-y-6">
            <div className="rise space-y-1" style={{ "--i": 1 } as React.CSSProperties}>
              <h2 id="settings-group-title" className="font-serif text-2xl font-semibold">
                {t(`groups.${open}.title`)}
              </h2>
              <p className="text-sm text-muted-foreground">{t(`groups.${open}.description`)}</p>
            </div>

            {open === "company" ? (
              <CompanyGroup canEdit={access.can("settings.labels.edit")} />
            ) : null}

            {open === "priority" ? (
              <PriorityGroup canEdit={access.can("settings.priority.edit")} />
            ) : null}

            {open === "receiving" ? (
              <ReceivingGroup
                showCategories={showCategories}
                showVendorOrder={showVendorOrder}
                canEditCategories={access.can("settings.categories.edit")}
                canEditVendorOrder={access.can("settings.vendorOrder.edit")}
              />
            ) : null}

            {open === "hardware" ? (
              <ScaleCard canConnect={access.can("settings.hardware.scale")} />
            ) : null}
          </section>
        </SectionLayout>
      ) : null}
    </>
  );
}

/** The company logo, and the way into the label designer. */
async function CompanyGroup({ canEdit }: { canEdit: boolean }) {
  const [status, layouts, shippingLayouts, shipping, stats] = await Promise.all([
    brandStatus(db),
    listLayouts(db),
    listLayoutsOfType(db, "shipping"),
    getShippingSettings(db),
    shippingStats(db),
  ]);
  // The address Priority calls is the address this page was opened at, plus the secret key. The key
  // is shown only to people who may change it.
  const token = canEdit ? await getShippingToken(db) : null;
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const proto =
    requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return (
    <>
      <LogoCard
        custom={{
          light: status.light.custom,
          full: status.full.custom,
          mark: status.mark.custom,
        }}
        canEdit={canEdit}
      />
      <LabelsCard count={layouts.length} index={3} />
      <ShippingCard
        origin={`${proto}://${host}`}
        token={token}
        canEdit={canEdit}
        defaultCount={shipping.defaultCount}
        defaultUnit={shipping.defaultUnit}
        palletCopies={shipping.palletCopies}
        layoutId={shipping.layoutId}
        layouts={shippingLayouts.map((layout) => ({ id: layout.id, name: layout.name }))}
        received={stats.received}
        lastReceivedAt={stats.lastReceivedAt ? formatDateTime(stats.lastReceivedAt) : null}
        index={4}
      />
    </>
  );
}

/** The Priority connection, the data check, and the stand-in's behaviour. */
async function PriorityGroup({ canEdit }: { canEdit: boolean }) {
  const [connection, behaviour] = await Promise.all([
    getPriorityConnection(db),
    getStandInBehaviour(db),
  ]);
  return (
    <>
      <PriorityCard
        live={process.env.PRIORITY_MODE === "live"}
        baseUrl={connection.baseUrl}
        hasKey={connection.apiUserEnc !== null || Boolean(connection.apiUser)}
        hasPassword={connection.passwordEnc !== null}
        canEdit={canEdit}
      />
      <PriorityCheckCard configured={Boolean(connection.baseUrl)} />
      <StandInCard
        mode={behaviour.mode}
        delaySeconds={Math.round(behaviour.delayMs / 1000)}
        canEdit={canEdit}
      />
    </>
  );
}

/** The storage room and alert days per category, and the vendor receiving order. */
async function ReceivingGroup({
  showCategories,
  showVendorOrder,
  canEditCategories,
  canEditVendorOrder,
}: {
  showCategories: boolean;
  showVendorOrder: boolean;
  canEditCategories: boolean;
  canEditVendorOrder: boolean;
}) {
  // What the two cards list comes from Priority; when it does not answer they say so.
  let priorityDown = false;
  let categories: { category: string; count: number }[] = [];
  let warehouses: { code: string; name: string }[] = [];
  let vendorOrders: { docno: string; date: string }[] = [];
  try {
    const priority = getPriorityClient();
    const [items, houses, orders] = await Promise.all([
      priority.getItems(),
      priority.getWarehouses(),
      priority.getOrders(),
    ]);
    categories = categoryCounts(items);
    warehouses = houses;
    vendorOrders = orders
      .filter((o) => o.kind === "vendor")
      .map((o) => ({ docno: o.docno, date: o.date }));
  } catch (error) {
    if (!(error instanceof PriorityError) || error.code !== "UNAVAILABLE") throw error;
    priorityDown = true;
  }
  const categoryChoices = showCategories ? await getCategoryWarehouses(db) : {};
  const alerts = showCategories ? await getAlertSettings(db) : null;
  const storageTexts = showCategories ? await getStorageTexts(db) : {};
  const shelfLives = showCategories ? await getShelfLives(db) : {};
  const packagingTypes = showCategories ? await getPackagingTypes(db) : [];
  const vendorChoice = showVendorOrder ? ((await getVendorOrder(db)) ?? "") : "";
  // A saved choice stays visible even when Priority cannot be asked right now.
  if (priorityDown) {
    categories = [
      ...new Set([
        ...Object.keys(categoryChoices),
        ...Object.keys(alerts?.byCategory ?? {}),
        ...Object.keys(storageTexts),
        ...Object.keys(shelfLives),
      ]),
    ].map((category) => ({ category, count: 0 }));
    warehouses = [...new Set(Object.values(categoryChoices))].map((code) => ({ code, name: code }));
    vendorOrders = vendorChoice ? [{ docno: vendorChoice, date: "" }] : [];
  }

  return (
    <>
      {showVendorOrder ? (
        <VendorOrderCard
          orders={vendorOrders}
          chosen={vendorChoice}
          canEdit={canEditVendorOrder}
          priorityDown={priorityDown}
          index={2}
        />
      ) : null}

      {showCategories ? (
        <PackagingTypesCard types={packagingTypes} canEdit={canEditCategories} index={3} />
      ) : null}

      {showCategories ? (
        <CategoryWarehousesCard
          categories={categories}
          warehouses={warehouses}
          chosen={categoryChoices}
          alertDays={alerts?.byCategory ?? {}}
          defaultAlertDays={alerts?.defaultDays ?? 7}
          storageTexts={storageTexts}
          shelfLives={shelfLives}
          defaultWarehouse={
            warehouses.find((w) => w.code === DEFAULT_WAREHOUSE)?.name ?? DEFAULT_WAREHOUSE
          }
          canEdit={canEditCategories}
          priorityDown={priorityDown}
          index={3}
        />
      ) : null}
    </>
  );
}
