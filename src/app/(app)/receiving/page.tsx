import { CloudOff } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { SCREEN_ICONS } from "@/components/screen-icons";
import { Card } from "@/components/ui/card";
import { db } from "@/server/db";
import { requireScreen } from "@/server/permissions";
import { getTares } from "@/server/packaging";
import { getPriorityClient } from "@/server/priority";
import { listTodayBoxes, readCatalog, ReceivingError, sendDue } from "@/server/receiving";
import { RefreshButton } from "../dashboard/refresh-button";
import { ReceivingScreen } from "./receiving-screen";
import type { TodayRow } from "./today-list";

export default async function ReceivingPage() {
  const access = await requireScreen("receiving");
  const t = await getTranslations();
  const Icon = SCREEN_ICONS.receiving;

  const header = (
    <PageHeader
      icon={<Icon />}
      eyebrow={t("shell.groups.operations")}
      title={t("nav.receiving")}
      description={t("screens.receiving")}
      help="receiving"
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

  // Opening the screen is also a chance to send what Priority could not take earlier.
  if (!catalog.saved) void sendDue(db, priority).catch(() => 0);

  let today: TodayRow[] | null = null;
  if (access.can("receiving.todayList")) {
    const names = new Map(catalog.items.map((i) => [i.itemNumber, i.name]));
    today = (await listTodayBoxes(db, "production")).map((box) => ({
      barcode: box.barcode,
      itemName: names.get(box.itemNumber) ?? box.itemNumber,
      running: box.running,
      weightKg: box.weightKg,
      receivedAt: box.receivedAt.toISOString(),
      receivedBy: box.receivedBy,
      sent: box.sent,
    }));
  }

  return (
    <>
      {header}
      <ReceivingScreen
        items={catalog.items}
        packing={Object.fromEntries(
          Object.entries(await getTares(db)).map(([category, tare]) => [
            category,
            { totalKg: tare.totalKg, name: tare.box?.name ?? "" },
          ]),
        )}
        today={today}
        usingSavedCatalog={catalog.saved}
        can={{
          manual: access.can("receiving.manual"),
          reprint: access.can("receiving.reprint"),
          autoPrint: access.can("receiving.autoPrint"),
        }}
      />
    </>
  );
}
