import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { SCREEN_ICONS } from "@/components/screen-icons";
import { Button } from "@/components/ui/button";
import { db } from "@/server/db";
import { listPallets } from "@/server/pallets";
import { getAccess, requireScreen } from "@/server/permissions";
import { getPriorityClient } from "@/server/priority";
import { PalletsScreen } from "./pallets-screen";

/** Pallets: what is on one (from its QR code), and the latest ones with their labels. */
export default async function PalletsPage() {
  await requireScreen("inventory");
  // Either way of building pallets leads to the pallets themselves.
  const access = await getAccess();
  if (!access.can("inventory.pallets") && !access.can("inventory.palletsScan")) notFound();
  const t = await getTranslations();
  const Icon = SCREEN_ICONS.inventory;

  const list = await listPallets(db);
  // Warehouse names are Priority's; when it does not answer the codes are shown instead.
  const warehouses = await getPriorityClient()
    .getWarehouses()
    .catch(() => []);

  return (
    <>
      <PageHeader
        icon={<Icon />}
        eyebrow={t("nav.inventory")}
        title={t("pallets.title")}
        description={t("pallets.subtitle")}
        help="pallets"
        actions={
          <Button variant="outline" nativeButton={false} render={<Link href="/inventory" />}>
            <ArrowLeft data-icon="inline-start" className="rtl:rotate-180" />
            {t("pallets.back")}
          </Button>
        }
      />
      <PalletsScreen
        recent={list.map((pallet) => ({ ...pallet, createdAt: pallet.createdAt.toISOString() }))}
        warehouses={warehouses}
      />
    </>
  );
}
