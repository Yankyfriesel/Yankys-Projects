import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { sampleValues } from "@/lib/labels/sample";
import { todayIso } from "@/lib/i18n/format";
import { db } from "@/server/db";
import { getLayout } from "@/server/labels";
import { requirePermission, requireScreen } from "@/server/permissions";
import { getPriorityClient, PriorityError, type PriorityItem } from "@/server/priority";
import { LayoutEditor } from "./layout-editor";

/** A stand-in item for the preview when Priority cannot be reached or has no items. */
const FALLBACK_ITEM: PriorityItem = {
  itemNumber: "N2015D-S",
  name: "המבורגר בקר קלאסי 150 גר׳",
  nameEn: "Classic beef burger 150 g",
  barcode: "2000000002015",
  category: "קציצות",
  weightKg: 12,
  shelfLifeDays: 12,
  storageText: "לשמור בקירור 0–4°C",
  packingCode: "קרטון",
  origin: "ישראל",
  inventoryManaged: true,
};

/** One layout, in the visual editor. */
export default async function LabelLayoutPage({ params }: { params: Promise<{ id: string }> }) {
  await requireScreen("settings");
  const access = await requirePermission("settings.labels.view");
  const { id } = await params;
  const layout = await getLayout(db, id);
  if (!layout) notFound();

  let items: PriorityItem[] = [];
  try {
    items = await getPriorityClient().getItems();
  } catch (error) {
    if (!(error instanceof PriorityError) || error.code !== "UNAVAILABLE") throw error;
  }
  if (items.length === 0) items = [FALLBACK_ITEM];

  const today = new Date(`${todayIso()}T00:00:00Z`);
  const previews = items.map((item) => ({
    itemNumber: item.itemNumber,
    label: `${item.itemNumber} · ${item.nameEn || item.name}`,
    values: sampleValues(item, today),
  }));

  const t = await getTranslations("labels");
  return (
    <LayoutEditor
      layoutId={layout.id}
      initial={{
        name: layout.name,
        type: layout.type,
        widthMm: layout.widthMm,
        heightMm: layout.heightMm,
        elements: layout.elements,
      }}
      previews={previews}
      canEdit={access.can("settings.labels.edit")}
      backLabel={t("back")}
    />
  );
}
