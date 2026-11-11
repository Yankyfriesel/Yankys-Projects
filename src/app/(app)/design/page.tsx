import { Palette } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getAccess } from "@/server/permissions";
import { DesignDemo } from "./design-demo";

/**
 * Owner-only review page for the design tokens and components (not part of the
 * product, not in the menu). English only on purpose: it is a developer tool.
 */
export default async function DesignPage() {
  const access = await getAccess();
  if (!access.isOwner) notFound();

  return (
    <>
      <PageHeader
        icon={<Palette />}
        title="Design review"
        description="Tokens and components as they look now. Owner only, not in the menu."
      />
      <DesignDemo />
    </>
  );
}
