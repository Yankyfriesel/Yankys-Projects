import { CloudOff } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { SCREEN_ICONS } from "@/components/screen-icons";
import { Card } from "@/components/ui/card";
import { db } from "@/server/db";
import { getDefaultItemLayout, listItemLayouts } from "@/server/labels";
import { getItemPackaging, getPackagingTypes } from "@/server/packaging";
import { requireScreen } from "@/server/permissions";
import { getPriorityClient, PriorityError, type PriorityItem } from "@/server/priority";
import { RefreshButton } from "../dashboard/refresh-button";
import { CatalogBrowser } from "./catalog-browser";
import type { PrintSettings } from "./print-dialog";

/** The item catalog, read from Priority (the stand-in until phase 6) every time the page opens. */
export default async function CatalogPage() {
  const access = await requireScreen("catalog");
  const t = await getTranslations();
  const Icon = SCREEN_ICONS.catalog;

  const header = (
    <PageHeader
      icon={<Icon />}
      eyebrow={t("shell.groups.operations")}
      title={t("nav.catalog")}
      description={t("screens.catalog")}
      help="catalog"
    />
  );

  let items: PriorityItem[];
  try {
    items = await getPriorityClient().getItems();
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
            <h2 className="font-serif text-2xl font-semibold">{t("catalog.unavailable.title")}</h2>
            <p className="text-muted-foreground">{t("catalog.unavailable.body")}</p>
            <RefreshButton />
          </div>
        </Card>
      </>
    );
  }

  // Only for people who may print: the item label types to choose from (chosen every time), and
  // whether they may change the number of copies.
  let print: PrintSettings | null = null;
  if (access.can("catalog.print")) {
    const [layouts, defaultLayoutId] = await Promise.all([
      listItemLayouts(db),
      getDefaultItemLayout(db),
    ]);
    print = {
      layouts: layouts.map(({ id, name, widthMm, heightMm, elements }) => ({
        id,
        name,
        widthMm,
        heightMm,
        elements,
      })),
      defaultLayoutId,
      canChangeCopies: access.can("catalog.changeCopies"),
    };
  }

  // The packaging of each item, for people who open the details of an item.
  const canOpenDetails = access.can("catalog.details");
  const packaging = canOpenDetails
    ? {
        types: await getPackagingTypes(db),
        byItem: await getItemPackaging(db),
        canEdit: access.can("catalog.packaging"),
      }
    : null;

  return (
    <>
      {header}
      <CatalogBrowser
        items={items}
        canOpenDetails={canOpenDetails}
        print={print}
        packaging={packaging}
      />
    </>
  );
}
