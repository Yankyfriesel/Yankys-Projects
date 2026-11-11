import { Tag } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { db } from "@/server/db";
import { getDefaultItemLayout, listLayouts } from "@/server/labels";
import { requireScreen, requirePermission } from "@/server/permissions";
import { LayoutsPanel } from "./layouts-panel";

/** The label layouts: every size and design the system can print. Opened from System settings. */
export default async function LabelLayoutsPage() {
  await requireScreen("settings");
  const access = await requirePermission("settings.labels.view");
  const t = await getTranslations("labels");
  const shell = await getTranslations("shell.groups");
  const layouts = await listLayouts(db);
  const defaultItemLayout = await getDefaultItemLayout(db);

  return (
    <>
      <PageHeader
        icon={<Tag />}
        eyebrow={shell("system")}
        title={t("title")}
        description={t("subtitle")}
        help="labels"
      />
      <LayoutsPanel
        layouts={layouts.map((l) => ({ ...l, updatedAt: l.updatedAt.toISOString() }))}
        canEdit={access.can("settings.labels.edit")}
        defaultItemLayout={defaultItemLayout}
      />
    </>
  );
}
