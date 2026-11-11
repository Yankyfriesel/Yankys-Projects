import { CloudOff } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { SCREEN_ICONS } from "@/components/screen-icons";
import { Card } from "@/components/ui/card";
import { db } from "@/server/db";
import { requireScreen } from "@/server/permissions";
import { getPriorityClient } from "@/server/priority";
import { listTodayBoxes, readCatalog, ReceivingError, sendDue } from "@/server/receiving";
import { RefreshButton } from "../dashboard/refresh-button";
import type { VendorRow } from "./vendor-history";
import { VendorScreen } from "./vendor-screen";

export default async function VendorReceivingPage() {
  const access = await requireScreen("vendor");
  const t = await getTranslations();
  const Icon = SCREEN_ICONS.vendor;

  const header = (
    <PageHeader
      icon={<Icon />}
      eyebrow={t("shell.groups.operations")}
      title={t("nav.vendor")}
      description={t("screens.vendor")}
      help="vendor"
    />
  );

  const priority = getPriorityClient();
  let catalog;
  try {
    catalog = await readCatalog(db, priority);
  } catch (error) {
    if (!(error instanceof ReceivingError)) throw error;
    return (
      <>
        {header}
        <Card className="rise" style={{ "--i": 2 } as React.CSSProperties}>
          <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-14 text-center">
            <span className="grid size-20 place-items-center rounded-full border border-warning/30 bg-warning-soft text-warning [&_svg]:size-9">
              <CloudOff />
            </span>
            <h2 className="font-serif text-2xl font-semibold">
              {t("receiving.unavailable.title")}
            </h2>
            <p className="text-muted-foreground">{t("receiving.unavailable.body")}</p>
            <RefreshButton />
          </div>
        </Card>
      </>
    );
  }

  if (!catalog.saved) void sendDue(db, priority).catch(() => 0);

  let today: VendorRow[] | null = null;
  if (access.can("vendor.todayList")) {
    const names = new Map(catalog.items.map((i) => [i.itemNumber, i.name]));
    today = (await listTodayBoxes(db, "vendor")).map((box) => ({
      barcode: box.barcode,
      itemNumber: box.itemNumber,
      itemName: names.get(box.itemNumber) ?? box.itemNumber,
      weightKg: box.weightKg,
      slaughterDate: box.slaughterDate,
      expiryDate: box.expiryDate,
      receivedAt: box.receivedAt.toISOString(),
      receivedBy: box.receivedBy,
      sent: box.sent,
    }));
  }

  return (
    <>
      {header}
      <VendorScreen today={today} usingSavedCatalog={catalog.saved} />
    </>
  );
}
